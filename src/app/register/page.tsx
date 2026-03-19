"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Mail, KeyRound, Loader2 } from "lucide-react";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { signup } from "../auth/actions";

export default function RegisterPage() {
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    const handleAction = async (formData: FormData) => {
        setMessage(null);
        const redirectUrl = searchParams.get("redirect") || undefined;
        startTransition(async () => {
            const result = await signup(formData, redirectUrl);

            if (result?.error) {
                setMessage({ type: 'error', text: result.error });
            } else if (result?.success) {
                setMessage({ type: 'success', text: result.success });
            }
        });
    };

    return (
        <main className="min-h-screen flex text-foreground overflow-hidden bg-background">
            {/* Visual Side */}
            <div className="hidden lg:flex w-1/2 relative flex-col justify-center p-12">
                <div className="absolute inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1542314831-c6a4d27ce66f?q=80&w=2940&auto=format&fit=crop"
                        alt="Luxury Suite"
                        className="w-full h-full object-cover opacity-60 mix-blend-luminosity"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                </div>
                <div className="relative z-10 w-full max-w-md mx-auto">
                    <h2 className="font-playfair text-4xl mb-4">Membership Invitation</h2>
                    <p className="font-inter font-light text-foreground/70 text-sm leading-relaxed">
                        Join an exclusive circle of travelers. Experience unparalleled service
                        and sophisticated comfort.
                    </p>
                </div>
            </div>

            {/* Form Side */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-muted relative overflow-y-auto">
                <div className="absolute top-8 right-8">
                    <Link href="/" className="font-inter text-xs tracking-widest uppercase text-foreground/50 hover:text-foreground transition-colors">
                        Return to Home
                    </Link>
                </div>

                <div className="w-full max-w-sm my-auto">
                    <div className="text-center mb-12">
                        <h1 className="font-playfair text-3xl tracking-widest uppercase mb-2">Registration</h1>
                        <p className="font-inter text-sm text-foreground/50">Submit your credentials.</p>
                    </div>

                    <div className="min-h-[220px]">
                        {message && (
                            <div
                                className={`mb-6 p-4 text-xs font-inter uppercase tracking-widest border ${message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'
                                    }`}
                            >
                                {message.text}
                            </div>
                        )}

                        <GoogleAuthButton
                            next="/vip"
                            label="Continue with Google"
                            disabled={isPending}
                            onError={(text) => setMessage(text ? { type: "error", text } : null)}
                            className="mb-6 flex w-full items-center justify-center gap-3 border border-white/20 bg-white/5 px-4 py-4 font-inter text-xs tracking-widest uppercase transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        />

                        <div className="relative mb-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10" />
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-muted px-4 font-inter text-[10px] tracking-[0.3em] uppercase text-foreground/35">
                                    Or continue with email
                                </span>
                            </div>
                        </div>

                        <form
                            action={handleAction}
                            className="space-y-6"
                        >
                            <div>
                                <label className="block text-xs font-inter uppercase tracking-widest text-foreground/50 mb-3">
                                    Email Address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                                    <input
                                        type="email"
                                        name="email"
                                        required
                                        placeholder="vip@example.com"
                                        className="w-full bg-transparent border border-white/20 py-3 pl-12 pr-4 font-inter text-sm focus:outline-none focus:border-white transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-inter uppercase tracking-widest text-foreground/50 mb-3">
                                    Password
                                </label>
                                <div className="relative">
                                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                                    <input
                                        type="password"
                                        name="password"
                                        required
                                        placeholder="Create a password"
                                        className="w-full bg-transparent border border-white/20 py-3 pl-12 pr-4 font-inter text-sm focus:outline-none focus:border-white transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-inter uppercase tracking-widest text-foreground/50 mb-3">
                                    Confirm Password
                                </label>
                                <div className="relative">
                                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                                    <input
                                        type="password"
                                        name="confirmPassword"
                                        required
                                        placeholder="Confirm your password"
                                        className="w-full bg-transparent border border-white/20 py-3 pl-12 pr-4 font-inter text-sm focus:outline-none focus:border-white transition-colors"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full flex items-center justify-center gap-2 py-4 mt-8 bg-white text-black font-inter text-xs tracking-widest uppercase hover:bg-white/90 transition-colors disabled:opacity-50"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete Registration"}
                                {!isPending && <ArrowRight className="w-4 h-4" />}
                            </button>
                        </form>
                    </div>

                    <div className="mt-12 text-center pb-8">
                        <p className="font-inter text-xs text-foreground/40 mb-2">Already accepted?</p>
                        <Link href={`/login${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`} className="font-inter text-xs tracking-widest uppercase text-foreground hover:text-foreground/70 transition-colors underline underline-offset-4">
                            Proceed to Login
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
