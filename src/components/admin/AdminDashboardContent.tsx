"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  CircleDollarSign,
  Download,
  FileText,
  Hotel,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Database } from "@/types/supabase";
import type { BookingStatus } from "@/lib/clientWarmup";
import { cn } from "@/lib/utils";
import { resolveRoomDetails } from "@/lib/roomCatalog";
import { formatPaymentType } from "@/lib/transactions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BookingMetricsRow = {
  id: string;
  created_at: string | null;
  room_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  check_in: string;
  check_out: string;
  total_price: number | null;
  status: string | null;
  transactions?: Array<{ payment_type: string | null }> | null;
};

type RoomSummaryRow = {
  id: string;
  name: string | null;
  base_price: number | null;
  deleted_at: string | null;
};

type ProfileMetricRow = {
  id: string;
  role: string | null;
  created_at: string | null;
};

type RoomUnitRow = {
  id: string;
  status: string | null;
};

type AdminDashboardContentProps = {
  allBookings: BookingMetricsRow[];
  rooms: RoomSummaryRow[];
  profiles: ProfileMetricRow[];
  roomUnitRows: RoomUnitRow[];
  selectedPeriod: string;
  initialStatus: string;
};

const bookingStatusOptions = [
  "ALL",
  "UNPAID",
  "PAID",
  "EXPIRED",
] as const;

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

export function AdminDashboardContent({
  allBookings,
  rooms,
  profiles,
  roomUnitRows,
  selectedPeriod,
  initialStatus,
}: AdminDashboardContentProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedStatus(value);
    const params = new URLSearchParams(window.location.search);
    if (value === "ALL") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  };

  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const today = getTodayInJakarta();

  const settledStatuses = new Set(["PAID"]);
  const activeStatuses = new Set(["PAID"]);

  // Filter bookings based on selected status
  const filteredBookings = allBookings.filter((booking) => {
    if (selectedStatus === "ALL") return true;
    return booking.status === selectedStatus;
  });

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

  filteredBookings.forEach((booking) => {
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

  const totalRevenue = filteredBookings.reduce((sum, booking) => {
    if (!settledStatuses.has(booking.status ?? "")) {
      return sum;
    }

    return sum + Number(booking.total_price ?? 0);
  }, 0);
  const pendingPayments = statusCounts.get("UNPAID") ?? 0;
  const activeStays = filteredBookings.filter(
    (booking) =>
      booking.status === "PAID" &&
      booking.check_in <= today &&
      booking.check_out >= today,
  ).length;
  const grossBookingValue = filteredBookings.reduce(
    (sum, booking) => sum + Number(booking.total_price ?? 0),
    0,
  );
  const averageBookingValue =
    filteredBookings.length > 0 ? grossBookingValue / filteredBookings.length : 0;
  const todayArrivals = filteredBookings.filter(
    (booking) =>
      booking.check_in === today && activeStatuses.has(booking.status ?? ""),
  ).length;
  const totalUnits = roomUnitRows?.length ?? 0;
  const availableUnits = roomUnitRows?.filter((unit) => unit.status === "AVAILABLE").length ?? 0;

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

  const recentBookings = filteredBookings.slice(0, 8);

  return (
    <>
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
            Dari booking terbayar (PAID)
          </CardFooter>
        </Card>

        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
          <CardHeader>
            <div>
              <CardDescription className="text-white/58">
                Total booking
              </CardDescription>
              <CardTitle className="mt-2 text-2xl text-white">
                {filteredBookings.length}
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

      <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 sm:p-6 text-white">
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
                  {availableUnits}/{totalUnits}
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
                value={selectedStatus}
                onChange={handleStatusChange}
                className="h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40 w-full"
              >
                {bookingStatusOptions.map((status) => (
                  <option key={status} value={status} className="bg-slate-950 text-white">
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
                  <TableHead className="text-white/55">Jenis Pembayaran</TableHead>
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
                      <TableCell>
                        <span className="text-white/70 text-sm">
                          {formatPaymentType(booking.transactions?.[0]?.payment_type)}
                        </span>
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
                  {availableUnits} dari {totalUnits} unit kamar.
                </CardDescription>
              </div>
              <CardAction>
                <Hotel className="size-5 text-primary" />
              </CardAction>
            </CardHeader>
          </Card>
        </div>
      </section>
    </>
  );
}
