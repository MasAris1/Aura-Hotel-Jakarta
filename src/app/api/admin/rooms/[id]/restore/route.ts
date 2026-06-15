import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";
import { normalizeRoomImages } from "@/lib/roomCatalog";
import { revalidateAllRoomData } from "@/lib/revalidate";

function normalizeAdminRoom(room: Record<string, unknown>) {
  return {
    id: String(room.id ?? ""),
    name: String(room.name ?? ""),
    type: typeof room.type === "string" ? room.type : "Room",
    base_price: Number(room.base_price ?? 0),
    capacity: Number(room.capacity ?? 1),
    images: normalizeRoomImages(
      Array.isArray(room.images)
        ? room.images
        : typeof room.image_url === "string" && room.image_url
          ? [room.image_url]
          : [],
    ),
    description: typeof room.description === "string" ? room.description : null,
    status: typeof room.status === "string" ? room.status : "AVAILABLE",
    deleted_at: typeof room.deleted_at === "string" ? room.deleted_at : null,
    created_at: typeof room.created_at === "string" ? room.created_at : null,
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
    const { data: currentRoom, error: currentError } = await access.supabaseAdmin
      .from("rooms")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
    }

    if (!currentRoom) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const { data: room, error } = await access.supabaseAdmin
      .from("rooms")
      .update({
        deleted_at: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !room) {
      return NextResponse.json({ error: "Failed to restore room" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "rooms",
      record_id: room.id,
      action: "UPDATE",
      old_data: currentRoom,
      new_data: room,
      performed_by: access.user.id,
    });

    revalidateAllRoomData(id);

    return NextResponse.json({
      room: normalizeAdminRoom(room as Record<string, unknown>),
    });
  } catch {
    return NextResponse.json({ error: "Failed to restore room" }, { status: 500 });
  }
}
