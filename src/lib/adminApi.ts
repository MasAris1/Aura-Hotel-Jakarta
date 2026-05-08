import { NextResponse } from "next/server";
import { getProfileForUser, isAdminRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export async function requireAdminApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const profile = await getProfileForUser(supabase, user.id);

  if (!isAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user,
    profile,
    supabase,
    supabaseAdmin: getSupabaseAdmin(),
  };
}
