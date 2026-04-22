"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowUpRight,
    CalendarClock,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    Download,
    Hotel,
    RefreshCw,
    Search,
    ShieldCheck,
    TrendingUp,
    TriangleAlert,
    Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import {
    CLIENT_WARMUP_KEYS,
    enrichBookingWithRoomData,
    readSessionCache,
    writeSessionCache,
    type BookingRecord,
    type DashboardSnapshot,
    type UserProfile,
} from "@/lib/clientWarmup";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

type RealtimeBookingPayload = {
    new: Partial<BookingRecord> & { id: string };
};

type HorizonOption = 3 | 6 | 12;

const settledStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);
const arrivalStatuses = new Set(["PAID", "CHECKED_IN"]);
const voucherEligibleStatuses = new Set(["PAID", "CHECKED_IN", "CHECKED_OUT"]);
const statusOrder: BookingRecord["status"][] = [
    "UNPAID",
    "PAID",
    "CHECKED_IN",
    "CHECKED_OUT",
    "EXPIRED",
    "REFUNDED",
];
const horizonOptions: { value: HorizonOption; label: string }[] = [
    { value: 3, label: "3M" },
    { value: 6, label: "6M" },
    { value: 12, label: "12M" },
];

const currencyFormatter = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
});

const compactCurrencyFormatter = new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
});

const longDateFormatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
});

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Jakarta",
});

function formatCurrency(amount: number) {
    return currencyFormatter.format(amount);
}

function formatCompactCurrency(amount: number) {
    if (!amount) {
        return "IDR 0";
    }

    return `IDR ${compactCurrencyFormatter.format(amount)}`;
}

function toAmount(value: number | string | null | undefined) {
    return Number(value ?? 0);
}

function parseCalendarDate(dateValue?: string | null) {
    if (!dateValue) {
        return null;
    }

    const normalized = dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`;
    const parsedDate = new Date(normalized);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDate(dateValue?: string | null) {
    const parsedDate = parseCalendarDate(dateValue);

    if (!parsedDate) {
        return "TBD";
    }

    return longDateFormatter.format(parsedDate);
}

function getTodayInJakarta() {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

function getMonthKey(dateValue?: string | null) {
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

function getStatusTone(status: BookingRecord["status"]) {
    switch (status) {
        case "PAID":
            return "border-primary/25 bg-primary/12 text-primary";
        case "CHECKED_IN":
            return "border-emerald-400/25 bg-emerald-400/12 text-emerald-100";
        case "CHECKED_OUT":
            return "border-sky-400/25 bg-sky-400/12 text-sky-100";
        case "EXPIRED":
        case "REFUNDED":
            return "border-rose-400/25 bg-rose-400/12 text-rose-100";
        case "UNPAID":
        default:
            return "border-amber-400/25 bg-amber-400/12 text-amber-100";
    }
}

function getStatusLabel(status: BookingRecord["status"]) {
    return status.replace("_", " ");
}

function getReservationPriority(reservation: BookingRecord, todayKey: string) {
    if (reservation.status === "UNPAID") {
        return 0;
    }

    if (reservation.check_in === todayKey && arrivalStatuses.has(reservation.status)) {
        return 1;
    }

    if (reservation.status === "CHECKED_IN") {
        return 2;
    }

    if (reservation.status === "PAID") {
        return 3;
    }

    return 4;
}

function sortReservationsForOps(reservations: BookingRecord[], todayKey: string) {
    return [...reservations].sort((left, right) => {
        const priorityDiff = getReservationPriority(left, todayKey) - getReservationPriority(right, todayKey);

        if (priorityDiff !== 0) {
            return priorityDiff;
        }

        const dateDiff = left.check_in.localeCompare(right.check_in);

        if (dateDiff !== 0) {
            return dateDiff;
        }

        return right.id.localeCompare(left.id);
    });
}

function isWithinUpcomingWindow(dateValue: string, startDate: string, windowInDays: number) {
    const start = parseCalendarDate(startDate);
    const target = parseCalendarDate(dateValue);

    if (!start || !target) {
        return false;
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    const diffInDays = Math.floor((target.getTime() - start.getTime()) / millisecondsPerDay);

    return diffInDays >= 0 && diffInDays <= windowInDays;
}

function getStayLength(checkIn: string, checkOut: string) {
    const start = parseCalendarDate(checkIn);
    const end = parseCalendarDate(checkOut);

    if (!start || !end) {
        return 0;
    }

    return Math.max(Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 0);
}

function filterReservationsByQuery(items: BookingRecord[], query: string) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
        return items;
    }

    return items.filter((reservation) => {
        const haystack = [
            reservation.id.slice(0, 8),
            reservation.first_name,
            reservation.last_name,
            reservation.email,
            reservation.roomInfo?.name,
            reservation.roomInfo?.type,
            getStatusLabel(reservation.status),
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(normalizedQuery);
    });
}

function DashboardSkeleton() {
    return (
        <main className="min-h-screen bg-background pb-24 pt-32 selection:bg-primary/20">
            <div className="container mx-auto max-w-7xl px-6">
                <div className="space-y-6">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
                        <div className="rounded-[2rem] border border-border bg-card/60 p-8">
                            <div className="mb-5 h-8 w-40 animate-pulse rounded-full bg-primary/10" />
                            <div className="space-y-3">
                                <div className="h-12 w-80 animate-pulse rounded-full bg-muted/40" />
                                <div className="h-4 w-full max-w-2xl animate-pulse rounded-full bg-muted/25" />
                                <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted/20" />
                            </div>
                            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="rounded-2xl border border-border bg-background/40 p-4">
                                        <div className="h-3 w-24 animate-pulse rounded-full bg-muted/25" />
                                        <div className="mt-4 h-8 w-28 animate-pulse rounded-full bg-muted/35" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-border bg-card/60 p-8">
                            <div className="h-4 w-28 animate-pulse rounded-full bg-muted/25" />
                            <div className="mt-4 h-10 w-36 animate-pulse rounded-full bg-muted/35" />
                            <div className="mt-8 grid h-48 grid-cols-6 items-end gap-3">
                                {Array.from({ length: 6 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="animate-pulse rounded-t-2xl bg-primary/20"
                                        style={{ height: `${36 + index * 18}px` }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="rounded-[1.6rem] border border-border bg-card/60 p-6">
                                <div className="h-3 w-24 animate-pulse rounded-full bg-muted/25" />
                                <div className="mt-4 h-9 w-28 animate-pulse rounded-full bg-muted/35" />
                                <div className="mt-5 h-3 w-32 animate-pulse rounded-full bg-muted/20" />
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
                        <div className="rounded-[1.75rem] border border-border bg-card/60 p-6">
                            <div className="h-8 w-44 animate-pulse rounded-full bg-muted/30" />
                            <div className="mt-6 space-y-4">
                                {Array.from({ length: 5 }).map((_, rowIndex) => (
                                    <div key={rowIndex} className="h-14 animate-pulse rounded-2xl bg-muted/15" />
                                ))}
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="rounded-[1.75rem] border border-border bg-card/60 p-6">
                                <div className="h-8 w-40 animate-pulse rounded-full bg-muted/30" />
                                <div className="mt-6 space-y-3">
                                    {Array.from({ length: 4 }).map((_, index) => (
                                        <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/15" />
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-[1.75rem] border border-border bg-card/60 p-6">
                                <div className="h-8 w-40 animate-pulse rounded-full bg-muted/30" />
                                <div className="mt-6 h-32 animate-pulse rounded-3xl bg-primary/10" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

export default function DashboardPage() {
    const [reservations, setReservations] = useState<BookingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
    const [actionBookingId, setActionBookingId] = useState<string | null>(null);
    const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
    const [selectedHorizon, setSelectedHorizon] = useState<HorizonOption>(6);
    const [reservationSearch, setReservationSearch] = useState("");
    const deferredReservationSearch = useDeferredValue(reservationSearch);
    const [cacheHydrated, setCacheHydrated] = useState(false);

    useEffect(() => {
        const cachedSnapshot = readSessionCache<DashboardSnapshot>(CLIENT_WARMUP_KEYS.dashboardSnapshot);
        const cachedProfile = readSessionCache<UserProfile>(CLIENT_WARMUP_KEYS.userProfile);

        if (cachedSnapshot) {
            setReservations(cachedSnapshot.reservations ?? []);
            setUserProfile(cachedSnapshot.userProfile ?? cachedProfile);
            setLoading(false);
        } else if (cachedProfile) {
            setUserProfile(cachedProfile);
        }

        setCacheHydrated(true);
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/dashboard", {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            const result = await res.json() as {
                error?: string;
                userProfile?: UserProfile | null;
                reservations?: BookingRecord[];
            };

            if (!res.ok) {
                setLoading(false);
                return;
            }

            const nextUserProfile = result.userProfile ?? null;
            const nextReservations = result.reservations ?? [];

            setUserProfile(nextUserProfile);
            setReservations(nextReservations);
            writeSessionCache(CLIENT_WARMUP_KEYS.userProfile, nextUserProfile);
            writeSessionCache(CLIENT_WARMUP_KEYS.dashboardSnapshot, {
                userProfile: nextUserProfile,
                reservations: nextReservations,
            });
            setLoading(false);
        } catch {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!cacheHydrated) {
            return;
        }

        void fetchData();
    }, [cacheHydrated, fetchData]);

    useEffect(() => {
        if (!cacheHydrated) {
            return;
        }

        let isMounted = true;
        const supabase = createClient();
        let unsubscribeChannel: (() => void) | undefined;

        const subscribeRealtime = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!isMounted || !user) {
                return;
            }

            const isPrivilegedUser = userProfile?.role === "admin" || userProfile?.role === "receptionist";
            const userFilter = isPrivilegedUser ? "" : `user_id=eq.${user.id}`;
            const channel = supabase.channel("public:bookings")
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "bookings", filter: userFilter ? userFilter : undefined },
                    (payload: RealtimeBookingPayload) => {
                        setReservations((prev) => {
                            const nextReservations = prev.map((reservation) =>
                                reservation.id === payload.new.id
                                    ? enrichBookingWithRoomData({ ...reservation, ...payload.new })
                                    : reservation
                            );

                            writeSessionCache(CLIENT_WARMUP_KEYS.dashboardSnapshot, {
                                userProfile,
                                reservations: nextReservations,
                            });

                            return nextReservations;
                        });
                    }
                )
                .subscribe();

            unsubscribeChannel = () => {
                supabase.removeChannel(channel);
            };
        };

        void subscribeRealtime();

        return () => {
            isMounted = false;
            unsubscribeChannel?.();
        };
    }, [cacheHydrated, userProfile]);

    const syncReservationsToCache = useCallback((nextReservations: BookingRecord[]) => {
        writeSessionCache(CLIENT_WARMUP_KEYS.dashboardSnapshot, {
            userProfile,
            reservations: nextReservations,
        });
    }, [userProfile]);

    const updateReservationStatus = useCallback((bookingId: string, status: BookingRecord["status"]) => {
        setReservations((prev) => {
            const nextReservations = prev.map((reservation) =>
                reservation.id === bookingId
                    ? enrichBookingWithRoomData({ ...reservation, status })
                    : reservation
            );

            syncReservationsToCache(nextReservations);
            return nextReservations;
        });
    }, [syncReservationsToCache]);

    const handleAction = async (bookingId: string, action: "check_in" | "check_out" | "refund") => {
        setActionBookingId(bookingId);

        try {
            const res = await fetch("/api/admin/bookings/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId, action }),
            });

            const result = await res.json() as { error?: string; status?: BookingRecord["status"] };

            if (!res.ok || !result.status) {
                alert(result.error || "Gagal memproses aksi admin.");
                return;
            }

            updateReservationStatus(bookingId, result.status);
        } catch {
            alert("Terjadi kesalahan saat memproses aksi admin.");
        } finally {
            setActionBookingId(null);
        }
    };

    const handleResumePayment = async (bookingId: string) => {
        setPayingBookingId(bookingId);

        try {
            const res = await fetch("/api/checkout/resume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId }),
            });

            const result = await res.json() as { error?: string; token?: string };

            if (!res.ok) {
                alert(result.error || "Gagal melanjutkan pembayaran");
                setPayingBookingId(null);
                return;
            }

            if (result.token) {
                if (!window.snap) {
                    alert("Layanan pembayaran belum siap. Silakan refresh halaman atau coba lagi beberapa saat lagi.");
                    setPayingBookingId(null);
                    return;
                }

                window.snap.pay(result.token, {
                    onSuccess: function () {
                        setPayingBookingId(null);
                    },
                    onPending: function () {
                        setPayingBookingId(null);
                    },
                    onError: function () {
                        alert("Pembayaran gagal. Silakan coba lagi.");
                        setPayingBookingId(null);
                    },
                    onClose: function () {
                        setPayingBookingId(null);
                    }
                });
            }
        } catch {
            alert("Terjadi kesalahan.");
            setPayingBookingId(null);
        }
    };

    const handleCancelBooking = async (bookingId: string) => {
        setCancelingBookingId(bookingId);

        try {
            const res = await fetch("/api/checkout/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bookingId }),
            });

            const result = await res.json() as { error?: string };

            if (!res.ok) {
                alert(result.error || "Gagal membatalkan booking");
                return;
            }

            updateReservationStatus(bookingId, "EXPIRED");
        } catch {
            alert("Terjadi kesalahan saat membatalkan booking.");
        } finally {
            setCancelingBookingId(null);
        }
    };

    if (loading) {
        return <DashboardSkeleton />;
    }

    const todayKey = getTodayInJakarta();
    const isPrivileged = userProfile?.role === "admin" || userProfile?.role === "receptionist";
    const sortedReservations = sortReservationsForOps(reservations, todayKey);
    const monthKeys = getRecentMonthKeys(selectedHorizon);
    const scopeMonthSet = new Set(monthKeys);
    const scopedReservations = reservations.filter((reservation) => {
        const monthKey = getMonthKey(reservation.check_in || reservation.created_at);

        return monthKey ? scopeMonthSet.has(monthKey) : false;
    });
    const monthlyRevenueMap = new Map(monthKeys.map((key) => [key, 0]));
    const statusCounts = new Map<BookingRecord["status"], number>();
    const roomSummary = new Map<string, {
        name: string;
        type: string;
        revenue: number;
        bookings: number;
        image: string | null;
    }>();

    let totalRevenue = 0;
    let settledRevenueCount = 0;
    let activeStayCount = 0;
    let upcomingRevenue = 0;
    let stayNights = 0;

    const arrivalsToday = sortedReservations.filter(
        (reservation) => reservation.check_in === todayKey && arrivalStatuses.has(reservation.status)
    );
    const paymentQueue = sortedReservations.filter((reservation) => reservation.status === "UNPAID");
    const activeStays = sortedReservations.filter((reservation) => reservation.status === "CHECKED_IN");
    const upcomingArrivals = sortedReservations
        .filter((reservation) => arrivalStatuses.has(reservation.status) && isWithinUpcomingWindow(reservation.check_in, todayKey, 7))
        .sort((left, right) => left.check_in.localeCompare(right.check_in));
    const completedOrClosed = sortedReservations.filter(
        (reservation) => reservation.status === "CHECKED_OUT" || reservation.status === "EXPIRED" || reservation.status === "REFUNDED"
    );

    scopedReservations.forEach((reservation) => {
        const amount = toAmount(reservation.total_price);
        const monthKey = getMonthKey(reservation.check_in || reservation.created_at);
        const roomLabel = reservation.roomInfo?.name || "Room assignment pending";
        const roomType = reservation.roomInfo?.type || "Suite";
        const roomImage = reservation.roomInfo?.images?.[0] || null;

        statusCounts.set(reservation.status, (statusCounts.get(reservation.status) ?? 0) + 1);

        if (settledStatuses.has(reservation.status)) {
            totalRevenue += amount;
            settledRevenueCount += 1;
            upcomingRevenue += reservation.check_in >= todayKey ? amount : 0;
            stayNights += getStayLength(reservation.check_in, reservation.check_out);

            if (monthKey && monthlyRevenueMap.has(monthKey)) {
                monthlyRevenueMap.set(monthKey, (monthlyRevenueMap.get(monthKey) ?? 0) + amount);
            }
        }

        if (reservation.status === "CHECKED_IN") {
            activeStayCount += 1;
        }

        const roomKey = `${reservation.room_id || roomLabel}`;
        const currentRoom = roomSummary.get(roomKey) ?? {
            name: roomLabel,
            type: roomType,
            revenue: 0,
            bookings: 0,
            image: roomImage,
        };

        currentRoom.bookings += 1;

        if (settledStatuses.has(reservation.status)) {
            currentRoom.revenue += amount;
        }

        if (!currentRoom.image && roomImage) {
            currentRoom.image = roomImage;
        }

        roomSummary.set(roomKey, currentRoom);
    });

    const monthlyRevenue = monthKeys.map((monthKey) => ({
        key: monthKey,
        label: formatMonthLabel(monthKey),
        value: monthlyRevenueMap.get(monthKey) ?? 0,
    }));
    const currentMonthRevenue = monthlyRevenue[monthlyRevenue.length - 1]?.value ?? 0;
    const previousMonthRevenue = monthlyRevenue[monthlyRevenue.length - 2]?.value ?? 0;
    const revenueDelta = getPercentageDelta(currentMonthRevenue, previousMonthRevenue);
    const maxMonthlyRevenue = Math.max(...monthlyRevenue.map((item) => item.value), 1);
    const averageBookingValue = settledRevenueCount > 0 ? totalRevenue / settledRevenueCount : 0;
    const conversionRate = scopedReservations.length > 0 ? (settledRevenueCount / scopedReservations.length) * 100 : 0;
    const falloutCount = (statusCounts.get("EXPIRED") ?? 0) + (statusCounts.get("REFUNDED") ?? 0);
    const operationalFocusCount = paymentQueue.length + arrivalsToday.length + activeStays.length;
    const peakMonth = monthlyRevenue.reduce(
        (best, current) => current.value > best.value ? current : best,
        monthlyRevenue[0] ?? { key: "", label: "-", value: 0 }
    );
    const statusBreakdown = statusOrder.map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
        share: scopedReservations.length > 0 ? ((statusCounts.get(status) ?? 0) / scopedReservations.length) * 100 : 0,
    }));
    const topRooms = Array.from(roomSummary.values())
        .sort((left, right) => {
            if (right.revenue !== left.revenue) {
                return right.revenue - left.revenue;
            }

            return right.bookings - left.bookings;
        })
        .slice(0, 4);
    const filteredReservations = filterReservationsByQuery(sortedReservations, deferredReservationSearch);
    const filteredUpcomingArrivals = filterReservationsByQuery(upcomingArrivals, deferredReservationSearch);
    const focusReservations = filteredReservations.slice(0, 8);
    const dashboardName = userProfile?.first_name || "Analyst";
    const horizonLabel = `Last ${selectedHorizon} months`;
    const scopedClosedRevenue = scopedReservations
        .filter((reservation) => reservation.status === "CHECKED_OUT")
        .reduce((sum, reservation) => sum + toAmount(reservation.total_price), 0);
    const scopedInHouseRevenue = scopedReservations
        .filter((reservation) => reservation.status === "CHECKED_IN")
        .reduce((sum, reservation) => sum + toAmount(reservation.total_price), 0);
    const scopedUpcomingRevenue = scopedReservations
        .filter((reservation) => reservation.status === "PAID")
        .reduce((sum, reservation) => sum + toAmount(reservation.total_price), 0);

    const renderReservationActions = (reservation: BookingRecord) => {
        const buttonClassName = "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-[11px] font-medium uppercase tracking-[0.18em] transition-all";

        return (
            <div className="flex flex-wrap justify-end gap-2">
                {voucherEligibleStatuses.has(reservation.status) ? (
                    <a
                        href={`/api/vouchers/${reservation.id}`}
                        className={cn(buttonClassName, "bg-white/5 text-white hover:bg-white/10")}
                        title="Download E-Voucher"
                    >
                        <Download className="size-3.5" />
                        Voucher
                    </a>
                ) : null}

                {isPrivileged ? (
                    <>
                        {reservation.status === "PAID" ? (
                            <button
                                onClick={() => handleAction(reservation.id, "check_in")}
                                disabled={actionBookingId === reservation.id}
                                className={cn(buttonClassName, "border-primary/25 bg-primary text-primary-foreground hover:shadow-[0_18px_36px_rgba(198,155,73,0.35)] disabled:opacity-50")}
                            >
                                {actionBookingId === reservation.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                                Check-In
                            </button>
                        ) : null}

                        {reservation.status === "CHECKED_IN" ? (
                            <button
                                onClick={() => handleAction(reservation.id, "check_out")}
                                disabled={actionBookingId === reservation.id}
                                className={cn(buttonClassName, "border-primary/25 bg-transparent text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50")}
                            >
                                {actionBookingId === reservation.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                                Check-Out
                            </button>
                        ) : null}

                        {(reservation.status === "PAID" || reservation.status === "CHECKED_IN") ? (
                            <button
                                onClick={() => handleAction(reservation.id, "refund")}
                                disabled={actionBookingId === reservation.id}
                                className={cn(buttonClassName, "border-rose-400/20 bg-rose-400/10 text-rose-100 hover:bg-rose-500 hover:text-white disabled:opacity-50")}
                            >
                                {actionBookingId === reservation.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                                Refund
                            </button>
                        ) : null}
                    </>
                ) : (
                    <>
                        {reservation.status === "UNPAID" ? (
                            <button
                                onClick={() => handleResumePayment(reservation.id)}
                                disabled={payingBookingId === reservation.id || cancelingBookingId === reservation.id}
                                className={cn(buttonClassName, "border-primary/25 bg-primary text-primary-foreground hover:shadow-[0_18px_36px_rgba(198,155,73,0.35)] disabled:opacity-50")}
                            >
                                {payingBookingId === reservation.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                                {payingBookingId === reservation.id ? "Processing" : "Pay Now"}
                            </button>
                        ) : null}

                        {reservation.status === "UNPAID" ? (
                            <button
                                onClick={() => handleCancelBooking(reservation.id)}
                                disabled={cancelingBookingId === reservation.id || payingBookingId === reservation.id}
                                className={cn(buttonClassName, "border-rose-400/20 bg-transparent text-rose-100 hover:bg-rose-500 hover:text-white disabled:opacity-50")}
                            >
                                {cancelingBookingId === reservation.id ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                                {cancelingBookingId === reservation.id ? "Cancelling" : "Cancel"}
                            </button>
                        ) : null}
                    </>
                )}
            </div>
        );
    };

    const renderReservationTable = (items: BookingRecord[], emptyState: string) => (
        items.length > 0 ? (
            <Table>
                <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-white/55">Booking</TableHead>
                        <TableHead className="text-white/55">Stay Window</TableHead>
                        <TableHead className="text-white/55">Status</TableHead>
                        <TableHead className="text-right text-white/55">Value</TableHead>
                        <TableHead className="text-right text-white/55">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((reservation) => (
                        <TableRow key={reservation.id} className="border-white/10 hover:bg-white/[0.03]">
                            <TableCell className="align-top">
                                <div className="flex min-w-[260px] items-start gap-4">
                                    {reservation.roomInfo?.images?.[0] ? (
                                        <Image
                                            src={reservation.roomInfo.images[0]}
                                            alt={reservation.roomInfo?.name || "Room"}
                                            width={64}
                                            height={64}
                                            className="size-16 rounded-2xl object-cover"
                                        />
                                    ) : (
                                        <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary">
                                            <Hotel className="size-5" />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <p className="font-medium text-white">
                                            {reservation.roomInfo?.name || "Room assignment pending"}
                                        </p>
                                        <p className="text-sm text-white/50">
                                            #{reservation.id.slice(0, 8)} • {`${reservation.first_name} ${reservation.last_name}`.trim()}
                                        </p>
                                        <p className="text-xs uppercase tracking-[0.2em] text-white/35">
                                            {reservation.roomInfo?.type || "Suite"}
                                        </p>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="flex min-w-[180px] flex-col">
                                    <span className="text-white">{formatDate(reservation.check_in)}</span>
                                    <span className="text-xs text-white/45">until {formatDate(reservation.check_out)}</span>
                                    <span className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/35">
                                        {getStayLength(reservation.check_in, reservation.check_out)} night stay
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <Badge variant="outline" className={cn("h-7 border text-[11px] tracking-[0.18em]", getStatusTone(reservation.status))}>
                                    {reservation.status === "CHECKED_IN" || reservation.status === "CHECKED_OUT" ? <CheckCircle2 className="size-3.5" /> : null}
                                    {reservation.status === "UNPAID" ? <Clock3 className="size-3.5" /> : null}
                                    {(reservation.status === "EXPIRED" || reservation.status === "REFUNDED") ? <TriangleAlert className="size-3.5" /> : null}
                                    {getStatusLabel(reservation.status)}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-right align-top">
                                <div className="flex min-w-[120px] flex-col items-end">
                                    <span className="font-medium text-white">
                                        {formatCurrency(toAmount(reservation.total_price))}
                                    </span>
                                    <span className="text-xs text-white/45">
                                        {reservation.created_at ? `Booked ${formatDate(reservation.created_at)}` : "Captured booking value"}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="w-[320px] text-right align-top">
                                {renderReservationActions(reservation)}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        ) : (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/15 p-8 text-sm text-white/55">
                {emptyState}
            </div>
        )
    );

    return (
        <main className="min-h-screen bg-background pb-24 pt-32 text-foreground selection:bg-primary/20">
            <div className="container mx-auto max-w-7xl px-6">
                <div className="space-y-6">
                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_360px]">
                        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-7 shadow-[0_28px_90px_rgba(0,0,0,0.24)] sm:p-8">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(212,175,55,0.12),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.03),_transparent_56%)]" />
                            <div className="relative space-y-6">
                                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                                    <ShieldCheck className="size-3.5" />
                                    {isPrivileged ? "Executive Dashboard" : "Reservation Overview"}
                                </Badge>

                                <div className="space-y-3">
                                    <h1 className="font-serif text-4xl text-white sm:text-5xl">
                                        {isPrivileged ? "Booking Performance Command Center" : "Your Reservation Portfolio"}
                                    </h1>
                                    <p className="max-w-3xl text-sm leading-7 text-white/65">
                                        {isPrivileged
                                            ? `Welcome back, ${dashboardName}. This dashboard blends live booking operations with monthly revenue visibility, priority alerts, and room-level performance so you can make faster executive decisions without leaving the current theme.`
                                            : `Welcome back, ${dashboardName}. Track reservation status, payment progress, and voucher access from one polished view built on your current booking data.`}
                                    </p>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/40">Current month</p>
                                        <p className="mt-3 text-2xl font-semibold text-white">{formatCompactCurrency(currentMonthRevenue)}</p>
                                        <p className="mt-2 text-sm text-white/50">
                                            {revenueDelta >= 0 ? "+" : ""}
                                            {revenueDelta.toFixed(1)}% vs previous month
                                        </p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/40">Operational focus</p>
                                        <p className="mt-3 text-2xl font-semibold text-white">{operationalFocusCount}</p>
                                        <p className="mt-2 text-sm text-white/50">
                                            {paymentQueue.length} unpaid, {arrivalsToday.length} arrivals today
                                        </p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/40">Stay nights</p>
                                        <p className="mt-3 text-2xl font-semibold text-white">{stayNights}</p>
                                        <p className="mt-2 text-sm text-white/50">
                                            Revenue-bearing nights on the books
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs uppercase tracking-[0.22em] text-white/40">Metric horizon</span>
                                    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
                                        {horizonOptions.map((option) => (
                                            <Button
                                                key={option.value}
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSelectedHorizon(option.value)}
                                                className={cn(
                                                    "rounded-lg px-3 text-xs tracking-[0.18em] text-white/60 hover:bg-white/8 hover:text-white",
                                                    selectedHorizon === option.value ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : ""
                                                )}
                                            >
                                                {option.label}
                                            </Button>
                                        ))}
                                    </div>
                                    <span className="text-sm text-white/52">
                                        KPI analytics below follow {horizonLabel.toLowerCase()}.
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <Link
                                        href="/#collection"
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)]"
                                    >
                                        Create Reservation
                                        <ArrowUpRight className="size-4" />
                                    </Link>
                                    {isPrivileged ? (
                                        <Link
                                            href="/admin"
                                            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                                        >
                                            Open Admin Workspace
                                        </Link>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader className="border-b border-white/10 pb-5">
                                <div>
                                    <CardDescription className="text-white/55">
                                        Monthly revenue trajectory
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-3xl font-semibold text-white">
                                        {formatCurrency(totalRevenue)}
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
                                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">{horizonLabel}</p>
                                    <p className="text-sm text-white/52">
                                        {scopedReservations.length} bookings in analytic scope
                                    </p>
                                </div>
                                <div
                                    className="grid h-52 items-end gap-3"
                                    style={{ gridTemplateColumns: `repeat(${monthlyRevenue.length}, minmax(0, 1fr))` }}
                                >
                                    {monthlyRevenue.map((point, index) => (
                                        <div key={point.key} className="flex h-full flex-col justify-end gap-3">
                                            <div className="flex h-full items-end">
                                                <div
                                                    className={cn(
                                                        "w-full rounded-t-[1.2rem] border border-white/10 bg-gradient-to-t from-primary/18 via-primary/35 to-primary shadow-[0_14px_24px_rgba(198,155,73,0.12)] transition-all",
                                                        index === monthlyRevenue.length - 1 ? "from-primary/28 via-primary/55 to-primary" : ""
                                                    )}
                                                    style={{
                                                        height: `${Math.max((point.value / maxMonthlyRevenue) * 100, point.value > 0 ? 12 : 6)}%`,
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium text-white/75">{point.label}</p>
                                                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/35">
                                                    {formatCompactCurrency(point.value)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.18em] text-white/55">
                                Based on settled bookings grouped by check-in month inside {horizonLabel.toLowerCase()}
                            </CardFooter>
                        </Card>
                    </section>

                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader>
                                <div>
                                    <CardDescription className="text-white/58">
                                        Revenue captured
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-3xl font-semibold text-white">
                                        {formatCurrency(totalRevenue)}
                                    </CardTitle>
                                </div>
                                <CardAction>
                                    <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                                        <CircleDollarSign className="size-5" />
                                    </div>
                                </CardAction>
                            </CardHeader>
                            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/50">
                                {formatCurrency(averageBookingValue)} average booking value
                            </CardFooter>
                        </Card>

                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader>
                                <div>
                                    <CardDescription className="text-white/58">
                                        Conversion quality
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-3xl font-semibold text-white">
                                        {conversionRate.toFixed(0)}%
                                    </CardTitle>
                                </div>
                                <CardAction>
                                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-emerald-200">
                                        <CheckCircle2 className="size-5" />
                                    </div>
                                </CardAction>
                            </CardHeader>
                            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/50">
                                {settledRevenueCount} of {scopedReservations.length} reservations settled
                            </CardFooter>
                        </Card>

                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader>
                                <div>
                                    <CardDescription className="text-white/58">
                                        Live operations
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-3xl font-semibold text-white">
                                        {activeStayCount}
                                    </CardTitle>
                                </div>
                                <CardAction>
                                    <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-100">
                                        <CalendarClock className="size-5" />
                                    </div>
                                </CardAction>
                            </CardHeader>
                            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/50">
                                {upcomingArrivals.length} arrivals inside the next 7 days
                            </CardFooter>
                        </Card>

                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader>
                                <div>
                                    <CardDescription className="text-white/58">
                                        Revenue at risk
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-3xl font-semibold text-white">
                                        {paymentQueue.length}
                                    </CardTitle>
                                </div>
                                <CardAction>
                                    <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-100">
                                        <Wallet className="size-5" />
                                    </div>
                                </CardAction>
                            </CardHeader>
                            <CardFooter className="border-white/10 bg-white/[0.03] text-xs uppercase tracking-[0.2em] text-white/50">
                                {formatCompactCurrency(upcomingRevenue)} scheduled future revenue
                            </CardFooter>
                        </Card>
                    </section>

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader className="border-b border-white/10 pb-5">
                                <div>
                                    <CardDescription className="text-white/55">
                                        Executive insight
                                    </CardDescription>
                                    <CardTitle className="mt-2 text-2xl text-white">
                                        What the current booking data is saying
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
                                <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">Peak month</p>
                                    <p className="mt-3 text-xl font-semibold text-white">{peakMonth.label}</p>
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                        {peakMonth.value > 0 ? `${formatCurrency(peakMonth.value)} captured in the strongest month.` : "Revenue will appear here once bookings are settled."}
                                    </p>
                                </div>
                                <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">Best performing room</p>
                                    <p className="mt-3 text-xl font-semibold text-white">{topRooms[0]?.name || "No lead room yet"}</p>
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                        {topRooms[0] ? `${topRooms[0].bookings} bookings contributing ${formatCompactCurrency(topRooms[0].revenue)}.` : "Room-level performance appears once reservation data is available."}
                                    </p>
                                </div>
                                <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-5">
                                    <p className="text-xs uppercase tracking-[0.22em] text-white/38">Attention required</p>
                                    <p className="mt-3 text-xl font-semibold text-white">{operationalFocusCount} items</p>
                                    <p className="mt-2 text-sm leading-6 text-white/58">
                                        {paymentQueue.length} payment follow-up, {arrivalsToday.length} arrivals today, and {activeStays.length} guests in-house.
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
                                            Distribution across the full reservation base.
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6">
                                    {statusBreakdown.map((item) => (
                                        <div key={item.status} className="space-y-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={cn("h-7 border text-[11px] tracking-[0.18em]", getStatusTone(item.status))}>
                                                        {getStatusLabel(item.status)}
                                                    </Badge>
                                                    <span className="text-sm text-white/55">{item.count} bookings</span>
                                                </div>
                                                <span className="text-sm font-medium text-white">{item.share.toFixed(0)}%</span>
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
                                        <CardTitle className="text-white">Revenue composition</CardTitle>
                                        <CardDescription className="text-white/58">
                                            Split the scoped revenue pool by stay progression.
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-[1.5rem] border border-emerald-400/15 bg-emerald-400/8 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-emerald-100/70">Checked out</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{formatCompactCurrency(scopedClosedRevenue)}</p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-sky-400/15 bg-sky-400/8 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-sky-100/70">In-house</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{formatCompactCurrency(scopedInHouseRevenue)}</p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-primary/15 bg-primary/8 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-primary/80">Upcoming paid</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{formatCompactCurrency(scopedUpcomingRevenue)}</p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-rose-400/15 bg-rose-400/8 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-rose-100/70">Expired or refunded</p>
                                        <p className="mt-2 text-3xl font-semibold text-white">{falloutCount}</p>
                                        <p className="mt-2 text-sm text-white/55">
                                            Leakage inside {horizonLabel.toLowerCase()} that suppresses realized revenue.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
                        <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                            <CardHeader className="border-b border-white/10 pb-5">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                                    <div className="space-y-2">
                                        <CardDescription className="text-white/55">
                                            Reservation command center
                                        </CardDescription>
                                        <CardTitle className="text-2xl text-white">
                                            Operational queue with live actions
                                        </CardTitle>
                                        <p className="text-sm text-white/50">
                                            Search across guest names, booking IDs, room labels, and status while preserving real-time actions.
                                        </p>
                                    </div>

                                    <div className="w-full max-w-sm space-y-2">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
                                            <Input
                                                value={reservationSearch}
                                                onChange={(event) => setReservationSearch(event.target.value)}
                                                placeholder="Search reservation, guest, room, status..."
                                                className="h-11 rounded-xl border-white/10 bg-black/20 pl-10 text-white placeholder:text-white/30"
                                            />
                                        </div>
                                        <p className="text-right text-xs uppercase tracking-[0.18em] text-white/35">
                                            {filteredReservations.length} matches in live queue
                                        </p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <Tabs defaultValue="focus" className="gap-6">
                                    <TabsList variant="line" className="border-b border-white/10 px-0">
                                        <TabsTrigger value="focus" className="px-4 text-white/65 data-active:text-white">
                                            Focus
                                        </TabsTrigger>
                                        <TabsTrigger value="arrivals" className="px-4 text-white/65 data-active:text-white">
                                            Arrivals
                                        </TabsTrigger>
                                        <TabsTrigger value="all" className="px-4 text-white/65 data-active:text-white">
                                            All Reservations
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="focus">
                                        {renderReservationTable(focusReservations, "No reservations need immediate attention right now.")}
                                    </TabsContent>
                                    <TabsContent value="arrivals">
                                        {renderReservationTable(filteredUpcomingArrivals.slice(0, 8), "No upcoming arrivals inside the next 7 days.")}
                                    </TabsContent>
                                    <TabsContent value="all">
                                        {renderReservationTable(filteredReservations, "No reservations found for the current dataset.")}
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>

                        <div className="space-y-6">
                            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                                <CardHeader className="border-b border-white/10 pb-5">
                                    <div>
                                        <CardTitle className="text-white">Top room performers</CardTitle>
                                        <CardDescription className="text-white/58">
                                            Rooms contributing the strongest settled revenue.
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-6">
                                    {topRooms.length > 0 ? topRooms.map((room, index) => (
                                        <div key={`${room.name}-${index}`} className="flex items-center gap-4 rounded-[1.5rem] border border-white/10 bg-black/15 p-4">
                                            {room.image ? (
                                                <Image
                                                    src={room.image}
                                                    alt={room.name}
                                                    width={64}
                                                    height={64}
                                                    className="size-16 rounded-2xl object-cover"
                                                />
                                            ) : (
                                                <div className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary">
                                                    <Hotel className="size-5" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium text-white">{room.name}</p>
                                                        <p className="text-sm text-white/45">{room.type}</p>
                                                    </div>
                                                    <span className="text-xs uppercase tracking-[0.22em] text-primary">
                                                        #{index + 1}
                                                    </span>
                                                </div>
                                                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                                                    <span className="text-white/55">{room.bookings} bookings</span>
                                                    <span className="font-medium text-white">{formatCompactCurrency(room.revenue)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/15 p-8 text-sm text-white/55">
                                            Top room performance will appear after settled bookings are available.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border border-white/10 bg-white/[0.04] text-white ring-0">
                                <CardHeader>
                                    <div>
                                        <CardTitle className="text-white">Daily pulse</CardTitle>
                                        <CardDescription className="text-white/58">
                                            Quick read on what matters today.
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/38">Arrivals today</p>
                                        <p className="mt-3 text-3xl font-semibold text-white">{arrivalsToday.length}</p>
                                        <p className="mt-2 text-sm text-white/55">
                                            Guests that need readiness for the next check-in window.
                                        </p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/38">Active in-house stays</p>
                                        <p className="mt-3 text-3xl font-semibold text-white">{activeStays.length}</p>
                                        <p className="mt-2 text-sm text-white/55">
                                            Guests currently checked in and moving through operations.
                                        </p>
                                    </div>
                                    <div className="rounded-[1.5rem] border border-white/10 bg-black/15 p-4">
                                        <p className="text-xs uppercase tracking-[0.22em] text-white/38">Closed outcomes</p>
                                        <p className="mt-3 text-3xl font-semibold text-white">{completedOrClosed.length}</p>
                                        <p className="mt-2 text-sm text-white/55">
                                            Completed, expired, and refunded reservations in the current dataset.
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}
