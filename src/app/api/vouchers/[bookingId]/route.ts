import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
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
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const serifRegular = await pdf.embedFont(StandardFonts.TimesRoman);

    const darkBackground = rgb(0.035, 0.035, 0.043); // #09090b
    const cardBackground = rgb(0.05, 0.05, 0.06); // #0d0d0f
    const gold = rgb(0.83, 0.69, 0.28); // #d4af37
    const white = rgb(1, 1, 1);
    const muted = rgb(0.63, 0.63, 0.67); // #a1a1aa

    // Draw Page Background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 595.28,
      height: 841.89,
      color: darkBackground,
    });

    // Draw Card Background
    page.drawRectangle({
      x: 97.64,
      y: 70.95,
      width: 400,
      height: 700,
      color: cardBackground,
      borderColor: gold,
      borderWidth: 1.5,
    });

    const guestName = `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || booking.email?.split("@")[0] || "Guest";

    // 1. Guest Name
    page.drawText("NAMA TAMU", {
      x: 120,
      y: 735,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(guestName, {
      x: 120,
      y: 708,
      size: 18,
      font: serifBold,
      color: gold,
    });

    // Draw Status Pill on the top right
    const statusText = (booking.status === "PAID" || booking.status === "SUCCESS") ? "TERBAYAR" : (booking.status ?? "UNKNOWN");
    const statusTextWidth = boldFont.widthOfTextAtSize(statusText, 8);
    const pillWidth = statusTextWidth + 16;
    const pillHeight = 18;
    const pillX = 497.64 - 20 - pillWidth;
    const pillY = 718;

    let pillBgColor = rgb(0.18, 0.13, 0.06);
    let pillBorderColor = rgb(0.45, 0.32, 0.06);
    let pillTextColor = rgb(0.8, 0.6, 0.2);

    if (booking.status === "PAID" || booking.status === "SUCCESS" || booking.status === "CONFIRMED") {
      pillBgColor = rgb(0.06, 0.18, 0.13);
      pillBorderColor = rgb(0.06, 0.45, 0.32);
      pillTextColor = rgb(0.2, 0.8, 0.6);
    }

    page.drawRectangle({
      x: pillX,
      y: pillY,
      width: pillWidth,
      height: pillHeight,
      color: pillBgColor,
      borderColor: pillBorderColor,
      borderWidth: 1,
    });

    page.drawText(statusText, {
      x: pillX + 8,
      y: pillY + 5,
      size: 8,
      font: boldFont,
      color: pillTextColor,
    });

    // Draw Header Separator
    page.drawLine({
      start: { x: 97.64, y: 685 },
      end: { x: 497.64, y: 685 },
      thickness: 1,
      color: rgb(0.15, 0.16, 0.2),
    });

    // 2. Booking ID & Room Type Row
    page.drawText("ID BOOKING", {
      x: 120,
      y: 655,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(`#${booking.id.split("-")[0].toUpperCase()}`, {
      x: 120,
      y: 638,
      size: 11,
      font: boldFont,
      color: white,
    });

    page.drawText("TIPE KAMAR", {
      x: 320,
      y: 655,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(room.type || "Room", {
      x: 320,
      y: 638,
      size: 11,
      font: regularFont,
      color: white,
    });

    // 3. Accommodation Row
    page.drawText("AKOMODASI", {
      x: 120,
      y: 598,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(room.name || "Kamar tidak diketahui", {
      x: 120,
      y: 576,
      size: 15,
      font: serifRegular,
      color: white,
    });

    // Draw fields separator
    page.drawLine({
      start: { x: 120, y: 555 },
      end: { x: 475, y: 555 },
      thickness: 0.5,
      color: rgb(0.15, 0.16, 0.2),
    });

    // 4. Check-in & Check-out Row
    page.drawText("CHECK-IN", {
      x: 120,
      y: 532,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(formatDate(booking.check_in), {
      x: 120,
      y: 515,
      size: 11,
      font: regularFont,
      color: white,
    });

    page.drawText("CHECK-OUT", {
      x: 320,
      y: 532,
      size: 8,
      font: boldFont,
      color: muted,
    });
    page.drawText(formatDate(booking.check_out), {
      x: 320,
      y: 515,
      size: 11,
      font: regularFont,
      color: white,
    });

    // 5. Perforation Line
    // Left notch circle
    page.drawCircle({
      x: 97.64,
      y: 470,
      size: 20,
      color: darkBackground,
    });
    // Right notch circle
    page.drawCircle({
      x: 497.64,
      y: 470,
      size: 20,
      color: darkBackground,
    });
    // Dashed line
    const startX = 115;
    const endX = 480;
    const dashLength = 4;
    const gapLength = 6;
    for (let currentX = startX; currentX < endX; currentX += (dashLength + gapLength)) {
      page.drawLine({
        start: { x: currentX, y: 470 },
        end: { x: Math.min(currentX + dashLength, endX), y: 470 },
        thickness: 1,
        color: gold,
      });
    }

    // Helper for centering text
    const drawCenteredText = (text: string, yVal: number, size: number, font: any, color: any) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: 297.64 - textWidth / 2,
        y: yVal,
        size,
        font,
        color,
      });
    };

    // 6. Total Pembayaran
    drawCenteredText("TOTAL PEMBAYARAN", 430, 8, boldFont, muted);
    drawCenteredText(formatCurrency(booking.total_price), 402, 22, serifBold, gold);

    // 7. QR Code Card
    // Generate QR code PNG buffer
    const qrCodeBuffer = await QRCode.toBuffer(`aura-voucher-${booking.id}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
    const qrImage = await pdf.embedPng(qrCodeBuffer);

    // Draw white background card for QR Code
    page.drawRectangle({
      x: 236.64,
      y: 230,
      width: 122,
      height: 122,
      color: white,
    });
    
    // Draw QR code image
    page.drawImage(qrImage, {
      x: 242.64,
      y: 236,
      width: 110,
      height: 110,
    });

    // 8. Footer Instructions
    drawCenteredText("TUNJUKKAN VOUCHER SAAT CHECK-IN", 195, 8, boldFont, muted);
    drawCenteredText("AURA HOTEL JAKARTA", 160, 10, serifBold, gold);

    const bytes = await pdf.save();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="aura-ticket-${booking.id}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error generating PDF:", err);
    return NextResponse.json({ error: "Failed to generate voucher" }, { status: 500 });
  }
}
