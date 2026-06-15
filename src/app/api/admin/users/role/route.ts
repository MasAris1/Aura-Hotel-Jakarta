import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";

const payloadSchema = z.object({
  targetUserId: z.string().uuid("Invalid user id"),
  role: z.enum(["guest", "receptionist", "admin"]),
});

export async function PATCH(request: Request) {
  try {
    const parsed = payloadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role update payload" }, { status: 400 });
    }

    const access = await requireAdminApi();
    if ("error" in access) {
      return access.error;
    }

    const { targetUserId, role } = parsed.data;
    if (targetUserId === access.user.id) {
      return NextResponse.json({ error: "You cannot change your own role from the admin UI" }, { status: 409 });
    }

    const { data: targetProfile, error: targetError } = await access.supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, role, created_at")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: "Failed to load target user" }, { status: 500 });
    }

    if (!targetProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { data: updatedProfile, error: updateError } = await access.supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("id", targetUserId)
      .select("id, first_name, last_name, role, created_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
    }

    const authUser = await access.supabaseAdmin.auth.admin.getUserById(targetUserId);

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "profiles",
      record_id: targetUserId,
      action: "UPDATE",
      old_data: targetProfile,
      new_data: updatedProfile,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      user: {
        ...updatedProfile,
        email: authUser.data.user?.email ?? "",
        last_sign_in_at: authUser.data.user?.last_sign_in_at ?? null,
        email_confirmed_at: authUser.data.user?.email_confirmed_at ?? null,
        is_current_user: false,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
  }
}
