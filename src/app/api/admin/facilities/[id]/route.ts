import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

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
    const { data: currentFacility, error: currentError } = await access.supabaseAdmin
      .from("facilities")
      .select(facilitySelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load facility" }, { status: 500 });
    }

    if (!currentFacility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    const { data: facility, error } = await access.supabaseAdmin
      .from("facilities")
      .update({
        ...parsed.data,
        icon: parsed.data.icon ?? "concierge",
        image_url: parsed.data.image_url ?? null,
        sort_order: parsed.data.sort_order ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(facilitySelect)
      .single();

    if (error || !facility) {
      return NextResponse.json({ error: "Failed to update facility" }, { status: 500 });
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
    const { data: currentFacility, error: currentError } = await access.supabaseAdmin
      .from("facilities")
      .select(facilitySelect)
      .eq("id", id)
      .maybeSingle();

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
      .eq("id", id)
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
