import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/adminApi";
import { getStaticFacilityById } from "@/lib/facilityCatalog";
import type { Database } from "@/types/supabase";

const facilitySelect =
  "id, title, description, icon, image_url, status, sort_order, deleted_at, created_at, updated_at";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findFacility(supabaseAdmin: SupabaseClient<Database>, id: string) {
  if (uuidPattern.test(id)) {
    return supabaseAdmin
      .from("facilities")
      .select(facilitySelect)
      .eq("id", id)
      .maybeSingle();
  }

  const staticFacility = getStaticFacilityById(id);

  if (!staticFacility) {
    return { data: null, error: null };
  }

  return supabaseAdmin
    .from("facilities")
    .select(facilitySelect)
    .eq("title", staticFacility.title)
    .maybeSingle();
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
    const { data: currentFacility, error: currentError } = await findFacility(
      access.supabaseAdmin,
      id,
    );

    if (currentError) {
      return NextResponse.json({ error: "Failed to load facility" }, { status: 500 });
    }

    if (!currentFacility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    const { data: facility, error } = await access.supabaseAdmin
      .from("facilities")
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentFacility.id)
      .select(facilitySelect)
      .single();

    if (error || !facility) {
      return NextResponse.json({ error: "Failed to restore facility" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "facilities",
      record_id: facility.id,
      action: "UPDATE",
      old_data: currentFacility,
      new_data: facility,
      performed_by: access.user.id,
    });

    return NextResponse.json({ facility });
  } catch {
    return NextResponse.json({ error: "Failed to restore facility" }, { status: 500 });
  }
}
