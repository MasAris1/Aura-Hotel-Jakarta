import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getProfileForUser, isAdminRole } from "@/lib/auth";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileForUser(supabase, user.id);
    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [{ data: profiles, error: profilesError }, { data: usersData, error: usersError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, role, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        }),
      ]);

    if (profilesError || usersError) {
      return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
    }

    const emailMap = new Map(
      (usersData.users ?? []).map((authUser) => [authUser.id, authUser.email ?? ""]),
    );

    return NextResponse.json({
      users: (profiles ?? []).map((entry) => ({
        ...entry,
        email: emailMap.get(entry.id) ?? "",
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
