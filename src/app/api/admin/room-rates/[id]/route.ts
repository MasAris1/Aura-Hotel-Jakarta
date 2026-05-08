import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const roomRateSchema = z.object({
  room_id: z.string().uuid("Invalid room id"),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().nonnegative("Price must be valid"),
});

const roomRateSelect = "id, room_id, rate_date, price, deleted_at, created_at";

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = roomRateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid room rate payload" }, { status: 400 });
    }

    const { id } = (await context.params) as { id: string };
    const { data: currentRate, error: currentError } = await access.supabaseAdmin
      .from("room_rates")
      .select(roomRateSelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room rate" }, { status: 500 });
    }

    if (!currentRate) {
      return NextResponse.json({ error: "Room rate not found" }, { status: 404 });
    }

    const { data: rate, error } = await access.supabaseAdmin
      .from("room_rates")
      .update(parsed.data)
      .eq("id", id)
      .select(roomRateSelect)
      .single();

    if (error || !rate) {
      return NextResponse.json({ error: "Failed to update room rate" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "room_rates",
      record_id: rate.id,
      action: "UPDATE",
      old_data: currentRate,
      new_data: rate,
      performed_by: access.user.id,
    });

    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "Failed to update room rate" }, { status: 500 });
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
    const { data: currentRate, error: currentError } = await access.supabaseAdmin
      .from("room_rates")
      .select(roomRateSelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room rate" }, { status: 500 });
    }

    if (!currentRate) {
      return NextResponse.json({ error: "Room rate not found" }, { status: 404 });
    }

    const { data: rate, error } = await access.supabaseAdmin
      .from("room_rates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select(roomRateSelect)
      .single();

    if (error || !rate) {
      return NextResponse.json({ error: "Failed to archive room rate" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "room_rates",
      record_id: rate.id,
      action: "UPDATE",
      old_data: currentRate,
      new_data: rate,
      performed_by: access.user.id,
    });

    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "Failed to archive room rate" }, { status: 500 });
  }
}
