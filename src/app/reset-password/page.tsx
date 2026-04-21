"use client";

import { Suspense, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { updatePassword } from "../auth/actions";

type PasswordMessage = {
  type: "error" | "success";
  text: string;
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/login";
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<PasswordMessage | null>(null);

  const handleAction = async (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updatePassword(formData, redirectUrl);

      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  return (
    <main className="min-h-screen flex text-foreground overflow-hidden bg-background">
      <div className="hidden lg:flex w-1/2 relative flex-col justify-end p-12">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=2787&auto=format&fit=crop"
            alt="Hotel suite"
            fill
            sizes="50vw"
            className="object-cover opacity-60 mix-blend-luminosity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <h2 className="font-playfair text-4xl mb-4">Secure Your Return</h2>
          <p className="font-inter font-light text-foreground/70 text-sm leading-relaxed">
            Set a new password to restore access to your guest portal and
            reservation history.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-muted relative">
        <div className="absolute top-8 right-8">
          <Link
            href="/"
            className="font-inter text-xs tracking-widest uppercase text-foreground/50 hover:text-foreground transition-colors"
          >
            Return to Home
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-10">
            <Link
              href={`/login${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
              className="inline-flex items-center gap-2 font-inter text-xs tracking-widest uppercase text-foreground/50 hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>

          <div className="text-center mb-12">
            <h1 className="font-playfair text-3xl tracking-widest uppercase mb-2">
              Reset Password
            </h1>
            <p className="font-inter text-sm text-foreground/50">
              Choose a new password for your account.
            </p>
          </div>

          {message && (
            <div
              className={`mb-6 p-4 text-xs font-inter uppercase tracking-widest border ${
                message.type === "error"
                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                  : "bg-green-500/10 border-green-500/20 text-green-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <form action={handleAction} className="space-y-6">
            <div>
              <label className="block text-xs font-inter uppercase tracking-widest text-foreground/50 mb-3">
                New Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                <input
                  type="password"
                  name="password"
                  required
                  placeholder="Enter your new password"
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
                  placeholder="Repeat your new password"
                  className="w-full bg-transparent border border-white/20 py-3 pl-12 pr-4 font-inter text-sm focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 py-4 bg-white text-black font-inter text-xs tracking-widest uppercase hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Save New Password"
              )}
              {!isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function ResetPasswordFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
    </main>
  );
}
