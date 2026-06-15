import { NextResponse } from "next/server";
import {
  enrichBookingWithRoomData,
  type BookingRecord,
  type UserProfile,
} from "@/lib/clientWarmup";
import { getProfileForUser, isStaffRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileForUser(supabase, user.id);
    const userProfile: UserProfile = profile || {
      first_name: user.email?.split("@")[0] ?? "Guest",
      last_name: "",
      role: null,
    };

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("bookings")
      .select("id, user_id, room_id, first_name, last_name, email, check_in, check_out, total_price, status, created_at")
      .order("created_at", { ascending: false });

    if (!isStaffRole(profile?.role)) {
      query = query.eq("user_id", user.id);
    }

    const { data: bookings, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to load dashboard bookings", details: error.message },
        { status: 500 },
      );
    }

    const reservations = ((bookings ?? []) as Partial<BookingRecord>[]).map((booking) =>
      enrichBookingWithRoomData({
        id: booking.id ?? "",
        user_id: booking.user_id ?? "",
        room_id: booking.room_id ?? "",
        first_name: booking.first_name ?? "",
        last_name: booking.last_name ?? "",
        email: booking.email ?? undefined,
        check_in: booking.check_in ?? "",
        check_out: booking.check_out ?? "",
        total_price: booking.total_price ?? 0,
        status: (booking.status as BookingRecord["status"]) ?? "UNPAID",
        created_at: booking.created_at ?? null,
      }),
    );

    return NextResponse.json({
      userProfile,
      reservations,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
