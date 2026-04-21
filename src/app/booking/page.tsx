"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useTransition, Suspense } from "react";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, ChevronRight, CreditCard, Info, Loader2, Sparkles, User, UserCheck } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
    CLIENT_WARMUP_KEYS,
    deriveGuestIdentity,
    readSessionCache,
    writeSessionCache,
    type CachedGuestIdentity,
} from "@/lib/clientWarmup";
import type { RoomQuote } from "@/lib/booking";
import { createClient } from "@/utils/supabase/client";
import {
    getStaticRoomById,
    getStaticRooms,
    resolveRoomDetails,
    type RoomCatalogItem,
} from "@/lib/roomCatalog";

type Step = 1 | 2 | 3;

type AuthUser = {
    email?: string;
    user_metadata?: {
        full_name?: string;
    };
};

function isValidDateRange(checkIn: string, checkOut: string) {
    if (!checkIn || !checkOut) {
        return false;
    }

    return new Date(`${checkOut}T00:00:00`) > new Date(`${checkIn}T00:00:00`);
}

function BookingForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = searchParams.get("room");
    const defaultRoomId = roomId ?? getStaticRooms()[0]?.id ?? "";
    const staticRoom = getStaticRoomById(defaultRoomId);
    const cachedIdentity = readSessionCache<CachedGuestIdentity>(CLIENT_WARMUP_KEYS.bookingIdentity);
    const [step, setStep] = useState<Step>(1);
    const [isPending, startTransition] = useTransition();
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isAuthorizing, setIsAuthorizing] = useState(true);

    const [checkIn, setCheckIn] = useState("");
    const [checkOut, setCheckOut] = useState("");
    const [firstName, setFirstName] = useState(cachedIdentity?.firstName || "");
    const [lastName, setLastName] = useState(cachedIdentity?.lastName || "");
    const [specialRequests, setSpecialRequests] = useState("");
    const [quote, setQuote] = useState<RoomQuote | null>(null);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [room, setRoom] = useState<RoomCatalogItem>(() =>
        resolveRoomDetails(defaultRoomId),
    );

    const today = new Date().toISOString().slice(0, 10);
    const hasValidDateRange = isValidDateRange(checkIn, checkOut);

    useEffect(() => {
        const checkUser = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                router.push(`/login?redirect=/booking?room=${roomId}`);
            } else {
                setUser(session.user);

                const guestIdentity = deriveGuestIdentity(session.user);
                writeSessionCache(CLIENT_WARMUP_KEYS.bookingIdentity, guestIdentity);

                setFirstName((prev) => prev || guestIdentity.firstName);
                setLastName((prev) => prev || guestIdentity.lastName);
            }
            setIsAuthorizing(false);
        };

        void checkUser();
    }, [roomId, router]);

    useEffect(() => {
        let isMounted = true;

        if (staticRoom) {
            setRoom(resolveRoomDetails(staticRoom.id));
        }

        const loadRoom = async () => {
            try {
                const response = await fetch(`/api/rooms/${defaultRoomId}`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    return;
                }

                const result = await response.json() as { room?: RoomCatalogItem };

                if (isMounted && result.room) {
                    setRoom(result.room);
                }
            } catch {
                // Keep static fallback.
            }
        };

        if (defaultRoomId) {
            void loadRoom();
        }

        return () => {
            isMounted = false;
        };
    }, [defaultRoomId, staticRoom]);

    useEffect(() => {
        if (!checkIn || !checkOut) {
            setQuote(null);
            setQuoteError(null);
            setIsQuoteLoading(false);
            return;
        }

        if (!hasValidDateRange) {
            setQuote(null);
            setQuoteError("Tanggal check-out harus setelah check-in.");
            setIsQuoteLoading(false);
            return;
        }

        const controller = new AbortController();

        const loadQuote = async () => {
            setIsQuoteLoading(true);
            setQuoteError(null);

            try {
                const params = new URLSearchParams({
                    roomId: room.id,
                    checkIn,
                    checkOut,
                });
                const response = await fetch(`/api/checkout/quote?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const result = await response.json() as {
                    error?: string;
                    quote?: RoomQuote;
                };

                if (!response.ok || !result.quote) {
                    setQuote(null);
                    setQuoteError(result.error || "Gagal menghitung total menginap.");
                    return;
                }

                setQuote(result.quote);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }

                console.error("Quote load failed:", error);
                setQuote(null);
                setQuoteError("Gagal mengambil harga terbaru dari server.");
            } finally {
                if (!controller.signal.aborted) {
                    setIsQuoteLoading(false);
                }
            }
        };

        void loadQuote();

        return () => {
            controller.abort();
        };
    }, [checkIn, checkOut, hasValidDateRange, room.id]);

    const nextStep = () => setStep(prev => (prev + 1) as Step);
    const prevStep = () => setStep(prev => (prev - 1) as Step);
    const displayedSubtotal = quote?.subtotal ?? room.basePrice;
    const displayedTaxAmount = quote?.taxAmount ?? 0;
    const displayedTotal = quote?.totalPrice ?? room.basePrice;
    const displayedNights = quote?.nights ?? (checkIn && checkOut
        ? Math.max(1, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)))
        : 1);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!checkIn || !checkOut || !firstName || !lastName) {
            alert("Harap lengkapi informasi jadwal dan tamu.");
            return;
        }

        if (!hasValidDateRange) {
            alert("Tanggal check-out harus setelah check-in.");
            return;
        }

        if (!quote) {
            alert("Harga terbaru belum siap. Mohon cek kembali tanggal menginap.");
            return;
        }

        startTransition(async () => {
            try {
                const response = await fetch("/api/checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        roomId: room.id,
                        firstName,
                        lastName,
                        email: user?.email,
                        specialRequests,
                        checkIn,
                        checkOut
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    alert(data.error || "Gagal memproses pesanan.");
                    return;
                }

                if (data.token) {
                    window.snap?.pay(data.token, {
                        onSuccess: () => {
                            setBookingSuccess(true);
                        },
                        onPending: () => {
                            router.push("/dashboard");
                        },
                        onError: () => {
                            alert("Pembayaran gagal. Silakan coba lagi.");
                        },
                        onClose: () => {
                            console.log("Customer closed the popup");
                        }
                    });
                }
            } catch (error) {
                console.error("Checkout failed:", error);
                alert("Terjadi kesalahan teknis.");
            }
        });
    };

    if (bookingSuccess) {
        return (
            <div className="text-center max-w-md w-full mx-auto py-12">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
                    <CheckCircle2 className="w-10 h-10 text-primary" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-4 text-foreground">Reservasi Diterima</h1>
                <p className="font-sans text-foreground/60 mb-10 leading-relaxed font-light">
                    Terima kasih telah memilih The Royal Horizon. Detail reservasi dan instruksi kedatangan telah dikirimkan ke email Anda.
                </p>
                <div className="flex flex-col gap-4">
                    <Link
                        href="/vip"
                        className="bg-primary text-primary-foreground py-4 font-sans text-xs tracking-[0.2em] uppercase hover:bg-primary/90 transition-colors text-center"
                    >
                        Ke Portal VIP
                    </Link>
                    <Link
                        href="/"
                        className="text-foreground/50 hover:text-foreground py-2 font-sans text-xs tracking-[0.2em] uppercase transition-colors text-center"
                    >
                        Kembali ke Beranda
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Form Side */}
            <div className="lg:col-span-7">
                {isAuthorizing ? (
                    <div className="mb-8 rounded-full border border-primary/20 bg-primary/8 px-4 py-3 text-[10px] font-sans uppercase tracking-[0.22em] text-primary animate-pulse">
                        Menyiapkan identitas tamu dan sesi pembayaran aman...
                    </div>
                ) : null}

                {/* Stepper */}
                <div className="flex items-center gap-4 mb-12 overflow-x-auto pb-4 no-scrollbar">
                    {[
                        { n: 1, label: "Jadwal", icon: Calendar },
                        { n: 2, label: "Tamu", icon: User },
                        { n: 3, label: "Pembayaran", icon: CreditCard }
                    ].map((s) => (
                        <div key={s.n} className="flex items-center gap-4 shrink-0">
                            <div className={`flex items-center gap-3 px-4 py-2 border transition-colors ${step === s.n ? 'bg-background border-primary text-primary' : 'bg-transparent border-border text-foreground/40'}`}>
                                <s.icon className="w-4 h-4" />
                                <span className="font-sans text-[10px] tracking-widest uppercase font-medium">{s.label}</span>
                            </div>
                            {s.n < 3 && <ChevronRight className="w-4 h-4 text-foreground/20" />}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                {step === 1 && (
                    <div className="bg-background border border-border p-8 md:p-12">
                        <h2 className="font-serif text-2xl mb-8 flex items-center gap-3 text-foreground">
                            <Calendar className="w-6 h-6 text-primary" /> Pilih Jadwal Menginap
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Check-In</label>
                                <input 
                                    type="date" 
                                    value={checkIn}
                                    onChange={(e) => setCheckIn(e.target.value)}
                                    min={today}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground" 
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Check-Out</label>
                                <input 
                                    type="date" 
                                    value={checkOut}
                                    onChange={(e) => setCheckOut(e.target.value)}
                                    min={checkIn || today}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground" 
                                />
                            </div>
                        </div>
                        <button
                            onClick={nextStep}
                            disabled={isAuthorizing || !checkIn || !checkOut || !hasValidDateRange}
                            className="w-full bg-primary text-primary-foreground py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-primary/90 transition-all group"
                        >
                            Selanjutnya <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="bg-background border border-border p-8 md:p-12">
                        <h2 className="font-serif text-2xl mb-8 flex items-center gap-3 text-foreground">
                            <UserCheck className="w-6 h-6 text-primary" /> Informasi Tamu
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Nama Depan</label>
                                <input
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground"
                                    placeholder="Nama Depan"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Nama Belakang</label>
                                <input
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground"
                                    placeholder="Nama Belakang"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-8 mb-12">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Permintaan Khusus (Opsional)</label>
                                <textarea
                                    rows={4}
                                    value={specialRequests}
                                    onChange={(e) => setSpecialRequests(e.target.value)}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors resize-none text-foreground"
                                    placeholder="Contoh: Lantai tinggi, alergi makanan, layanan butler khusus..."
                                />
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={prevStep} className="flex-1 border border-border py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-muted transition-colors text-foreground">
                                <ArrowLeft className="w-4 h-4" /> Kembali
                            </button>
                            <button
                                onClick={nextStep}
                                disabled={isAuthorizing || !firstName || !lastName || !hasValidDateRange}
                                className="flex-[2] bg-primary text-primary-foreground py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-primary/90 transition-all group disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Tinjau & Bayar <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="bg-background border border-border p-8 md:p-12">
                        <h2 className="font-serif text-2xl mb-4 flex items-center gap-3 text-foreground">
                            <CreditCard className="w-6 h-6 text-primary" /> Konfirmasi Pembayaran
                        </h2>
                        <p className="font-sans text-foreground/50 text-sm mb-8 leading-relaxed font-light">
                            Pembayaran diproses secara aman melalui Midtrans. Total di bawah dihitung langsung dari harga kamar di Supabase agar sama dengan nominal yang akan ditagihkan.
                        </p>

                        <div className="bg-muted/30 border border-border p-6 mb-12 space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-border">
                                <span className="font-sans text-sm text-foreground/60">Durasi Menginap</span>
                                <span className="font-serif text-lg text-foreground">{displayedNights} malam</span>
                            </div>
                            <div className="flex justify-between items-center pb-4 border-b border-border">
                                <span className="font-sans text-sm text-foreground/60">Subtotal</span>
                                <span className="font-serif text-lg text-foreground">IDR {displayedSubtotal.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between items-center pb-4 border-b border-border">
                                <span className="font-sans text-sm text-foreground/60">Pajak &amp; biaya</span>
                                <span className="font-serif text-lg text-foreground">IDR {displayedTaxAmount.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="font-sans text-xs tracking-widest uppercase font-semibold text-primary">Total Pembayaran</span>
                                <span className="font-serif text-2xl text-foreground">IDR {displayedTotal.toLocaleString('id-ID')}</span>
                            </div>
                            {isQuoteLoading ? (
                                <p className="text-xs font-sans uppercase tracking-[0.18em] text-foreground/40">
                                    Mengambil harga terbaru dari server...
                                </p>
                            ) : null}
                            {quoteError ? (
                                <p className="text-sm text-red-500">{quoteError}</p>
                            ) : null}
                        </div>

                        <div className="flex gap-4">
                            <button onClick={prevStep} className="flex-1 border border-border py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-muted transition-colors text-foreground">
                                <ArrowLeft className="w-4 h-4" /> Kembali
                            </button>
                            <button
                                onClick={handleCheckout}
                                disabled={isPending || isAuthorizing || !user || !quote || !!quoteError || !hasValidDateRange}
                                className="flex-[2] bg-primary text-primary-foreground py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed group text-center"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Bayar Sekarang"}
                                {!isPending && <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Side */}
            <div className="lg:col-span-5">
                <div className="sticky top-32 space-y-8">
                    {/* Room Summary */}
                    <div className="bg-background border border-border overflow-hidden">
                        <div className="aspect-[16/9] overflow-hidden grayscale-[0.5] hover:grayscale-0 transition-all duration-700">
                            <div className="relative h-full w-full">
                                <Image
                                    src={room.images[0]}
                                    alt={room.name}
                                    fill
                                    priority
                                    sizes="(min-width: 1024px) 33vw, 100vw"
                                    className="object-cover"
                                />
                            </div>
                        </div>
                        <div className="p-8">
                            <span className="text-primary font-sans text-[10px] tracking-[0.3em] uppercase mb-2 block">{room.type}</span>
                            <h3 className="font-serif text-2xl mb-4 text-foreground">{room.name}</h3>
                            <p className="text-foreground/60 font-sans text-sm leading-relaxed font-light mb-8 line-clamp-3">
                                {room.description}
                            </p>
                        </div>
                    </div>

                    {/* Why Us */}
                    <div className="bg-primary/5 border border-primary/20 p-8 space-y-4">
                        <div className="flex items-start gap-3">
                            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <div>
                                <span className="block font-sans text-[10px] tracking-widest uppercase font-semibold text-primary mb-1">Jaminan Layanan VIP</span>
                                <p className="font-sans text-[11px] text-foreground/60 leading-relaxed font-light">
                                    Akses langsung ke AI Butler 24/7 dan prioritas check-in tersedia untuk semua reservasi suite.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function BookingPageFallback() {
    return (
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-8">
                <div className="h-10 w-72 animate-pulse rounded-full bg-primary/10" />
                <div className="flex gap-4 overflow-x-auto pb-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="h-12 w-32 shrink-0 animate-pulse rounded-full border border-border bg-background" />
                    ))}
                </div>
                <div className="space-y-6 border border-border bg-background p-8 md:p-12">
                    <div className="h-8 w-56 animate-pulse rounded-full bg-muted/30" />
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                        <div className="h-14 animate-pulse rounded-2xl bg-muted/40" />
                        <div className="h-14 animate-pulse rounded-2xl bg-muted/40" />
                    </div>
                    <div className="h-14 w-full animate-pulse rounded-full bg-primary/10" />
                </div>
            </div>

            <div className="lg:col-span-5">
                <div className="sticky top-32 space-y-8">
                    <div className="overflow-hidden border border-border bg-background">
                        <div className="aspect-[16/9] animate-pulse bg-muted/40" />
                        <div className="space-y-4 p-8">
                            <div className="h-3 w-20 animate-pulse rounded-full bg-primary/15" />
                            <div className="h-8 w-56 animate-pulse rounded-full bg-muted/30" />
                            <div className="h-4 w-full animate-pulse rounded-full bg-muted/20" />
                            <div className="h-4 w-5/6 animate-pulse rounded-full bg-muted/20" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BookingPage() {
    return (
        <main className="min-h-screen bg-muted/30 pt-32 pb-24 selection:bg-primary/20">
            <div className="container mx-auto px-6 max-w-6xl">
                <Suspense fallback={<BookingPageFallback />}>
                    <BookingForm />
                </Suspense>
            </div>
        </main>
    );
}
