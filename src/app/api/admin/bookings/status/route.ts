import { NextResponse } from "next/server";
import { z } from "zod";
import { midtransTransaction } from "@/lib/midtrans";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getProfileForUser, isStaffRole } from "@/lib/auth";
import {
  mapBookingStatusToTransactionStatus,
  upsertBookingTransaction,
} from "@/lib/transactions";

const bookingActionSchema = z.object({
  bookingId: z.string().uuid("Invalid booking id"),
  action: z.enum(["check_in", "check_out", "refund"]),
});

const transitionConfig = {
  check_in: {
    allowedFrom: ["PAID"],
    nextStatus: "CHECKED_IN",
  },
  check_out: {
    allowedFrom: ["CHECKED_IN"],
    nextStatus: "CHECKED_OUT",
  },
  refund: {
    allowedFrom: ["PAID", "CHECKED_IN"],
    nextStatus: "REFUNDED",
  },
} as const;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}

export async function POST(req: Request) {
  try {
    const parsed = bookingActionSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid admin action payload" }, { status: 400 });
    }

    const { bookingId, action } = parsed.data;
    const supabase = await createClient();
    const supabaseAdmin = getSupabaseAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileForUser(supabase, user.id);
    if (!isStaffRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, total_price")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) {
      return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
    }

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const transition = transitionConfig[action];
    const allowedFrom = [...transition.allowedFrom] as string[];

    if (!allowedFrom.includes(booking.status ?? "")) {
      return NextResponse.json(
        { error: `Booking dengan status ${booking.status ?? "UNKNOWN"} tidak bisa diproses untuk aksi ini.` },
        { status: 409 },
      );
    }

    if (action === "refund") {
      try {
        await midtransTransaction.refund(booking.id, {
          refund_key: `${booking.id}-${Date.now()}`,
          amount: Number(booking.total_price ?? 0),
          reason: `Manual refund by ${profile?.role ?? "staff"}`,
        });
      } catch (refundError) {
        console.error("Midtrans Refund Error:", getErrorMessage(refundError));
        return NextResponse.json(
          { error: "Refund Midtrans gagal diproses. Status booking tidak diubah." },
          { status: 502 },
        );
      }
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: transition.nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
    }

    await upsertBookingTransaction(supabaseAdmin, {
      bookingId: booking.id,
      amount: Number(booking.total_price ?? 0),
      paymentType: "midtrans",
      status:
        action === "refund"
          ? "REFUNDED"
          : mapBookingStatusToTransactionStatus(transition.nextStatus),
    });

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      status: transition.nextStatus,
    });
  } catch (error) {
    console.error("Admin Booking Action Error:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to process admin action" }, { status: 500 });
  }
}
