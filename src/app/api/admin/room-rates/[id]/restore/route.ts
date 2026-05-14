import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

function normalizeRate(rate: Record<string, unknown>) {
  return {
    id: String(rate.id ?? ""),
    room_id: typeof rate.room_id === "string" ? rate.room_id : null,
    rate_date: String(rate.rate_date ?? ""),
    price: Number(rate.price ?? 0),
    deleted_at: typeof rate.deleted_at === "string" ? rate.deleted_at : null,
    created_at: typeof rate.created_at === "string" ? rate.created_at : null,
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
    const { data: currentRate, error: currentError } = await access.supabaseAdmin
      .from("room_rates")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room rate" }, { status: 500 });
    }

    if (!currentRate) {
      return NextResponse.json({ error: "Room rate not found" }, { status: 404 });
    }

    let result = await access.supabaseAdmin
      .from("room_rates")
      .update({ deleted_at: null })
      .eq("id", id)
      .select("*")
      .single();

    if (result.error?.message.includes("deleted_at")) {
      result = await access.supabaseAdmin
        .from("room_rates")
        .update({ price: currentRate.price })
        .eq("id", id)
        .select("*")
        .single();
    }

    const { data: rate, error } = result;

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

    return NextResponse.json({ rate: normalizeRate(rate) });
  } catch {
    return NextResponse.json({ error: "Failed to restore room rate" }, { status: 500 });
  }
}
