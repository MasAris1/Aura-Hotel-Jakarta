import roomsData from "@/data/rooms.json";
import type { Json } from "@/types/supabase";

type StaticRoom = (typeof roomsData)[number];

export type LiveRoomLookup = {
  id: string;
  name?: string | null;
  type?: string | null;
  base_price?: number | null;
  capacity?: number | null;
  images?: Json | string[] | null;
  description?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  image_url?: string | null;
};

export type ResolvedRoomDetails = {
  id: string;
  name: string;
  type: string;
  images: string[];
  basePrice: number;
  capacity: number;
  description: string;
  size: string;
  bedType: string;
  amenities: string[];
  isFeatured: boolean;
  status: string | null;
};

export type RoomCatalogItem = ResolvedRoomDetails;

const staticRooms = roomsData as StaticRoom[];
const staticRoomMap = new Map<string, StaticRoom>(
  staticRooms.map((room) => [room.id, room]),
);
const staticRoomOrder = new Map<string, number>(
  staticRooms.map((room, index) => [room.id, index]),
);

export function getStaticRooms() {
  return staticRooms;
}

export function getStaticRoomById(roomId: string | null | undefined) {
  if (!roomId) {
    return null;
  }

  return staticRoomMap.get(roomId) ?? null;
}

export function isCuratedRoomId(roomId: string | null | undefined) {
  return Boolean(getStaticRoomById(roomId));
}

export function normalizeRoomImages(
  images: Json | string[] | null | undefined,
): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  const normalized: string[] = [];

  for (const image of images) {
    if (typeof image === "string") {
      normalized.push(image);
    }
  }

  return normalized;
}

export function resolveRoomDetails(
  roomId: string | null | undefined,
  liveRoom?: LiveRoomLookup | null,
): ResolvedRoomDetails {
  const staticRoom = getStaticRoomById(roomId);
  const liveImages = normalizeRoomImages(liveRoom?.images);
  const staticImages = normalizeRoomImages(staticRoom?.images);
  const imageUrl = liveRoom?.image_url?.trim();
  const liveDescription =
    typeof liveRoom?.description === "string" ? liveRoom.description.trim() : "";

  return {
    id: roomId ?? liveRoom?.id ?? "",
    name: liveRoom?.name?.trim() || staticRoom?.name || "Unknown Room",
    type: liveRoom?.type?.trim() || staticRoom?.type || "Room",
    images:
      liveImages.length > 0
        ? liveImages
        : staticImages.length > 0
          ? staticImages
          : imageUrl
            ? [imageUrl]
            : [],
    basePrice: Number(liveRoom?.base_price ?? staticRoom?.price ?? 0),
    capacity: Number(liveRoom?.capacity ?? staticRoom?.capacity ?? 1),
    description: liveDescription || staticRoom?.description || "Room details unavailable.",
    size: staticRoom?.size ?? "Spacious stay",
    bedType: staticRoom?.bedType ?? "Premium bedding",
    amenities: staticRoom?.amenities ?? [],
    isFeatured: staticRoom?.isFeatured ?? false,
    status: liveRoom?.status ?? null,
  };
}

export function mergeRoomCatalogRooms(rooms: LiveRoomLookup[]) {
  const liveRooms = rooms
    .filter((room) => !room.deleted_at)
    .map((room) => resolveRoomDetails(room.id, room));
  const mergedRoomIds = new Set(liveRooms.map((room) => room.id));
  const fallbackRooms = staticRooms
    .filter((room) => !mergedRoomIds.has(room.id))
    .map((room) => resolveRoomDetails(room.id));

  return [...liveRooms, ...fallbackRooms].sort((left, right) => {
    const leftIndex = staticRoomOrder.get(left.id);
    const rightIndex = staticRoomOrder.get(right.id);

    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }

    if (leftIndex !== undefined) {
      return -1;
    }

    if (rightIndex !== undefined) {
      return 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function buildLiveRoomMap<TRoom extends LiveRoomLookup>(rooms: TRoom[]) {
  return new Map(rooms.map((room) => [room.id, room]));
}
