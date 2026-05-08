import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

const roomRateSelect = "id, room_id, rate_date, price, deleted_at, created_at";

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
      .update({ deleted_at: null })
      .eq("id", id)
      .select(roomRateSelect)
      .single();

    if (error || !rate) {
      return NextResponse.json({ error: "Failed to restore room rate" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to restore room rate" }, { status: 500 });
  }
}
