import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PROJECT_ROOT = process.cwd();
const ENV_FILES = [".env.local", ".env"];
const TABLES_TO_BACKUP = ["pengguna", "reservations"];
const PAGE_SIZE = 1000;

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getBackupDir() {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(PROJECT_ROOT, "backups", "supabase", `legacy-${iso}`);
}

async function fetchAllRows(supabase, table) {
  const rows = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to);

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return rows;
    }

    from += PAGE_SIZE;
  }
}

async function main() {
  const env = loadEnvFiles();
  const supabaseUrl = getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY");
  const outputDir = getBackupDir();

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  ensureDir(outputDir);

  const manifest = {
    projectUrl: supabaseUrl,
    createdAt: new Date().toISOString(),
    tables: {},
  };

  for (const table of TABLES_TO_BACKUP) {
    const rows = await fetchAllRows(supabase, table);
    const outputPath = path.join(outputDir, `${table}.json`);

    fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));
    manifest.tables[table] = {
      rowCount: rows.length,
      file: path.relative(PROJECT_ROOT, outputPath),
    };

    console.log(`Backed up ${table}: ${rows.length} row(s) -> ${outputPath}`);
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
