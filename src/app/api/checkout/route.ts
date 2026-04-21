import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { BookingQuoteError, getRoomQuote } from "@/lib/booking";
import { snap } from "@/lib/midtrans";
import type { Database } from "@/types/supabase";
import {
    TRANSACTION_STATUSES,
    upsertBookingTransaction,
} from "@/lib/transactions";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server error";
}

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

const checkoutSchema = z.object({
    roomId: z.string().min(1, "Room ID is required"),
    firstName: z.string().min(2, "First name is too short"),
    lastName: z.string().min(2, "Last name is too short"),
    email: z.string().email("Invalid email format"),
    specialRequests: z.string().optional(),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = checkoutSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: "Invalid data", details: parsed.error.format() }, { status: 400 });
        }

        const data = parsed.data;
        const supabase = await createClient();
        const supabaseAdmin = getSupabaseAdmin();

        // Cek Otentikasi
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const quote = await getRoomQuote(
            supabaseAdmin,
            data.roomId,
            data.checkIn,
            data.checkOut,
        );

        // Coba insert Booking dengan Supabase
        const { data: bookingData, error: insertError } = await supabase.from('bookings').insert({
            user_id: user.id,
            room_id: data.roomId,
            first_name: data.firstName,
            last_name: data.lastName,
            email: data.email,
            special_requests: data.specialRequests,
            check_in: data.checkIn,
            check_out: data.checkOut,
            total_price: quote.totalPrice,
            status: 'UNPAID'
        }).select().single();
        const booking = bookingData as BookingRow | null;

        if (insertError || !booking) {
            console.error("Booking Error:", insertError);

            // PostgreSQL Exclusion Violation (Overlapping Dates - Double Booking / Race condition)
            if (insertError?.code === '23P01') {
                return NextResponse.json({ error: "Gagal Booking: Kamar sudah dipesan di tanggal tersebut. Silakan pilih tanggal lain." }, { status: 409 });
            }
            return NextResponse.json({ error: "Gagal membuat pesanan: " + (insertError?.message || "Unknown booking error") }, { status: 500 });
        }

        try {
            await upsertBookingTransaction(supabaseAdmin, {
                bookingId: booking.id,
                amount: Number(booking.total_price ?? 0),
                status: TRANSACTION_STATUSES.initiated,
            });

            // == FASE 4: INTEGRASI MIDTRANS & GRACEFUL DEGRADATION ==
            const parameter = {
                transaction_details: {
                    order_id: booking.id,
                    gross_amount: quote.totalPrice
                },
                customer_details: {
                    first_name: data.firstName,
                    last_name: data.lastName,
                    email: data.email
                },
                item_details: [{
                    id: data.roomId,
                    price: quote.nights > 0 ? Math.round(quote.totalPrice / quote.nights) : quote.totalPrice,
                    quantity: quote.nights,
                    name: `${quote.room.name} (${quote.nights} Night${quote.nights > 1 ? 's' : ''})`
                }]
            };

            // Pastikan total item_details.price * quantity = gross_amount (rounding fix)
            const itemTotal = parameter.item_details[0].price * parameter.item_details[0].quantity;
            if (itemTotal !== quote.totalPrice) {
                parameter.item_details[0].price += (quote.totalPrice - itemTotal);
            }

            const transaction = await snap.createTransaction(parameter);
            const token = transaction.token;

            await upsertBookingTransaction(supabaseAdmin, {
                bookingId: booking.id,
                amount: Number(booking.total_price ?? 0),
                paymentType: "midtrans",
                status: TRANSACTION_STATUSES.pending,
            });

            return NextResponse.json({ success: true, bookingId: booking.id, token, totalPrice: quote.totalPrice }, { status: 201 });

        } catch (midtransError: unknown) {
            console.error("Midtrans Error:", getErrorMessage(midtransError));

            // Jangan hapus booking agar histori transaksi tetap utuh.
            await supabase
                .from('bookings')
                .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
                .eq('id', booking.id)
                .eq('status', 'UNPAID');

            try {
                await upsertBookingTransaction(supabaseAdmin, {
                    bookingId: booking.id,
                    amount: Number(booking.total_price ?? 0),
                    paymentType: "midtrans",
                    status: TRANSACTION_STATUSES.failed,
                });
            } catch (transactionError) {
                console.error("Transaction Logging Error:", getErrorMessage(transactionError));
            }

            return NextResponse.json({
                error: "Sistem pembayaran sedang tidak tersedia. Pemesanan ditandai gagal agar histori tetap tercatat. Silakan coba membuat reservasi baru beberapa saat lagi."
            }, { status: 503 });
        }

    } catch (error: unknown) {
        if (error instanceof BookingQuoteError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }

        console.error("Checkout Exception:", getErrorMessage(error));
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
