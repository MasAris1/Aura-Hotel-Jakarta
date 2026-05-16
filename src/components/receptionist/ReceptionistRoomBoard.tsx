"use client";

import { useMemo, useState } from "react";
import {
  BedDouble,
  Brush,
  CalendarClock,
  CircleSlash,
  Search,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RoomUnitStatus =
  | "AVAILABLE"
  | "OCCUPIED"
  | "MAINTENANCE"
  | "CLEANING"
  | "RESERVED";

export type ReceptionistRoomUnit = {
  id: string;
  room_id: string;
  unit_number: string;
  floor: number;
  status: RoomUnitStatus;
  current_guest_name: string | null;
  current_guest_email: string | null;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  updated_at: string | null;
  rooms: {
    id: string;
    name: string | null;
    type: string | null;
    base_price: number | null;
    capacity: number | null;
  } | null;
};

const statusOptions: Array<{
  value: RoomUnitStatus;
  label: string;
  tone: string;
  icon: typeof BedDouble;
}> = [
  {
    value: "AVAILABLE",
    label: "Kosong",
    tone: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/12 dark:text-emerald-100",
    icon: BedDouble,
  },
  {
    value: "OCCUPIED",
    label: "Terisi",
    tone: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/12 dark:text-sky-100",
    icon: CalendarClock,
  },
  {
    value: "MAINTENANCE",
    label: "Maintenance",
    tone: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-300/20 dark:bg-rose-300/12 dark:text-rose-100",
    icon: Wrench,
  },
  {
    value: "CLEANING",
    label: "Dibersihkan",
    tone: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/12 dark:text-amber-100",
    icon: Brush,
  },
  {
    value: "RESERVED",
    label: "Reservasi",
    tone: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:border-violet-300/20 dark:bg-violet-300/12 dark:text-violet-100",
    icon: CircleSlash,
  },
];

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
});

function getStatusOption(status: RoomUnitStatus) {
  return statusOptions.find((option) => option.value === status) ?? statusOptions[0];
}

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return "-";
  }

  const safeDate = new Date(`${dateValue}T00:00:00`);

  return Number.isNaN(safeDate.getTime()) ? dateValue : dateFormatter.format(safeDate);
}

function formatCurrency(value: number | null) {
  return currencyFormatter.format(Number(value ?? 0));
}

type ReceptionistRoomBoardProps = {
  initialUnits: ReceptionistRoomUnit[];
};

export function ReceptionistRoomBoard({ initialUnits }: ReceptionistRoomBoardProps) {
  const [roomUnits, setRoomUnits] = useState(initialUnits);
  const [statusFilter, setStatusFilter] = useState<"ALL" | RoomUnitStatus>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts = new Map<RoomUnitStatus, number>();

    statusOptions.forEach((option) => counts.set(option.value, 0));
    roomUnits.forEach((unit) => {
      counts.set(unit.status, (counts.get(unit.status) ?? 0) + 1);
    });

    return counts;
  }, [roomUnits]);

  const filteredUnits = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return roomUnits.filter((unit) => {
      const matchesStatus = statusFilter === "ALL" || unit.status === statusFilter;
      const searchable = [
        unit.unit_number,
        unit.rooms?.name,
        unit.rooms?.type,
        unit.current_guest_name,
        unit.current_guest_email,
        unit.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesStatus && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [roomUnits, searchTerm, statusFilter]);

  const handleStatusChange = async (unit: ReceptionistRoomUnit, nextStatus: RoomUnitStatus) => {
    if (unit.status === nextStatus) {
      return;
    }

    setPendingId(unit.id);
    setNotice(null);

    const response = await fetch(`/api/receptionist/room-units/${unit.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: nextStatus,
        current_guest_name: unit.current_guest_name,
        current_guest_email: unit.current_guest_email,
        check_in: unit.check_in,
        check_out: unit.check_out,
        notes: unit.notes,
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      roomUnit?: ReceptionistRoomUnit;
      error?: string;
    } | null;

    if (!response.ok || !payload?.roomUnit) {
      setPendingId(null);
      setNotice(payload?.error ?? "Status kamar gagal diperbarui.");
      return;
    }

    const updatedRoomUnit = payload.roomUnit;

    setRoomUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              ...updatedRoomUnit,
              rooms: updatedRoomUnit.rooms ?? item.rooms,
            }
          : item,
      ),
    );
    setPendingId(null);
    setNotice("Status kamar berhasil diperbarui.");
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {statusOptions.map((option) => {
          const Icon = option.icon;
          const count = statusCounts.get(option.value) ?? 0;

          return (
            <button
              type="button"
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={cn(
                "rounded-lg border bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.07]",
                statusFilter === option.value ? "border-primary/40" : "border-white/10",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className={option.tone}>
                  <Icon className="size-3.5" />
                  {option.label}
                </Badge>
                <span className="text-2xl font-semibold text-white">{count}</span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                {Math.round((count / Math.max(roomUnits.length, 1)) * 100)}% dari unit
              </p>
            </button>
          );
        })}
      </section>

      <section className="rounded-xl border border-white/10 bg-white/[0.04] text-white">
        <div className="flex flex-col gap-4 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-serif text-2xl text-white">Daftar unit kamar</h2>
            <p className="mt-1 text-sm text-white/58">
              {filteredUnits.length} dari {roomUnits.length} unit ditampilkan.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative block min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/42" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Cari kamar, tamu, email"
                className="h-10 w-full rounded-lg border border-white/10 bg-black/22 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-white/34 focus:border-primary/40"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "ALL" | RoomUnitStatus)}
              className="h-10 rounded-lg border border-white/10 bg-black/22 px-3 text-sm text-white outline-none transition-colors focus:border-primary/40"
            >
              <option value="ALL" className="bg-slate-950 text-white">
                Semua status
              </option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-950 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {notice ? (
          <div className="border-b border-white/10 px-4 py-3 text-sm text-white/70">
            {notice}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="w-44 text-white/55">Status</TableHead>
              <TableHead className="text-white/55">Unit</TableHead>
              <TableHead className="text-white/55">Tipe dan harga</TableHead>
              <TableHead className="text-white/55">Tamu</TableHead>
              <TableHead className="text-white/55">Tanggal</TableHead>
              <TableHead className="text-white/55">Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUnits.length > 0 ? (
              filteredUnits.map((unit) => {
                const statusOption = getStatusOption(unit.status);

                return (
                  <TableRow key={unit.id} className="border-white/10 hover:bg-white/[0.03]">
                    <TableCell className="w-44">
                      <div className="flex min-w-40 flex-col gap-2">
                        <Badge variant="outline" className={statusOption.tone}>
                          {statusOption.label}
                        </Badge>
                        <select
                          value={unit.status}
                          disabled={pendingId === unit.id}
                          onChange={(event) =>
                            void handleStatusChange(unit, event.target.value as RoomUnitStatus)
                          }
                          className="h-9 rounded-lg border border-white/10 bg-black/28 px-3 text-sm text-white outline-none transition-colors focus:border-primary/40 disabled:opacity-50"
                        >
                          {statusOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              className="bg-slate-950 text-white"
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-white">Kamar {unit.unit_number}</span>
                        <span className="text-xs text-white/45">Lantai {unit.floor}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-52 flex-col">
                        <span className="font-medium text-white">
                          {unit.rooms?.name ?? "Kamar"}
                        </span>
                        <span className="text-xs text-white/45">
                          {unit.rooms?.type ?? "Room"} - {unit.rooms?.capacity ?? 1} tamu -{" "}
                          {formatCurrency(unit.rooms?.base_price ?? null)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-44 flex-col">
                        <span className="text-white">
                          {unit.current_guest_name ?? "Belum ada tamu"}
                        </span>
                        <span className="text-xs text-white/45">
                          {unit.current_guest_email ?? "Email kosong"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-36 flex-col">
                        <span className="text-white">{formatDate(unit.check_in)}</span>
                        <span className="text-xs text-white/45">
                          sampai {formatDate(unit.check_out)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-white/64">
                      {unit.notes ?? "-"}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableCell colSpan={6} className="py-10 text-center text-white/48">
                  Tidak ada unit kamar yang cocok dengan filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
