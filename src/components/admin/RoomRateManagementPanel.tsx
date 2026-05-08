"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type AdminRoom = {
  id: string;
  name: string | null;
  type: string | null;
  deleted_at: string | null;
};

type AdminRoomRate = {
  id: string;
  room_id: string | null;
  rate_date: string;
  price: number;
  deleted_at: string | null;
  created_at: string | null;
};

type RoomRatesResponse = {
  rates: AdminRoomRate[];
  rooms: AdminRoom[];
};

type RateFormState = {
  id?: string;
  room_id: string;
  rate_date: string;
  price: string;
};

const emptyForm: RateFormState = {
  room_id: "",
  rate_date: "",
  price: "",
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

function toPayload(form: RateFormState) {
  return {
    room_id: form.room_id,
    rate_date: form.rate_date,
    price: Number(form.price),
  };
}

export function RoomRateManagementPanel() {
  const [rates, setRates] = useState<AdminRoomRate[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [form, setForm] = useState<RateFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeRateId, setActiveRateId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roomMap = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );
  const editingRate = rates.find((rate) => rate.id === form.id) ?? null;

  const loadRates = () => {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/admin/room-rates", { cache: "no-store" });
        const result = (await response.json()) as RoomRatesResponse & { error?: string };

        if (!response.ok) {
          setError(result.error ?? "Failed to load room rates.");
          return;
        }

        setRates(result.rates ?? []);
        setRooms(result.rooms ?? []);
        setForm((prev) => ({
          ...prev,
          room_id: prev.room_id || result.rooms?.find((room) => !room.deleted_at)?.id || "",
        }));
      } catch {
        setError("Failed to load room rates.");
      }
    });
  };

  useEffect(() => {
    loadRates();
  }, []);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      room_id: rooms.find((room) => !room.deleted_at)?.id ?? "",
    });
  };

  const saveRate = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const payload = toPayload(form);
        const isEdit = Boolean(form.id);
        const response = await fetch(
          isEdit ? `/api/admin/room-rates/${form.id}` : "/api/admin/room-rates",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = (await response.json()) as { error?: string; rate?: AdminRoomRate };

        if (!response.ok || !result.rate) {
          setError(result.error ?? "Failed to save room rate.");
          return;
        }

        setRates((prev) =>
          isEdit
            ? prev.map((rate) => (rate.id === result.rate?.id ? result.rate : rate))
            : [result.rate!, ...prev],
        );
        setSuccess(isEdit ? "Harga harian diperbarui." : "Harga harian dibuat.");
        resetForm();
      } catch {
        setError("Failed to save room rate.");
      }
    });
  };

  const archiveRate = (rateId: string) => {
    setActiveRateId(rateId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/room-rates/${rateId}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string; rate?: AdminRoomRate };

        if (!response.ok || !result.rate) {
          setError(result.error ?? "Failed to archive room rate.");
          return;
        }

        setRates((prev) => prev.map((rate) => (rate.id === result.rate?.id ? result.rate : rate)));
        setSuccess("Harga harian diarsipkan.");
      } catch {
        setError("Failed to archive room rate.");
      } finally {
        setActiveRateId(null);
      }
    });
  };

  const restoreRate = (rateId: string) => {
    setActiveRateId(rateId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/room-rates/${rateId}/restore`, { method: "POST" });
        const result = (await response.json()) as { error?: string; rate?: AdminRoomRate };

        if (!response.ok || !result.rate) {
          setError(result.error ?? "Failed to restore room rate.");
          return;
        }

        setRates((prev) => prev.map((rate) => (rate.id === result.rate?.id ? result.rate : rate)));
        setSuccess("Harga harian dipulihkan.");
      } catch {
        setError("Failed to restore room rate.");
      } finally {
        setActiveRateId(null);
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
              {editingRate ? "Edit harga" : "Tambah harga"}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-white">
              {editingRate ? formatDate(editingRate.rate_date) : "Harga harian kamar"}
            </h3>
          </div>
          {editingRate ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              Batal
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
                  {room.name ?? room.type ?? room.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Tanggal
            <input
              type="date"
              value={form.rate_date}
              onChange={(event) => setForm((prev) => ({ ...prev, rate_date: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Harga
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveRate}
            disabled={isPending || !form.room_id || !form.rate_date || !form.price}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
          >
            {isPending ? "Menyimpan..." : editingRate ? "Update Harga" : "Tambah Harga"}
          </button>
          <button
            type="button"
            onClick={loadRates}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rates.map((rate) => {
          const room = rate.room_id ? roomMap.get(rate.room_id) : null;
          const isArchived = Boolean(rate.deleted_at);
          const isBusy = activeRateId === rate.id;

          return (
            <div
              key={rate.id}
              className="grid gap-4 rounded-lg border border-white/10 bg-black/12 p-4 lg:grid-cols-[minmax(0,1fr)_160px_140px_220px]"
            >
              <div>
                <p className="font-medium text-white">{room?.name ?? "Kamar tidak tersedia"}</p>
                <p className="mt-1 text-xs text-white/45">{rate.room_id}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Tanggal</p>
                <p className="mt-2 text-sm text-white">{formatDate(rate.rate_date)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Harga</p>
                <p className="mt-2 text-sm font-medium text-white">{formatCurrency(Number(rate.price))}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: rate.id,
                      room_id: rate.room_id ?? "",
                      rate_date: rate.rate_date,
                      price: String(rate.price),
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
                    onClick={() => restoreRate(rate.id)}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {isBusy ? "Memulihkan..." : "Restore"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => archiveRate(rate.id)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                  >
                    {isBusy ? "Mengarsipkan..." : "Archive"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
