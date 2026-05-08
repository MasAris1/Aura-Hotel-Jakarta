import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

const bookingSelect =
  "id, user_id, room_id, first_name, last_name, email, special_requests, check_in, check_out, total_price, status, deleted_at, created_at, updated_at";

export async function POST(
  _: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = (await context.params) as { id: string };
    const { data: currentBooking, error: currentError } = await access.supabaseAdmin
      .from("bookings")
      .select(bookingSelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
    }

    if (!currentBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const { data: booking, error } = await access.supabaseAdmin
      .from("bookings")
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(bookingSelect)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: "Failed to restore booking" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "bookings",
      record_id: booking.id,
      action: "UPDATE",
      old_data: currentBooking,
      new_data: booking,
      performed_by: access.user.id,
    });

    return NextResponse.json({ booking });
  } catch {
    return NextResponse.json({ error: "Failed to restore booking" }, { status: 500 });
  }
}
