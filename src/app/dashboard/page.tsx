"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Clock, CheckCircle2, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import roomsData from "@/data/rooms.json";

type RoomData = (typeof roomsData)[number];
type RoomInfo = Pick<RoomData, "name" | "type" | "images" | "price">;

type BookingStatus =
    | "UNPAID"
    | "PAID"
    | "CHECKED_IN"
    | "CHECKED_OUT"
    | "EXPIRED"
    | "REFUNDED";

type UserProfile = {
    first_name?: string | null;
    last_name?: string | null;
    role?: string | null;
};

type BookingRoomRelation = {
    name?: string | null;
    type?: string | null;
    images?: string[] | null;
    base_price?: number | null;
} | null;

type BookingRecord = {
    id: string;
    user_id: string;
    room_id: string;
    first_name: string;
    last_name: string;
    check_in: string;
    check_out: string;
    total_price: number | string;
    status: BookingStatus;
    email?: string;
    rooms?: BookingRoomRelation;
    roomInfo?: RoomInfo;
};

type RealtimeBookingPayload = {
    new: Partial<BookingRecord> & { id: string };
};

// Helper: Enrich bookings dengan data dari rooms.json
function enrichBookingWithRoomData(booking: BookingRecord): BookingRecord {
    const staticRoom = roomsData.find(r => r.id === booking.room_id);
    const roomInfo: RoomInfo = staticRoom
        ? {
            name: staticRoom.name,
            type: staticRoom.type,
            images: staticRoom.images,
            price: staticRoom.price,
        }
        : {
            name: booking.rooms?.name || 'Unknown Room',
            type: booking.rooms?.type || 'Room',
            images: booking.rooms?.images || [],
            price: booking.rooms?.base_price || 0,
        };

    return {
        ...booking,
        roomInfo,
    };
}

export default function DashboardPage() {
    const [reservations, setReservations] = useState<BookingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            // Fetch Profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('first_name, last_name, role')
                .eq('id', user.id)
                .single();

            setUserProfile(profile || { first_name: user?.email?.split('@')[0] });

            // Fetch Bookings
            let query = supabase
                .from('bookings')
                .select('*, rooms(name, type, images, base_price)')
                .order('created_at', { ascending: false });

            if (profile?.role !== 'admin' && profile?.role !== 'receptionist') {
                query = query.eq('user_id', user.id);
            }

            const { data: bookings } = await query;

            if (bookings) {
                // Enrich setiap booking dengan data statis dari rooms.json
                setReservations((bookings as BookingRecord[]).map(enrichBookingWithRoomData));
            }
            setLoading(false);

            // FASE 6: Supabase Realtime Subscription untuk Sinkronisasi Waktu Nyata
            const userFilter = (profile?.role === 'admin' || profile?.role === 'receptionist') ? '' : `user_id=eq.${user.id}`;

            const channel = supabase.channel('public:bookings')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'bookings', filter: userFilter ? userFilter : undefined },
                    (payload: RealtimeBookingPayload) => {
                        console.log('Realtime Update Received:', payload);
                        setReservations((prev) =>
                            prev.map((res) => res.id === payload.new.id
                                ? enrichBookingWithRoomData({ ...res, ...payload.new })
                                : res
                            )
                        );
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        } else {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cleanup: (() => void) | undefined;
        let isMounted = true;

        const loadDashboard = async () => {
            const unsubscribe = await fetchData();

            if (!isMounted) {
                unsubscribe?.();
                return;
            }

            cleanup = unsubscribe;
        };

        void loadDashboard();

        return () => {
            isMounted = false;
            cleanup?.();
        };
    }, [fetchData]);

    const handleAction = async (bookingId: string, action: 'check_in' | 'check_out' | 'refund') => {
        const supabase = createClient();
        let newStatus = '';
        if (action === 'check_in') newStatus = 'CHECKED_IN';
        if (action === 'check_out') newStatus = 'CHECKED_OUT';
        if (action === 'refund') newStatus = 'REFUNDED';

        await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
    };

    // P1-3: Resume payment untuk booking UNPAID yang sudah ada
    const handleResumePayment = async (bookingId: string) => {
        setPayingBookingId(bookingId);
        try {
            const res = await fetch('/api/checkout/resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId }),
            });

            const result = await res.json() as { error?: string; token?: string };

            if (!res.ok) {
                alert(result.error || 'Gagal melanjutkan pembayaran');
                setPayingBookingId(null);
                return;
            }

            if (result.token) {
                window.snap?.pay(result.token, {
                    onSuccess: function () {
                        setPayingBookingId(null);
                        // Realtime akan auto-update status
                    },
                    onPending: function () {
                        setPayingBookingId(null);
                    },
                    onError: function () {
                        alert('Pembayaran gagal. Silakan coba lagi.');
                        setPayingBookingId(null);
                    },
                    onClose: function () {
                        setPayingBookingId(null);
                    }
                });
            }
        } catch {
            alert('Terjadi kesalahan.');
            setPayingBookingId(null);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-background pt-32 pb-24 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background pt-32 pb-24 selection:bg-primary/20">
            <div className="container mx-auto px-6 max-w-5xl">
                <div className="mb-12 border-b border-border pb-8 flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <h1 className="text-4xl md:text-5xl font-serif text-foreground mb-2">Guest Portal</h1>
                        <p className="font-sans text-foreground/50 tracking-widest uppercase text-xs">Welcome back, {userProfile?.first_name || 'Guest'}</p>
                    </div>
                    <Link href="/#collection" className="px-6 py-2 border border-primary text-primary font-sans text-xs tracking-widest uppercase hover:bg-primary hover:text-primary-foreground transition-all">
                        New Reservation
                    </Link>
                </div>

                <div className="space-y-6">
                    <h2 className="font-serif text-2xl text-foreground mb-6">Reservation History</h2>

                    {reservations.length === 0 ? (
                        <div className="text-center py-20 bg-muted/20 border border-border">
                            <p className="font-sans text-foreground/50 tracking-widest uppercase text-sm">No reservations found.</p>
                        </div>
                    ) : null}

                    {reservations.map((res) => (
                        <div key={res.id} className="bg-card border border-border p-6 md:p-8 flex flex-col md:flex-row gap-8 items-center justify-between hover:border-primary/50 transition-colors duration-500">
                            <div className="flex gap-6 w-full md:w-auto">
                                <Image src={res.roomInfo?.images?.[0] || 'https://via.placeholder.com/96'} alt={res.roomInfo?.name || 'Room'} width={96} height={96} className="w-24 h-24 object-cover" />
                                <div className="flex flex-col justify-center">
                                    <span className="text-foreground/50 font-sans text-[10px] tracking-widest uppercase mb-1">{res.id.substring(0, 8)}</span>
                                    <h3 className="font-serif text-xl text-foreground mb-2">{res.roomInfo?.name} <span className="text-sm font-sans text-foreground/50 ml-2">({res.first_name} {res.last_name})</span></h3>
                                    <p className="font-sans text-xs text-foreground/70 uppercase tracking-widest">
                                        {res.check_in} &mdash; {res.check_out}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col md:flex-row items-center gap-8 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-border">
                                <div className="flex items-center gap-2">
                                    {res.status === "PAID" || res.status === "CHECKED_IN" || res.status === "CHECKED_OUT" ? (
                                        <span className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 font-sans text-[10px] uppercase tracking-widest border border-green-500/20">
                                            <CheckCircle2 className="w-3 h-3" /> Confirmed
                                        </span>
                                    ) : res.status === "EXPIRED" || res.status === "REFUNDED" ? (
                                        <span className="flex items-center gap-2 px-3 py-1 bg-red-500/10 text-red-500 font-sans text-[10px] uppercase tracking-widest border border-red-500/20">
                                            <span className="w-3 h-3 rounded-full border-2 border-current"></span> {res.status}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 text-yellow-500 font-sans text-[10px] uppercase tracking-widest border border-yellow-500/20">
                                            <Clock className="w-3 h-3" /> {res.status}
                                        </span>
                                    )}
                                </div>

                                <div className="text-right">
                                    <span className="text-foreground/50 text-[10px] font-sans tracking-widest uppercase block mb-1">Total Amount</span>
                                    <span className="font-serif text-lg text-foreground">IDR {Number(res.total_price).toLocaleString('id-ID')}</span>
                                </div>

                                <div className="flex gap-2 w-full md:w-auto">
                                    {userProfile?.role === 'admin' || userProfile?.role === 'receptionist' ? (
                                        <>
                                            {res.status === 'PAID' && (
                                                <button onClick={() => handleAction(res.id, 'check_in')} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-sans text-xs tracking-widest uppercase transition-colors hover:shadow-lg hover:shadow-primary/30">
                                                    Check-In
                                                </button>
                                            )}
                                            {res.status === 'CHECKED_IN' && (
                                                <button onClick={() => handleAction(res.id, 'check_out')} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 border border-primary text-primary font-sans text-xs tracking-widest uppercase transition-colors hover:bg-primary hover:text-primary-foreground">
                                                    Check-Out
                                                </button>
                                            )}
                                            {(res.status === 'PAID' || res.status === 'CHECKED_IN') && (
                                                <button onClick={() => handleAction(res.id, 'refund')} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-500 font-sans text-xs tracking-widest uppercase transition-colors hover:bg-red-500 hover:text-white">
                                                    Refund
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {res.status === "PAID" || res.status === "CHECKED_IN" || res.status === "CHECKED_OUT" ? (
                                                <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground font-sans text-xs tracking-widest uppercase transition-colors" title="Download E-Ticket" onClick={() => alert('Fitur E-Ticket akan segera tersedia.')}>
                                                    <Download className="w-4 h-4" /> <span className="md:hidden">E-Ticket</span>
                                                </button>
                                            ) : res.status === "UNPAID" ? (
                                                <button
                                                    onClick={() => handleResumePayment(res.id)}
                                                    disabled={payingBookingId === res.id}
                                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-sans text-xs tracking-widest uppercase transition-colors hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50"
                                                >
                                                    {payingBookingId === res.id ? 'Processing...' : 'Pay Now'}
                                                </button>
                                            ) : null}
                                        </>
                                    )}
                                    <button className="px-4 py-3 border border-border text-foreground hover:bg-muted font-sans text-xs transition-colors" title="Options">
                                        <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
