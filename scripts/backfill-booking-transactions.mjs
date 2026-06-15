import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = process.cwd();
const ENV_FILES = [".env.local", ".env"];

function loadEnvFiles() {
  const loaded = {};

  for (const envFile of ENV_FILES) {
    const envPath = path.join(PROJECT_ROOT, envFile);

    if (!fs.existsSync(envPath)) {
      continue;
    }

    const contents = fs.readFileSync(envPath, "utf8");

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in loaded)) {
        loaded[key] = value;
      }
    }
  }

  return { ...loaded, ...process.env };
}

function getRequiredEnv(env, key) {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function mapBookingStatusToTransactionStatus(status) {
  switch (status) {
    case "PAID":
    case "CHECKED_IN":
    case "CHECKED_OUT":
      return "PAID";
    case "REFUNDED":
      return "REFUNDED";
    case "EXPIRED":
      return "EXPIRED";
    case "UNPAID":
    default:
      return "PENDING";
  }
}

async function main() {
  const env = loadEnvFiles();
  const supabase = createClient(
    getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const [{ data: bookings, error: bookingsError }, { data: transactions, error: transactionsError }] =
    await Promise.all([
      supabase.from("bookings").select("id, status, total_price"),
      supabase.from("transactions").select("booking_id"),
    ]);

  if (bookingsError) {
    throw new Error(`Failed to load bookings: ${bookingsError.message}`);
  }

  if (transactionsError) {
    throw new Error(`Failed to load transactions: ${transactionsError.message}`);
  }

  const transactionBookingIds = new Set(
    (transactions ?? []).map((transaction) => transaction.booking_id).filter(Boolean),
  );
  const missingBookings = (bookings ?? []).filter(
    (booking) => !transactionBookingIds.has(booking.id),
  );

  if (missingBookings.length === 0) {
    console.log("No missing booking transactions found.");
    return;
  }

  const payload = missingBookings.map((booking) => ({
    booking_id: booking.id,
    midtrans_order_id: booking.id,
    amount: Number(booking.total_price ?? 0),
    payment_type: null,
    status: mapBookingStatusToTransactionStatus(booking.status),
  }));

  const { error: upsertError } = await supabase.from("transactions").upsert(payload, {
    onConflict: "midtrans_order_id",
  });

  if (upsertError) {
    throw new Error(`Failed to backfill transactions: ${upsertError.message}`);
  }

  console.log(`Backfilled ${payload.length} booking transaction(s).`);
}

main().catch((error) => {
  console.error(
    "Transaction backfill failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
