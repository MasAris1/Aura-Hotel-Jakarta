import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const roomRateSchema = z.object({
  room_id: z.string().uuid("Invalid room id"),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().nonnegative("Price must be valid"),
});

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

function normalizeRoom(room: Record<string, unknown>) {
  return {
    id: String(room.id ?? ""),
    name: typeof room.name === "string" ? room.name : null,
    type: typeof room.type === "string" ? room.type : null,
    deleted_at: typeof room.deleted_at === "string" ? room.deleted_at : null,
  };
}

export async function GET() {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  const [ratesResult, roomsResult] = await Promise.all([
    access.supabaseAdmin
      .from("room_rates")
      .select("*")
      .order("rate_date", { ascending: false }),
    access.supabaseAdmin
      .from("rooms")
      .select("*")
      .order("name", { ascending: true }),
  ]);
  let rates: Record<string, unknown>[] | null = ratesResult.data;
  let ratesError = ratesResult.error;
  const roomRows = roomsResult.data;
  const roomRowsError = roomsResult.error;

  if (ratesError) {
    const retry = await access.supabaseAdmin
      .from("room_rates")
      .select("id, room_id, rate_date, price, created_at")
      .order("rate_date", { ascending: false });

    rates = retry.data;
    ratesError = retry.error;
  }

  if (ratesError || roomRowsError) {
    return NextResponse.json(
      { error: "Failed to load room rates", details: ratesError?.message ?? roomRowsError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    rates: (rates ?? []).map((rate) => normalizeRate(rate)),
    rooms: (roomRows ?? []).map((room) => normalizeRoom(room)),
  });
}

export async function POST(request: Request) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = roomRateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid room rate payload" }, { status: 400 });
    }

    const { data: rate, error } = await access.supabaseAdmin
      .from("room_rates")
      .insert(parsed.data)
      .select("*")
      .single();

    if (error || !rate) {
      return NextResponse.json({ error: "Failed to create room rate" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "room_rates",
      record_id: rate.id,
      action: "INSERT",
      new_data: rate,
      performed_by: access.user.id,
    });

    return NextResponse.json({ rate: normalizeRate(rate) });
  } catch {
    return NextResponse.json({ error: "Failed to create room rate" }, { status: 500 });
  }
}
