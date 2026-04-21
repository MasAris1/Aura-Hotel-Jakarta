import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { midtransTransaction } from "@/lib/midtrans";
import type { Database } from "@/types/supabase";
import {
    TRANSACTION_STATUSES,
    upsertBookingTransaction,
} from "@/lib/transactions";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server error";
}

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

export async function POST(req: Request) {
    try {
        const { bookingId } = await req.json();

        if (!bookingId) {
            return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
        }

        const supabase = await createClient();
        const supabaseAdmin = getSupabaseAdmin();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Hanya bisa cancel booking milik sendiri yang masih UNPAID
        const { data: bookingData, error: fetchError } = await supabase
            .from('bookings')
            .select('id, user_id, status, total_price')
            .eq('id', bookingId)
            .eq('user_id', user.id)
            .eq('status', 'UNPAID')
            .single();
        const booking = bookingData as Pick<BookingRow, "id" | "user_id" | "status" | "total_price"> | null;

        if (fetchError || !booking) {
            return NextResponse.json({ error: "Booking tidak ditemukan atau sudah diproses" }, { status: 404 });
        }

        const { error: updateError } = await supabase
            .from('bookings')
            .update({
                status: 'EXPIRED',
                updated_at: new Date().toISOString(),
            })
            .eq('id', bookingId)
            .eq('status', 'UNPAID');

        if (updateError) {
            console.error("Cancel Booking Error:", updateError);
            return NextResponse.json({ error: "Gagal membatalkan pesanan" }, { status: 500 });
        }

        await upsertBookingTransaction(supabaseAdmin, {
            bookingId,
            amount: Number(booking.total_price ?? 0),
            status: TRANSACTION_STATUSES.cancelled,
            paymentType: "midtrans",
        });

        try {
            await midtransTransaction.cancel(bookingId);
        } catch (gatewayError) {
            console.warn("Midtrans Cancel Warning:", getErrorMessage(gatewayError));
        }

        return NextResponse.json({ success: true, message: "Booking berhasil dibatalkan" });

    } catch (error: unknown) {
        console.error("Cancel Exception:", getErrorMessage(error));
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
