import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";
import { getSupabaseAdmin } from "@/utils/supabase/admin";

const userSchema = z.object({
  email: z.string().email("Email is required").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().nullable().optional(),
  role: z.enum(["guest", "receptionist", "admin"]),
});

const profileSelect = "id, first_name, last_name, role, deleted_at, created_at";

async function getAuthShape(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  id: string,
) {
  const result = await supabaseAdmin.auth.admin.getUserById(id);

  return {
    email: result.data.user?.email ?? "",
    last_sign_in_at: result.data.user?.last_sign_in_at ?? null,
    email_confirmed_at: result.data.user?.email_confirmed_at ?? null,
  };
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
    const parsed = userSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid user payload" }, { status: 400 });
    }

    const { id } = (await context.params) as { id: string };
    const { data: currentProfile, error: currentError } = await access.supabaseAdmin
      .from("profiles")
      .select(profileSelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load user profile" }, { status: 500 });
    }

    if (!currentProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (id === access.user.id && parsed.data.role !== currentProfile.role) {
      return NextResponse.json({ error: "You cannot change your own role from the admin UI" }, { status: 409 });
    }

    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, string> } = {
      user_metadata: {
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name ?? "",
        full_name: `${parsed.data.first_name} ${parsed.data.last_name ?? ""}`.trim(),
      },
    };

    if (parsed.data.email) {
      authUpdate.email = parsed.data.email;
    }

    if (parsed.data.password) {
      authUpdate.password = parsed.data.password;
    }

    const { error: authError } = await access.supabaseAdmin.auth.admin.updateUserById(id, authUpdate);

    if (authError) {
      return NextResponse.json({ error: "Failed to update auth user" }, { status: 500 });
    }

    const { data: profile, error } = await access.supabaseAdmin
      .from("profiles")
      .update({
        first_name: parsed.data.first_name,
        last_name: parsed.data.last_name ?? "",
        role: parsed.data.role,
      })
      .eq("id", id)
      .select(profileSelect)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Failed to update user profile" }, { status: 500 });
    }

    const authShape = await getAuthShape(access.supabaseAdmin, id);

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "profiles",
      record_id: profile.id,
      action: "UPDATE",
      old_data: currentProfile,
      new_data: profile,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      user: {
        ...profile,
        ...authShape,
        is_current_user: id === access.user.id,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
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

    if (id === access.user.id) {
      return NextResponse.json({ error: "You cannot archive your own account" }, { status: 409 });
    }

    const { data: currentProfile, error: currentError } = await access.supabaseAdmin
      .from("profiles")
      .select(profileSelect)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: "Failed to load user profile" }, { status: 500 });
    }

    if (!currentProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { data: profile, error } = await access.supabaseAdmin
      .from("profiles")
      .update({ deleted_at: new Date().toISOString(), role: "guest" })
      .eq("id", id)
      .select(profileSelect)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Failed to archive user profile" }, { status: 500 });
    }

    const authShape = await getAuthShape(access.supabaseAdmin, id);

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "profiles",
      record_id: profile.id,
      action: "UPDATE",
      old_data: currentProfile,
      new_data: profile,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      user: {
        ...profile,
        ...authShape,
        is_current_user: false,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to archive user" }, { status: 500 });
  }
}
