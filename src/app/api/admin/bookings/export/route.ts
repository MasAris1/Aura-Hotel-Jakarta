import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireAdminApi } from "@/lib/adminApi";
import { resolveRoomDetails } from "@/lib/roomCatalog";

type AdminPeriod = "month" | "3m" | "6m" | "1y";
type BookingExportRow = {
  id: string;
  created_at: string | null;
  room_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  status: string | null;
};
type RoomExportRow = {
  id: string;
  name: string | null;
  type: string | null;
  images: unknown;
  base_price: number | null;
  description: string | null;
  capacity: number | null;
};

const periodOptions: Array<{ value: AdminPeriod; months: number }> = [
  { value: "month", months: 1 },
  { value: "3m", months: 3 },
  { value: "6m", months: 6 },
  { value: "1y", months: 12 },
];

const settledStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);

function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);

  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
}

function getTodayInJakarta() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function normalizePeriod(period: string | null): AdminPeriod {
  return periodOptions.some((option) => option.value === period)
    ? (period as AdminPeriod)
    : "month";
}

function getPeriodRange(period: AdminPeriod) {
  const today = getTodayInJakarta();
  const [year, month, day] = today.split("-").map(Number);
  const option = periodOptions.find((item) => item.value === period) ?? periodOptions[0];
  const fromDate =
    period === "month"
      ? new Date(Date.UTC(year, month - 1, 1))
      : new Date(Date.UTC(year, month - option.months, day));
  const toDate = new Date(Date.UTC(year, month - 1, day));

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function formatCurrency(amount: number | null | undefined) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount ?? 0));
}

function formatDate(date: string | null | undefined) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date.includes("T") ? date : `${date}T00:00:00`));
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export async function GET(request: Request) {
  try {
    const access = await requireAdminApi();
    if ("error" in access) {
      return access.error;
    }

    const requestUrl = new URL(request.url);
    const status = requestUrl.searchParams.get("status");
    const format = requestUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
    const period = normalizePeriod(requestUrl.searchParams.get("period"));
    const periodRange = getPeriodRange(period);
    const dateFrom = requestUrl.searchParams.get("dateFrom") ?? periodRange.from;
    const dateTo = requestUrl.searchParams.get("dateTo") ?? periodRange.to;
    const supabaseAdmin = access.supabaseAdmin;

    let query = supabaseAdmin
      .from("bookings")
      .select("id, created_at, room_id, first_name, last_name, email, check_in, check_out, total_price, status")
      .order("created_at", { ascending: false });

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error("Failed to query booking export rows", error);
      return NextResponse.json({ error: "Failed to export bookings" }, { status: 500 });
    }

    const bookingRows = (bookings ?? []) as BookingExportRow[];
    const roomIds = Array.from(
      new Set(
        bookingRows
          .map((booking) => booking.room_id)
          .filter((roomId): roomId is string => Boolean(roomId)),
      ),
    );
    let roomMap = new Map<string, RoomExportRow>();

    if (roomIds.length > 0) {
      const { data: rooms, error: roomsError } = await supabaseAdmin
        .from("rooms")
        .select("id, name, type, images, base_price, description, capacity")
        .in("id", roomIds);

      if (roomsError) {
        console.warn("Failed to query booking export room rows", roomsError);
      } else {
        roomMap = new Map(((rooms ?? []) as RoomExportRow[]).map((room) => [room.id, room]));
      }
    }

    const header = [
      "booking_id",
      "created_at",
      "room_id",
      "room_name",
      "guest_name",
      "email",
      "check_in",
      "check_out",
      "total_price",
      "status",
    ];

    const rows = bookingRows.map((booking) => {
      const bookingRoom = booking.room_id ? roomMap.get(booking.room_id) : null;

      const room = resolveRoomDetails(booking.room_id, {
        id: booking.room_id ?? "",
        name: bookingRoom?.name ?? null,
        type: bookingRoom?.type ?? "Room",
        images: bookingRoom?.images as string[] | null | undefined,
        base_price: bookingRoom?.base_price ?? 0,
        description: bookingRoom?.description ?? null,
        capacity: bookingRoom?.capacity ?? 1,
      });
      const guestName = `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim();

      return [
        booking.id,
        booking.created_at ?? "",
        booking.room_id ?? "",
        room.name,
        guestName,
        booking.email ?? "",
        booking.check_in,
        booking.check_out,
        booking.total_price,
        booking.status ?? "",
      ];
    });

    if (format === "pdf") {
      const totalBookings = rows.length;
      const grossValue = bookingRows.reduce(
        (sum, booking) => sum + Number(booking.total_price ?? 0),
        0,
      );
      const realizedRevenue = bookingRows.reduce((sum, booking) => {
        if (!settledStatuses.has(booking.status ?? "")) {
          return sum;
        }

        return sum + Number(booking.total_price ?? 0);
      }, 0);
      const statusMap = new Map<string, { count: number; amount: number }>();

      for (const booking of bookingRows) {
        const bookingStatus = booking.status ?? "UNPAID";
        const current = statusMap.get(bookingStatus) ?? { count: 0, amount: 0 };
        current.count += 1;
        current.amount += Number(booking.total_price ?? 0);
        statusMap.set(bookingStatus, current);
      }

      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]);
      const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
      const gold = rgb(0.78, 0.62, 0.29);
      const white = rgb(0.95, 0.95, 0.95);
      const soft = rgb(0.68, 0.68, 0.72);
      const dark = rgb(0.08, 0.09, 0.12);
      let y = 770;

      page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: dark });
      page.drawRectangle({
        x: 42,
        y: 710,
        width: 511.28,
        height: 84,
        color: rgb(0.1, 0.11, 0.15),
        borderColor: gold,
        borderWidth: 1,
      });
      page.drawText("Aura Hotel Jakarta", { x: 58, y, size: 24, font: boldFont, color: gold });
      page.drawText("Admin Booking Report", { x: 58, y: y - 28, size: 14, font: regularFont, color: white });
      page.drawText(`Generated ${formatDateTime(new Date())}`, {
        x: 58,
        y: y - 50,
        size: 10,
        font: regularFont,
        color: soft,
      });

      y = 660;
      const summaryLines = [
        ["Period", `${formatDate(dateFrom)} - ${formatDate(dateTo)}`],
        ["Status Filter", status && status !== "ALL" ? status : "ALL"],
        ["Total Bookings", String(totalBookings)],
        ["Gross Booking Value", formatCurrency(grossValue)],
        ["Realized Revenue", formatCurrency(realizedRevenue)],
      ];

      for (const [label, value] of summaryLines) {
        page.drawText(label, { x: 58, y, size: 11, font: boldFont, color: gold });
        page.drawText(value, { x: 210, y, size: 11, font: regularFont, color: white });
        y -= 28;
      }

      y -= 14;
      page.drawText("Status Summary", { x: 58, y, size: 14, font: boldFont, color: white });
      y -= 24;

      for (const [bookingStatus, value] of Array.from(statusMap.entries()).slice(0, 8)) {
        page.drawText(bookingStatus, { x: 58, y, size: 10, font: boldFont, color: gold });
        page.drawText(`${value.count} bookings`, { x: 190, y, size: 10, font: regularFont, color: white });
        page.drawText(formatCurrency(value.amount), { x: 320, y, size: 10, font: regularFont, color: white });
        y -= 20;
      }

      y -= 14;
      page.drawText("Recent Bookings", { x: 58, y, size: 14, font: boldFont, color: white });
      y -= 24;

      for (const row of rows.slice(0, 18)) {
        const [bookingId, , , roomName, guestName, , checkIn, checkOut, totalPrice, bookingStatus] = row;
        const line = `#${String(bookingId).slice(0, 8)}  ${guestName || "-"}  ${roomName || "-"}  ${formatDate(String(checkIn))}-${formatDate(String(checkOut))}  ${bookingStatus}`;

        page.drawText(line.slice(0, 88), { x: 58, y, size: 8.5, font: regularFont, color: soft });
        page.drawText(formatCurrency(Number(totalPrice ?? 0)), {
          x: 438,
          y,
          size: 8.5,
          font: regularFont,
          color: white,
        });
        y -= 18;

        if (y < 54) {
          break;
        }
      }

      const bytes = await pdf.save();
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="bookings-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
      .join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookings-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Unexpected booking export failure", error);
    return NextResponse.json({ error: "Failed to export bookings" }, { status: 500 });
  }
}
