import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const roomRateSchema = z.object({
  room_id: z.string().uuid("Invalid room id"),
  rate_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().nonnegative("Price must be valid"),
});

const roomRateSelect = "id, room_id, rate_date, price, deleted_at, created_at";

export async function GET() {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  const [{ data: rates, error: ratesError }, { data: rooms, error: roomsError }] =
    await Promise.all([
      access.supabaseAdmin
        .from("room_rates")
        .select(roomRateSelect)
        .order("rate_date", { ascending: false }),
      access.supabaseAdmin
        .from("rooms")
        .select("id, name, type, deleted_at")
        .order("name", { ascending: true }),
    ]);

  if (ratesError || roomsError) {
    return NextResponse.json({ error: "Failed to load room rates" }, { status: 500 });
  }

  return NextResponse.json({ rates: rates ?? [], rooms: rooms ?? [] });
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
      .select(roomRateSelect)
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

    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "Failed to create room rate" }, { status: 500 });
  }
}
