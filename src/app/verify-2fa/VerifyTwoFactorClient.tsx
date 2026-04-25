"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import {
  ArrowRight,
  KeyRound,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  cancelTwoFactorLogin,
  refreshTwoFactorSetup,
  verifyTwoFactorLogin,
} from "../auth/actions";

type AuthMessage = {
  type: "error" | "success";
  text: string;
};

type SetupState = {
  qrCodeDataUrl: string;
  secretDisplay: string;
  expiresLabel: string;
};

type VerifyTwoFactorClientProps = {
  email: string;
  redirectTo: string;
  hasStoredSecret: boolean;
  setupState: SetupState | null;
};

export function VerifyTwoFactorClient({
  email,
  redirectTo,
  hasStoredSecret,
  setupState,
}: VerifyTwoFactorClientProps) {
  const isSetupMode = !hasStoredSecret;
  const setupExpired = isSetupMode && !setupState;
  const [message, setMessage] = useState<AuthMessage | null>(
    isSetupMode
      ? setupState
        ? {
            type: "success",
            text: "Scan the QR code with your authenticator app, then enter the latest 6-digit code to finish setup.",
          }
        : {
            type: "error",
            text: "Your authenticator setup has expired. Generate a new QR code to continue.",
          }
      : null,
  );
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

  const handleRefreshSetup = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await refreshTwoFactorSetup(redirectTo);

      if (result?.error) {
        setMessage({ type: "error", text: result.error });
      } else if (result?.success) {
        setMessage({ type: "success", text: result.success });
        window.location.reload();
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
              {isSetupMode ? (
                <Smartphone className="h-6 w-6 text-white" />
              ) : (
                <ShieldCheck className="h-6 w-6 text-white" />
              )}
            </div>
            <div>
              <p className="mb-4 font-inter text-xs uppercase tracking-[0.32em] text-foreground/45">
                Secure sign-in
              </p>
              <h1 className="font-playfair text-4xl uppercase tracking-widest text-white sm:text-5xl">
                {isSetupMode ? "Set Up Authenticator" : "Verify Access"}
              </h1>
            </div>
            <p className="max-w-md font-inter text-sm leading-7 text-foreground/60">
              {isSetupMode
                ? `Authenticator app is required for every login. Connect ${maskEmail(email)} to Google Authenticator, Microsoft Authenticator, Authy, or another compatible TOTP app.`
                : `Enter the current 6-digit code from the authenticator app linked to ${maskEmail(email)} to continue into your Aura account.`}
            </p>
          </div>

          <div className="w-full border border-white/10 bg-muted p-6 sm:p-8">
            <div className="mb-8 flex items-start gap-4 border-b border-white/10 pb-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/5">
                {isSetupMode ? (
                  <QrCode className="h-5 w-5 text-foreground/75" />
                ) : (
                  <KeyRound className="h-5 w-5 text-foreground/75" />
                )}
              </div>
              <div>
                <h2 className="font-inter text-sm uppercase tracking-[0.24em] text-white">
                  {isSetupMode ? "Authenticator setup" : "Authenticator code"}
                </h2>
                <p className="mt-2 font-inter text-xs leading-6 text-foreground/50">
                  {isSetupMode
                    ? setupState
                      ? `Setup session expires ${setupState.expiresLabel}.`
                      : "Generate a fresh QR code before entering a code."
                    : "Use the code currently shown inside your authenticator app."}
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

            {isSetupMode && (
              <div className="mb-8 space-y-5">
                {setupState ? (
                  <>
                    <div className="flex justify-center border border-white/10 bg-black/30 p-5">
                      <Image
                        src={setupState.qrCodeDataUrl}
                        alt="Authenticator QR code"
                        width={220}
                        height={220}
                        className="h-[220px] w-[220px]"
                        unoptimized
                      />
                    </div>
                    <div className="border border-white/10 bg-black/20 p-4">
                      <p className="mb-3 font-inter text-[11px] uppercase tracking-[0.28em] text-foreground/45">
                        Manual setup key
                      </p>
                      <code className="block break-all font-inter text-sm tracking-[0.24em] text-white">
                        {setupState.secretDisplay}
                      </code>
                    </div>
                  </>
                ) : (
                  <div className="border border-dashed border-white/15 bg-black/20 p-6 font-inter text-sm leading-7 text-foreground/55">
                    Your authenticator setup cookie is no longer valid, so the QR code cannot
                    be shown until a new setup session is created.
                  </div>
                )}
              </div>
            )}

            <form action={handleVerify} className="space-y-6">
              <div>
                <label className="mb-3 block font-inter text-xs uppercase tracking-widest text-foreground/50">
                  {isSetupMode ? "Authenticator Code" : "Verification Code"}
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
                  disabled={setupExpired || isPending}
                  className="w-full border border-white/20 bg-transparent px-4 py-4 text-center font-inter text-2xl tracking-[0.35em] text-white transition-colors placeholder:text-foreground/20 focus:border-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={setupExpired || isPending}
                className="flex w-full items-center justify-center gap-2 bg-white px-4 py-4 font-inter text-xs uppercase tracking-widest text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSetupMode ? (
                  "Finish Setup"
                ) : (
                  "Verify Code"
                )}
                {!isPending && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {isSetupMode ? (
                <button
                  type="button"
                  onClick={handleRefreshSetup}
                  disabled={isPending}
                  className="flex items-center justify-center gap-2 border border-white/15 px-4 py-3 font-inter text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh QR Code
                </button>
              ) : (
                <div className="flex items-center justify-center border border-white/10 px-4 py-3 font-inter text-[11px] uppercase tracking-[0.28em] text-foreground/45">
                  Authenticator required
                </div>
              )}
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
