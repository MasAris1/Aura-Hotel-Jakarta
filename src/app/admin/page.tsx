import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Download,
  Hotel,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
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
import { UserRoleManagementPanel } from "@/components/admin/UserRoleManagementPanel";
import { RoomManagementPanel } from "@/components/admin/RoomManagementPanel";
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
  "id" | "room_id" | "check_in" | "check_out" | "total_price" | "status"
>;

type RoomSummaryRow = {
  id: string;
  name: string | null;
  base_price: number | null;
  deleted_at: string | null;
  image_url?: string | null;
};

type RecentBookingRow = Pick<
  Database["public"]["Tables"]["bookings"]["Row"],
  | "id"
  | "room_id"
  | "first_name"
  | "last_name"
  | "email"
  | "check_in"
  | "check_out"
  | "total_price"
  | "status"
>;

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

const compactCurrencyFormatter = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "short",
  year: "2-digit",
  timeZone: "Asia/Jakarta",
});

const adminActionButtonClassName =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2.5 text-sm font-medium whitespace-nowrap transition-all outline-none";

const adminOutlineButtonClassName = cn(
  adminActionButtonClassName,
  "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
);

const adminPrimaryButtonClassName = cn(
  adminActionButtonClassName,
  "bg-primary text-primary-foreground shadow-[0_16px_40px_rgba(198,155,73,0.35)]",
);
const bookingStatusOptions = [
  "ALL",
  "UNPAID",
  "PAID",
  "CHECKED_IN",
  "CHECKED_OUT",
  "EXPIRED",
  "REFUNDED",
] as const;

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return "TBD";
  }

  const safeDate = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(safeDate.getTime())) {
    return dateValue;
  }

  return dateFormatter.format(safeDate);
}

function formatCurrency(amount: number | null) {
  return currencyFormatter.format(Number(amount ?? 0));
}

function formatCompactCurrency(amount: number | null) {
  if (!amount) {
    return "IDR 0";
  }

  return `IDR ${compactCurrencyFormatter.format(Number(amount))}`;
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

function getMonthKey(dateValue: string | null) {
  if (!dateValue) {
    return null;
  }

  return dateValue.slice(0, 7);
}

function getRecentMonthKeys(total: number) {
  const [year, month] = getTodayInJakarta().slice(0, 7).split("-").map(Number);
  const monthKeys: string[] = [];

  for (let index = total - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(monthKey);
  }

  return monthKeys;
}

function formatMonthLabel(monthKey: string) {
  const parsedDate = new Date(`${monthKey}-01T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return monthKey;
  }

  return monthFormatter.format(parsedDate);
}

function getPercentageDelta(currentValue: number, previousValue: number) {
  if (!previousValue) {
    return currentValue > 0 ? 100 : 0;
  }

  return ((currentValue - previousValue) / previousValue) * 100;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const profile = await getProfileForUser(supabase, user.id);

  if (!isAdminRole(profile?.role)) {
    redirect("/dashboard");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [{ data: metricsRows }, { data: recentRows }, { data: roomRows }] =
    await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select("id, room_id, check_in, check_out, total_price, status")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("bookings")
        .select(
          "id, room_id, first_name, last_name, email, check_in, check_out, total_price, status",
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabaseAdmin.from("rooms").select("id, name, base_price, deleted_at"),
    ]);

  const bookings = (metricsRows ?? []) as BookingMetricsRow[];
  const recentBookings = (recentRows ?? []) as RecentBookingRow[];
  const rooms = ((roomRows ?? []) as RoomSummaryRow[]).filter(
    (room) => !room.deleted_at,
  );
  const roomMap = buildLiveRoomMap(rooms);
  const activeCatalogRooms = rooms.filter((room) => isCuratedRoomId(room.id));
  const today = getTodayInJakarta();

  const settledStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);
  const activeStatuses = new Set(["PAID", "CHECKED_IN"]);
  const monthKeys = getRecentMonthKeys(6);
  const monthlyDemandMap = new Map(monthKeys.map((key) => [key, 0]));
  const monthlyRevenueMap = new Map(monthKeys.map((key) => [key, 0]));
  const monthlyLeakageMap = new Map(monthKeys.map((key) => [key, 0]));
  const roomPerformance = new Map<
    string,
    {
      name: string;
      type: string;
      realizedRevenue: number;
      grossDemand: number;
      leakageValue: number;
      bookings: number;
    }
  >();
  const statusBreakdownMap = new Map<BookingStatus, number>();
  const grossBookingValue = bookings.reduce(
    (sum, booking) => sum + Number(booking.total_price ?? 0),
    0,
  );

  const totalRevenue = bookings.reduce((sum, booking) => {
    if (!settledStatuses.has(booking.status ?? "")) {
      return sum;
    }

    return sum + Number(booking.total_price ?? 0);
  }, 0);

  const activeStays = bookings.filter(
    (booking) => booking.status === "CHECKED_IN",
  ).length;
  const pendingPayments = bookings.filter(
    (booking) => booking.status === "UNPAID",
  ).length;
  const settledBookingCount = bookings.filter((booking) =>
    settledStatuses.has(booking.status ?? ""),
  ).length;
  const conversionRate =
    bookings.length > 0 ? (settledBookingCount / bookings.length) * 100 : 0;
  const todayArrivals = bookings.filter(
    (booking) =>
      booking.check_in === today && activeStatuses.has(booking.status ?? ""),
  ).length;
  const occupiedRooms = bookings.filter(
    (booking) =>
      isCuratedRoomId(booking.room_id) &&
      booking.check_in <= today &&
      booking.check_out >= today &&
      activeStatuses.has(booking.status ?? ""),
  ).length;
  const totalRooms = activeCatalogRooms.length;
  const availableRooms = Math.max(totalRooms - occupiedRooms, 0);
  const averageBookingValue = bookings.length > 0 ? grossBookingValue / bookings.length : 0;
  const leakedDemandValue = bookings.reduce((sum, booking) => {
    if (booking.status !== "EXPIRED" && booking.status !== "REFUNDED") {
      return sum;
    }

    return sum + Number(booking.total_price ?? 0);
  }, 0);
  const falloutCount = bookings.filter(
    (booking) => booking.status === "EXPIRED" || booking.status === "REFUNDED",
  ).length;
  const openPipelineCount = bookings.filter((booking) =>
    booking.status === "UNPAID" ||
    booking.status === "PAID" ||
    booking.status === "CHECKED_IN",
  ).length;
  const operationalFocusCount = pendingPayments + todayArrivals + activeStays + falloutCount;
  const realizationRate =
    grossBookingValue > 0 ? (totalRevenue / grossBookingValue) * 100 : 0;
  const leakageRate =
    grossBookingValue > 0 ? (leakedDemandValue / grossBookingValue) * 100 : 0;
  const zeroRealizedWarning = totalRevenue === 0 && grossBookingValue > 0;

  const upcomingArrivals = recentBookings
    .filter((booking) => activeStatuses.has(booking.status ?? ""))
    .sort((left, right) => left.check_in.localeCompare(right.check_in))
    .slice(0, 4);

  const unsettledBookings = recentBookings.filter(
    (booking) => booking.status === "UNPAID",
  );

  bookings.forEach((booking) => {
    const status = (booking.status ?? "UNPAID") as BookingStatus;
    const amount = Number(booking.total_price ?? 0);
    statusBreakdownMap.set(status, (statusBreakdownMap.get(status) ?? 0) + 1);

    const monthKey = getMonthKey(booking.check_in);
    if (monthKey && monthlyDemandMap.has(monthKey)) {
      monthlyDemandMap.set(monthKey, (monthlyDemandMap.get(monthKey) ?? 0) + amount);
    }

    if (monthKey && monthlyRevenueMap.has(monthKey) && settledStatuses.has(status)) {
      monthlyRevenueMap.set(monthKey, (monthlyRevenueMap.get(monthKey) ?? 0) + amount);
    }

    if (
      monthKey &&
      monthlyLeakageMap.has(monthKey) &&
      (status === "EXPIRED" || status === "REFUNDED")
    ) {
      monthlyLeakageMap.set(monthKey, (monthlyLeakageMap.get(monthKey) ?? 0) + amount);
    }

    const roomDetails = resolveRoomDetails(
      booking.room_id,
      booking.room_id ? roomMap.get(booking.room_id) : null,
    );
    const roomKey = booking.room_id || roomDetails.name;
    const currentRoom = roomPerformance.get(roomKey) ?? {
      name: roomDetails.name || "Room assignment pending",
      type: roomDetails.type || "Suite",
      realizedRevenue: 0,
      grossDemand: 0,
      leakageValue: 0,
      bookings: 0,
    };

    currentRoom.bookings += 1;
    currentRoom.grossDemand += amount;
    if (settledStatuses.has(status)) {
      currentRoom.realizedRevenue += amount;
    }
    if (status === "EXPIRED" || status === "REFUNDED") {
      currentRoom.leakageValue += amount;
    }

    roomPerformance.set(roomKey, currentRoom);
  });

  const monthlyDemand = monthKeys.map((monthKey) => ({
    key: monthKey,
    label: formatMonthLabel(monthKey),
    demand: monthlyDemandMap.get(monthKey) ?? 0,
    realized: monthlyRevenueMap.get(monthKey) ?? 0,
    leakage: monthlyLeakageMap.get(monthKey) ?? 0,
  }));
  const monthlyRevenue = monthKeys.map((monthKey) => ({
    key: monthKey,
    label: formatMonthLabel(monthKey),
    value: monthlyRevenueMap.get(monthKey) ?? 0,
  }));
  const currentMonthDemand = monthlyDemand[monthlyDemand.length - 1]?.demand ?? 0;
  const currentMonthRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.value ?? 0;
  const previousMonthRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.value ?? 0;
  const revenueDelta = getPercentageDelta(currentMonthRevenue, previousMonthRevenue);
  const maxMonthlyDemand = Math.max(...monthlyDemand.map((item) => item.demand), 1);
  const peakDemandMonth = monthlyDemand.reduce(
    (best, current) => (current.demand > best.demand ? current : best),
    monthlyDemand[0] ?? { key: "", label: "-", demand: 0, realized: 0, leakage: 0 },
  );
  const highestLeakageMonth = monthlyDemand.reduce(
    (best, current) => (current.leakage > best.leakage ? current : best),
    monthlyDemand[0] ?? { key: "", label: "-", demand: 0, realized: 0, leakage: 0 },
  );
  const topRooms = Array.from(roomPerformance.values())
    .sort((left, right) => {
      if (right.grossDemand !== left.grossDemand) {
        return right.grossDemand - left.grossDemand;
      }

      return right.bookings - left.bookings;
    })
    .slice(0, 3);
  const statusBreakdown = [
    "UNPAID",
    "PAID",
    "CHECKED_IN",
    "CHECKED_OUT",
    "EXPIRED",
    "REFUNDED",
  ].map((status) => ({
    status: status as BookingStatus,
    count: statusBreakdownMap.get(status as BookingStatus) ?? 0,
    share:
      bookings.length > 0
        ? ((statusBreakdownMap.get(status as BookingStatus) ?? 0) / bookings.length) * 100
        : 0,
  }));

  const adminName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "Admin";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.16),_transparent_32%),linear-gradient(180deg,_rgba(15,19,27,0.98)_0%,_rgba(9,12,18,1)_100%)] pb-20 pt-32 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_380px]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(212,175,55,0.13),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.03),_transparent_58%)]" />
            <div className="relative space-y-6">
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <ShieldCheck className="size-3.5" />
                Administrator Access
              </Badge>

              <div className="space-y-3">
                <h1 className="font-serif text-4xl tracking-[0.04em] text-white sm:text-5xl">
                  Demand, Revenue & Conversion Signal
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-white/66">
                  Executive-grade view of booking demand, realized revenue,
                  conversion quality, room inventory, and operational pressure.
                  The dashboard now surfaces why performance is strong, flat, or leaking.
                </p>
              </div>

              {zeroRealizedWarning ? (
                <div className="rounded-[1.4rem] border border-rose-400/15 bg-rose-400/8 p-4">
                  <div className="flex items-start gap-3">
                    <TriangleAlert className="mt-0.5 size-4 text-rose-200" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-white">
                        Booking demand exists, but no revenue has been realized yet.
                      </p>
                      <p className="text-sm leading-6 text-white/60">
                        {formatCurrency(grossBookingValue)} demand is on record, while {formatCurrency(leakedDemandValue)} has already leaked into expired or refunded outcomes.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/42">Current month demand</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{formatCompactCurrency(currentMonthDemand)}</p>
                  <p className="mt-2 text-sm text-white/52">
                    {revenueDelta >= 0 ? "+" : ""}
                    {revenueDelta.toFixed(1)}% realized revenue vs previous month
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/42">Conversion pressure</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{operationalFocusCount}</p>
                  <p className="mt-2 text-sm text-white/52">
                    {falloutCount} leaked, {pendingPayments} unpaid, {todayArrivals} arrivals today
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-white/42">Open pipeline</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{openPipelineCount}</p>
                  <p className="mt-2 text-sm text-white/52">
                    bookings still convertible out of {bookings.length} total records
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                  Signed in as <span className="font-medium text-white">{adminName}</span>
                </div>
                <Link
                  href="/dashboard"
                  className={adminOutlineButtonClassName}
                >
                  Operations Dashboard
                </Link>
                <Link
                  href="/#collection"
                  className={adminPrimaryButtonClassName}
                >
                  Create Booking
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader className="border-b border-white/10 pb-5">
              <div>
                <CardDescription className="text-white/58">
                  Demand vs realized trend
                </CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-white">
                  {formatCurrency(grossBookingValue)}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                  <TrendingUp className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.22em] text-white/38">Last 6 months</p>
                <p className="text-sm text-white/52">Peak demand in {peakDemandMonth.label}</p>
              </div>
              <div className="mb-5 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.18em] text-white/40">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-white/25" />
                  Gross demand
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-primary" />
                  Realized
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-rose-300/70" />
                  Leaked
                </span>
              </div>
              <div className="grid h-52 grid-cols-6 items-end gap-3">
                {monthlyDemand.map((point, index) => (
                  <div key={point.key} className="flex h-full flex-col justify-end gap-3">
                    <div className="flex h-full items-end">
                      <div
                        className={cn(
                          "relative w-full rounded-t-[1.2rem] border border-white/10 bg-white/8",
                          index === monthlyDemand.length - 1 ? "border-primary/25 bg-white/10" : "",
                        )}
                        style={{
                          height: `${Math.max((point.demand / maxMonthlyDemand) * 100, point.demand > 0 ? 12 : 6)}%`,
                        }}
                      >
                        <div
                          className="absolute inset-x-1 bottom-0 rounded-t-[0.9rem] bg-gradient-to-t from-primary/40 via-primary/65 to-primary"
                          style={{
                            height: `${point.demand > 0 ? Math.max((point.realized / point.demand) * 100, point.realized > 0 ? 10 : 0) : 0}%`,
                          }}
                        />
                        <div
                          className="absolute inset-x-1 rounded-t-[0.75rem] bg-rose-300/70"
                          style={{
                            bottom: `${point.demand > 0 ? (point.realized / point.demand) * 100 : 0}%`,
                            height: `${point.demand > 0 ? Math.max((point.leakage / point.demand) * 100, point.leakage > 0 ? 8 : 0) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white/75">{point.label}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
                        {formatCompactCurrency(point.demand)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.18em] text-white/55">
              Gross demand with overlays for realized revenue and leaked demand
            </CardFooter>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/60">
                  Gross booking demand
                </CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-white">
                  {formatCurrency(grossBookingValue)}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                  <CircleDollarSign className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.22em] text-white/50">
              {formatCurrency(averageBookingValue)} average ticket across all bookings
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/60">
                  Realized revenue
                </CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-white">
                  {formatCurrency(totalRevenue)}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
                  <ClipboardList className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.22em] text-white/50">
              {realizationRate.toFixed(0)}% of gross demand has converted into realized revenue
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/60">
                  Conversion quality
                </CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-white">
                  {conversionRate.toFixed(0)}%
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-300">
                  <BedDouble className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.22em] text-white/50">
              {settledBookingCount} of {bookings.length} bookings reached paid or completed states
            </CardFooter>
          </Card>

          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader>
              <div>
                <CardDescription className="text-white/60">
                  Revenue leakage
                </CardDescription>
                <CardTitle className="mt-2 text-3xl font-semibold text-white">
                  {formatCurrency(leakedDemandValue)}
                </CardTitle>
              </div>
              <CardAction>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-300">
                  <Wallet className="size-5" />
                </div>
              </CardAction>
            </CardHeader>
            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.22em] text-white/50">
              {leakageRate.toFixed(0)}% of gross demand expired or was refunded
            </CardFooter>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
            <CardHeader className="border-b border-white/10 pb-5">
              <div>
                <CardDescription className="text-white/58">
                  Executive insight
                </CardDescription>
                <CardTitle className="mt-2 text-2xl text-white">
                  What matters most right now
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/38">Peak month</p>
                <p className="mt-3 text-xl font-semibold text-white">{peakDemandMonth.label}</p>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  {peakDemandMonth.demand > 0
                    ? `${formatCurrency(peakDemandMonth.demand)} demand entered the funnel in the strongest month.`
                    : "Demand appears here once bookings are available."}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/38">Best room performer</p>
                <p className="mt-3 text-xl font-semibold text-white">{topRooms[0]?.name || "No lead room yet"}</p>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  {topRooms[0]
                    ? `${topRooms[0].bookings} bookings generated ${formatCompactCurrency(topRooms[0].grossDemand)} demand, with ${formatCompactCurrency(topRooms[0].realizedRevenue)} realized.`
                    : "Room performance will appear after bookings land."}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-white/38">Attention required</p>
                <p className="mt-3 text-xl font-semibold text-white">{operationalFocusCount} items</p>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  {falloutCount} leaked outcomes, {pendingPayments} unpaid bookings, {todayArrivals} arrivals today, and {activeStays} active stays.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10 pb-5">
                <div>
                  <CardTitle className="text-white">Status mix</CardTitle>
                  <CardDescription className="text-white/58">
                    Distribution across all reservations.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                {statusBreakdown.map((item) => (
                  <div key={item.status} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Badge
                        variant={getStatusBadgeVariant(item.status)}
                        className={cn(
                          "border-white/10",
                          item.status === "PAID" || item.status === "CHECKED_IN" || item.status === "CHECKED_OUT"
                            ? "bg-emerald-400/15 text-emerald-200"
                            : "",
                          item.status === "UNPAID"
                            ? "bg-amber-400/15 text-amber-100"
                            : "",
                          item.status === "EXPIRED" || item.status === "REFUNDED"
                            ? "bg-rose-400/15 text-rose-100"
                            : "",
                        )}
                      >
                        {item.status.replace("_", " ")}
                      </Badge>
                      <span className="text-sm text-white/70">
                        {item.count} bookings • {item.share.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/6">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-white/80"
                        style={{ width: `${Math.max(item.share, item.count > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader>
                <div>
                  <CardTitle className="text-white">Risk snapshot</CardTitle>
                  <CardDescription className="text-white/58">
                    Closely watch issues that suppress realized revenue and conversion.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[1.5rem] border border-amber-400/15 bg-amber-400/8 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Pending payments</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{pendingPayments}</p>
                </div>
                <div className="rounded-[1.5rem] border border-rose-400/15 bg-rose-400/8 p-4">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="size-4 text-rose-200" />
                    <p className="text-xs uppercase tracking-[0.22em] text-rose-100/70">Expired or refunded</p>
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-white">{formatCompactCurrency(leakedDemandValue)}</p>
                  <p className="mt-2 text-sm text-white/58">
                    {falloutCount} bookings leaked, with the highest leakage in {highestLeakageMonth.label}.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-primary/70">
                Reporting
              </p>
              <h2 className="font-serif text-2xl text-white">
                Export reservation report
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/60">
                Download a CSV snapshot for finance, audit, or daily operations
                using simple booking filters.
              </p>
            </div>

            <form
              action="/api/admin/bookings/export"
              method="get"
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/58">
                Created from
                <input
                  type="date"
                  name="dateFrom"
                  className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/58">
                Created to
                <input
                  type="date"
                  name="dateTo"
                  className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
                />
              </label>
              <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/58">
                Status
                <select
                  name="status"
                  defaultValue="ALL"
                  className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)]"
              >
                <Download className="size-4" />
                Export CSV
              </button>
            </form>
          </div>
        </section>

        <Tabs defaultValue="overview" className="gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-serif text-2xl text-white">Admin workspace</h2>
              <p className="mt-1 text-sm text-white/58">
                Overview, governance, audit visibility, and property control in one place.
              </p>
            </div>
            <TabsList variant="line" className="border-b border-white/10 px-0">
              <TabsTrigger value="overview" className="px-4 text-white/65 data-active:text-white">
                Overview
              </TabsTrigger>
              <TabsTrigger value="queue" className="px-4 text-white/65 data-active:text-white">
                Queue
              </TabsTrigger>
              <TabsTrigger value="audit" className="px-4 text-white/65 data-active:text-white">
                Audit Logs
              </TabsTrigger>
              <TabsTrigger value="team" className="px-4 text-white/65 data-active:text-white">
                Team
              </TabsTrigger>
              <TabsTrigger value="rooms" className="px-4 text-white/65 data-active:text-white">
                Rooms
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
              <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                <CardHeader className="border-b border-white/10 pb-5">
                  <div>
                    <CardTitle className="text-white">Recent reservations</CardTitle>
                    <CardDescription className="text-white/60">
                      Snapshot of the latest guest activity and payment state.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/55">Booking</TableHead>
                        <TableHead className="text-white/55">Guest</TableHead>
                        <TableHead className="text-white/55">Stay</TableHead>
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
                        const roomLabel = roomDetails.name || roomDetails.type || "Room assignment pending";
                        const status = (booking.status ?? "UNPAID") as BookingStatus;

                        return (
                          <TableRow key={booking.id} className="border-white/10 hover:bg-white/[0.03]">
                            <TableCell className="align-top">
                              <div className="flex flex-col">
                                <span className="font-medium text-white">
                                  #{booking.id.slice(0, 8)}
                                </span>
                                <span className="text-xs text-white/45">{roomLabel}</span>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-col">
                                <span className="text-white">{guestName}</span>
                                <span className="text-xs text-white/45">
                                  {booking.email || "No email provided"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex flex-col">
                                <span className="text-white">{formatDate(booking.check_in)}</span>
                                <span className="text-xs text-white/45">
                                  until {formatDate(booking.check_out)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge
                                variant={getStatusBadgeVariant(status)}
                                className={cn(
                                  "border-white/10",
                                  status === "PAID" || status === "CHECKED_IN" || status === "CHECKED_OUT"
                                    ? "bg-emerald-400/15 text-emerald-200"
                                    : "",
                                  status === "UNPAID"
                                    ? "bg-amber-400/15 text-amber-100"
                                    : "",
                                  status === "EXPIRED" || status === "REFUNDED"
                                    ? "bg-rose-400/15 text-rose-100"
                                    : "",
                                )}
                              >
                                {status.replace("_", " ")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right align-top font-medium text-white">
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
                  <CardHeader>
                    <div>
                      <CardTitle className="text-white">Arrivals today</CardTitle>
                      <CardDescription className="text-white/60">
                        Priority guests to prepare before check-in.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {upcomingArrivals.length > 0 ? (
                      upcomingArrivals.map((booking) => (
                        <div
                          key={booking.id}
                          className="rounded-2xl border border-white/10 bg-black/15 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-white">
                                {`${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || "Guest"}
                              </p>
                              <p className="text-sm text-white/50">
                                {resolveRoomDetails(
                                  booking.room_id,
                                  booking.room_id ? roomMap.get(booking.room_id) : null,
                                ).name}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-white/10 text-white/75">
                              {formatDate(booking.check_in)}
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/55">
                        No arrivals currently need attention.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                  <CardHeader>
                    <div>
                      <CardTitle className="text-white">Room inventory</CardTitle>
                      <CardDescription className="text-white/60">
                        Fast view of current room capacity.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                          Available
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">
                          {availableRooms}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/45">
                          Total rooms
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">
                          {totalRooms}
                        </p>
                      </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/8 p-4">
                      <Hotel className="mt-0.5 size-4 text-primary" />
                      <p className="text-sm leading-6 text-white/68">
                        Use the guest dashboard for live status changes like check-in,
                        check-out, and refund while keeping this page focused on overview.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="queue" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                <CardHeader>
                  <div>
                    <CardTitle className="text-white">Payment follow-up</CardTitle>
                    <CardDescription className="text-white/60">
                      Reservations still waiting for settlement.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {unsettledBookings.length > 0 ? (
                    unsettledBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="rounded-2xl border border-white/10 bg-black/15 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="space-y-1">
                            <p className="font-medium text-white">
                              {`${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || booking.email || "Guest"}
                            </p>
                            <p className="text-sm text-white/50">
                              {resolveRoomDetails(
                                booking.room_id,
                                booking.room_id ? roomMap.get(booking.room_id) : null,
                              ).name} • {formatDate(booking.check_in)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-amber-400/15 text-amber-100">
                              Awaiting payment
                            </Badge>
                            <span className="text-sm font-medium text-white">
                              {formatCurrency(Number(booking.total_price ?? 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-4 text-sm text-white/55">
                      No unpaid reservations in the current queue.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                <CardHeader>
                  <div>
                    <CardTitle className="text-white">Admin routing</CardTitle>
                    <CardDescription className="text-white/60">
                      Role behavior now split between admin and receptionist.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="size-4 text-primary" />
                      <p className="font-medium text-white">Protected admin route</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      Only users with <code className="rounded bg-white/8 px-1 py-0.5 text-white">admin</code>{" "}
                      role can enter <code className="rounded bg-white/8 px-1 py-0.5 text-white">/admin</code>.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-center gap-3">
                      <CalendarClock className="size-4 text-primary" />
                      <p className="font-medium text-white">Smart post-login redirect</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      Admin users land on this control center, while receptionists
                      stay routed to the operations dashboard.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex items-center gap-3">
                      <Hotel className="size-4 text-primary" />
                      <p className="font-medium text-white">Profile bootstrap</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      New users receive a default profile row automatically, and
                      only guest/receptionist role changes are allowed from the UI.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="border-white/10 bg-white/[0.03]">
                  <Link
                    href="/dashboard"
                    className={cn(adminOutlineButtonClassName, "border-white/10")}
                  >
                    Open live operations dashboard
                  </Link>
                </CardFooter>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-6">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Audit logs</CardTitle>
                  <CardDescription className="text-white/60">
                    Review booking, transaction, profile, and room changes with actor visibility.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <AuditLogsPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Team & role management</CardTitle>
                  <CardDescription className="text-white/60">
                    Promote guests to receptionist and demote receptionists back to guest.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <UserRoleManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rooms" className="space-y-6">
            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
              <CardHeader className="border-b border-white/10">
                <div>
                  <CardTitle className="text-white">Room management</CardTitle>
                  <CardDescription className="text-white/60">
                    Create, update, archive, restore, and control public availability for rooms.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <RoomManagementPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
