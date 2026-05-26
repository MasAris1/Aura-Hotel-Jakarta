"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useTransition, Suspense } from "react";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, ChevronRight, CreditCard, Download, Info, Loader2, Sparkles, User, UserCheck } from "lucide-react";
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

function formatDateLocal(dateString: string) {
    if (!dateString) return "-";
    try {
        return new Intl.DateTimeFormat("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        }).format(new Date(`${dateString}T00:00:00`));
    } catch {
        return dateString;
    }
}

function formatRupiah(value?: number | null) {
    return typeof value === "number" && Number.isFinite(value)
        ? `IDR ${value.toLocaleString("id-ID")}`
        : "Menunggu harga";
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
    const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
    const [bookingStatus, setBookingStatus] = useState<string>("UNPAID");
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isAuthorizing, setIsAuthorizing] = useState(true);

    const [checkIn, setCheckIn] = useState("");
    const [checkOut, setCheckOut] = useState("");
    const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
    const [customDuration, setCustomDuration] = useState("");

    const calculateCheckOutDate = (checkInDate: string, days: number) => {
        if (!checkInDate) return "";
        const date = new Date(`${checkInDate}T00:00:00`);
        date.setDate(date.getDate() + days);
        return date.toISOString().slice(0, 10);
    };

    const handleSelectDuration = (days: number) => {
        setSelectedDuration(days);
        setCustomDuration("");
        if (checkIn) {
            setCheckOut(calculateCheckOutDate(checkIn, days));
        }
    };

    const handleCustomDurationChange = (val: string) => {
        setCustomDuration(val);
        const days = parseInt(val, 10);
        if (!isNaN(days) && days > 0) {
            setSelectedDuration(days);
            if (checkIn) {
                setCheckOut(calculateCheckOutDate(checkIn, days));
            }
        } else {
            setSelectedDuration(null);
        }
    };

    const handleCheckInChange = (val: string) => {
        setCheckIn(val);
        if (selectedDuration && val) {
            setCheckOut(calculateCheckOutDate(val, selectedDuration));
        }
    };

    const handleCheckOutChange = (val: string) => {
        setCheckOut(val);
        setSelectedDuration(null);
        setCustomDuration("");
    };
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
        if (!bookingSuccess || !createdBookingId) return;

        const supabase = createClient();
        let intervalId: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const { data, error } = await supabase
                    .from("bookings")
                    .select("status")
                    .eq("id", createdBookingId)
                    .single();

                if (data && data.status) {
                    setBookingStatus(data.status);
                    if (data.status === "PAID" || data.status === "SUCCESS") {
                        clearInterval(intervalId);
                    }
                }
            } catch (err) {
                console.error("Error polling booking status:", err);
            }
        };

        // Poll immediately, then every 2 seconds
        void checkStatus();
        intervalId = setInterval(checkStatus, 2000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [bookingSuccess, createdBookingId]);

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
            setQuote(null);

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
    const displayedSubtotal = quote?.subtotal ?? null;
    const displayedTotal = quote?.totalPrice ?? null;
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
                    if (!window.snap) {
                        alert("Layanan pembayaran belum siap. Silakan refresh halaman atau coba lagi beberapa saat lagi.");
                        return;
                    }

                    setCreatedBookingId(data.bookingId);

                    window.snap.pay(data.token, {
                        onSuccess: () => {
                            setCreatedBookingId(data.bookingId);
                            setBookingSuccess(true);
                        },
                        onPending: () => {
                            router.push("/");
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
            <div className="max-w-2xl w-full mx-auto py-12 px-4 flex flex-col items-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="w-8 h-8 text-primary animate-bounce" />
                </div>
                <h1 className="font-serif text-3xl md:text-4xl mb-2 text-center text-foreground">Reservasi Diterima</h1>
                <p className="font-sans text-sm text-foreground/60 mb-10 text-center leading-relaxed font-light max-w-md">
                    Terima kasih telah memilih Aura Hotel Jakarta. Reservasi Anda telah masuk ke dalam sistem kami.
                </p>

                {/* Interactive Luxury Ticket */}
                <div className="w-full max-w-[480px] bg-zinc-950/70 border border-primary/20 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(212,175,71,0.08)] relative backdrop-blur-md transition-transform duration-500 hover:scale-[1.01]">
                    {/* Ticket Header */}
                    <div className="p-6 border-b border-primary/10 flex justify-between items-start">
                        <div>
                            <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Nama Tamu</p>
                            <p className="font-serif text-lg text-primary">{firstName} {lastName}</p>
                        </div>
                        <div className={`px-3 py-1 border font-sans text-[10px] tracking-wider uppercase transition-all duration-300 ${
                            bookingStatus === "PAID" || bookingStatus === "SUCCESS"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400 animate-pulse font-medium"
                        }`}>
                            {bookingStatus === "PAID" || bookingStatus === "SUCCESS" ? "TERBAYAR" : "MEMVERIFIKASI"}
                        </div>
                    </div>

                    {/* Ticket Body */}
                    <div className="p-6 space-y-6">
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">ID Booking</p>
                                <p className="font-sans text-sm text-foreground font-semibold uppercase tracking-wider">
                                    #{createdBookingId ? createdBookingId.split("-")[0].toUpperCase() : "-"}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Tipe Kamar</p>
                                <p className="font-sans text-sm text-foreground font-medium">{room.type}</p>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Akomodasi</p>
                            <p className="font-serif text-xl text-foreground font-light">{room.name}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-6 border-t border-primary/10 pt-6">
                            <div>
                                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Check-In</p>
                                <p className="font-sans text-sm text-foreground">{formatDateLocal(checkIn)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Check-Out</p>
                                <p className="font-sans text-sm text-foreground">{formatDateLocal(checkOut)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Perforation Line */}
                    <div className="relative h-6 flex items-center bg-transparent select-none">
                        {/* Left notch */}
                        <div className="absolute -left-3 w-6 h-6 bg-background rounded-full border-r border-primary/20"></div>
                        {/* Dashed line */}
                        <div className="w-full border-t border-dashed border-primary/30 mx-4"></div>
                        {/* Right notch */}
                        <div className="absolute -right-3 w-6 h-6 bg-background rounded-full border-l border-primary/20"></div>
                    </div>

                    {/* Ticket Footer */}
                    <div className="p-6 flex flex-col items-center bg-black/40 border-t border-primary/5">
                        <div className="mb-6 text-center">
                            <p className="text-[10px] font-sans tracking-[0.2em] text-foreground/45 uppercase mb-1">Total Pembayaran</p>
                            <p className="font-serif text-2xl text-primary tracking-tighter font-semibold">{formatRupiah(quote?.totalPrice)}</p>
                        </div>

                        {/* QR Code Section */}
                        <div className="p-2 bg-white rounded-xl mb-4 flex items-center justify-center transition-all duration-300 shadow-md">
                            {bookingStatus === "PAID" || bookingStatus === "SUCCESS" ? (
                                <img
                                    alt="QR Code"
                                    className="w-28 h-28 grayscale contrast-125 select-none"
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=aura-voucher-${createdBookingId}&color=000000`}
                                />
                            ) : (
                                <div className="w-28 h-28 flex flex-col items-center justify-center bg-zinc-950 text-foreground/50 border border-dashed border-primary/20 rounded-lg">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                                    <span className="text-[9px] uppercase tracking-widest text-center px-2">Verifikasi</span>
                                </div>
                            )}
                        </div>
                        <p className="text-[9px] font-sans tracking-[0.2em] text-foreground/35 uppercase text-center font-light">Tunjukkan voucher saat Check-in</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-4 w-full max-w-[480px] mt-8">
                    <a
                        href={bookingStatus === "PAID" || bookingStatus === "SUCCESS" ? `/api/vouchers/${createdBookingId}` : undefined}
                        onClick={(e) => {
                            if (bookingStatus !== "PAID" && bookingStatus !== "SUCCESS") {
                                e.preventDefault();
                                alert("Pembayaran belum diverifikasi. Mohon tunggu beberapa saat.");
                            }
                        }}
                        className={`w-full font-sans text-[11px] tracking-[0.25em] uppercase py-4 text-center transition-all flex items-center justify-center gap-2 border font-medium ${
                            bookingStatus === "PAID" || bookingStatus === "SUCCESS"
                                ? "bg-primary border-primary text-primary-foreground hover:bg-primary/95 cursor-pointer"
                                : "bg-muted border-border text-muted-foreground cursor-not-allowed opacity-60"
                        }`}
                    >
                        {bookingStatus === "PAID" || bookingStatus === "SUCCESS" ? (
                            <>
                                <Download className="w-4 h-4" />
                                Unduh E-Voucher (PDF)
                            </>
                        ) : (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                Menunggu Verifikasi Pembayaran...
                            </>
                        )}
                    </a>

                    {bookingStatus !== "PAID" && bookingStatus !== "SUCCESS" && (
                        <p className="text-[11px] font-sans text-center text-foreground/40 leading-relaxed max-w-sm mx-auto font-light">
                            Verifikasi otomatis sedang berjalan. Jika status tidak berubah dalam beberapa detik, silakan periksa riwayat reservasi Anda di profil.
                        </p>
                    )}

                    <div className="flex gap-4 mt-2">
                        <Link
                            href="/profile"
                            className="flex-1 border border-border text-foreground/75 py-4 font-sans text-[10px] tracking-[0.2em] uppercase hover:border-primary/50 hover:text-foreground transition-all text-center font-medium"
                        >
                            Ke Profil
                        </Link>
                        <Link
                            href="/"
                            className="flex-1 border border-transparent text-foreground/50 hover:text-foreground py-4 font-sans text-[10px] tracking-[0.2em] uppercase transition-all text-center font-medium"
                        >
                            Ke Beranda
                        </Link>
                    </div>
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
                        {/* Pilihan Durasi Menginap */}
                        <div className="mb-8 space-y-3">
                            <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Durasi Menginap</label>
                            <div className="flex flex-wrap items-center gap-3">
                                {[1, 2, 3].map((days) => (
                                    <button
                                        key={days}
                                        type="button"
                                        onClick={() => handleSelectDuration(days)}
                                        className={`px-5 py-3 font-sans text-xs tracking-wider uppercase border transition-all ${
                                            selectedDuration === days && !customDuration
                                                ? "border-primary bg-primary/10 text-primary font-medium"
                                                : "border-border bg-muted/30 text-foreground/70 hover:border-foreground/30 hover:text-foreground"
                                        }`}
                                    >
                                        {days} Hari
                                    </button>
                                ))}
                                <div className="flex items-center gap-2 pl-2 border-l border-border">
                                    <input
                                        type="number"
                                        min="1"
                                        value={customDuration}
                                        onChange={(e) => handleCustomDurationChange(e.target.value)}
                                        placeholder="Kustom"
                                        className="w-20 bg-muted/50 border border-border px-3 py-2.5 font-sans text-xs focus:outline-none focus:border-primary transition-colors text-foreground text-center"
                                    />
                                    <span className="font-sans text-[11px] text-foreground/50">hari</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Check-In</label>
                                <input 
                                    type="date" 
                                    value={checkIn}
                                    onChange={(e) => handleCheckInChange(e.target.value)}
                                    min={today}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground" 
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Check-Out</label>
                                <input 
                                    type="date" 
                                    value={checkOut}
                                    onChange={(e) => handleCheckOutChange(e.target.value)}
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
                                <span className="font-serif text-lg text-foreground">{formatRupiah(displayedSubtotal)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="font-sans text-xs tracking-widest uppercase font-semibold text-primary">Total Pembayaran</span>
                                <span className="font-serif text-2xl text-foreground">{formatRupiah(displayedTotal)}</span>
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
                                disabled={isPending || isAuthorizing || isQuoteLoading || !user || !quote || !!quoteError || !hasValidDateRange}
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
                        <div className="aspect-[16/9] overflow-hidden transition-all duration-700 dark:grayscale-[0.5] dark:hover:grayscale-0">
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
                                <span className="block font-sans text-[10px] tracking-widest uppercase font-semibold text-primary mb-1">Jaminan Layanan Suite</span>
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
