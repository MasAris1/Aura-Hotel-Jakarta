import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getProfileForUser, isAdminRole } from "@/lib/auth";
import { normalizeRoomImages } from "@/lib/roomCatalog";

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

export async function POST(
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
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, name, type, base_price, capacity, images, description, status, deleted_at, created_at")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Failed to restore room" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to restore room" }, { status: 500 });
  }
}
