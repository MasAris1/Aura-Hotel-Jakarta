import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffApi } from "@/lib/adminApi";

const roomUnitStatusSchema = z.enum([
  "AVAILABLE",
  "OCCUPIED",
  "MAINTENANCE",
  "CLEANING",
  "RESERVED",
]);

const roomUnitUpdateSchema = z.object({
  status: roomUnitStatusSchema,
  current_guest_name: z.string().trim().max(120).nullable().optional(),
  current_guest_email: z.string().trim().email().nullable().optional().or(z.literal("")),
  check_in: z.string().trim().nullable().optional(),
  check_out: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function normalizeNullableText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function normalizeDate(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireStaffApi();
  if ("error" in access) {
    return access.error;
  }

  const { id } = await context.params;
  const parsed = roomUnitUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid room unit payload" }, { status: 400 });
  }

  const { status } = parsed.data;
  const clearsGuestData = status === "AVAILABLE" || status === "MAINTENANCE" || status === "CLEANING";
  const payload = {
    status,
    current_guest_name: clearsGuestData
      ? null
      : normalizeNullableText(parsed.data.current_guest_name),
    current_guest_email: clearsGuestData
      ? null
      : normalizeNullableText(
          parsed.data.current_guest_email === "" ? null : parsed.data.current_guest_email,
        ),
    check_in: clearsGuestData ? null : normalizeDate(parsed.data.check_in),
    check_out: clearsGuestData ? null : normalizeDate(parsed.data.check_out),
    notes: normalizeNullableText(parsed.data.notes),
    updated_at: new Date().toISOString(),
  };

  const { data: currentUnit, error: currentError } = await access.supabaseAdmin
    .from("room_units")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (currentError) {
    return NextResponse.json(
      { error: "Failed to load room unit", details: currentError.message },
      { status: 500 },
    );
  }

  if (!currentUnit) {
    return NextResponse.json({ error: "Room unit not found" }, { status: 404 });
  }

  const { data: roomUnit, error } = await access.supabaseAdmin
    .from("room_units")
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null)
    .select(
      `
        *,
        rooms (
          id,
          name,
          type,
          base_price,
          capacity
        )
      `,
    )
    .single();

  if (error || !roomUnit) {
    return NextResponse.json(
      { error: "Failed to update room unit", details: error?.message },
      { status: 500 },
    );
  }

  await access.supabaseAdmin.from("audit_logs").insert({
    table_name: "room_units",
    record_id: roomUnit.id,
    action: "UPDATE",
    old_data: currentUnit,
    new_data: roomUnit,
    performed_by: access.user.id,
  });

  return NextResponse.json({ roomUnit });
}
