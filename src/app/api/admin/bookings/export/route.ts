import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getProfileForUser, isAdminRole } from "@/lib/auth";
import { resolveRoomDetails } from "@/lib/roomCatalog";

function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);

  if (normalized.includes(",") || normalized.includes('"') || normalized.includes("\n")) {
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  return normalized;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getProfileForUser(supabase, user.id);
    if (!isAdminRole(profile?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requestUrl = new URL(request.url);
    const status = requestUrl.searchParams.get("status");
    const dateFrom = requestUrl.searchParams.get("dateFrom");
    const dateTo = requestUrl.searchParams.get("dateTo");
    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from("bookings")
      .select("id, created_at, room_id, first_name, last_name, email, check_in, check_out, total_price, status, rooms(*)")
      .order("created_at", { ascending: false });

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    if (dateFrom) {
      query = query.gte("created_at", `${dateFrom}T00:00:00`);
    }

    if (dateTo) {
      query = query.lte("created_at", `${dateTo}T23:59:59`);
    }

    const { data: bookings, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Failed to export bookings" }, { status: 500 });
    }

    const header = [
      "booking_id",
      "created_at",
      "room_id",
      "room_name",
      "guest_name",
      "email",
      "check_in",
      "check_out",
      "total_price",
      "status",
    ];

    const rows = (bookings ?? []).map((booking) => {
      const bookingRoom = (booking.rooms ?? null) as {
        name?: string | null;
        type?: string | null;
        images?: unknown;
        image_url?: string | null;
        base_price?: number | null;
        description?: string | null;
        capacity?: number | null;
      } | null;

      const room = resolveRoomDetails(booking.room_id, {
        id: booking.room_id ?? "",
        name: bookingRoom?.name ?? null,
        type: bookingRoom?.type ?? "Room",
        images: bookingRoom?.images as string[] | null | undefined,
        image_url: bookingRoom?.image_url ?? null,
        base_price: bookingRoom?.base_price ?? 0,
        description: bookingRoom?.description ?? null,
        capacity: bookingRoom?.capacity ?? 1,
      });
      const guestName = `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim();

      return [
        booking.id,
        booking.created_at ?? "",
        booking.room_id ?? "",
        room.name,
        guestName,
        booking.email ?? "",
        booking.check_in,
        booking.check_out,
        booking.total_price,
        booking.status ?? "",
      ];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
      .join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookings-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to export bookings" }, { status: 500 });
  }
}
