import { revalidatePath } from "next/cache";

/**
 * Revalidates all pages that display room-related data.
 *
 * Call this after any mutation to the `rooms`, `room_units`, or `room_rates`
 * tables so that every server-rendered page and every client-side fetch
 * receives fresh data on the next visit.
 */
export function revalidateRoomPages() {
  // Home page – room catalog section (#collection)
  revalidatePath("/");

  // Admin dashboard – booking metrics, room counts, reporting
  revalidatePath("/admin");

  // Receptionist dashboard – room unit board
  revalidatePath("/receptionist");

  // Booking page – room details sidebar, quote calculation
  revalidatePath("/booking");

  // Public API consumed by client components
  revalidatePath("/api/rooms");
}

/**
 * Revalidates the detail page for a specific room.
 */
export function revalidateRoomDetailPage(roomId: string) {
  revalidatePath(`/rooms/${roomId}`);
  revalidatePath(`/api/rooms/${roomId}`);
}

/**
 * Convenience: revalidate everything room-related including a specific room.
 */
export function revalidateAllRoomData(roomId?: string) {
  revalidateRoomPages();

  if (roomId) {
    revalidateRoomDetailPage(roomId);
  }
}
