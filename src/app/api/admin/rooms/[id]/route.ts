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

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdmin();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = roomSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid room payload" }, { status: 400 });
    }

    const { id } = (await context.params) as { id: string };
    const supabaseAdmin = getSupabaseAdmin();
    const { data: currentRoom, error: currentError } = await supabaseAdmin
      .from("rooms")
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
    }

    if (!currentRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .update({
        ...parsed.data,
        description: parsed.data.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
    }

    await supabaseAdmin.from("audit_logs").insert({
      table_name: "rooms",
      record_id: room.id,
      action: "UPDATE",
      old_data: currentRoom,
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
    return NextResponse.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(
  _: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdmin();
  if ("error" in access) {
    return access.error;
  }

  try {
    const { id } = (await context.params) as { id: string };
    const supabaseAdmin = getSupabaseAdmin();
    const { data: currentRoom, error: currentError } = await supabaseAdmin
      .from("rooms")
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
    }

    if (!currentRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Failed to archive room" }, { status: 500 });
    }

    await supabaseAdmin.from("audit_logs").insert({
      table_name: "rooms",
      record_id: room.id,
      action: "UPDATE",
      old_data: currentRoom,
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
    return NextResponse.json({ error: "Failed to archive room" }, { status: 500 });
  }
}
