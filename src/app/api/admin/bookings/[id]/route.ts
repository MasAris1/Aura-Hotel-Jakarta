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
  status: z.enum(["UNPAID", "PAID", "CHECKED_IN", "CHECKED_OUT", "EXPIRED", "REFUNDED"]),
});

const bookingSelect =
  "id, user_id, room_id, first_name, last_name, email, special_requests, check_in, check_out, total_price, status, deleted_at, created_at, updated_at";

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
      .select(bookingSelect)
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
      .select(bookingSelect)
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

    return NextResponse.json({ booking });
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
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(bookingSelect)
      .single();

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

    return NextResponse.json({ booking });
  } catch {
    return NextResponse.json({ error: "Failed to archive booking" }, { status: 500 });
  }
}
