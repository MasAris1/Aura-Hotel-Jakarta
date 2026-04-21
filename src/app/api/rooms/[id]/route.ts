import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getStaticRoomById, resolveRoomDetails } from "@/lib/roomCatalog";

export async function GET(
  _: Request,
  context: { params: Promise<unknown> },
) {
  try {
    const { id } = (await context.params) as { id: string };
    const supabaseAdmin = getSupabaseAdmin();
    const { data: room, error } = await supabaseAdmin
      .from("rooms")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
    }

    if (room?.deleted_at) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!room && !getStaticRoomById(id)) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const resolvedRoom = resolveRoomDetails(id, room ?? undefined);
    return NextResponse.json({ room: resolvedRoom });
  } catch {
    return NextResponse.json({ error: "Failed to load room" }, { status: 500 });
  }
}
