import type { User } from "@supabase/supabase-js";

export const TWO_FACTOR_CHALLENGE_COOKIE = "aura_2fa_challenge";
export const TWO_FACTOR_VERIFIED_COOKIE = "aura_2fa_verified";

export const TWO_FACTOR_CODE_TTL_SECONDS = 10 * 60;
export const TWO_FACTOR_VERIFIED_TTL_SECONDS = 60 * 60 * 24 * 7;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;

type SignedCookie<T> = {
  payload: T;
  signature: string;
};

type TwoFactorChallengePayload = {
  userId: string;
  email: string;
  authBinding: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  redirectTo: string;
};

type TwoFactorVerifiedPayload = {
  userId: string;
  authBinding: string;
  verifiedAt: number;
};

type CookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};

type VerificationResult =
  | { ok: true; verifiedCookie: string }
  | {
      ok: false;
      error: string;
      updatedChallengeCookie?: string;
      clearChallenge?: boolean;
    };

const encoder = new TextEncoder();

export function getTwoFactorCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function getExpiredTwoFactorCookieOptions(): CookieOptions {
  return getTwoFactorCookieOptions(0);
}

export function getTwoFactorRedirectPath(redirectTo?: string | null) {
  const safeRedirect = sanitizeTwoFactorRedirect(redirectTo) ?? "/vip";
  return `/verify-2fa?redirect=${encodeURIComponent(safeRedirect)}`;
}

export function getTwoFactorAuthBinding(user: Pick<User, "created_at" | "last_sign_in_at">) {
  return user.last_sign_in_at ?? user.created_at ?? "";
}

export async function createTwoFactorChallenge(options: {
  user: User;
  redirectTo?: string | null;
}) {
  if (!options.user.email) {
    throw new Error("Two-factor verification requires an account email.");
  }

  const code = generateNumericCode();
  const authBinding = getTwoFactorAuthBinding(options.user);
  const redirectTo = sanitizeTwoFactorRedirect(options.redirectTo) ?? "/vip";
  const expiresAt = Date.now() + TWO_FACTOR_CODE_TTL_SECONDS * 1000;
  const payload: TwoFactorChallengePayload = {
    userId: options.user.id,
    email: options.user.email,
    authBinding,
    codeHash: await hmacHex(getCodeHashMessage(options.user.id, authBinding, code)),
    expiresAt,
    attempts: 0,
    redirectTo,
  };

  return {
    cookie: await signPayload(payload),
    code,
  };
}

export async function verifyTwoFactorChallenge(options: {
  user: User;
  code: string;
  challengeCookie?: string | null;
}): Promise<VerificationResult> {
  const challenge = await readSignedCookie<TwoFactorChallengePayload>(
    options.challengeCookie,
  );

  if (!challenge) {
    return {
      ok: false,
      error: "Your verification code has expired. Please request a new code.",
      clearChallenge: true,
    };
  }

  const authBinding = getTwoFactorAuthBinding(options.user);

  if (
    challenge.userId !== options.user.id ||
    challenge.authBinding !== authBinding ||
    challenge.email !== options.user.email
  ) {
    return {
      ok: false,
      error: "Your verification session is no longer valid. Please sign in again.",
      clearChallenge: true,
    };
  }

  if (Date.now() > challenge.expiresAt) {
    return {
      ok: false,
      error: "Your verification code has expired. Please request a new code.",
      clearChallenge: true,
    };
  }

  if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many incorrect attempts. Please request a new code.",
      clearChallenge: true,
    };
  }

  const normalizedCode = normalizeCode(options.code);
  if (!normalizedCode) {
    return { ok: false, error: "Enter the 6-digit verification code." };
  }

  const submittedHash = await hmacHex(
    getCodeHashMessage(options.user.id, authBinding, normalizedCode),
  );

  if (!constantTimeEqual(submittedHash, challenge.codeHash)) {
    const updatedChallenge = {
      ...challenge,
      attempts: challenge.attempts + 1,
    };

    return {
      ok: false,
      error: "The verification code is incorrect.",
      updatedChallengeCookie: await signPayload(updatedChallenge),
    };
  }

  return {
    ok: true,
    verifiedCookie: await createTwoFactorVerifiedCookie(options.user),
  };
}

export async function createTwoFactorVerifiedCookie(user: User) {
  const payload: TwoFactorVerifiedPayload = {
    userId: user.id,
    authBinding: getTwoFactorAuthBinding(user),
    verifiedAt: Date.now(),
  };

  return signPayload(payload);
}

export async function isTwoFactorVerifiedForUser(
  user: User,
  verifiedCookie?: string | null,
) {
  const verified = await readSignedCookie<TwoFactorVerifiedPayload>(verifiedCookie);

  if (!verified) {
    return false;
  }

  return (
    verified.userId === user.id &&
    verified.authBinding === getTwoFactorAuthBinding(user)
  );
}

async function signPayload<T>(payload: T) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await hmacHex(encodedPayload);
  const signedCookie: SignedCookie<string> = {
    payload: encodedPayload,
    signature,
  };

  return encodeBase64Url(JSON.stringify(signedCookie));
}

async function readSignedCookie<T>(value?: string | null): Promise<T | null> {
  if (!value) {
    return null;
  }

  try {
    const rawCookie = JSON.parse(decodeBase64Url(value)) as SignedCookie<string>;
    const expectedSignature = await hmacHex(rawCookie.payload);

    if (!constantTimeEqual(rawCookie.signature, expectedSignature)) {
      return null;
    }

    return JSON.parse(decodeBase64Url(rawCookie.payload)) as T;
  } catch {
    return null;
  }
}

function generateNumericCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

function normalizeCode(code: string) {
  const normalized = code.replace(/\D/g, "");
  return /^\d{6}$/.test(normalized) ? normalized : null;
}

function getCodeHashMessage(userId: string, authBinding: string, code: string) {
  return `otp:${userId}:${authBinding}:${code}`;
}

async function hmacHex(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getTwoFactorSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getTwoFactorSecret() {
  const secret =
    process.env.AUTH_2FA_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.MIDTRANS_SERVER_KEY;

  if (!secret) {
    throw new Error("Missing AUTH_2FA_SECRET for two-factor verification.");
  }

  return secret;
}

function sanitizeTwoFactorRedirect(redirectTo?: string | null) {
  if (!redirectTo) {
    return null;
  }

  if (
    !redirectTo.startsWith("/") ||
    redirectTo.startsWith("//") ||
    redirectTo.includes("\\") ||
    /[\r\n]/.test(redirectTo)
  ) {
    return null;
  }

  return redirectTo;
}

function encodeBase64Url(value: string) {
  const bytes = encoder.encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
