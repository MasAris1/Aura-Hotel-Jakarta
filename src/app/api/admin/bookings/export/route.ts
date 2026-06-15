import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireAdminApi } from "@/lib/adminApi";
import { resolveRoomDetails } from "@/lib/roomCatalog";
import { formatPaymentType } from "@/lib/transactions";
import * as XLSX from "xlsx";

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
  transactions?: Array<{ payment_type: string | null }> | null;
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

const settledStatuses = new Set(["PAID"]);

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
    const format = requestUrl.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
    const period = normalizePeriod(requestUrl.searchParams.get("period"));
    const periodRange = getPeriodRange(period);
    const dateFrom = requestUrl.searchParams.get("dateFrom") ?? periodRange.from;
    const dateTo = requestUrl.searchParams.get("dateTo") ?? periodRange.to;
    const supabaseAdmin = access.supabaseAdmin;

    let query = supabaseAdmin
      .from("bookings")
      .select("id, created_at, room_id, first_name, last_name, email, check_in, check_out, total_price, status, transactions ( payment_type )")
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
      "payment_type",
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
      const paymentType = booking.transactions?.[0]?.payment_type;

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
        formatPaymentType(paymentType),
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
      
      const primaryDark = rgb(0.1, 0.1, 0.1);
      const secondaryDark = rgb(0.25, 0.25, 0.25);
      const mutedText = rgb(0.45, 0.45, 0.45);
      const brandGold = rgb(0.78, 0.62, 0.29);
      const brandBlue = rgb(0.08, 0.18, 0.36);
      const lightBg = rgb(0.96, 0.96, 0.97);
      const borderCol = rgb(0.85, 0.85, 0.85);
      const white = rgb(1, 1, 1);

      // 1. Kop Surat (Header)
      page.drawRectangle({
        x: 42,
        y: 745,
        width: 45,
        height: 45,
        color: brandGold,
      });
      page.drawText("A", {
        x: 54,
        y: 757,
        size: 24,
        font: boldFont,
        color: white,
      });

      page.drawText("AURA HOTEL JAKARTA", {
        x: 95,
        y: 775,
        size: 16,
        font: boldFont,
        color: brandBlue,
      });
      page.drawText("Jl. Jenderal Sudirman Kav. 21, Jakarta Pusat 10220, Indonesia", {
        x: 95,
        y: 762,
        size: 8,
        font: regularFont,
        color: secondaryDark,
      });
      page.drawText("Telp: (021) 555-8888  |  Email: info@aurahoteljakarta.com  |  Website: www.aurahoteljakarta.com", {
        x: 95,
        y: 749,
        size: 8,
        font: regularFont,
        color: secondaryDark,
      });

      page.drawLine({
        start: { x: 42, y: 735 },
        end: { x: 553, y: 735 },
        thickness: 1.5,
        color: brandBlue,
      });
      page.drawLine({
        start: { x: 42, y: 731 },
        end: { x: 553, y: 731 },
        thickness: 0.5,
        color: borderCol,
      });

      // 2. Report Title & Metadata
      page.drawText("LAPORAN OPERASIONAL & RESERVASI", {
        x: 42,
        y: 705,
        size: 12,
        font: boldFont,
        color: brandBlue,
      });
      
      page.drawText(`Periode: ${formatDate(dateFrom)} s/d ${formatDate(dateTo)}`, {
        x: 42,
        y: 690,
        size: 8.5,
        font: regularFont,
        color: primaryDark,
      });
      page.drawText(`Filter Status: ${status && status !== "ALL" ? status : "SEMUA"}`, {
        x: 42,
        y: 678,
        size: 8.5,
        font: regularFont,
        color: primaryDark,
      });
      page.drawText(`Dicetak pada: ${formatDateTime(new Date())}`, {
        x: 350,
        y: 690,
        size: 8.5,
        font: regularFont,
        color: mutedText,
      });
      page.drawText(`Total Data: ${totalBookings} Reservasi`, {
        x: 350,
        y: 678,
        size: 8.5,
        font: regularFont,
        color: primaryDark,
      });

      page.drawLine({
        start: { x: 42, y: 665 },
        end: { x: 553, y: 665 },
        thickness: 0.8,
        color: borderCol,
      });

      // 3. KPI Cards (3 Columns)
      const cardW = 163.76;
      const cardH = 50;
      const cardY = 605;

      page.drawRectangle({
        x: 42,
        y: cardY,
        width: cardW,
        height: cardH,
        color: lightBg,
        borderColor: borderCol,
        borderWidth: 1,
      });
      page.drawText("TOTAL RESERVASI", { x: 50, y: cardY + 38, size: 7.5, font: boldFont, color: mutedText });
      page.drawText(String(totalBookings), { x: 50, y: cardY + 12, size: 18, font: boldFont, color: primaryDark });

      page.drawRectangle({
        x: 215.76,
        y: cardY,
        width: cardW,
        height: cardH,
        color: lightBg,
        borderColor: borderCol,
        borderWidth: 1,
      });
      page.drawText("GROSS BOOKING VALUE", { x: 223.76, y: cardY + 38, size: 7.5, font: boldFont, color: mutedText });
      page.drawText(formatCurrency(grossValue), { x: 223.76, y: cardY + 12, size: 11.5, font: boldFont, color: brandBlue });

      page.drawRectangle({
        x: 389.52,
        y: cardY,
        width: cardW,
        height: cardH,
        color: lightBg,
        borderColor: borderCol,
        borderWidth: 1,
      });
      page.drawText("REALIZED REVENUE", { x: 397.52, y: cardY + 38, size: 7.5, font: boldFont, color: mutedText });
      page.drawText(formatCurrency(realizedRevenue), { x: 397.52, y: cardY + 12, size: 11.5, font: boldFont, color: rgb(0.1, 0.5, 0.2) });

      // 4. Status Summary Table & Horizontal Bar Chart
      page.drawText("ANALISIS STATUS RESERVASI", { x: 42, y: 575, size: 10, font: boldFont, color: brandBlue });
      page.drawLine({ start: { x: 42, y: 567 }, end: { x: 553, y: 567 }, thickness: 0.8, color: borderCol });

      page.drawText("STATUS", { x: 48, y: 550, size: 8, font: boldFont, color: mutedText });
      page.drawText("QTY", { x: 135, y: 550, size: 8, font: boldFont, color: mutedText });
      page.drawText("TOTAL BIAYA", { x: 185, y: 550, size: 8, font: boldFont, color: mutedText });
      page.drawLine({ start: { x: 42, y: 542 }, end: { x: 280, y: 542 }, thickness: 0.8, color: borderCol });

      let rowY = 527;
      const statusEntries = Array.from(statusMap.entries());
      statusEntries.forEach(([bookingStatus, value], idx) => {
        if (idx % 2 === 0) {
          page.drawRectangle({ x: 42, y: rowY - 4, width: 238, height: 18, color: lightBg });
        }
        page.drawText(bookingStatus, { x: 48, y: rowY, size: 8, font: boldFont, color: primaryDark });
        page.drawText(`${value.count}x`, { x: 135, y: rowY, size: 8, font: regularFont, color: secondaryDark });
        page.drawText(formatCurrency(value.amount), { x: 185, y: rowY, size: 8, font: regularFont, color: secondaryDark });
        rowY -= 20;
      });

      let chartY = 550;
      statusEntries.forEach(([bookingStatus, value]) => {
        const percentage = totalBookings > 0 ? (value.count / totalBookings) : 0;
        page.drawText(bookingStatus, { x: 310, y: chartY, size: 8, font: boldFont, color: mutedText });
        page.drawText(`${Math.round(percentage * 100)}%`, { x: 520, y: chartY, size: 8, font: boldFont, color: primaryDark });
        
        page.drawRectangle({ x: 310, y: chartY - 10, width: 200, height: 6, color: lightBg });
        const fillBarColor = bookingStatus === "PAID" ? rgb(0.1, 0.5, 0.2) : rgb(0.78, 0.62, 0.29);
        if (percentage > 0) {
          page.drawRectangle({ x: 310, y: chartY - 10, width: 200 * percentage, height: 6, color: fillBarColor });
        }
        chartY -= 20;
      });

      let y = Math.min(rowY, chartY) - 15;

      // 5. Recent Bookings Section
      page.drawText("DAFTAR TRANSAKSI RESERVASI", { x: 42, y, size: 10, font: boldFont, color: brandBlue });
      page.drawLine({ start: { x: 42, y: y - 8 }, end: { x: 553, y: y - 8 }, thickness: 0.8, color: borderCol });
      y -= 25;

      page.drawText("BOOKING ID", { x: 48, y, size: 8, font: boldFont, color: mutedText });
      page.drawText("TAMU / EMAIL", { x: 118, y, size: 8, font: boldFont, color: mutedText });
      page.drawText("KAMAR", { x: 218, y, size: 8, font: boldFont, color: mutedText });
      page.drawText("PERIODE IN - OUT", { x: 318, y, size: 8, font: boldFont, color: mutedText });
      page.drawText("STATUS", { x: 438, y, size: 8, font: boldFont, color: mutedText });
      page.drawText("TOTAL BIAYA", { x: 503, y, size: 8, font: boldFont, color: mutedText });
      page.drawLine({ start: { x: 42, y: y - 5 }, end: { x: 553, y: y - 5 }, thickness: 0.8, color: borderCol });
      y -= 22;

      let currentPage = page;
      let pageNumber = 1;
      const pages = [page];

      const createNewPage = () => {
        const newPage = pdf.addPage([595.28, 841.89]);
        
        newPage.drawText("Aura Hotel Jakarta — Laporan Reservasi (Lanjutan)", {
          x: 42,
          y: 800,
          size: 10,
          font: boldFont,
          color: brandBlue,
        });
        newPage.drawLine({ start: { x: 42, y: 792 }, end: { x: 553, y: 792 }, thickness: 0.8, color: borderCol });

        newPage.drawText("BOOKING ID", { x: 48, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawText("TAMU / EMAIL", { x: 118, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawText("KAMAR", { x: 218, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawText("PERIODE IN - OUT", { x: 318, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawText("STATUS", { x: 438, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawText("TOTAL BIAYA", { x: 503, y: 775, size: 8, font: boldFont, color: mutedText });
        newPage.drawLine({ start: { x: 42, y: 767 }, end: { x: 553, y: 767 }, thickness: 0.8, color: borderCol });

        pages.push(newPage);
        pageNumber += 1;
        return { newPage, startY: 745 };
      };

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const bookingId = String(row[0]);
        const roomName = String(row[3]);
        const guestName = String(row[4]);
        const email = String(row[5]);
        const checkIn = String(row[6]);
        const checkOut = String(row[7]);
        const totalPrice = Number(row[8] ?? 0);
        const bookingStatus = String(row[9] ?? "UNPAID");
        const paymentType = String(row[10]);

        if (y < 60) {
          const res = createNewPage();
          currentPage = res.newPage;
          y = res.startY;
        }

        if (i % 2 === 0) {
          currentPage.drawRectangle({
            x: 42,
            y: y - 5,
            width: 511.28,
            height: 22,
            color: lightBg
          });
        }

        currentPage.drawText(`#${bookingId.slice(0, 8)}`, { x: 48, y: y + 2, size: 8, font: boldFont, color: primaryDark });

        const truncatedGuest = guestName.length > 18 ? guestName.slice(0, 16) + ".." : guestName;
        const truncatedEmail = email.length > 20 ? email.slice(0, 18) + ".." : email;
        currentPage.drawText(truncatedGuest || "-", { x: 118, y: y + 5, size: 8, font: boldFont, color: primaryDark });
        currentPage.drawText(truncatedEmail || "-", { x: 118, y: y - 3, size: 7, font: regularFont, color: mutedText });

        const truncatedRoom = roomName.length > 20 ? roomName.slice(0, 18) + ".." : roomName;
        currentPage.drawText(truncatedRoom || "-", { x: 218, y: y + 2, size: 8, font: regularFont, color: primaryDark });

        currentPage.drawText(`${formatDate(checkIn)} - ${formatDate(checkOut)}`, { x: 318, y: y + 5, size: 7.5, font: regularFont, color: primaryDark });
        currentPage.drawText(paymentType || "-", { x: 318, y: y - 3, size: 7, font: regularFont, color: mutedText });

        let badgeColor = rgb(0.9, 0.9, 0.9);
        let textColor = rgb(0.2, 0.2, 0.2);
        if (bookingStatus === "PAID") {
          badgeColor = rgb(0.85, 0.95, 0.88);
          textColor = rgb(0.1, 0.45, 0.2);
        } else if (bookingStatus === "UNPAID") {
          badgeColor = rgb(0.99, 0.94, 0.85);
          textColor = rgb(0.65, 0.4, 0.05);
        } else if (bookingStatus === "EXPIRED") {
          badgeColor = rgb(0.98, 0.88, 0.88);
          textColor = rgb(0.75, 0.1, 0.1);
        }

        currentPage.drawRectangle({
          x: 438,
          y: y - 2,
          width: 45,
          height: 12,
          color: badgeColor
        });
        currentPage.drawText(bookingStatus, {
          x: 438 + (45 - boldFont.widthOfTextAtSize(bookingStatus, 6.5)) / 2,
          y: y + 1,
          size: 6.5,
          font: boldFont,
          color: textColor
        });

        currentPage.drawText(formatCurrency(totalPrice), { x: 503, y: y + 2, size: 8, font: boldFont, color: primaryDark });

        y -= 25;
      }

      const totalPages = pages.length;
      for (let i = 0; i < totalPages; i++) {
        const p = pages[i];
        p.drawLine({ start: { x: 42, y: 40 }, end: { x: 553, y: 40 }, thickness: 0.8, color: borderCol });
        p.drawText(`Halaman ${i + 1} dari ${totalPages}`, {
          x: 553 - regularFont.widthOfTextAtSize(`Halaman ${i + 1} dari ${totalPages}`, 8),
          y: 26,
          size: 8,
          font: regularFont,
          color: mutedText
        });
        p.drawText("Aura Hotel Jakarta — Laporan Operasional & Reservasi", {
          x: 42,
          y: 26,
          size: 8,
          font: regularFont,
          color: mutedText
        });
      }

      const bytes = await pdf.save();
      return new NextResponse(Buffer.from(bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="bookings-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        },
      });
    }

    // Format XLSX Export
    const wsData = [header, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const colWidths = [
      { wch: 15 }, // booking_id
      { wch: 25 }, // created_at
      { wch: 15 }, // room_id
      { wch: 25 }, // room_name
      { wch: 25 }, // guest_name
      { wch: 25 }, // email
      { wch: 15 }, // check_in
      { wch: 15 }, // check_out
      { wch: 15 }, // total_price
      { wch: 12 }, // status
      { wch: 15 }, // payment_type
    ];
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Bookings Report");

    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bookings-report-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Unexpected booking export failure", error);
    return NextResponse.json({ error: "Failed to export bookings" }, { status: 500 });
  }
}
