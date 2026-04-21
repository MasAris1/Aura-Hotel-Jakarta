const LOCAL_SITE_URL = "http://localhost:3000";
const LOCAL_DEV_ORIGINS = new Set([
  LOCAL_SITE_URL,
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

export function getRequiredEnv(name: keyof NodeJS.ProcessEnv) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPublicSiteUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    return siteUrl.replace(/\/$/, "");
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return LOCAL_SITE_URL;
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function normalizeForwardedHost(value?: string | null) {
  const host = value?.split(",")[0]?.trim();

  if (!host) {
    return null;
  }

  // Basic hardening against malformed host header values.
  if (host.includes("/") || host.includes("\\") || host.includes("@")) {
    return null;
  }

  return host;
}

export function getTrustedOrigins() {
  const trustedOrigins = new Set<string>();
  const publicSiteOrigin = normalizeOrigin(getPublicSiteUrl());

  if (publicSiteOrigin) {
    trustedOrigins.add(publicSiteOrigin);
  }

  const vercelUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

  if (vercelUrl) {
    const vercelOrigin = normalizeOrigin(`https://${vercelUrl}`);
    if (vercelOrigin) {
      trustedOrigins.add(vercelOrigin);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    for (const origin of LOCAL_DEV_ORIGINS) {
      trustedOrigins.add(origin);
    }
  }

  return trustedOrigins;
}

export function isTrustedOrigin(origin?: string | null) {
  const normalizedOrigin = origin ? normalizeOrigin(origin) : null;

  if (!normalizedOrigin) {
    return false;
  }

  return getTrustedOrigins().has(normalizedOrigin);
}

export function resolveTrustedRequestOrigin(options?: {
  origin?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  fallback?: string;
}) {
  const fallbackOrigin =
    normalizeOrigin(options?.fallback ?? getPublicSiteUrl()) ??
    normalizeOrigin(LOCAL_SITE_URL) ??
    LOCAL_SITE_URL;

  if (isTrustedOrigin(options?.origin)) {
    return normalizeOrigin(options?.origin ?? "") ?? fallbackOrigin;
  }

  const forwardedHost = normalizeForwardedHost(options?.forwardedHost);
  if (forwardedHost) {
    const forwardedProto = options?.forwardedProto?.split(",")[0]?.trim() || "https";
    const forwardedOrigin = normalizeOrigin(`${forwardedProto}://${forwardedHost}`);

    if (forwardedOrigin && isTrustedOrigin(forwardedOrigin)) {
      return forwardedOrigin;
    }
  }

  return fallbackOrigin;
}
