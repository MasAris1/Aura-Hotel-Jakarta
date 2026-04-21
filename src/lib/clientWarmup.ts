import { resolveRoomDetails } from "@/lib/roomCatalog";

export type RoomInfo = {
  name: string;
  type: string;
  images: string[];
  price: number;
};

export type BookingStatus =
  | "UNPAID"
  | "PAID"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "EXPIRED"
  | "REFUNDED";

export type UserProfile = {
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
};

export type BookingRoomRelation = {
  name?: string | null;
  type?: string | null;
  images?: string[] | null;
  image_url?: string | null;
  base_price?: number | null;
  description?: string | null;
  capacity?: number | null;
  status?: string | null;
} | null;

export type BookingRecord = {
  id: string;
  user_id: string;
  room_id: string;
  first_name: string;
  last_name: string;
  check_in: string;
  check_out: string;
  created_at?: string | null;
  total_price: number | string;
  status: BookingStatus;
  email?: string;
  rooms?: BookingRoomRelation;
  roomInfo?: RoomInfo;
};

export type DashboardSnapshot = {
  reservations: BookingRecord[];
  userProfile: UserProfile | null;
};

export type AuthUserLike = {
  email?: string | null;
  user_metadata?: {
    full_name?: string;
  };
};

export type CachedGuestIdentity = {
  email?: string;
  firstName: string;
  lastName: string;
};

export const CLIENT_WARMUP_KEYS = {
  bookingIdentity: "aura-booking-identity-v1",
  dashboardSnapshot: "aura-dashboard-snapshot-v1",
  userProfile: "aura-user-profile-v1",
} as const;

export function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function clearSessionCache(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(key);
}

export function deriveGuestIdentity(user: AuthUserLike | null | undefined): CachedGuestIdentity {
  const fullName = user?.user_metadata?.full_name?.trim() || "";

  if (fullName) {
    const parts = fullName.split(/\s+/);

    return {
      email: user?.email || undefined,
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || parts[0] || "",
    };
  }

  const fallbackName = user?.email?.split("@")[0] || "";

  return {
    email: user?.email || undefined,
    firstName: fallbackName,
    lastName: fallbackName,
  };
}

export function enrichBookingWithRoomData(booking: BookingRecord): BookingRecord {
  const roomDetails = resolveRoomDetails(booking.room_id, {
    id: booking.room_id ?? "",
    name: booking.rooms?.name ?? null,
    type: booking.rooms?.type ?? null,
    base_price: booking.rooms?.base_price ?? null,
    images: booking.rooms?.images ?? null,
    image_url: booking.rooms?.image_url ?? null,
    description: booking.rooms?.description ?? null,
    capacity: booking.rooms?.capacity ?? null,
    status: booking.rooms?.status ?? null,
  });
  const roomInfo: RoomInfo = {
    name: roomDetails.name,
    type: roomDetails.type,
    images: roomDetails.images,
    price: roomDetails.basePrice,
  };

  return {
    ...booking,
    roomInfo,
  };
}
