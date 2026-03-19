import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import { getPublicSiteUrl, getRequiredEnv } from "@/lib/env";

type BookingStatus = "UNPAID" | "PAID" | "EXPIRED" | "REFUNDED";

type WebhookBooking = {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    check_in: string;
    check_out: string;
    status: BookingStatus;
    rooms?: {
        name?: string | null;
    } | null;
};

type MidtransWebhookPayload = {
    order_id: string;
    status_code: string;
    gross_amount: string;
    signature_key: string;
    transaction_status: string;
    fraud_status?: string;
    transaction_id?: string;
    payment_type?: string;
};

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown server error";
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as MidtransWebhookPayload;
        const supabase = getSupabaseAdmin();

        // 1. Validasi SHA-512 Kriptografi (Fase 5)
        const serverKey = getRequiredEnv("MIDTRANS_SERVER_KEY");
        const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body;

        const payloadStr = order_id + status_code + gross_amount + serverKey;
        const hash = crypto.createHash("sha512").update(payloadStr).digest("hex");

        if (hash !== signature_key) {
            console.error("Midtrans Webhook: Invalid Signature");
            return NextResponse.json({ error: "Invalid Signature" }, { status: 403 });
        }

        // 2. Cek Idempotensi (Pastikan pesanan belum PAID/EXPIRED dari webhook sebelumnya)
        // Menggunakan supabase (Service Role Key) karena webhook dipanggil
        // oleh server Midtrans tanpa user session — perlu bypass RLS
        const { data: bookingData, error: fetchError } = await supabase
            .from('bookings')
            .select('*, rooms(name)')
            .eq('id', order_id)
            .single();
        const booking = bookingData as WebhookBooking | null;

        if (fetchError || !booking) {
            console.error("Booking Not Found:", order_id);
            return NextResponse.json({ error: "Order Not Found" }, { status: 404 });
        }

        if (booking.status === 'PAID' || booking.status === 'EXPIRED' || booking.status === 'REFUNDED') {
            console.log(`Webhook Idempotency: Order ${order_id} already ${booking.status}`);
            return NextResponse.json({ success: true, message: "Order already processed" }, { status: 200 });
        }

        // 3. Tentukan status dari Midtrans
        let newStatus: BookingStatus = booking.status;
        let isSuccess = false;

        if (transaction_status === 'capture') {
            if (fraud_status === 'accept') {
                newStatus = 'PAID';
                isSuccess = true;
            }
        } else if (transaction_status === 'settlement') {
            newStatus = 'PAID';
            isSuccess = true;
        } else if (transaction_status === 'cancel' || transaction_status === 'deny' || transaction_status === 'expire') {
            newStatus = 'EXPIRED';
        } else if (transaction_status === 'pending') {
            newStatus = 'UNPAID';
        }

        // 4. Update Database (menggunakan supabase agar bypass RLS)
        if (newStatus !== booking.status) {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', order_id);

            if (updateError) {
                console.error("Booking Update Error:", updateError);
                return NextResponse.json({ error: "Db Update Failed" }, { status: 500 });
            }

            // Simpan ke log transaksi
            await supabase.from('transactions').insert({
                booking_id: order_id,
                midtrans_order_id: body.transaction_id,
                payment_type: body.payment_type,
                amount: Number(body.gross_amount),
                status: transaction_status
            });
        }

        // 5. Distribusi E-Voucher (Resend)
        // Jika status berpindah menjadi PAID untuk pertama kalinya, kirim email PDF e-Voucher
        if (isSuccess) {
            try {
                const { Resend } = await import("resend");
                const resend = new Resend(process.env.RESEND_API_KEY);

                if (process.env.RESEND_API_KEY) {
                    await resend.emails.send({
                        from: 'Aura Hotel <reservations@aura-hotel.com>',
                        to: [booking.email],
                        subject: `Booking Confirmation - ${booking.rooms?.name}`,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                <h1 style="color: #c9a25b;">Booking Confirmed!</h1>
                                <p>Dear ${booking.first_name} ${booking.last_name},</p>
                                <p>Thank you for choosing Aura. Your payment has been successfully processed.</p>
                                
                                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                                    <tr style="border-bottom: 1px solid #EEE;">
                                        <td style="padding: 10px 0; color: #666;">Booking ID</td>
                                        <td style="padding: 10px 0; text-align: right; font-weight: bold;">${order_id}</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #EEE;">
                                        <td style="padding: 10px 0; color: #666;">Room</td>
                                        <td style="padding: 10px 0; text-align: right; font-weight: bold;">${booking.rooms?.name}</td>
                                    </tr>
                                    <tr style="border-bottom: 1px solid #EEE;">
                                        <td style="padding: 10px 0; color: #666;">Dates</td>
                                        <td style="padding: 10px 0; text-align: right; font-weight: bold;">${booking.check_in} to ${booking.check_out}</td>
                                    </tr>
                                </table>

                                <p style="margin-top: 30px;">
                                    <a href="${getPublicSiteUrl()}/dashboard" style="background: #c9a25b; color: #fff; padding: 10px 20px; text-decoration: none; display: inline-block;">View e-Voucher</a>
                                </p>
                            </div>
                        `,
                    });
                } else {
                    console.warn("RESEND_API_KEY not set, skipping email notification.");
                }
            } catch (emailError) {
                console.error("Failed to send booking email:", emailError);
                // Kita tidak throw error agar Midtrans Webhook tetap return 200 OK
            }
        }

        return NextResponse.json({ success: true, processed_status: newStatus }, { status: 200 });

    } catch (error: unknown) {
        console.error("Webhook Exception:", getErrorMessage(error));
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
