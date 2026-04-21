import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getProfileForUser, isAdminRole } from "@/lib/auth";
import { normalizeRoomImages } from "@/lib/roomCatalog";

const roomSchema = z.object({
  name: z.string().min(2, "Room name is required"),
  type: z.string().min(2, "Room type is required"),
  base_price: z.number().nonnegative("Base price must be valid"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  images: z.array(z.string().url("Images must use valid URLs")).default([]),
  description: z.string().nullable().optional(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const profile = await getProfileForUser(supabase, user.id);
  if (!isAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const access = await requireAdmin();
  if ("error" in access) {
    return access.error;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("rooms")
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
    }

    return NextResponse.json({
      rooms: (data ?? []).map((room) => ({
        ...room,
        images: normalizeRoomImages(room.images),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdmin();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = roomSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid room payload" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .insert({
        ...parsed.data,
        description: parsed.data.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
    }

    await supabaseAdmin.from("audit_logs").insert({
      table_name: "rooms",
      record_id: room.id,
      action: "INSERT",
      new_data: room,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      room: {
        ...room,
        images: normalizeRoomImages(room.images),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
