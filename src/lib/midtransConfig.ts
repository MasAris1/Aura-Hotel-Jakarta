type MidtransModeInput = {
  explicitMode?: string | null;
  serverKey?: string | null;
  clientKey?: string | null;
};

const PRODUCTION_MODE_VALUES = new Set(["1", "true", "production", "prod", "live"]);
const SANDBOX_MODE_VALUES = new Set(["0", "false", "sandbox", "development", "dev"]);

function normalizeMode(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function normalizeMidtransCredential(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  const isWrappedInQuotes =
    trimmed.length >= 2 &&
    ((firstChar === '"' && lastChar === '"') ||
      (firstChar === "'" && lastChar === "'"));

  return isWrappedInQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

function parseExplicitMode(value?: string | null) {
  const normalized = normalizeMode(value);

  if (!normalized) {
    return null;
  }

  if (PRODUCTION_MODE_VALUES.has(normalized)) {
    return true;
  }

  if (SANDBOX_MODE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(
    "Invalid MIDTRANS_IS_PRODUCTION value. Use true/false, production, or sandbox.",
  );
}

function inferModeFromKey(key?: string | null) {
  const normalizedKey = normalizeMidtransCredential(key);

  if (!normalizedKey) {
    return null;
  }

  if (normalizedKey.startsWith("SB-Mid-")) {
    return false;
  }

  if (normalizedKey.startsWith("Mid-")) {
    return true;
  }

  return null;
}

export function getMidtransIsProduction(input: MidtransModeInput = {}) {
  const explicitMode =
    input.explicitMode ??
    process.env.MIDTRANS_IS_PRODUCTION ??
    process.env.MIDTRANS_ENV;
  const parsedExplicitMode = parseExplicitMode(explicitMode);

  if (parsedExplicitMode !== null) {
    return parsedExplicitMode;
  }

  const inferredFromServerKey = inferModeFromKey(
    input.serverKey ?? process.env.MIDTRANS_SERVER_KEY,
  );

  if (inferredFromServerKey !== null) {
    return inferredFromServerKey;
  }

  const inferredFromClientKey = inferModeFromKey(
    input.clientKey ?? process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
  );

  if (inferredFromClientKey !== null) {
    return inferredFromClientKey;
  }

  return process.env.NODE_ENV === "production";
}

export function getMidtransSnapScriptSrc(input: MidtransModeInput = {}) {
  return getMidtransIsProduction(input)
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";
}

function summarizeCredential(value?: string | null) {
  const rawValue = value ?? "";
  const normalizedValue = normalizeMidtransCredential(value);
  const mode = inferModeFromKey(normalizedValue);

  return {
    present: normalizedValue.length > 0,
    family:
      mode === false ? "sandbox" : mode === true ? "production" : "unknown",
    length: normalizedValue.length,
    rawLength: rawValue.length,
    hadOuterWhitespace: rawValue !== rawValue.trim(),
    hadWrappingQuotes: rawValue.trim() !== normalizedValue,
  };
}

export function getMidtransConfigDiagnostics(input: MidtransModeInput = {}) {
  return {
    isProduction: getMidtransIsProduction(input),
    explicitMode:
      input.explicitMode ??
      process.env.MIDTRANS_IS_PRODUCTION ??
      process.env.MIDTRANS_ENV ??
      null,
    serverKey: summarizeCredential(
      input.serverKey ?? process.env.MIDTRANS_SERVER_KEY,
    ),
    clientKey: summarizeCredential(
      input.clientKey ?? process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
    ),
  };
}
