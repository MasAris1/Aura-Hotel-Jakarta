import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getStaticRooms, mergeRoomCatalogRooms, resolveRoomDetails } from "@/lib/roomCatalog";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const [{ data: rooms, error }, { data: units }] = await Promise.all([
      supabaseAdmin.from("rooms").select("*"),
      supabaseAdmin.from("room_units").select("room_id").is("deleted_at", null).eq("status", "AVAILABLE")
    ]);

    if (error) {
      return NextResponse.json({
        rooms: getStaticRooms().map((room) => resolveRoomDetails(room.id)),
      });
    }

    const unitsCountByRoom: Record<string, number> = {};
    if (units) {
      for (const unit of units) {
        unitsCountByRoom[unit.room_id] = (unitsCountByRoom[unit.room_id] || 0) + 1;
      }
    }

    const roomsWithUnits = (rooms ?? []).map((room) => ({
      ...room,
      total_units: unitsCountByRoom[room.id] || 0,
    }));

    return NextResponse.json({ rooms: mergeRoomCatalogRooms(roomsWithUnits) });
  } catch {
    return NextResponse.json({
      rooms: getStaticRooms().map((room) => resolveRoomDetails(room.id)),
    });
  }
}
