"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fetchAdmin } from "@/lib/adminFetch";
import { formatPaymentType } from "@/lib/transactions";

type AdminRoom = {
  id: string;
  name: string;
  type: string;
  base_price: number;
  deleted_at: string | null;
};

type AdminBooking = {
  id: string;
  user_id: string | null;
  room_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  special_requests: string | null;
  check_in: string;
  check_out: string;
  total_price: number;
  status: BookingStatus | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  transactions?: Array<{ payment_type: string | null }> | null;
};

type BookingStatus =
  | "UNPAID"
  | "PAID"
  | "EXPIRED";

type BookingFormState = {
  id?: string;
  user_id: string;
  room_id: string;
  first_name: string;
  last_name: string;
  email: string;
  special_requests: string;
  check_in: string;
  check_out: string;
  total_price: string;
  status: BookingStatus;
};

type BookingsResponse = {
  bookings: AdminBooking[];
};

type RoomsResponse = {
  rooms: AdminRoom[];
};

const statusOptions: BookingStatus[] = [
  "UNPAID",
  "PAID",
  "EXPIRED",
];

const emptyForm: BookingFormState = {
  user_id: "",
  room_id: "",
  first_name: "",
  last_name: "",
  email: "",
  special_requests: "",
  check_in: "",
  check_out: "",
  total_price: "",
  status: "UNPAID",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value.includes("T") ? value : `${value}T00:00:00`));
}

function toPayload(form: BookingFormState) {
  return {
    user_id: form.user_id.trim() || null,
    room_id: form.room_id,
    first_name: form.first_name,
    last_name: form.last_name || null,
    email: form.email,
    special_requests: form.special_requests || null,
    check_in: form.check_in,
    check_out: form.check_out,
    total_price: Number(form.total_price),
    status: form.status,
  };
}

function getGuestName(booking: AdminBooking) {
  return `${booking.first_name ?? ""} ${booking.last_name ?? ""}`.trim() || booking.email || "Guest";
}

export function BookingManagementPanel() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [form, setForm] = useState<BookingFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );
  const editingBooking = bookings.find((booking) => booking.id === form.id) ?? null;

  const loadBookings = () => {
    startTransition(async () => {
      setError(null);

      try {
        const [bookingsResponse, roomsResponse] = await Promise.all([
          fetchAdmin("/api/admin/bookings"),
          fetchAdmin("/api/admin/rooms"),
        ]);
        const bookingsResult = (await bookingsResponse.json()) as BookingsResponse & { error?: string };
        const roomsResult = (await roomsResponse.json()) as RoomsResponse & { error?: string };

        if (!bookingsResponse.ok) {
          setError(bookingsResult.error ?? "Failed to load bookings.");
          return;
        }

        if (!roomsResponse.ok) {
          setError(roomsResult.error ?? "Failed to load rooms.");
          return;
        }

        setBookings(bookingsResult.bookings ?? []);
        setRooms(roomsResult.rooms ?? []);
        setForm((prev) => ({
          ...prev,
          room_id: prev.room_id || roomsResult.rooms?.find((room) => !room.deleted_at)?.id || "",
        }));
      } catch {
        setError("Failed to load bookings.");
      }
    });
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      room_id: rooms.find((room) => !room.deleted_at)?.id ?? "",
    });
  };

  const saveBooking = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const payload = toPayload(form);
        const isEdit = Boolean(form.id);
        const response = await fetch(
          isEdit ? `/api/admin/bookings/${form.id}` : "/api/admin/bookings",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = (await response.json()) as { error?: string; booking?: AdminBooking };

        if (!response.ok || !result.booking) {
          setError(result.error ?? "Failed to save booking.");
          return;
        }

        setBookings((prev) =>
          isEdit
            ? prev.map((booking) => (booking.id === result.booking?.id ? result.booking : booking))
            : [result.booking!, ...prev],
        );
        setSuccess(isEdit ? "Booking diperbarui." : "Booking dibuat.");
        resetForm();
      } catch {
        setError("Failed to save booking.");
      }
    });
  };

  const archiveBooking = (bookingId: string) => {
    setActiveBookingId(bookingId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string; booking?: AdminBooking };

        if (!response.ok || !result.booking) {
          setError(result.error ?? "Failed to archive booking.");
          return;
        }

        setBookings((prev) =>
          prev.map((booking) => (booking.id === result.booking?.id ? result.booking : booking)),
        );
        setSuccess("Booking diarsipkan.");
      } catch {
        setError("Failed to archive booking.");
      } finally {
        setActiveBookingId(null);
      }
    });
  };

  const restoreBooking = (bookingId: string) => {
    setActiveBookingId(bookingId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/bookings/${bookingId}/restore`, { method: "POST" });
        const result = (await response.json()) as { error?: string; booking?: AdminBooking };

        if (!response.ok || !result.booking) {
          setError(result.error ?? "Failed to restore booking.");
          return;
        }

        setBookings((prev) =>
          prev.map((booking) => (booking.id === result.booking?.id ? result.booking : booking)),
        );
        setSuccess("Booking dipulihkan.");
      } catch {
        setError("Failed to restore booking.");
      } finally {
        setActiveBookingId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-black/16 p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary/70">
              {editingBooking ? "Edit booking" : "Tambah booking"}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-white">
              {editingBooking ? `#${editingBooking.id.slice(0, 8)}` : "Reservasi manual"}
            </h3>
          </div>
          {editingBooking ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              Batal
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Kamar
            <select
              value={form.room_id}
              onChange={(event) => setForm((prev) => ({ ...prev, room_id: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            >
              <option value="" className="bg-slate-950 text-white">Pilih kamar</option>
              {rooms.filter((room) => !room.deleted_at).map((room) => (
                <option key={room.id} value={room.id} className="bg-slate-950 text-white">
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Check-in
            <input
              type="date"
              value={form.check_in}
              onChange={(event) => setForm((prev) => ({ ...prev, check_in: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Check-out
            <input
              type="date"
              value={form.check_out}
              onChange={(event) => setForm((prev) => ({ ...prev, check_out: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Status
            <select
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as BookingStatus }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status} className="bg-slate-950 text-white">
                  {status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Nama depan
            <input
              value={form.first_name}
              onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Nama belakang
            <input
              value={form.last_name}
              onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Total
            <input
              type="number"
              min="0"
              value={form.total_price}
              onChange={(event) => setForm((prev) => ({ ...prev, total_price: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55 md:col-span-2">
            User ID
            <input
              value={form.user_id}
              onChange={(event) => setForm((prev) => ({ ...prev, user_id: event.target.value }))}
              placeholder="Kosongkan untuk booking manual tanpa akun"
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none placeholder:text-white/30 focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55 md:col-span-2">
            Catatan
            <input
              value={form.special_requests}
              onChange={(event) => setForm((prev) => ({ ...prev, special_requests: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveBooking}
            disabled={
              isPending ||
              !form.room_id ||
              !form.check_in ||
              !form.check_out ||
              !form.first_name ||
              !form.email ||
              !form.total_price
            }
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
          >
            {isPending ? "Menyimpan..." : editingBooking ? "Update Booking" : "Tambah Booking"}
          </button>
          <button
            type="button"
            onClick={loadBookings}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {bookings.map((booking) => {
          const room = booking.room_id ? roomMap.get(booking.room_id) : null;
          const isArchived = Boolean(booking.deleted_at);
          const isBusy = activeBookingId === booking.id;

          return (
            <div
              key={booking.id}
              className="grid gap-4 rounded-lg border border-white/10 bg-black/12 p-4 xl:grid-cols-[220px_minmax(0,1.1fr)_minmax(180px,0.7fr)_130px]"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: booking.id,
                      user_id: booking.user_id ?? "",
                      room_id: booking.room_id ?? "",
                      first_name: booking.first_name ?? "",
                      last_name: booking.last_name ?? "",
                      email: booking.email ?? "",
                      special_requests: booking.special_requests ?? "",
                      check_in: booking.check_in,
                      check_out: booking.check_out,
                      total_price: String(booking.total_price),
                      status: booking.status ?? "UNPAID",
                    })
                  }
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Edit
                </button>
                {isArchived ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => restoreBooking(booking.id)}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {isBusy ? "Memulihkan..." : "Restore"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => archiveBooking(booking.id)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                  >
                    {isBusy ? "Mengarsipkan..." : "Archive"}
                  </button>
                )}
                <span className="flex h-10 items-center text-sm font-medium text-white">
                  {formatCurrency(Number(booking.total_price ?? 0))}
                </span>
              </div>
              <div>
                <p className="font-medium text-white">#{booking.id.slice(0, 8)} - {getGuestName(booking)}</p>
                <p className="mt-1 text-sm text-white/55">{booking.email ?? "Email kosong"}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-white/35">
                  <span>{room?.name ?? booking.room_id ?? "Kamar tidak tersedia"}</span>
                  <span>•</span>
                  <span>{formatPaymentType(booking.transactions?.[0]?.payment_type)}</span>
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Tanggal</p>
                <p className="mt-2 text-sm text-white">{formatDate(booking.check_in)}</p>
                <p className="text-xs text-white/45">sampai {formatDate(booking.check_out)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Status</p>
                <p className="mt-2 text-sm text-white">{booking.status ?? "UNPAID"}</p>
                <p className="mt-1 text-xs text-white/45">{isArchived ? "Archived" : "Visible"}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
