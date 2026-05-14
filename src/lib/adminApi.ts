import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  ensureConfiguredAdminProfile,
  getProfileForUser,
  hasAdminAccess,
  hasStaffAccess,
} from "@/lib/auth";
import {
  hasEnabledTwoFactor,
  isTwoFactorVerifiedForUser,
  TWO_FACTOR_VERIFIED_COOKIE,
} from "@/lib/twoFactor";
import type { Database } from "@/types/supabase";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

const authRetryDelays = [0, 120, 320] as const;

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getUserWithRetry(supabase: SupabaseClient<Database>) {
  let lastError: unknown = null;

  for (const delay of authRetryDelays) {
    if (delay > 0) {
      await wait(delay);
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (user) {
      return { user, error: null };
    }

    lastError = error;
  }

  return { user: null, error: lastError };
}

async function requireCompletedTwoFactor(user: User) {
  if (!hasEnabledTwoFactor(user)) {
    return null;
  }

  const cookieStore = await cookies();
  const hasVerifiedTwoFactor = await isTwoFactorVerifiedForUser(
    user,
    cookieStore.get(TWO_FACTOR_VERIFIED_COOKIE)?.value,
  );

  if (!hasVerifiedTwoFactor) {
    return NextResponse.json(
      { error: "Two-factor verification required" },
      { status: 403 },
    );
  }

  return null;
}

export async function requireAdminApi() {
  const supabase = await createClient();
  const { user } = await getUserWithRetry(supabase);

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const twoFactorError = await requireCompletedTwoFactor(user);
  if (twoFactorError) {
    return { error: twoFactorError };
  }

  const supabaseAdmin = getSupabaseAdmin();
  let profile = await getProfileForUser(supabase, user.id);

  if (!hasAdminAccess(profile?.role, user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  profile = await ensureConfiguredAdminProfile(supabaseAdmin, user, profile);

  return {
    user,
    profile,
    supabase,
    supabaseAdmin,
  };
}

export async function requireStaffApi() {
  const supabase = await createClient();
  const { user } = await getUserWithRetry(supabase);

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const twoFactorError = await requireCompletedTwoFactor(user);
  if (twoFactorError) {
    return { error: twoFactorError };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const profile = await getProfileForUser(supabase, user.id);

  if (!hasStaffAccess(profile?.role, user.email)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    user,
    profile,
    supabase,
    supabaseAdmin,
  };
}
