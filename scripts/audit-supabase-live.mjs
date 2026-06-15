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

async function getTableCount(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return {
    table,
    count: count ?? 0,
    error: error?.message ?? null,
  };
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

async function main() {
  const env = loadEnvFiles();
  const supabaseUrl = getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const [
    usersResult,
    profilesResult,
    roomsResult,
    bookingsResult,
    transactionsResult,
    roomRatesResult,
    auditLogsResult,
    bookingsRowsResult,
    transactionsRowsResult,
  ] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from("profiles").select("id, role"),
    getTableCount(supabase, "rooms"),
    getTableCount(supabase, "bookings"),
    getTableCount(supabase, "transactions"),
    getTableCount(supabase, "room_rates"),
    getTableCount(supabase, "audit_logs"),
    supabase.from("bookings").select("id, status, total_price"),
    supabase.from("transactions").select("booking_id, status"),
  ]);

  const users = usersResult.data?.users ?? [];
  const profiles = profilesResult.data ?? [];
  const bookings = bookingsRowsResult.data ?? [];
  const transactions = transactionsRowsResult.data ?? [];
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const missingProfileUserIds = users
    .map((user) => user.id)
    .filter((userId) => !profileIds.has(userId));
  const transactionBookingIds = new Set(
    transactions
      .map((transaction) => transaction.booking_id)
      .filter(Boolean),
  );
  const missingTransactionBookingIds = bookings
    .map((booking) => booking.id)
    .filter((bookingId) => !transactionBookingIds.has(bookingId));
  const roleCounts = profiles.reduce(
    (accumulator, profile) => {
      const role = profile.role ?? "guest";
      accumulator[role] = (accumulator[role] ?? 0) + 1;
      return accumulator;
    },
    {},
  );

  const { data: roomSample } = await supabase
    .from("rooms")
    .select("id")
    .limit(1)
    .maybeSingle();

  let dynamicPriceStatus = "skipped";
  if (roomSample?.id) {
    const { error } = await supabase.rpc("get_dynamic_price", {
      p_room_id: roomSample.id,
      p_date: new Date().toISOString().slice(0, 10),
    });

    dynamicPriceStatus = error
      ? `error:${error.code ?? "unknown"}:${error.message}`
      : "ok";
  }

  const issues = [];

  if (usersResult.error) {
    issues.push(`auth.admin.listUsers failed: ${usersResult.error.message}`);
  }

  if (profilesResult.error) {
    issues.push(`profiles query failed: ${profilesResult.error.message}`);
  }

  if (bookingsRowsResult.error) {
    issues.push(`bookings query failed: ${bookingsRowsResult.error.message}`);
  }

  if (transactionsRowsResult.error) {
    issues.push(`transactions query failed: ${transactionsRowsResult.error.message}`);
  }

  if (missingProfileUserIds.length > 0) {
    issues.push(`missing profiles for ${missingProfileUserIds.length} auth user(s)`);
  }

  if (missingTransactionBookingIds.length > 0) {
    issues.push(
      `missing transactions for ${missingTransactionBookingIds.length} booking(s): ${missingTransactionBookingIds.slice(0, 5).join(", ")}`,
    );
  }

  if (dynamicPriceStatus.startsWith("error:")) {
    issues.push(`get_dynamic_price is broken: ${dynamicPriceStatus}`);
  }

  const tableChecks = [
    roomsResult,
    roomRatesResult,
    bookingsResult,
    transactionsResult,
    auditLogsResult,
  ];

  for (const tableCheck of tableChecks) {
    if (tableCheck.error) {
      issues.push(`${tableCheck.table} count failed: ${tableCheck.error}`);
    }
  }

  printSection("Supabase Live Audit");
  console.log(`Project URL: ${supabaseUrl}`);
  console.log(`Auth users: ${users.length}`);
  console.log(`Profiles: ${profiles.length}`);
  console.log(`Missing profiles: ${missingProfileUserIds.length}`);
  console.log(`Missing transactions: ${missingTransactionBookingIds.length}`);
  console.log(`Role counts: ${JSON.stringify(roleCounts)}`);
  console.log(`get_dynamic_price: ${dynamicPriceStatus}`);

  printSection("Table Counts");
  for (const tableCheck of tableChecks) {
    const suffix = tableCheck.error ? ` (error: ${tableCheck.error})` : "";
    console.log(`${tableCheck.table}: ${tableCheck.count}${suffix}`);
  }

  printSection("Status");
  if (issues.length === 0) {
    console.log("No critical issues detected.");
    return;
  }

  for (const issue of issues) {
    console.log(`- ${issue}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error("Supabase audit failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
