import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Mail,
  ShieldCheck,
  ShieldOff,
  UserRound,
} from "lucide-react";
import { disableTwoFactor, startTwoFactorSetup } from "@/app/auth/actions";
import { ensureProfileForUser } from "@/lib/auth";
import {
  hasEnabledTwoFactor,
  TWO_FACTOR_ENABLED_AT_METADATA_KEY,
} from "@/lib/twoFactor";
import { createClient } from "@/utils/supabase/server";
import { EditableProfile } from "./EditableProfile";
import { BookingHistory } from "./BookingHistory";

type ProfilePageProps = {
  searchParams?: Promise<{
    twoFactor?: string | string[];
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/profile");
  }

  const profile = await ensureProfileForUser(supabase, user);

  const { data: rawBookings, error } = await supabase
    .from("bookings")
    .select(`
      id,
      room_id,
      check_in,
      check_out,
      total_price,
      status
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching bookings:", error);
  }

  // Fetch room names manually due to missing foreign key constraint
  let bookings: any[] = [];
  if (rawBookings && rawBookings.length > 0) {
    const roomIds = Array.from(new Set(rawBookings.map(b => b.room_id).filter((id): id is string => id != null)));
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id, name")
      .in("id", roomIds);
      
    const roomMap = new Map((rooms || []).map(r => [r.id, r.name]));
    
    bookings = rawBookings.map(b => ({
      id: b.id,
      check_in: b.check_in,
      check_out: b.check_out,
      total_price: b.total_price,
      status: b.status,
      rooms: b.room_id ? { name: roomMap.get(b.room_id) || "Kamar tidak diketahui" } : null
    }));
  }

  const fullName =
    `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "Guest";
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const twoFactorEnabled = hasEnabledTwoFactor(user);
  const enabledAt = readDateLabel(
    user.user_metadata?.[TWO_FACTOR_ENABLED_AT_METADATA_KEY],
  );
  const params = searchParams ? await searchParams : {};
  const twoFactorStatus = Array.isArray(params.twoFactor)
    ? params.twoFactor[0]
    : params.twoFactor;

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-32 text-foreground">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 border-b border-border pb-6 sm:mb-10 sm:gap-6 sm:pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 font-inter text-xs uppercase tracking-[0.32em] text-primary">
              Account profile
            </p>
            <h1 className="font-playfair text-3xl uppercase tracking-widest text-foreground sm:text-4xl md:text-5xl">
              {fullName}
            </h1>
            <p className="mt-4 max-w-2xl font-inter text-sm leading-7 text-foreground/55">
              Manage your identity, account access, and authenticator protection
              from one place.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center border border-border px-5 py-3 font-inter text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-primary/35 hover:text-foreground"
          >
            Back to Home
          </Link>
        </div>

        {twoFactorStatus ? (
          <div
            className={`mb-8 border p-4 font-inter text-xs uppercase tracking-widest ${
              twoFactorStatus === "disable-error" ||
              twoFactorStatus === "invalid-code" ||
              twoFactorStatus === "setup-error"
                ? "border-red-500/25 bg-red-500/10 text-red-300"
                : "border-green-500/25 bg-green-500/10 text-green-300"
            }`}
          >
            {getTwoFactorStatusMessage(twoFactorStatus)}
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <aside className="border border-border bg-card p-5 sm:p-7">
            <EditableProfile
              initialFirstName={profile.first_name || ""}
              initialLastName={profile.last_name || ""}
              email={user.email || ""}
              role={profile.role || "guest"}
              initials={initials}
            />

            <div className="mt-8 space-y-4 font-inter text-sm text-foreground/65">
              <ProfileMeta icon={<Mail className="h-4 w-4" />} label="Email" value={user.email ?? "-"} />
              <ProfileMeta
                icon={<CalendarDays className="h-4 w-4" />}
                label="Joined"
                value={readDateLabel(user.created_at)}
              />
              <ProfileMeta
                icon={<UserRound className="h-4 w-4" />}
                label="Last sign-in"
                value={readDateLabel(user.last_sign_in_at)}
              />
            </div>
          </aside>

          <section className="space-y-8">
            <div className="border border-border bg-card p-5 sm:p-7">
              <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:mb-6 sm:flex-row">
                <div>
                  <p className="mb-3 font-inter text-xs uppercase tracking-[0.28em] text-foreground/45">
                    Security
                  </p>
                  <h2 className="font-playfair text-2xl text-foreground sm:text-3xl">
                    Two-factor authentication
                  </h2>
                </div>
                <div
                  className={`flex items-center gap-2 border px-3 py-2 font-inter text-[11px] uppercase tracking-[0.22em] ${
                    twoFactorEnabled
                      ? "border-green-500/25 bg-green-500/10 text-green-300"
                      : "border-border bg-muted/60 text-foreground/50"
                  }`}
                >
                  {twoFactorEnabled ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <ShieldOff className="h-4 w-4" />
                  )}
                  {twoFactorEnabled ? "Active" : "Inactive"}
                </div>
              </div>

              <p className="max-w-2xl font-inter text-sm leading-7 text-foreground/55">
                {twoFactorEnabled
                  ? `Your account requires an authenticator code on every login${
                      enabledAt ? ` since ${enabledAt}` : ""
                    }.`
                  : "2FA is optional. You can keep it off, or enable it anytime from this profile page."}
              </p>

              <div className="mt-8">
                {twoFactorEnabled ? (
                  <form action={disableTwoFactor} className="max-w-sm space-y-4">
                    <div>
                      <label className="mb-3 block font-inter text-xs uppercase tracking-widest text-foreground/50">
                        Authenticator Code
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
                        className="w-full border border-input bg-background/40 px-4 py-3 text-center font-inter text-xl tracking-[0.35em] text-foreground transition-colors placeholder:text-foreground/20 focus:border-primary focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 border border-red-500/30 px-5 py-3 font-inter text-xs uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/10 hover:text-red-200"
                    >
                      <ShieldOff className="h-4 w-4" />
                      Disable 2FA
                    </button>
                  </form>
                ) : (
                  <form action={startTwoFactorSetup}>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 bg-primary px-5 py-3 font-inter text-xs uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Enable 2FA
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <AccountStat label="Profile status" value="Ready" />
              <AccountStat label="Login destination" value="Home" />
            </div>

            <div className="border border-border bg-card p-5 sm:p-7">
              <div className="mb-5 flex flex-col items-start justify-between gap-4 sm:mb-6 sm:flex-row">
                <div>
                  <p className="mb-3 font-inter text-xs uppercase tracking-[0.28em] text-foreground/45">
                    History
                  </p>
                  <h2 className="font-playfair text-2xl text-foreground sm:text-3xl">
                    Riwayat Reservasi
                  </h2>
                </div>
              </div>
              <BookingHistory bookings={bookings as any || []} />
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function ProfileMeta({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
      <span className="mt-0.5 text-primary/80">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/35">
          {label}
        </p>
        <p className="mt-1 break-words text-foreground/75">{value}</p>
      </div>
    </div>
  );
}

function AccountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-5 sm:p-6">
      <p className="font-inter text-[11px] uppercase tracking-[0.26em] text-foreground/40">
        {label}
      </p>
      <p className="mt-3 font-playfair text-2xl text-foreground">{value}</p>
    </div>
  );
}

function getTwoFactorStatusMessage(status: string) {
  if (status === "disable-error") {
    return "Unable to disable 2FA right now. Please try again.";
  }

  if (status === "invalid-code") {
    return "The authenticator code is incorrect. 2FA is still active.";
  }

  if (status === "setup-error") {
    return "2FA setup is not ready on the server. Please set AUTH_2FA_SECRET in the deployment environment.";
  }

  return "2FA has been disabled.";
}

function readDateLabel(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
