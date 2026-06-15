import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const bookingSchema = z.object({
  user_id: z.string().uuid("Invalid user id").nullable().optional(),
  room_id: z.string().uuid("Invalid room id"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().nullable().optional(),
  email: z.string().email("Email is required"),
  special_requests: z.string().nullable().optional(),
  check_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_out: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  total_price: z.number().nonnegative("Total price must be valid"),
  status: z.enum(["UNPAID", "PAID", "EXPIRED"]),
});

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

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = bookingSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid booking payload" }, { status: 400 });
    }

    const checkIn = new Date(`${parsed.data.check_in}T00:00:00`);
    const checkOut = new Date(`${parsed.data.check_out}T00:00:00`);

    if (checkOut <= checkIn) {
      return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
    }

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

    const payload = {
      ...parsed.data,
      last_name: parsed.data.last_name ?? "",
      special_requests: parsed.data.special_requests ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: booking, error } = await access.supabaseAdmin
      .from("bookings")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}

export async function DELETE(
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
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error?.message.includes("deleted_at")) {
      result = await access.supabaseAdmin
        .from("bookings")
        .update({
          status: "EXPIRED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
    }

    const { data: booking, error } = result;

    if (error || !booking) {
      return NextResponse.json({ error: "Failed to archive booking" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to archive booking" }, { status: 500 });
  }
}
