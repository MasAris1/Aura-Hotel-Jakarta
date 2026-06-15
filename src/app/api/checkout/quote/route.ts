import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingQuoteError, getRoomQuote } from "@/lib/booking";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";

const quoteSchema = z.object({
  roomId: z.string().min(1, "Room ID is required"),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = quoteSchema.safeParse({
      roomId: searchParams.get("roomId"),
      checkIn: searchParams.get("checkIn"),
      checkOut: searchParams.get("checkOut"),
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid quote request" }, { status: 400 });
    }

    const quote = await getRoomQuote(
      getSupabaseAdmin(),
      parsed.data.roomId,
      parsed.data.checkIn,
      parsed.data.checkOut,
    );

    return NextResponse.json({ success: true, quote });
  } catch (error) {
    if (error instanceof BookingQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    console.error("Quote Exception:", getErrorMessage(error));
    return NextResponse.json({ error: "Failed to calculate quote" }, { status: 500 });
  }
}
