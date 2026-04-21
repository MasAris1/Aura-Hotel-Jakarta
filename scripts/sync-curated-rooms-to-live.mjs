import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import roomsData from "../src/data/rooms.json" with { type: "json" };

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

  const payload = roomsData.map((room) => ({
    id: room.id,
    name: room.name,
    description: room.description,
    base_price: room.price,
    image_url: room.images[0] ?? null,
    deleted_at: null,
  }));

  const { data, error } = await supabase
    .from("rooms")
    .upsert(payload, { onConflict: "id" })
    .select("id, name, base_price");

  if (error) {
    throw new Error(`Failed to sync curated rooms: ${error.message}`);
  }

  console.log(`Synced ${data?.length ?? payload.length} curated room(s) to live Supabase.`);
  for (const room of data ?? payload) {
    console.log(`- ${room.id}: ${room.name}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
