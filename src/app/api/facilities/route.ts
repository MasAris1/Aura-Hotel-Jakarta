import { NextResponse } from "next/server";
import { mergeFacilityCatalogItems } from "@/lib/facilityCatalog";
import { getSupabaseAdmin } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: facilities, error } = await supabaseAdmin
      .from("facilities")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ facilities: mergeFacilityCatalogItems([]) });
    }

    return NextResponse.json({ facilities: mergeFacilityCatalogItems(facilities ?? []) });
  } catch {
    return NextResponse.json({ facilities: mergeFacilityCatalogItems([]) });
  }
}
