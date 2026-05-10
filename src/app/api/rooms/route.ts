import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getStaticRooms, mergeRoomCatalogRooms, resolveRoomDetails } from "@/lib/roomCatalog";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rooms, error } = await supabaseAdmin
      .from("rooms")
      .select("*");

    if (error) {
      return NextResponse.json({
        rooms: getStaticRooms().map((room) => resolveRoomDetails(room.id)),
      });
    }

    return NextResponse.json({ rooms: mergeRoomCatalogRooms(rooms ?? []) });
  } catch {
    return NextResponse.json({
      rooms: getStaticRooms().map((room) => resolveRoomDetails(room.id)),
    });
  }
}
