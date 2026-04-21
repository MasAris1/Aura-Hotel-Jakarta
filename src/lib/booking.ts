import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { resolveRoomDetails } from "@/lib/roomCatalog";

export const BOOKING_TAX_RATE = 0.21;

type PublicSupabaseClient = SupabaseClient<Database>;

type RoomRateRow = Database["public"]["Tables"]["room_rates"]["Row"];
type LiveRoomRow = {
  id: string;
  name: string | null;
  type: string | null;
  base_price: number | null;
  capacity: number | null;
  images: Database["public"]["Tables"]["rooms"]["Row"]["images"];
  description: string | null;
  status: string | null;
  deleted_at: string | null;
};

export type RoomQuote = {
  room: {
    id: string;
    name: string;
    type: string;
    base_price: number;
    status: string | null;
  };
  nights: number;
  nightlyRates: Array<{
    date: string;
    price: number;
  }>;
  subtotal: number;
  taxAmount: number;
  totalPrice: number;
};

export class BookingQuoteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BookingQuoteError";
    this.statusCode = statusCode;
  }
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    throw new BookingQuoteError("Invalid booking date", 400);
  }

  return date;
}

export function getStayDates(checkIn: string, checkOut: string) {
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);

  if (end <= start) {
    throw new BookingQuoteError("Invalid date range", 400);
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function buildRoomRateMap(roomRates: Pick<RoomRateRow, "rate_date" | "price">[] | null) {
  return new Map(
    (roomRates ?? []).map((roomRate) => [
      roomRate.rate_date,
      Number(roomRate.price ?? 0),
    ]),
  );
}

export async function getRoomQuote(
  supabase: PublicSupabaseClient,
  roomId: string,
  checkIn: string,
  checkOut: string,
) {
  const stayDates = getStayDates(checkIn, checkOut);

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle<LiveRoomRow>();

  if (roomError) {
    throw new BookingQuoteError("Failed to load room data", 500);
  }

  if (!room || room.deleted_at) {
    throw new BookingQuoteError("Kamar tidak ditemukan", 404);
  }

  if (room.status && room.status !== "AVAILABLE") {
    throw new BookingQuoteError("Kamar sedang tidak tersedia untuk dipesan", 409);
  }

  const { data: roomRates, error: roomRatesError } = await supabase
    .from("room_rates")
    .select("rate_date, price")
    .eq("room_id", roomId)
    .gte("rate_date", checkIn)
    .lt("rate_date", checkOut);

  if (roomRatesError) {
    throw new BookingQuoteError("Failed to load room pricing", 500);
  }

  const roomRateMap = buildRoomRateMap(roomRates);
  const roomDetails = resolveRoomDetails(room.id, room);
  const basePrice = Number(room.base_price ?? roomDetails.basePrice ?? 0);
  const nightlyRates = stayDates.map((date) => ({
    date,
    price: roomRateMap.get(date) ?? basePrice,
  }));
  const subtotal = nightlyRates.reduce((sum, nightlyRate) => sum + nightlyRate.price, 0);
  const totalPrice = Math.round(subtotal * (1 + BOOKING_TAX_RATE));

  return {
    room: {
      id: room.id,
      name: roomDetails.name,
      type: roomDetails.type,
      base_price: basePrice,
      status: room.status,
    },
    nights: stayDates.length,
    nightlyRates,
    subtotal,
    taxAmount: totalPrice - subtotal,
    totalPrice,
  } satisfies RoomQuote;
}
