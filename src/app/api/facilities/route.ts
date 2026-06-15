import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getStaticFacilities, mergeFacilityCatalogItems } from "@/lib/facilityCatalog";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: facilities, error } = await supabaseAdmin
      .from("facilities")
      .select("id, title, description, icon, image_url, status, sort_order, deleted_at, created_at");

    if (error) {
      return NextResponse.json({ facilities: getStaticFacilities() });
    }

    return NextResponse.json({ facilities: mergeFacilityCatalogItems(facilities ?? []) });
  } catch {
    return NextResponse.json({ facilities: getStaticFacilities() });
  }
}
