import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { BookingQuoteError, getRoomQuote } from "@/lib/booking";
import { buildRoomPaymentParameter, midtransConfigDiagnostics, snap } from "@/lib/midtrans";
import type { Database } from "@/types/supabase";
import {
    TRANSACTION_STATUSES,
    upsertBookingTransaction,
} from "@/lib/transactions";
import { revalidateRoomPages } from "@/lib/revalidate";

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

        // Cari room_unit yang AVAILABLE untuk room_id ini
        const { data: availableUnits, error: unitError } = await supabaseAdmin
            .from('room_units')
            .select('id, unit_number')
            .eq('room_id', data.roomId)
            .eq('status', 'AVAILABLE')
            .limit(1);

        if (unitError || !availableUnits || availableUnits.length === 0) {
            return NextResponse.json({ error: "Gagal Booking: Tidak ada unit kamar yang tersedia untuk dipesan." }, { status: 409 });
        }

        const allocatedUnit = availableUnits[0];

        // Update room_unit menjadi RESERVED
        await supabaseAdmin.from('room_units').update({
            status: 'RESERVED',
            current_guest_name: `${data.firstName} ${data.lastName}`,
            current_guest_email: data.email,
            check_in: data.checkIn,
            check_out: data.checkOut
        }).eq('id', allocatedUnit.id);

        // Coba insert Booking dengan SupabaseAdmin (Bypass RLS)
        const { data: bookingData, error: insertError } = await supabaseAdmin.from('bookings').insert({
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

        if (booking && !insertError) {
            await supabaseAdmin.from('audit_logs').insert({
                table_name: 'bookings',
                record_id: booking.id,
                action: 'CREATE_RESERVATION',
                new_data: booking as any,
                performed_by: user.id
            });

            revalidateRoomPages();
        }

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
            const parameter = buildRoomPaymentParameter({
                bookingId: booking.id,
                roomId: data.roomId,
                roomName: quote.room.name,
                nights: quote.nights,
                totalPrice: quote.totalPrice,
                customer: {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                },
            });

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
            console.error("Midtrans Config Diagnostics:", midtransConfigDiagnostics);

            // Jangan hapus booking agar histori transaksi tetap utuh.
            await supabaseAdmin
                .from('bookings')
                .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
                .eq('id', booking.id)
                .eq('status', 'UNPAID');

            await supabaseAdmin.from('audit_logs').insert({
                table_name: 'bookings',
                record_id: booking.id,
                action: 'UPDATE_STATUS_EXPIRED',
                old_data: { status: 'UNPAID' },
                new_data: { status: 'EXPIRED' },
                performed_by: user.id
            });

            // Bebaskan unit kamar kembali ke AVAILABLE
            await supabaseAdmin.from('room_units').update({
                status: 'AVAILABLE',
                current_guest_name: null,
                current_guest_email: null,
                check_in: null,
                check_out: null
            }).eq('id', allocatedUnit.id);

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
                error: "Sistem pembayaran sedang tidak tersedia. Pemesanan ditandai gagal agar histori tetap tercatat. Silakan coba membuat reservasi baru beberapa saat lagi.",
                diagnostics: {
                    midtrans: midtransConfigDiagnostics,
                    message: getErrorMessage(midtransError),
                },
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
