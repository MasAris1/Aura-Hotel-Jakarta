import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { sanitizeInternalRedirect } from "@/lib/auth";
import {
  getTwoFactorChallengeState,
  getStoredTwoFactorSecret,
  hasConfiguredTwoFactor,
  TWO_FACTOR_CHALLENGE_COOKIE,
} from "@/lib/twoFactor";
import { createClient } from "@/utils/supabase/server";
import { VerifyTwoFactorClient } from "./VerifyTwoFactorClient";

type VerifyTwoFactorPageProps = {
  searchParams?: Promise<{
    redirect?: string | string[];
  }>;
};

export default async function VerifyTwoFactorPage({
  searchParams,
}: VerifyTwoFactorPageProps) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const hasStoredSecret = hasConfiguredTwoFactor(getStoredTwoFactorSecret(user));
  const challengeState = await getTwoFactorChallengeState({
    user,
    challengeCookie: cookieStore.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value,
  });

  const params = searchParams ? await searchParams : {};
  const rawRedirect = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;
  const redirectTo = sanitizeInternalRedirect(rawRedirect) ?? "/vip";
  const setupState =
    !hasStoredSecret && challengeState?.mode === "setup"
      ? {
          qrCodeDataUrl: await QRCode.toDataURL(challengeState.otpAuthUri, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 240,
            color: {
              dark: "#FFFFFF",
              light: "#00000000",
            },
          }),
          secretDisplay: challengeState.secretDisplay,
          expiresLabel: formatExpiry(challengeState.expiresAt),
        }
      : null;

  return (
    <VerifyTwoFactorClient
      email={user.email}
      redirectTo={redirectTo}
      hasStoredSecret={hasStoredSecret}
      setupState={setupState}
    />
  );
}

function formatExpiry(expiresAt: number) {
  const secondsRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  if (minutes <= 0) {
    return `in ${seconds}s`;
  }

  return `in ${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
