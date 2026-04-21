import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getProfileForUser, isAdminRole } from "@/lib/auth";

const payloadSchema = z.object({
  targetUserId: z.string().uuid("Invalid user id"),
  role: z.enum(["guest", "receptionist"]),
});

export async function PATCH(request: Request) {
  try {
    const parsed = payloadSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role update payload" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requesterProfile = await getProfileForUser(supabase, user.id);
    if (!isAdminRole(requesterProfile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { targetUserId, role } = parsed.data;
    if (targetUserId === user.id) {
      return NextResponse.json({ error: "You cannot change your own role from the admin UI" }, { status: 409 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: targetProfile, error: targetError } = await supabaseAdmin
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

    if (targetProfile.role === "admin") {
      return NextResponse.json({ error: "Admin role can only be managed manually" }, { status: 409 });
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("id", targetUserId)
      .select("id, first_name, last_name, role, created_at")
      .single();

    if (updateError) {
      return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
    }

    const authUser = await supabaseAdmin.auth.admin.getUserById(targetUserId);

    await supabaseAdmin.from("audit_logs").insert({
      table_name: "profiles",
      record_id: targetUserId,
      action: "UPDATE",
      old_data: targetProfile,
      new_data: updatedProfile,
      performed_by: user.id,
    });

    return NextResponse.json({
      user: {
        ...updatedProfile,
        email: authUser.data.user?.email ?? "",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
  }
}
