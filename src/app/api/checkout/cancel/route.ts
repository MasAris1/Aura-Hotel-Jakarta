import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
    try {
        const { bookingId } = await req.json();

        if (!bookingId) {
            return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Hanya bisa cancel booking milik sendiri yang masih UNPAID
        const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select('id, user_id, status')
            .eq('id', bookingId)
            .eq('user_id', user.id)
            .eq('status', 'UNPAID')
            .single();

        if (fetchError || !booking) {
            return NextResponse.json({ error: "Booking tidak ditemukan atau sudah diproses" }, { status: 404 });
        }

        // Hapus booking UNPAID agar kamar kembali tersedia
        const { error: deleteError } = await supabase
            .from('bookings')
            .delete()
            .eq('id', bookingId)
            .eq('status', 'UNPAID');

        if (deleteError) {
            console.error("Cancel Booking Error:", deleteError);
            return NextResponse.json({ error: "Gagal membatalkan pesanan" }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: "Booking berhasil dibatalkan" });

    } catch (e: any) {
        console.error("Cancel Exception:", e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
