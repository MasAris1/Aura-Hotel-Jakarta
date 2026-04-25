import type { User } from "@supabase/supabase-js";

export const TWO_FACTOR_CHALLENGE_COOKIE = "aura_2fa_challenge";
export const TWO_FACTOR_VERIFIED_COOKIE = "aura_2fa_verified";

export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 10 * 60;
export const TWO_FACTOR_VERIFIED_TTL_SECONDS = 60 * 60 * 24 * 7;
export const TWO_FACTOR_MAX_ATTEMPTS = 5;
export const TWO_FACTOR_TOTP_PERIOD_SECONDS = 30;
export const TWO_FACTOR_TOTP_DIGITS = 6;
export const TWO_FACTOR_ISSUER = "Aura Hotel Jakarta";
export const TWO_FACTOR_SECRET_METADATA_KEY = "aura_two_factor_secret";
export const TWO_FACTOR_ENABLED_AT_METADATA_KEY = "aura_two_factor_enabled_at";

type SignedCookie<T> = {
  payload: T;
  signature: string;
};

type TwoFactorChallengePayload = {
  userId: string;
  email: string;
  authBinding: string;
  mode: "setup" | "verify";
  pendingSecret?: string;
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

export type TwoFactorChallengeState =
  | {
      mode: "verify";
      redirectTo: string;
      expiresAt: number;
      attempts: number;
    }
  | {
      mode: "setup";
      secret: string;
      secretDisplay: string;
      otpAuthUri: string;
      redirectTo: string;
      expiresAt: number;
      attempts: number;
    };

type TwoFactorMetadataUser = Pick<User, "user_metadata">;

type VerificationResult =
  | {
      ok: true;
      verifiedCookie: string;
      secretToStore?: string;
    }
  | {
      ok: false;
      error: string;
      updatedChallengeCookie?: string;
      clearChallenge?: boolean;
    };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

export function getTwoFactorAuthBinding(
  user: Pick<User, "created_at" | "last_sign_in_at">,
) {
  return user.last_sign_in_at ?? user.created_at ?? "";
}

export async function createTwoFactorChallenge(options: {
  user: User;
  hasStoredSecret: boolean;
  redirectTo?: string | null;
}) {
  if (!options.user.email) {
    throw new Error("Two-factor verification requires an account email.");
  }

  const authBinding = getTwoFactorAuthBinding(options.user);
  const redirectTo = sanitizeTwoFactorRedirect(options.redirectTo) ?? "/vip";
  const expiresAt = Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000;
  const payload: TwoFactorChallengePayload = {
    userId: options.user.id,
    email: options.user.email,
    authBinding,
    mode: options.hasStoredSecret ? "verify" : "setup",
    pendingSecret: options.hasStoredSecret ? undefined : generateBase32Secret(),
    expiresAt,
    attempts: 0,
    redirectTo,
  };

  return {
    cookie: await signPayload(payload),
    redirectPath: getTwoFactorRedirectPath(redirectTo),
  };
}

export async function getTwoFactorChallengeState(options: {
  user: User;
  challengeCookie?: string | null;
}) {
  const challenge = await readAndValidateChallenge(options.user, options.challengeCookie);

  if (!challenge) {
    return null;
  }

  if (challenge.mode === "setup" && challenge.pendingSecret) {
    return {
      mode: "setup" as const,
      secret: challenge.pendingSecret,
      secretDisplay: formatTwoFactorSecret(challenge.pendingSecret),
      otpAuthUri: buildTotpOtpAuthUri({
        email: challenge.email,
        secret: challenge.pendingSecret,
      }),
      redirectTo: challenge.redirectTo,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
    };
  }

  return {
    mode: "verify" as const,
    redirectTo: challenge.redirectTo,
    expiresAt: challenge.expiresAt,
    attempts: challenge.attempts,
  };
}

export async function verifyTwoFactorChallenge(options: {
  user: User;
  code: string;
  challengeCookie?: string | null;
  storedSecret?: string | null;
}): Promise<VerificationResult> {
  const challenge = await readAndValidateChallenge(options.user, options.challengeCookie);
  const normalizedCode = normalizeCode(options.code);

  if (!normalizedCode) {
    return {
      ok: false,
      error: "Enter the 6-digit code from your authenticator app.",
    };
  }

  if (!challenge) {
    if (!options.storedSecret) {
      return {
        ok: false,
        error: "Your authenticator setup has expired. Generate a new QR code and try again.",
        clearChallenge: true,
      };
    }

    return verifyAgainstStoredSecret(options.user, normalizedCode, options.storedSecret);
  }

  if (challenge.attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many incorrect attempts. Please sign in again.",
      clearChallenge: true,
    };
  }

  if (challenge.mode === "setup") {
    if (!challenge.pendingSecret) {
      return {
        ok: false,
        error: "Your authenticator setup is incomplete. Generate a new QR code and try again.",
        clearChallenge: true,
      };
    }

    const isValid = await verifyTotpCode(challenge.pendingSecret, normalizedCode);

    if (!isValid) {
      const updatedChallenge = {
        ...challenge,
        attempts: challenge.attempts + 1,
      };

      return {
        ok: false,
        error: "The authenticator code is incorrect.",
        updatedChallengeCookie: await signPayload(updatedChallenge),
      };
    }

    return {
      ok: true,
      verifiedCookie: await createTwoFactorVerifiedCookie(options.user),
      secretToStore: challenge.pendingSecret,
    };
  }

  if (!options.storedSecret) {
    return {
      ok: false,
      error: "Authenticator is not configured for this account yet.",
      clearChallenge: true,
    };
  }

  const verified = await verifyAgainstStoredSecret(
    options.user,
    normalizedCode,
    options.storedSecret,
  );

  if (verified.ok) {
    return verified;
  }

  return {
    ...verified,
    updatedChallengeCookie: await signPayload({
      ...challenge,
      attempts: challenge.attempts + 1,
    }),
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

export function hasConfiguredTwoFactor(storedSecret?: string | null) {
  return Boolean(storedSecret && storedSecret.trim());
}

export function getStoredTwoFactorSecret(user: TwoFactorMetadataUser) {
  const rawSecret = user.user_metadata?.[TWO_FACTOR_SECRET_METADATA_KEY];

  return typeof rawSecret === "string" && rawSecret.trim()
    ? rawSecret.trim().toUpperCase()
    : null;
}

export function getTwoFactorMetadataPatch(secret: string) {
  return {
    [TWO_FACTOR_SECRET_METADATA_KEY]: secret,
    [TWO_FACTOR_ENABLED_AT_METADATA_KEY]: new Date().toISOString(),
  };
}

async function verifyAgainstStoredSecret(
  user: User,
  code: string,
  storedSecret: string,
): Promise<VerificationResult> {
  const isValid = await verifyTotpCode(storedSecret, code);

  if (!isValid) {
    return {
      ok: false,
      error: "The authenticator code is incorrect.",
    };
  }

  return {
    ok: true,
    verifiedCookie: await createTwoFactorVerifiedCookie(user),
  };
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

async function readAndValidateChallenge(
  user: User,
  challengeCookie?: string | null,
): Promise<TwoFactorChallengePayload | null> {
  const challenge = await readSignedCookie<TwoFactorChallengePayload>(challengeCookie);

  if (!challenge) {
    return null;
  }

  const authBinding = getTwoFactorAuthBinding(user);

  if (
    challenge.userId !== user.id ||
    challenge.authBinding !== authBinding ||
    challenge.email !== user.email
  ) {
    return null;
  }

  if (Date.now() > challenge.expiresAt) {
    return null;
  }

  return challenge;
}

function generateBase32Secret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);

  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function formatTwoFactorSecret(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

function normalizeCode(code: string) {
  const normalized = code.replace(/\D/g, "");
  return new RegExp(`^\\d{${TWO_FACTOR_TOTP_DIGITS}}$`).test(normalized)
    ? normalized
    : null;
}

async function verifyTotpCode(secret: string, code: string) {
  const currentCounter = Math.floor(Date.now() / 1000 / TWO_FACTOR_TOTP_PERIOD_SECONDS);

  for (let offset = -1; offset <= 1; offset += 1) {
    const expectedCode = await generateTotp(secret, currentCounter + offset);

    if (constantTimeEqual(expectedCode, code)) {
      return true;
    }
  }

  return false;
}

async function generateTotp(secret: string, counter: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counterBytes = new Uint8Array(8);
  let remaining = counter;

  for (let index = 7; index >= 0; index -= 1) {
    counterBytes[index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, counterBytes),
  );
  const offset = signature[signature.length - 1] & 0x0f;
  const binaryCode =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  return String(binaryCode % 10 ** TWO_FACTOR_TOTP_DIGITS).padStart(
    TWO_FACTOR_TOTP_DIGITS,
    "0",
  );
}

function buildTotpOtpAuthUri(options: { email: string; secret: string }) {
  const label = encodeURIComponent(`${TWO_FACTOR_ISSUER}:${options.email}`);
  const issuer = encodeURIComponent(TWO_FACTOR_ISSUER);
  return `otpauth://totp/${label}?secret=${options.secret}&issuer=${issuer}&algorithm=SHA1&digits=${TWO_FACTOR_TOTP_DIGITS}&period=${TWO_FACTOR_TOTP_PERIOD_SECONDS}`;
}

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let current = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const alphabetIndex = BASE32_ALPHABET.indexOf(char);

    if (alphabetIndex === -1) {
      throw new Error("Invalid authenticator secret.");
    }

    current = (current << 5) | alphabetIndex;
    bits += 5;

    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
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
    throw new Error(
      "Missing server secret for two-factor verification. Set AUTH_2FA_SECRET or provide an existing server-side secret.",
    );
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
  let binary = "";

  for (const byte of encoder.encode(value)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return decoder.decode(bytes);
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
