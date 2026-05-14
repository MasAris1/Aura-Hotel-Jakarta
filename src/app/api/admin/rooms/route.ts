import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/adminApi";
import { normalizeRoomImages } from "@/lib/roomCatalog";

const roomSchema = z.object({
  name: z.string().min(2, "Room name is required"),
  type: z.string().min(2, "Room type is required"),
  base_price: z.number().nonnegative("Base price must be valid"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  images: z.array(z.string().url("Images must use valid URLs")).default([]),
  description: z.string().nullable().optional(),
  status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
});

const legacyRoomSelect = "id, name, description, base_price, deleted_at, created_at";

function normalizeAdminRoom(room: Record<string, unknown>) {
  return {
    id: String(room.id ?? ""),
    name: String(room.name ?? ""),
    type: typeof room.type === "string" ? room.type : "Room",
    base_price: Number(room.base_price ?? 0),
    capacity: Number(room.capacity ?? 1),
    images: normalizeRoomImages(
      Array.isArray(room.images)
        ? room.images
        : typeof room.image_url === "string" && room.image_url
          ? [room.image_url]
          : [],
    ),
    description: typeof room.description === "string" ? room.description : null,
    status: typeof room.status === "string" ? room.status : "AVAILABLE",
    deleted_at: typeof room.deleted_at === "string" ? room.deleted_at : null,
    created_at: typeof room.created_at === "string" ? room.created_at : null,
  };
}

async function loadRooms(access: Awaited<ReturnType<typeof requireAdminApi>>) {
  if ("error" in access) {
    return { data: null, error: new Error("Forbidden") };
  }

  const fullResult = await access.supabaseAdmin
    .from("rooms")
    .select("*")
    .order("created_at", { ascending: false });

  if (!fullResult.error) {
    return fullResult;
  }

  return access.supabaseAdmin
    .from("rooms")
    .select(legacyRoomSelect)
    .order("created_at", { ascending: false });
}

export async function GET() {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const { data, error } = await loadRooms(access);

    if (error) {
      return NextResponse.json({ error: "Failed to load rooms", details: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rooms: ((data ?? []) as Record<string, unknown>[]).map((room) =>
        normalizeAdminRoom(room),
      ),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireAdminApi();
  if ("error" in access) {
    return access.error;
  }

  try {
    const parsed = roomSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid room payload" }, { status: 400 });
    }

    const fullPayload = {
      ...parsed.data,
      description: parsed.data.description ?? null,
      updated_at: new Date().toISOString(),
    };
    const legacyPayload = {
      name: parsed.data.name,
      base_price: parsed.data.base_price,
      description: parsed.data.description ?? null,
      deleted_at: null,
    };
    let result = await access.supabaseAdmin
      .from("rooms")
      .insert(fullPayload)
      .select("*")
      .single();

    if (result.error) {
      result = await access.supabaseAdmin
        .from("rooms")
        .insert(legacyPayload as never)
        .select(legacyRoomSelect)
        .single();
    }

    const { data: room, error } = result;

    if (error || !room) {
      return NextResponse.json({ error: "Failed to create room", details: error?.message }, { status: 500 });
    }

    await access.supabaseAdmin.from("audit_logs").insert({
      table_name: "rooms",
      record_id: room.id,
      action: "INSERT",
      new_data: room,
      performed_by: access.user.id,
    });

    return NextResponse.json({
      room: normalizeAdminRoom(room as Record<string, unknown>),
    });
  } catch {
    return NextResponse.json({ error: "Failed to create room" }, { status: 500 });
  }
}
