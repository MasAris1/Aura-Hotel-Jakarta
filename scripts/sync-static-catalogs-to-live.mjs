import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import roomsData from "../src/data/rooms.json" with { type: "json" };

const PROJECT_ROOT = process.cwd();
const ENV_FILES = [".env.local", ".env"];

const staticFacilities = [
  {
    title: "Skyline Fitness Club",
    description:
      "A fully equipped gym with Technogym stations, sunrise yoga corners, and sweeping city views to start the day in rhythm.",
    icon: "fitness",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 10,
  },
  {
    title: "Infinity Pool Deck",
    description:
      "An elevated pool lined with cabanas, evening lighting, and soft skyline reflections for slow afternoons above Jakarta.",
    icon: "pool",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 20,
  },
  {
    title: "Panoramic City View",
    description:
      "Floor-to-ceiling vantage points frame Bundaran HI, golden-hour traffic trails, and the capital's most cinematic nightscape.",
    icon: "view",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 30,
  },
  {
    title: "Signature Restaurant",
    description:
      "A destination dining room serving refined Indonesian and international plates with a late-night ambience shaped by live jazz.",
    icon: "restaurant",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 40,
  },
  {
    title: "Spa & Wellness Rituals",
    description:
      "Private treatment suites, aromatherapy journeys, and restorative massage programs designed to quiet the pace of the city.",
    icon: "spa",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 50,
  },
  {
    title: "Concierge Lounge",
    description:
      "A discreet lounge for bespoke itineraries, priority transfers, and private check-in guided by our round-the-clock concierge team.",
    icon: "concierge",
    image_url: null,
    status: "AVAILABLE",
    sort_order: 60,
  },
];

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

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripUnsupportedColumns(payload, supportedColumns) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => supportedColumns.has(key)),
  );
}

async function syncRooms(supabase) {
  const fullPayload = roomsData.map((room) => ({
    id: room.id,
    name: room.name,
    type: room.type,
    description: room.description,
    base_price: room.price,
    capacity: room.capacity,
    images: room.images,
    image_url: room.images[0] ?? null,
    status: "AVAILABLE",
    deleted_at: null,
    updated_at: new Date().toISOString(),
  }));
  const legacyPayload = fullPayload.map((room) =>
    stripUnsupportedColumns(
      room,
      new Set(["id", "name", "description", "base_price", "image_url", "deleted_at"]),
    ),
  );

  let result = await supabase
    .from("rooms")
    .upsert(fullPayload, { onConflict: "id" })
    .select("id, name, base_price");

  if (result.error) {
    result = await supabase
      .from("rooms")
      .upsert(legacyPayload, { onConflict: "id" })
      .select("id, name, base_price");
  }

  if (result.error) {
    throw new Error(`Failed to sync suites: ${result.error.message}`);
  }

  console.log(`Synced ${result.data?.length ?? fullPayload.length} suite(s).`);
}

async function syncFacilities(supabase) {
  const { data: existingFacilities, error: existingError } = await supabase
    .from("facilities")
    .select("*");

  if (existingError) {
    throw new Error(`Failed to load facilities: ${existingError.message}`);
  }

  const facilityColumns = new Set(
    Object.keys(existingFacilities?.[0] ?? {
      title: true,
      description: true,
      icon: true,
      image_url: true,
      status: true,
      sort_order: true,
      deleted_at: true,
      updated_at: true,
    }),
  );
  const existingByTitle = new Map(
    (existingFacilities ?? []).map((facility) => [
      String(facility.title ?? "").toLowerCase(),
      facility,
    ]),
  );

  let changed = 0;

  for (const facility of staticFacilities) {
    const existing = existingByTitle.get(facility.title.toLowerCase());
    const payload = stripUnsupportedColumns(
      {
        ...facility,
        slug: slugify(facility.title),
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      facilityColumns,
    );
    const query = existing
      ? supabase.from("facilities").update(payload).eq("id", existing.id)
      : supabase.from("facilities").insert(payload);
    const { error } = await query;

    if (error) {
      throw new Error(`Failed to sync facility ${facility.title}: ${error.message}`);
    }

    changed += 1;
  }

  console.log(`Synced ${changed} facilitie(s).`);
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

  await syncRooms(supabase);
  await syncFacilities(supabase);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
