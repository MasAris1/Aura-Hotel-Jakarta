import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { mergeRoomCatalogRooms } from "@/lib/roomCatalog";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rooms, error } = await supabaseAdmin
      .from("rooms")
      .select("*")
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
    }

    return NextResponse.json({ rooms: mergeRoomCatalogRooms(rooms ?? []) });
  } catch {
    return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}
