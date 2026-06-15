import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/adminApi";
import { getStaticFacilityById } from "@/lib/facilityCatalog";
import type { Database } from "@/types/supabase";

const facilitySelect =
  "id, title, description, icon, image_url, status, sort_order, deleted_at, created_at, updated_at";

const facilitySchema = z.object({
  title: z.string().min(2, "Facility title is required"),
  description: z.string().min(8, "Facility description is required"),
  icon: z.string().min(2, "Facility icon is required").nullable().optional(),
  image_url: z.string().url("Image must use a valid URL").nullable().optional(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
  sort_order: z.number().int().min(0).nullable().optional(),
});

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function findFacility(
  supabaseAdmin: SupabaseClient<Database>,
  id: string,
  fallbackTitle?: string,
) {
  if (uuidPattern.test(id)) {
    return supabaseAdmin
      .from("facilities")
      .select(facilitySelect)
      .eq("id", id)
      .maybeSingle();
  }

  const staticFacility = getStaticFacilityById(id);
  const title = fallbackTitle || staticFacility?.title;

  if (!title) {
    return { data: null, error: null };
  }

  return supabaseAdmin
    .from("facilities")
    .select(facilitySelect)
    .eq("title", title)
    .maybeSingle();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> },
) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = facilitySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid facility payload" }, { status: 400 });
    }

    const { id } = (await context.params) as { id: string };
    const { data: currentFacility, error: currentError } = await findFacility(
      access.supabaseAdmin,
      id,
      parsed.data.title,
    );

    if (currentError) {
      return NextResponse.json({ error: "Failed to load facility" }, { status: 500 });
    }

    const payload = {
        ...parsed.data,
        icon: parsed.data.icon ?? "concierge",
        image_url: parsed.data.image_url ?? null,
        sort_order: parsed.data.sort_order ?? null,
        updated_at: new Date().toISOString(),
      };
    const query = currentFacility
      ? access.supabaseAdmin.from("facilities").update(payload).eq("id", currentFacility.id)
      : access.supabaseAdmin.from("facilities").insert(payload);
    const { data: facility, error } = await query
      .select(facilitySelect)
      .single();

    if (error || !facility) {
      return NextResponse.json({ error: "Failed to update facility" }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "facilities",
      record_id: facility.id,
      action: currentFacility ? "UPDATE" : "INSERT",
      old_data: currentFacility,
      new_data: facility,
      performed_by: access.user.id,
    });

    return NextResponse.json({ facility });
  } catch {
    return NextResponse.json({ error: "Failed to update facility" }, { status: 500 });
  }
}

export async function DELETE(
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
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentFacility.id)
      .select(facilitySelect)
      .single();

    if (error || !facility) {
      return NextResponse.json({ error: "Failed to archive facility" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to archive facility" }, { status: 500 });
  }
}
