import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/utils/supabase/server";
import { getProfileForUser, isStaffRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { resolveRoomDetails } from "@/lib/roomCatalog";

const eligibleStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);

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
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${date}T00:00:00`));
}

export async function GET(
  _: Request,
  context: { params: Promise<unknown> },
) {
  try {
    const { bookingId } = (await context.params) as { bookingId: string };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileForUser(supabase, user.id);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, user_id, room_id, first_name, last_name, email, check_in, check_out, total_price, status, created_at, rooms(*)")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
    }

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const canAccess = isStaffRole(profile?.role) || booking.user_id === user.id;
    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!eligibleStatuses.has(booking.status ?? "")) {
      return NextResponse.json({ error: "Voucher is not available for this booking" }, { status: 409 });
    }

    const bookingRoom = (booking.rooms ?? null) as {
      name?: string | null;
      type?: string | null;
      images?: unknown;
      image_url?: string | null;
      base_price?: number | null;
      description?: string | null;
      capacity?: number | null;
    } | null;

    const room = resolveRoomDetails(booking.room_id, {
      id: booking.room_id ?? "",
      name: bookingRoom?.name ?? null,
      type: bookingRoom?.type ?? "Room",
      images: bookingRoom?.images as string[] | null | undefined,
      image_url: bookingRoom?.image_url ?? null,
      base_price: bookingRoom?.base_price ?? 0,
      description: bookingRoom?.description ?? null,
      capacity: bookingRoom?.capacity ?? 1,
    });

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
    const gold = rgb(0.78, 0.62, 0.29);
    const white = rgb(0.95, 0.95, 0.95);
    const soft = rgb(0.72, 0.72, 0.72);
    const dark = rgb(0.08, 0.09, 0.12);
    let y = 770;

    page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: dark });
    page.drawRectangle({ x: 42, y: 710, width: 511.28, height: 84, color: rgb(0.1, 0.11, 0.15), borderColor: gold, borderWidth: 1 });
    page.drawText("Aura Hotel", { x: 58, y: y, size: 28, font: boldFont, color: gold });
    page.drawText("Reservation E-Voucher", { x: 58, y: y - 30, size: 15, font: regularFont, color: white });
    page.drawText(`Generated ${new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date())}`, {
      x: 58,
      y: y - 52,
      size: 10,
      font: regularFont,
      color: soft,
    });

    y = 640;
    const lines = [
      ["Booking ID", booking.id],
      ["Guest Name", `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || "-"],
      ["Email", booking.email ?? "-"],
      ["Room", room.name],
      ["Room Type", room.type],
      ["Check-in", formatDate(booking.check_in)],
      ["Check-out", formatDate(booking.check_out)],
      ["Total", formatCurrency(booking.total_price)],
      ["Status", booking.status ?? "-"],
    ];

    for (const [label, value] of lines) {
      page.drawText(label, { x: 58, y, size: 11, font: boldFont, color: gold });
      page.drawText(value, { x: 200, y, size: 11, font: regularFont, color: white });
      y -= 34;
    }

    page.drawLine({
      start: { x: 58, y: y - 6 },
      end: { x: 537, y: y - 6 },
      thickness: 1,
      color: rgb(0.2, 0.2, 0.24),
    });
    page.drawText(
      "Please present this voucher together with a valid identification document during check-in.",
      { x: 58, y: y - 36, size: 10, font: regularFont, color: soft },
    );

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="aura-voucher-${booking.id}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate voucher" }, { status: 500 });
  }
}
