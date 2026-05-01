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

    const profileMap = new Map((profiles ?? []).map((entry) => [entry.id, entry]));
    const authUserIds = new Set((usersData.users ?? []).map((authUser) => authUser.id));
    const authRows = (usersData.users ?? []).map((authUser) => {
      const profile = profileMap.get(authUser.id);

      return {
        id: authUser.id,
        email: authUser.email ?? "",
        first_name: profile?.first_name ?? null,
        last_name: profile?.last_name ?? null,
        role: profile?.role ?? "guest",
        created_at: profile?.created_at ?? authUser.created_at ?? null,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        email_confirmed_at: authUser.email_confirmed_at ?? null,
        is_current_user: authUser.id === user.id,
      };
    });
    const profileOnlyRows = (profiles ?? [])
      .filter((entry) => !authUserIds.has(entry.id))
      .map((entry) => ({
        ...entry,
        email: "",
        last_sign_in_at: null,
        email_confirmed_at: null,
        is_current_user: entry.id === user.id,
      }));

    return NextResponse.json({
      users: [...authRows, ...profileOnlyRows].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

        return rightTime - leftTime;
      }),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
