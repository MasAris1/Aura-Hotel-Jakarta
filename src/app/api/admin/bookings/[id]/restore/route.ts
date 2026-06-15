import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

function normalizeBooking(booking: Record<string, unknown>) {
  return {
    id: String(booking.id ?? ""),
    user_id: typeof booking.user_id === "string" ? booking.user_id : null,
    room_id: typeof booking.room_id === "string" ? booking.room_id : null,
    first_name: typeof booking.first_name === "string" ? booking.first_name : null,
    last_name: typeof booking.last_name === "string" ? booking.last_name : null,
    email: typeof booking.email === "string" ? booking.email : null,
    special_requests:
      typeof booking.special_requests === "string" ? booking.special_requests : null,
    check_in: String(booking.check_in ?? ""),
    check_out: String(booking.check_out ?? ""),
    total_price: Number(booking.total_price ?? 0),
    status: typeof booking.status === "string" ? booking.status : null,
    deleted_at: typeof booking.deleted_at === "string" ? booking.deleted_at : null,
    created_at: typeof booking.created_at === "string" ? booking.created_at : null,
    updated_at: typeof booking.updated_at === "string" ? booking.updated_at : null,
  };
}

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
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
    }

    if (!currentBooking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    let result = await access.supabaseAdmin
      .from("bookings")
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error?.message.includes("deleted_at")) {
      result = await access.supabaseAdmin
        .from("bookings")
        .update({
          status: currentBooking.status ?? "UNPAID",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
    }

    const { data: booking, error } = result;

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

    return NextResponse.json({ booking: normalizeBooking(booking) });
  } catch {
    return NextResponse.json({ error: "Failed to restore booking" }, { status: 500 });
  }
}
