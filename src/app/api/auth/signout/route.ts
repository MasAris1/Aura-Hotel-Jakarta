import { NextResponse } from "next/server";
import {
  getExpiredTwoFactorCookieOptions,
  TWO_FACTOR_CHALLENGE_COOKIE,
  TWO_FACTOR_VERIFIED_COOKIE,
} from "@/lib/twoFactor";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    TWO_FACTOR_CHALLENGE_COOKIE,
    "",
    getExpiredTwoFactorCookieOptions(),
  );
  response.cookies.set(
    TWO_FACTOR_VERIFIED_COOKIE,
    "",
    getExpiredTwoFactorCookieOptions(),
  );

  return response;
}
