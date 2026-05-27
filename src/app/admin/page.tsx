import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  CircleDollarSign,
  Download,
  FileText,
  Hotel,
  Sparkles,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Database } from "@/types/supabase";
import type { BookingStatus } from "@/lib/clientWarmup";
import { cn } from "@/lib/utils";
import {
  ensureConfiguredAdminProfile,
  getProfileForUser,
  hasAdminAccess,
} from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import {
  buildLiveRoomMap,
  isCuratedRoomId,
  resolveRoomDetails,
} from "@/lib/roomCatalog";
import { formatPaymentType } from "@/lib/transactions";
import { AuditLogsPanel } from "@/components/admin/AuditLogsPanel";
import { BookingManagementPanel } from "@/components/admin/BookingManagementPanel";
import { FacilityManagementPanel } from "@/components/admin/FacilityManagementPanel";
import { RoomRateManagementPanel } from "@/components/admin/RoomRateManagementPanel";
import { RoomManagementPanel } from "@/components/admin/RoomManagementPanel";
import { UserRoleManagementPanel } from "@/components/admin/UserRoleManagementPanel";
import { AdminDashboardContent } from "@/components/admin/AdminDashboardContent";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type BookingMetricsRow = Pick<
  Database["public"]["Tables"]["bookings"]["Row"],
  | "id"
  | "created_at"
  | "room_id"
  | "first_name"
  | "last_name"
  | "email"
  | "check_in"
  | "check_out"
  | "total_price"
  | "status"
> & {
  transactions: Array<{ payment_type: string | null }> | null;
};

type RoomSummaryRow = {
  id: string;
  name: string | null;
  base_price: number | null;
  deleted_at: string | null;
};

type AdminPeriod = "month" | "3m" | "6m" | "1y";

type AdminPageProps = {
  searchParams?: Promise<{
    period?: string;
    status?: string;
  }>;
};

type ProfileMetricRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "role" | "created_at"
>;

const bookingStatusOptions = [
  "ALL",
  "UNPAID",
  "PAID",
  "EXPIRED",
] as const;

const periodOptions: Array<{ value: AdminPeriod; label: string; months: number }> = [
  { value: "month", label: "Bulan ini", months: 1 },
  { value: "3m", label: "3 bulan", months: 3 },
  { value: "6m", label: "6 bulan", months: 6 },
  { value: "1y", label: "1 tahun", months: 12 },
];

const roleLabels: Record<string, string> = {
  admin: "Admin",
  receptionist: "Resepsionis",
  guest: "Guest",
};

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

const adminButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all";

const adminOutlineButtonClassName = cn(
  adminButtonClassName,
  "border border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]",
);

const adminPrimaryButtonClassName = cn(
  adminButtonClassName,
  "bg-primary text-primary-foreground shadow-[0_12px_32px_rgba(198,155,73,0.26)] hover:shadow-[0_16px_42px_rgba(198,155,73,0.34)]",
);

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return "-";
  }

  const safeDate = new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`);

  if (Number.isNaN(safeDate.getTime())) {
    return dateValue;
  }

  return dateFormatter.format(safeDate);
}

function formatCurrency(amount: number | null) {
  return currencyFormatter.format(Number(amount ?? 0));
}

function getStatusBadgeVariant(status: BookingStatus | null) {
  switch (status) {
    case "PAID":
      return "default";
    case "UNPAID":
      return "secondary";
    case "EXPIRED":
      return "destructive";
    default:
      return "outline";
  }
}

function getTodayInJakarta() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function normalizePeriod(period: string | undefined): AdminPeriod {
  return periodOptions.some((option) => option.value === period)
    ? (period as AdminPeriod)
    : "month";
}

function getPeriodRange(period: AdminPeriod) {
  const today = getTodayInJakarta();
  const [year, month, day] = today.split("-").map(Number);
  const option = periodOptions.find((item) => item.value === period) ?? periodOptions[0];
  const fromDate =
    period === "month"
      ? new Date(Date.UTC(year, month - 1, 1))
      : new Date(Date.UTC(year, month - option.months, day));
  const toDate = new Date(Date.UTC(year, month - 1, day));
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  return {
    from,
    to,
    label: `${formatDate(from)} - ${formatDate(to)}`,
  };
}

function getPeriodHref(period: AdminPeriod) {
  return `/admin?period=${period}`;
}

function getRoleLabel(role: string | null) {
  return roleLabels[role ?? "guest"] ?? "Guest";
}

function getRoleBadgeClassName(role: string | null) {
  if (role === "admin") {
    return "border-primary/25 bg-primary/12 text-primary";
  }

  if (role === "receptionist") {
    return "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100";
  }

  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-white/72";
}

function getStatusBadgeClassName(status: BookingStatus) {
  if (status === "PAID") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/12 dark:text-emerald-100";
  }

  if (status === "UNPAID") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/12 dark:text-amber-100";
  }

  if (status === "EXPIRED") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/12 dark:text-rose-100";
  }

  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/12 dark:bg-transparent dark:text-white/70";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedPeriod = normalizePeriod(params.period);
  const periodRange = getPeriodRange(selectedPeriod);
  const selectedStatus = params.status && (bookingStatusOptions as readonly string[]).includes(params.status)
    ? params.status
    : "ALL";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const supabaseAdmin = getSupabaseAdmin();
  let profile = await getProfileForUser(supabase, user.id);

  if (!hasAdminAccess(profile?.role, user.email)) {
    redirect("/");
  }

  profile = await ensureConfiguredAdminProfile(supabaseAdmin, user, profile);

  const [
    { data: metricsRows },
    { data: roomRows },
    { data: profileRows },
    { data: roomUnitRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("id, created_at, room_id, first_name, last_name, email, check_in, check_out, total_price, status, transactions ( payment_type )")
      .gte("created_at", `${periodRange.from}T00:00:00`)
      .lte("created_at", `${periodRange.to}T23:59:59`)
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("rooms").select("id, name, base_price, deleted_at"),
    supabaseAdmin
      .from("profiles")
      .select("id, role, created_at")
      .gte("created_at", `${periodRange.from}T00:00:00`)
      .lte("created_at", `${periodRange.to}T23:59:59`),
    supabaseAdmin.from("room_units").select("id, status").is("deleted_at", null),
  ]);

  const bookings = (metricsRows ?? []) as BookingMetricsRow[];
  const rooms = ((roomRows ?? []) as RoomSummaryRow[]).filter(
    (room) => !room.deleted_at,
  );
  const profiles = (profileRows ?? []) as ProfileMetricRow[];
  const roomUnitRowsData = (roomUnitRows ?? []) as Array<{ id: string; status: string | null }>;

  const adminName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "Admin";

  return (
    <main className="theme-aware-admin min-h-screen bg-[linear-gradient(180deg,_rgba(15,19,27,0.98)_0%,_rgba(9,12,18,1)_100%)] pb-12 pt-24 sm:pb-16 sm:pt-28 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:gap-6 px-4 sm:px-6">
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-white shadow-[0_20px_70px_rgba(0,0,0,0.26)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary"
              >
                <ShieldCheck className="size-3.5" />
                Admin
              </Badge>
              <div>
                <h1 className="font-serif text-2xl text-white sm:text-3xl md:text-4xl">
                  Dashboard Admin
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
                  Ringkasan operasional, booking terbaru, role pengguna, kamar,
                  reporting, dan audit dalam satu dashboard admin.
                </p>
                <p className="mt-2 text-sm text-white/46">
                  Periode data: {periodRange.label}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-white/10 bg-black/18 px-4 py-3 text-sm text-white/70">
                Masuk sebagai <span className="font-medium text-white">{adminName}</span>
              </div>
              <Link href="/#collection" className={adminPrimaryButtonClassName}>
                Buat Booking
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
            {periodOptions.map((option) => (
              <Link
                key={option.value}
                href={getPeriodHref(option.value)}
                className={cn(
                  "inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium transition-colors",
                  selectedPeriod === option.value
                    ? "border-primary/35 bg-primary text-primary-foreground"
                    : "border-white/10 bg-black/18 text-white/70 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </section>

        <AdminDashboardContent
          allBookings={bookings}
          rooms={rooms}
          profiles={profiles}
          roomUnitRows={roomUnitRowsData}
          selectedPeriod={selectedPeriod}
          initialStatus={selectedStatus}
        />



        <Tabs defaultValue="users" className="gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-white">Kelola admin</h2>
              <p className="mt-1 text-sm text-white/58">
                Data user, booking, kamar, fasilitas, harga harian, dan audit log.
              </p>
            </div>
            <TabsList variant="line" className="border-b border-white/10 px-0">
              <TabsTrigger value="users" className="px-4 text-white/65 data-active:text-white">
                User
              </TabsTrigger>
              <TabsTrigger value="bookings" className="px-4 text-white/65 data-active:text-white">
                Booking
              </TabsTrigger>
              <TabsTrigger value="rooms" className="px-4 text-white/65 data-active:text-white">
                Kamar
              </TabsTrigger>
              <TabsTrigger value="facilities" className="px-4 text-white/65 data-active:text-white">
                Fasilitas
              </TabsTrigger>
              <TabsTrigger value="rates" className="px-4 text-white/65 data-active:text-white">
                Harga
              </TabsTrigger>
              <TabsTrigger value="audit" className="px-4 text-white/65 data-active:text-white">
                Audit
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="users">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">User dan role</CardTitle>
                  <CardDescription className="text-white/60">
                    Tambah, ubah, arsipkan, pulihkan akun, dan atur role.
                  </CardDescription>
                </div>
                <CardAction>
                  <UserRound className="size-5 text-primary" />
                </CardAction>
              </CardHeader>
              <CardContent className="pt-6">
                <UserRoleManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bookings">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Manajemen booking</CardTitle>
                  <CardDescription className="text-white/60">
                    Tambah, ubah, arsipkan, dan pulihkan data reservasi tanpa mengelola transaksi.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <BookingManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rooms">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Manajemen kamar</CardTitle>
                  <CardDescription className="text-white/60">
                    Tambah, ubah, arsipkan, dan pulihkan data kamar.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <RoomManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="facilities">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Manajemen fasilitas</CardTitle>
                  <CardDescription className="text-white/60">
                    Tambah, ubah, arsipkan, dan pulihkan fasilitas yang tampil di website.
                  </CardDescription>
                </div>
                <CardAction>
                  <Sparkles className="size-5 text-primary" />
                </CardAction>
              </CardHeader>
              <CardContent className="pt-6">
                <FacilityManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rates">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Harga harian kamar</CardTitle>
                  <CardDescription className="text-white/60">
                    Kelola override harga per tanggal dengan soft delete.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <RoomRateManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Audit logs</CardTitle>
                  <CardDescription className="text-white/60">
                    Pantau perubahan booking, user, transaksi, dan kamar.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <AuditLogsPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Separator className="bg-white/10" />
      </div>
    </main>
  );
}
