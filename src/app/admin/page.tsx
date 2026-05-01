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
  ShieldCheck,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Database } from "@/types/supabase";
import type { BookingStatus } from "@/lib/clientWarmup";
import { cn } from "@/lib/utils";
import { getProfileForUser, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";
import {
  buildLiveRoomMap,
  isCuratedRoomId,
  resolveRoomDetails,
} from "@/lib/roomCatalog";
import { AuditLogsPanel } from "@/components/admin/AuditLogsPanel";
import { RoomManagementPanel } from "@/components/admin/RoomManagementPanel";
import { UserRoleManagementPanel } from "@/components/admin/UserRoleManagementPanel";
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
  | "check_in"
  | "check_out"
  | "total_price"
  | "status"
>;

type RoomSummaryRow = {
  id: string;
  name: string | null;
  base_price: number | null;
  deleted_at: string | null;
};

type RecentBookingRow = Pick<
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
>;

type AdminPeriod = "month" | "3m" | "6m" | "1y";

type AdminPageProps = {
  searchParams?: Promise<{
    period?: string;
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
  "CHECKED_IN",
  "CHECKED_OUT",
  "EXPIRED",
  "REFUNDED",
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
    case "CHECKED_IN":
    case "CHECKED_OUT":
    case "PAID":
      return "default";
    case "UNPAID":
      return "secondary";
    case "REFUNDED":
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
    return "border-sky-300/20 bg-sky-300/10 text-sky-100";
  }

  return "border-white/12 bg-white/[0.04] text-white/72";
}

function getStatusBadgeClassName(status: BookingStatus) {
  if (status === "PAID" || status === "CHECKED_IN" || status === "CHECKED_OUT") {
    return "border-emerald-300/20 bg-emerald-300/12 text-emerald-100";
  }

  if (status === "UNPAID") {
    return "border-amber-300/20 bg-amber-300/12 text-amber-100";
  }

  if (status === "EXPIRED" || status === "REFUNDED") {
    return "border-rose-300/20 bg-rose-300/12 text-rose-100";
  }

  return "border-white/12 text-white/70";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedPeriod = normalizePeriod(params.period);
  const periodRange = getPeriodRange(selectedPeriod);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const profile = await getProfileForUser(supabase, user.id);

  if (!isAdminRole(profile?.role)) {
    redirect("/");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [
    { data: metricsRows },
    { data: recentRows },
    { data: roomRows },
    { data: profileRows },
  ] = await Promise.all([
    supabaseAdmin
      .from("bookings")
      .select("id, created_at, room_id, check_in, check_out, total_price, status")
      .gte("created_at", `${periodRange.from}T00:00:00`)
      .lte("created_at", `${periodRange.to}T23:59:59`)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("bookings")
      .select(
        "id, created_at, room_id, first_name, last_name, email, check_in, check_out, total_price, status",
      )
      .gte("created_at", `${periodRange.from}T00:00:00`)
      .lte("created_at", `${periodRange.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabaseAdmin.from("rooms").select("id, name, base_price, deleted_at"),
    supabaseAdmin
      .from("profiles")
      .select("id, role, created_at")
      .gte("created_at", `${periodRange.from}T00:00:00`)
      .lte("created_at", `${periodRange.to}T23:59:59`),
  ]);

  const bookings = (metricsRows ?? []) as BookingMetricsRow[];
  const recentBookings = (recentRows ?? []) as RecentBookingRow[];
  const rooms = ((roomRows ?? []) as RoomSummaryRow[]).filter(
    (room) => !room.deleted_at,
  );
  const profiles = (profileRows ?? []) as ProfileMetricRow[];
  const roomMap = buildLiveRoomMap(rooms);
  const today = getTodayInJakarta();

  const settledStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);
  const activeStatuses = new Set(["PAID", "CHECKED_IN"]);
  const statusCounts = new Map<BookingStatus, number>();
  const statusAmountMap = new Map<BookingStatus, number>();
  const roleCounts = new Map<string, number>();
  const roomReportMap = new Map<
    string,
    {
      name: string;
      bookings: number;
      revenue: number;
      gross: number;
    }
  >();

  bookings.forEach((booking) => {
    const status = (booking.status ?? "UNPAID") as BookingStatus;
    const amount = Number(booking.total_price ?? 0);
    const roomDetails = resolveRoomDetails(
      booking.room_id,
      booking.room_id ? roomMap.get(booking.room_id) : null,
    );
    const roomKey = booking.room_id || roomDetails.name;
    const roomReport = roomReportMap.get(roomKey) ?? {
      name: roomDetails.name || roomDetails.type || "Room pending",
      bookings: 0,
      revenue: 0,
      gross: 0,
    };

    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    statusAmountMap.set(status, (statusAmountMap.get(status) ?? 0) + amount);
    roomReport.bookings += 1;
    roomReport.gross += amount;
    if (settledStatuses.has(status)) {
      roomReport.revenue += amount;
    }
    roomReportMap.set(roomKey, roomReport);
  });

  profiles.forEach((entry) => {
    const role = entry.role ?? "guest";
    roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
  });

  const totalRevenue = bookings.reduce((sum, booking) => {
    if (!settledStatuses.has(booking.status ?? "")) {
      return sum;
    }

    return sum + Number(booking.total_price ?? 0);
  }, 0);
  const pendingPayments = statusCounts.get("UNPAID") ?? 0;
  const activeStays = statusCounts.get("CHECKED_IN") ?? 0;
  const grossBookingValue = bookings.reduce(
    (sum, booking) => sum + Number(booking.total_price ?? 0),
    0,
  );
  const averageBookingValue =
    bookings.length > 0 ? grossBookingValue / bookings.length : 0;
  const todayArrivals = bookings.filter(
    (booking) =>
      booking.check_in === today && activeStatuses.has(booking.status ?? ""),
  ).length;
  const activeCatalogRooms = rooms.filter((room) => isCuratedRoomId(room.id));
  const occupiedRooms = bookings.filter(
    (booking) =>
      isCuratedRoomId(booking.room_id) &&
      booking.check_in <= today &&
      booking.check_out >= today &&
      activeStatuses.has(booking.status ?? ""),
  ).length;
  const availableRooms = Math.max(activeCatalogRooms.length - occupiedRooms, 0);
  const adminName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "Admin";

  const statusBreakdown = bookingStatusOptions
    .filter((status) => status !== "ALL")
    .map((status) => ({
      status: status as BookingStatus,
      count: statusCounts.get(status as BookingStatus) ?? 0,
      amount: statusAmountMap.get(status as BookingStatus) ?? 0,
    }));

  const roleBreakdown = ["admin", "receptionist", "guest"].map((role) => ({
    role,
    count: roleCounts.get(role) ?? 0,
  }));
  const topRoomReports = Array.from(roomReportMap.values())
    .sort((left, right) => {
      if (right.revenue !== left.revenue) {
        return right.revenue - left.revenue;
      }

      return right.bookings - left.bookings;
    })
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_rgba(15,19,27,0.98)_0%,_rgba(9,12,18,1)_100%)] pb-16 pt-28 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6">
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
                <h1 className="font-serif text-3xl text-white sm:text-4xl">
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/58">
                  Total pendapatan
                </CardDescription>
                <CardTitle className="mt-2 text-2xl text-white">
                  {formatCurrency(totalRevenue)}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                  <CircleDollarSign className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-white/50">
              Dari booking paid, checked-in, dan checked-out
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/58">
                  Total booking
                </CardDescription>
                <CardTitle className="mt-2 text-2xl text-white">
                  {bookings.length}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-2 text-emerald-200">
                  <BedDouble className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-white/50">
              {activeStays} sedang menginap, {todayArrivals} kedatangan hari ini
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/58">
                  Pembayaran tertunda
                </CardDescription>
                <CardTitle className="mt-2 text-2xl text-white">
                  {pendingPayments}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-2 text-amber-100">
                  <Wallet className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-white/50">
              Perlu follow-up resepsionis
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/58">
                  User baru
                </CardDescription>
                <CardTitle className="mt-2 text-2xl text-white">
                  {profiles.length}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-lg border border-sky-300/20 bg-sky-300/10 p-2 text-sky-100">
                  <UsersRound className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-white/50">
              Terdaftar pada periode ini
            </CardFooter>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader className="border-b border-white/10">
              <div>
                <CardTitle className="text-white">Booking terbaru</CardTitle>
                <CardDescription className="text-white/58">
                  Aktivitas reservasi paling baru.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/55">Booking</TableHead>
                    <TableHead className="text-white/55">Tamu</TableHead>
                    <TableHead className="text-white/55">Tanggal</TableHead>
                    <TableHead className="text-white/55">Status</TableHead>
                    <TableHead className="text-right text-white/55">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBookings.map((booking) => {
                    const guestName =
                      `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() ||
                      booking.email ||
                      "Guest";
                    const roomDetails = resolveRoomDetails(
                      booking.room_id,
                      booking.room_id ? roomMap.get(booking.room_id) : null,
                    );
                    const status = (booking.status ?? "UNPAID") as BookingStatus;

                    return (
                      <TableRow
                        key={booking.id}
                        className="border-white/10 hover:bg-white/[0.03]"
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-white">
                              #{booking.id.slice(0, 8)}
                            </span>
                            <span className="text-xs text-white/45">
                              {roomDetails.name || roomDetails.type || "Room pending"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-white">{guestName}</span>
                            <span className="text-xs text-white/45">
                              {booking.email || "Email kosong"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-white">{formatDate(booking.check_in)}</span>
                            <span className="text-xs text-white/45">
                              sampai {formatDate(booking.check_out)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadgeVariant(status)}
                            className={getStatusBadgeClassName(status)}
                          >
                            {status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-white">
                          {formatCurrency(Number(booking.total_price ?? 0))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Ringkasan role</CardTitle>
                  <CardDescription className="text-white/58">
                    Komposisi akses pengguna.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {roleBreakdown.map((item) => (
                  <div
                    key={item.role}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/16 px-4 py-3"
                  >
                    <Badge
                      variant="outline"
                      className={getRoleBadgeClassName(item.role)}
                    >
                      {getRoleLabel(item.role)}
                    </Badge>
                    <span className="text-lg font-semibold text-white">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Status booking</CardTitle>
                  <CardDescription className="text-white/58">
                    Jumlah booking per status.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {statusBreakdown.map((item) => (
                  <div
                    key={item.status}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/16 px-4 py-3"
                  >
                    <Badge
                      variant={getStatusBadgeVariant(item.status)}
                      className={getStatusBadgeClassName(item.status)}
                    >
                      {item.status.replace("_", " ")}
                    </Badge>
                    <div className="text-right">
                      <span className="block text-lg font-semibold text-white">{item.count}</span>
                      <span className="text-xs text-white/42">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader>
                <div>
                  <CardTitle className="text-white">Kamar tersedia</CardTitle>
                  <CardDescription className="text-white/58">
                    {availableRooms} dari {activeCatalogRooms.length} kamar katalog.
                  </CardDescription>
                </div>
                <CardAction>
                  <Hotel className="size-5 text-primary" />
                </CardAction>
              </CardHeader>
            </Card>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-2 text-primary">
                  <BarChart3 className="size-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-white">Reporting</h2>
                  <p className="mt-1 text-sm leading-6 text-white/58">
                    Laporan booking, pendapatan, status, kamar, dan user baru untuk periode aktif.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/16 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/42">
                    Gross booking
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {formatCurrency(grossBookingValue)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/16 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/42">
                    Rata-rata booking
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {formatCurrency(averageBookingValue)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/16 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/42">
                    Kamar tersedia
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {availableRooms}/{activeCatalogRooms.length}
                  </p>
                </div>
              </div>
            </div>

            <form
              action="/api/admin/bookings/export"
              method="get"
              className="grid gap-3 sm:grid-cols-[180px_1fr_1fr] lg:min-w-[520px]"
            >
              <input type="hidden" name="period" value={selectedPeriod} />
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.16em] text-white/58">
                Status
                <select
                  name="status"
                  defaultValue="ALL"
                  className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
                >
                  {bookingStatusOptions.map((status) => (
                    <option
                      key={status}
                      value={status}
                      className="bg-slate-950 text-white"
                    >
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                name="format"
                value="csv"
                className={adminPrimaryButtonClassName}
              >
                <Download className="size-4" />
                Export CSV
              </button>
              <button
                type="submit"
                name="format"
                value="pdf"
                className={adminOutlineButtonClassName}
              >
                <FileText className="size-4" />
                Export PDF
              </button>
            </form>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/12">
              <div className="border-b border-white/10 px-4 py-3">
                <h3 className="font-medium text-white">Laporan status booking</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/55">Status</TableHead>
                    <TableHead className="text-right text-white/55">Booking</TableHead>
                    <TableHead className="text-right text-white/55">Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusBreakdown.map((item) => (
                    <TableRow key={item.status} className="border-white/10 hover:bg-white/[0.03]">
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(item.status)}
                          className={getStatusBadgeClassName(item.status)}
                        >
                          {item.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-white">{item.count}</TableCell>
                      <TableCell className="text-right font-medium text-white">
                        {formatCurrency(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/12">
              <div className="border-b border-white/10 px-4 py-3">
                <h3 className="font-medium text-white">Laporan kamar</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/55">Kamar</TableHead>
                    <TableHead className="text-right text-white/55">Booking</TableHead>
                    <TableHead className="text-right text-white/55">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRoomReports.length > 0 ? (
                    topRoomReports.map((room) => (
                      <TableRow key={room.name} className="border-white/10 hover:bg-white/[0.03]">
                        <TableCell className="font-medium text-white">{room.name}</TableCell>
                        <TableCell className="text-right text-white">{room.bookings}</TableCell>
                        <TableCell className="text-right font-medium text-white">
                          {formatCurrency(room.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableCell colSpan={3} className="py-6 text-center text-white/48">
                        Belum ada booking pada periode ini.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        <Tabs defaultValue="users" className="gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-white">Kelola admin</h2>
              <p className="mt-1 text-sm text-white/58">
                Data user, role, kamar, dan audit log.
              </p>
            </div>
            <TabsList variant="line" className="border-b border-white/10 px-0">
              <TabsTrigger value="users" className="px-4 text-white/65 data-active:text-white">
                User
              </TabsTrigger>
              <TabsTrigger value="rooms" className="px-4 text-white/65 data-active:text-white">
                Kamar
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
                    Lihat detail akun dan ubah role admin, resepsionis, atau guest.
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
