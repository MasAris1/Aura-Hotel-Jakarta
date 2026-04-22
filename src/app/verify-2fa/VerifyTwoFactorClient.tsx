"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import {
  cancelTwoFactorLogin,
  resendTwoFactorLoginCode,
  verifyTwoFactorLogin,
} from "../auth/actions";

type AuthMessage = {
  type: "error" | "success";
  text: string;
};

type VerifyTwoFactorClientProps = {
  email: string;
  redirectTo: string;
};

export function VerifyTwoFactorClient({
  email,
  redirectTo,
}: VerifyTwoFactorClientProps) {
  const [message, setMessage] = useState<AuthMessage | null>({
    type: "success",
    text: "A verification code has been sent to your email.",
  });
  const [isPending, startTransition] = useTransition();

  const handleVerify = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await verifyTwoFactorLogin(formData, redirectTo);

      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      }
    });
  };

  const handleResend = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await resendTwoFactorLoginCode(redirectTo);

      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else if (result?.success) {
        setMessage({ type: "success", text: result.success });
      }
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      await cancelTwoFactorLogin();
    });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-16">
        <div className="grid w-full gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-7">
            <div className="flex h-14 w-14 items-center justify-center border border-white/15 bg-white/5">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="mb-4 font-inter text-xs uppercase tracking-[0.32em] text-foreground/45">
                Secure sign-in
              </p>
              <h1 className="font-playfair text-4xl uppercase tracking-widest text-white sm:text-5xl">
                Verify Access
              </h1>
            </div>
            <p className="max-w-md font-inter text-sm leading-7 text-foreground/60">
              Enter the 6-digit code sent to {maskEmail(email)} to continue into
              your Aura account.
            </p>
          </div>

          <div className="w-full border border-white/10 bg-muted p-6 sm:p-8">
            <div className="mb-8 flex items-start gap-4 border-b border-white/10 pb-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/5">
                <MailCheck className="h-5 w-5 text-foreground/75" />
              </div>
              <div>
                <h2 className="font-inter text-sm uppercase tracking-[0.24em] text-white">
                  Email code
                </h2>
                <p className="mt-2 font-inter text-xs leading-6 text-foreground/50">
                  The code expires in 10 minutes.
                </p>
              </div>
            </div>

            {message && (
              <div
                className={`mb-6 border p-4 font-inter text-xs uppercase tracking-widest ${
                  message.type === "error"
                    ? "border-red-500/20 bg-red-500/10 text-red-400"
                    : "border-green-500/20 bg-green-500/10 text-green-400"
                }`}
              >
                {message.text}
              </div>
            )}

            <form action={handleVerify} className="space-y-6">
              <div>
                <label className="mb-3 block font-inter text-xs uppercase tracking-widest text-foreground/50">
                  Verification Code
                </label>
                <input
                  type="text"
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  className="w-full border border-white/20 bg-transparent px-4 py-4 text-center font-inter text-2xl tracking-[0.35em] text-white transition-colors placeholder:text-foreground/20 focus:border-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 bg-white px-4 py-4 font-inter text-xs uppercase tracking-widest text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify Code"}
                {!isPending && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={isPending}
                className="flex items-center justify-center gap-2 border border-white/15 px-4 py-3 font-inter text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Resend Code
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="border border-white/10 px-4 py-3 font-inter text-xs uppercase tracking-widest text-foreground/45 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Use Another Account
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function maskEmail(email: string) {
  const [name = "", domain = ""] = email.split("@");

  if (!domain) {
    return email;
  }

  const visiblePrefix = name.slice(0, 2);
  return `${visiblePrefix}${"*".repeat(Math.max(name.length - 2, 2))}@${domain}`;
}
