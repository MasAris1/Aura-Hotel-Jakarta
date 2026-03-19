"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, KeyRound, Loader2, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import { loginWithPassword, loginWithMagicLink } from "../auth/actions";

type AuthMessage = {
    type: "error" | "success";
    text: string;
};

export default function LoginPage() {
    const searchParams = useSearchParams();
    const [method, setMethod] = useState<"magic" | "password">("magic");
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<AuthMessage | null>(null);
    const callbackError = searchParams.get("error");
    const [dismissedCallbackError, setDismissedCallbackError] = useState<string | null>(null);
    const activeCallbackError =
        callbackError && dismissedCallbackError !== callbackError ? callbackError : null;
    const visibleMessage = message ?? (activeCallbackError ? { type: "error", text: activeCallbackError } : null);

    const handleAction = async (formData: FormData) => {
        setDismissedCallbackError(callbackError);
        setMessage(null);
        const redirectUrl = searchParams.get("redirect") || undefined;
        startTransition(async () => {
            const result = method === "magic"
                ? await loginWithMagicLink(formData)
                : await loginWithPassword(formData, redirectUrl);

            if (result && "error" in result && result.error) {
                setMessage({ type: "error", text: result.error as string });
            } else if (result && "success" in result && result.success) {
                setMessage({ type: "success", text: result.success as string });
            }
        });
    };

    return (
        <main className="min-h-screen flex text-foreground overflow-hidden bg-background">
            {/* Visual Side */}
            <div className="hidden lg:flex w-1/2 relative flex-col justify-end p-12">
                <div className="absolute inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1578683010236-d716f9a3f461?q=80&w=2940&auto=format&fit=crop"
                        alt="VIP Lounge"
                        className="w-full h-full object-cover opacity-60 mix-blend-luminosity"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                </div>
                <div className="relative z-10 w-full max-w-md">
                    <h2 className="font-playfair text-4xl mb-4">The VIP Portal</h2>
                    <p className="font-inter font-light text-foreground/70 text-sm leading-relaxed">
                        Access your personalized sanctuary. Customize your suite&apos;s ambiance,
                        request private charters, and communicate directly with The Royal Butler.
                    </p>
                </div>
            </div>

            {/* Form Side */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-muted relative">
                <div className="absolute top-8 right-8">
                    <Link href="/" className="font-inter text-xs tracking-widest uppercase text-foreground/50 hover:text-foreground transition-colors">
                        Return to Home
                    </Link>
                </div>

                <div className="w-full max-w-sm">
                    <div className="text-center mb-12">
                        <h1 className="font-playfair text-3xl tracking-widest uppercase mb-2">Authentication</h1>
                        <p className="font-inter text-sm text-foreground/50">Identify yourself to proceed.</p>
                    </div>

                    <div className="flex border-b border-white/10 mb-8">
                        <button
                            onClick={() => { setMethod("magic"); setMessage(null); }}
                            className={`flex-1 pb-4 text-xs font-inter tracking-widest uppercase transition-colors relative ${method === "magic" ? "text-foreground" : "text-foreground/40 hover:text-foreground/70"
                                }`}
                        >
                            Magic Link
                            {method === "magic" && (
                                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white" />
                            )}
                        </button>
                        <button
                            onClick={() => { setMethod("password"); setMessage(null); }}
                            className={`flex-1 pb-4 text-xs font-inter tracking-widest uppercase transition-colors relative ${method === "password" ? "text-foreground" : "text-foreground/40 hover:text-foreground/70"
                                }`}
                        >
                            Password
                            {method === "password" && (
                                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white" />
                            )}
                        </button>
                    </div>

                    <div className="min-h-[220px]">
                        {visibleMessage && (
                            <div
                                className={`mb-6 p-4 text-xs font-inter uppercase tracking-widest border ${visibleMessage.type === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-green-500/10 border-green-500/20 text-green-400"
                                    }`}
                            >
                                {visibleMessage.text}
                            </div>
                        )}

                        <GoogleAuthButton
                            next="/vip"
                            label="Continue with Google"
                            disabled={isPending}
                            onError={(text) => {
                                setDismissedCallbackError(callbackError);
                                setMessage(text ? { type: "error", text } : null);
                            }}
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
                            key={method}
                            action={handleAction}
                            className="space-y-6"
                        >
                            <div>
                                <label className="block text-xs font-inter uppercase tracking-widest text-foreground/50 mb-3">
                                    Registered Email
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

                            {method === "password" && (
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
                                            placeholder="Enter your password"
                                            className="w-full bg-transparent border border-white/20 py-3 pl-12 pr-4 font-inter text-sm focus:outline-none focus:border-white transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isPending}
                                className="w-full flex items-center justify-center gap-2 py-4 bg-white text-black font-inter text-xs tracking-widest uppercase hover:bg-white/90 transition-colors disabled:opacity-50"
                            >
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (method === "magic" ? "Send Magic Link" : "Sign In")}
                                {!isPending && <ArrowRight className="w-4 h-4" />}
                            </button>
                        </form>
                    </div>

                    <div className="mt-12 text-center">
                        <p className="font-inter text-xs text-foreground/40 mb-2">Don&apos;t have an account?</p>
                        <Link href={`/register${searchParams.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect')!)}` : ''}`} className="font-inter text-xs tracking-widest uppercase text-foreground hover:text-foreground/70 transition-colors underline underline-offset-4">
                            Create Account
                        </Link>
                    </div>
                </div>
            </div>
        </main>
    );
}
