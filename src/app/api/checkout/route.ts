import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { snap } from "@/lib/midtrans";
import roomsData from "@/data/rooms.json";

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

        // Cek Otentikasi
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Kalkulasi Durasi
        const durationInMs = new Date(data.checkOut).getTime() - new Date(data.checkIn).getTime();
        const durationInDays = Math.ceil(durationInMs / (1000 * 60 * 60 * 24));

        if (durationInDays < 1) {
            return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
        }

        // Cari harga kamar dari data statis rooms.json
        const room = roomsData.find(r => r.id === data.roomId);
        if (!room) {
            return NextResponse.json({ error: "Kamar tidak ditemukan" }, { status: 404 });
        }

        const pricePerNight = room.price;
        const subtotal = pricePerNight * durationInDays;
        const taxRate = 0.21; // 21% pajak & biaya
        const totalPrice = Math.round(subtotal * (1 + taxRate));

        // Coba insert Booking dengan Supabase
        const { data: booking, error: insertError } = await supabase.from('bookings').insert({
            user_id: user.id,
            room_id: data.roomId,
            first_name: data.firstName,
            last_name: data.lastName,
            email: data.email,
            special_requests: data.specialRequests,
            check_in: data.checkIn,
            check_out: data.checkOut,
            total_price: totalPrice,
            status: 'UNPAID'
        }).select().single();

        if (insertError) {
            console.error("Booking Error:", insertError);

            // PostgreSQL Exclusion Violation (Overlapping Dates - Double Booking / Race condition)
            if (insertError.code === '23P01') {
                return NextResponse.json({ error: "Gagal Booking: Kamar sudah dipesan di tanggal tersebut. Silakan pilih tanggal lain." }, { status: 409 });
            }
            return NextResponse.json({ error: "Gagal membuat pesanan: " + insertError.message }, { status: 500 });
        }

        try {
            // == FASE 4: INTEGRASI MIDTRANS & GRACEFUL DEGRADATION ==
            const parameter = {
                transaction_details: {
                    order_id: booking.id,
                    gross_amount: totalPrice
                },
                customer_details: {
                    first_name: data.firstName,
                    last_name: data.lastName,
                    email: data.email
                },
                item_details: [{
                    id: data.roomId,
                    price: Math.round(totalPrice / durationInDays),
                    quantity: durationInDays,
                    name: `${room.name} (${durationInDays} Night${durationInDays > 1 ? 's' : ''})`
                }]
            };

            // Pastikan total item_details.price * quantity = gross_amount (rounding fix)
            const itemTotal = parameter.item_details[0].price * parameter.item_details[0].quantity;
            if (itemTotal !== totalPrice) {
                parameter.item_details[0].price += (totalPrice - itemTotal);
            }

            const transaction = await snap.createTransaction(parameter);
            const token = transaction.token;

            return NextResponse.json({ success: true, bookingId: booking.id, token, totalPrice }, { status: 201 });

        } catch (midtransError: any) {
            console.error("Midtrans Error:", midtransError);

            // Failsafe: Graceful Degradation. Jika midtrans down, hapus/batalkan pesanan yang berstatus UNPAID
            // agar kamar kembali Available tanpa menunggu cron block 1 jam
            await supabase.from('bookings').delete().match({ id: booking.id, status: 'UNPAID' });

            return NextResponse.json({
                error: "Sistem pembayaran sedang tidak tersedia. Pemesanan dibatalkan otomatis agar kamar tidak terkunci. Silakan coba beberapa saat lagi."
            }, { status: 503 });
        }

    } catch (e: any) {
        console.error("Checkout Exception:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

