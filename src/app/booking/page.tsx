"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useTransition, Suspense } from "react";
import { ArrowLeft, ArrowRight, Calendar, CheckCircle2, ChevronRight, CreditCard, Info, Loader2, Sparkles, User, UserCheck } from "lucide-react";
import Link from "next/link";
import roomsData from "@/data/rooms.json";
import { createClient } from "@/utils/supabase/client";

type Step = 1 | 2 | 3;

function BookingForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = searchParams.get("room");
    const [step, setStep] = useState<Step>(1);
    const [isPending, startTransition] = useTransition();
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [checkIn, setCheckIn] = useState("");
    const [checkOut, setCheckOut] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [specialRequests, setSpecialRequests] = useState("");

    const room = roomsData.find(r => r.id === roomId) || roomsData[0];

    useEffect(() => {
        const checkUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push(`/login?redirect=/booking?room=${roomId}`);
            } else {
                setUser(user);
                // Pre-fill names
                const fullName = user?.user_metadata?.full_name || "";
                if (fullName) {
                    const parts = fullName.split(" ");
                    setFirstName(parts[0]);
                    setLastName(parts.slice(1).join(" ") || parts[0]);
                } else {
                    setFirstName(user?.email?.split('@')[0] || "");
                    setLastName(user?.email?.split('@')[0] || "");
                }
            }
            setLoading(false);
        };
        checkUser();
    }, [roomId, router]);

    if (loading) {
        return (
            <div className="w-full h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    const nextStep = () => setStep(prev => (prev + 1) as Step);
    const prevStep = () => setStep(prev => (prev - 1) as Step);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!checkIn || !checkOut || !firstName || !lastName) {
            alert("Harap lengkapi informasi jadwal dan tamu.");
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
                    // @ts-ignore
                    window.snap.pay(data.token, {
                        onSuccess: (result: any) => {
                            setBookingSuccess(true);
                        },
                        onPending: (result: any) => {
                            router.push("/dashboard");
                        },
                        onError: (result: any) => {
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
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground" 
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="block text-[10px] font-sans tracking-[0.2em] uppercase text-foreground/50">Check-Out</label>
                                <input 
                                    type="date" 
                                    value={checkOut}
                                    onChange={(e) => setCheckOut(e.target.value)}
                                    className="w-full bg-muted/50 border border-border p-4 font-sans text-sm focus:outline-none focus:border-primary transition-colors text-foreground" 
                                />
                            </div>
                        </div>
                        <button
                            onClick={nextStep}
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
                            <button onClick={nextStep} className="flex-[2] bg-primary text-primary-foreground py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-primary/90 transition-all group">
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
                            Pembayaran diproses secara aman melalui Midtrans. Anda dapat memilih berbagai metode pembayaran setelah menekan tombol di bawah.
                        </p>

                        <div className="bg-muted/30 border border-border p-6 mb-12 space-y-4">
                            <div className="flex justify-between items-center pb-4 border-b border-border">
                                <span className="font-sans text-sm text-foreground/60">Subtotal</span>
                                <span className="font-serif text-lg text-foreground">IDR {room.price.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <span className="font-sans text-xs tracking-widest uppercase font-semibold text-primary">Total Pembayaran</span>
                                <span className="font-serif text-2xl text-foreground">IDR {room.price.toLocaleString('id-ID')}</span>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <button onClick={prevStep} className="flex-1 border border-border py-5 flex items-center justify-center gap-3 font-sans text-xs tracking-[0.2em] uppercase hover:bg-muted transition-colors text-foreground">
                                <ArrowLeft className="w-4 h-4" /> Kembali
                            </button>
                            <button
                                onClick={handleCheckout}
                                disabled={isPending}
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
                            <img src={room.images[0]} alt={room.name} className="w-full h-full object-cover" />
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

export default function BookingPage() {
    return (
        <main className="min-h-screen bg-muted/30 pt-32 pb-24 selection:bg-primary/20">
            <div className="container mx-auto px-6 max-w-6xl">
                <Suspense fallback={
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                }>
                    <BookingForm />
                </Suspense>
            </div>
        </main>
    );
}
