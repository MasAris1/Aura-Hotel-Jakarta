import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { snap } from "@/lib/midtrans";
import type { Database } from "@/types/supabase";
import {
    TRANSACTION_STATUSES,
    upsertBookingTransaction,
} from "@/lib/transactions";
import { resolveRoomDetails } from "@/lib/roomCatalog";

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

        // Cari booking yang masih UNPAID milik user
        const { data: bookingData, error: fetchError } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', bookingId)
            .eq('user_id', user.id)
            .eq('status', 'UNPAID')
            .single();
        const booking = bookingData as BookingRow | null;

        if (fetchError || !booking) {
            return NextResponse.json({ error: "Booking tidak ditemukan atau sudah dibayar" }, { status: 404 });
        }

        const roomName = resolveRoomDetails(booking.room_id).name;

        // Kalkulasi ulang durasi
        const durationInMs = new Date(booking.check_out).getTime() - new Date(booking.check_in).getTime();
        const durationInDays = Math.ceil(durationInMs / (1000 * 60 * 60 * 24));

        // Generate Midtrans token baru untuk booking yang sudah ada
        const totalPrice = Number(booking.total_price);
        const pricePerItem = Math.round(totalPrice / durationInDays);

        const parameter = {
            transaction_details: {
                order_id: booking.id,
                gross_amount: totalPrice
            },
            customer_details: {
                first_name: booking.first_name,
                last_name: booking.last_name,
                email: booking.email
            },
            item_details: [{
                id: booking.room_id,
                price: pricePerItem,
                quantity: durationInDays,
                name: `${roomName} (${durationInDays} Night${durationInDays > 1 ? 's' : ''})`
            }]
        };

        await upsertBookingTransaction(supabaseAdmin, {
            bookingId: booking.id,
            amount: totalPrice,
            paymentType: "midtrans",
            status: TRANSACTION_STATUSES.pending,
        });

        let transaction;
        try {
            transaction = await snap.createTransaction(parameter);
        } catch (midtransError) {
            await upsertBookingTransaction(supabaseAdmin, {
                bookingId: booking.id,
                amount: totalPrice,
                paymentType: "midtrans",
                status: TRANSACTION_STATUSES.failed,
            });

            throw midtransError;
        }

        return NextResponse.json({
            success: true,
            token: transaction.token,
            bookingId: booking.id,
            totalPrice
        });

    } catch (error: unknown) {
        console.error("Resume Payment Exception:", getErrorMessage(error));
        return NextResponse.json({ error: "Gagal melanjutkan pembayaran" }, { status: 500 });
    }
}
