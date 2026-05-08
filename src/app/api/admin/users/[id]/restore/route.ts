import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminApi";

const profileSelect = "id, first_name, last_name, role, deleted_at, created_at";

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
      .update({ deleted_at: null })
      .eq("id", id)
      .select(profileSelect)
      .single();

    if (error || !profile) {
      return NextResponse.json({ error: "Failed to restore user profile" }, { status: 500 });
    }

    const authUser = await access.supabaseAdmin.auth.admin.getUserById(id);

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
        email: authUser.data.user?.email ?? "",
        last_sign_in_at: authUser.data.user?.last_sign_in_at ?? null,
        email_confirmed_at: authUser.data.user?.email_confirmed_at ?? null,
        is_current_user: id === access.user.id,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to restore user" }, { status: 500 });
  }
}
