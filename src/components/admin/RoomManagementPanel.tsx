"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type AdminRoom = {
  id: string;
  name: string;
  type: string;
  base_price: number;
  capacity: number;
  images: string[];
  description: string | null;
  status: string | null;
  deleted_at: string | null;
  created_at: string | null;
};

type RoomsResponse = {
  rooms: AdminRoom[];
};

type RoomFormState = {
  id?: string;
  name: string;
  type: string;
  base_price: string;
  capacity: string;
  imagesText: string;
  description: string;
  status: "AVAILABLE" | "UNAVAILABLE";
};

const emptyForm: RoomFormState = {
  name: "",
  type: "",
  base_price: "",
  capacity: "2",
  imagesText: "",
  description: "",
  status: "AVAILABLE",
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
  }).format(new Date(value));
}

function toPayload(form: RoomFormState) {
  return {
    name: form.name,
    type: form.type,
    base_price: Number(form.base_price),
    capacity: Number(form.capacity),
    images: form.imagesText
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    description: form.description.trim() || null,
    status: form.status,
  };
}

export function RoomManagementPanel() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [form, setForm] = useState<RoomFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingRoom = useMemo(
    () => rooms.find((room) => room.id === form.id) ?? null,
    [form.id, rooms],
  );

  const loadRooms = () => {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/admin/rooms", { cache: "no-store" });
        const result = (await response.json()) as RoomsResponse & { error?: string };

        if (!response.ok) {
          setError(result.error ?? "Failed to load rooms.");
          return;
        }

        setRooms(result.rooms ?? []);
      } catch {
        setError("Failed to load rooms.");
      }
    });
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const saveRoom = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const payload = toPayload(form);
        const isEdit = Boolean(form.id);
        const response = await fetch(
          isEdit ? `/api/admin/rooms/${form.id}` : "/api/admin/rooms",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = (await response.json()) as { error?: string; room?: AdminRoom };

        if (!response.ok || !result.room) {
          setError(result.error ?? "Failed to save room.");
          return;
        }

        setRooms((prev) => {
          if (!isEdit) {
            return [result.room!, ...prev];
          }

          return prev.map((room) => (room.id === result.room?.id ? result.room : room));
        });
        setSuccess(isEdit ? "Room updated successfully." : "Room created successfully.");
        resetForm();
      } catch {
        setError("Failed to save room.");
      }
    });
  };

  const softDeleteRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/rooms/${roomId}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string; room?: AdminRoom };

        if (!response.ok || !result.room) {
          setError(result.error ?? "Failed to archive room.");
          setActiveRoomId(null);
          return;
        }

        setRooms((prev) => prev.map((room) => (room.id === result.room?.id ? result.room : room)));
        setSuccess("Room archived successfully.");
      } catch {
        setError("Failed to archive room.");
      } finally {
        setActiveRoomId(null);
      }
    });
  };

  const restoreRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/rooms/${roomId}/restore`, { method: "POST" });
        const result = (await response.json()) as { error?: string; room?: AdminRoom };

        if (!response.ok || !result.room) {
          setError(result.error ?? "Failed to restore room.");
          setActiveRoomId(null);
          return;
        }

        setRooms((prev) => prev.map((room) => (room.id === result.room?.id ? result.room : room)));
        setSuccess("Room restored successfully.");
      } catch {
        setError("Failed to restore room.");
      } finally {
        setActiveRoomId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {success}
        </div>
      ) : null}

      <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-primary/70">
              {editingRoom ? "Edit room" : "Create room"}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-white">
              {editingRoom ? editingRoom.name : "Add a new room"}
            </h3>
          </div>
          {editingRoom ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
            Type
            <input
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
            Base Price
            <input
              type="number"
              min="0"
              value={form.base_price}
              onChange={(event) => setForm((prev) => ({ ...prev, base_price: event.target.value }))}
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
            Capacity
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))}
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55 md:col-span-2">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as "AVAILABLE" | "UNAVAILABLE",
                }))
              }
              className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            >
              <option value="AVAILABLE" className="bg-slate-950 text-white">AVAILABLE</option>
              <option value="UNAVAILABLE" className="bg-slate-950 text-white">UNAVAILABLE</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55 md:col-span-2">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55 md:col-span-2">
            Images
            <textarea
              value={form.imagesText}
              onChange={(event) => setForm((prev) => ({ ...prev, imagesText: event.target.value }))}
              rows={4}
              placeholder="One image URL per line"
              className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveRoom}
            disabled={isPending}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
          >
            {isPending ? "Saving..." : editingRoom ? "Update Room" : "Create Room"}
          </button>
          <button
            type="button"
            onClick={loadRooms}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {rooms.map((room) => {
          const isArchived = Boolean(room.deleted_at);
          const isBusy = activeRoomId === room.id;

          return (
            <div
              key={room.id}
              className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-[minmax(0,1.1fr)_140px_160px_220px]"
            >
              <div>
                <p className="font-medium text-white">{room.name}</p>
                <p className="mt-1 text-sm text-white/55">
                  {room.type} • {room.capacity} guests • {formatCurrency(Number(room.base_price))}
                </p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
                  Created {formatDate(room.created_at)}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Status</p>
                <p className="mt-2 text-sm text-white">{room.status ?? "AVAILABLE"}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Visibility</p>
                <p className="mt-2 text-sm text-white">{isArchived ? "Archived" : "Visible"}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: room.id,
                      name: room.name,
                      type: room.type,
                      base_price: String(room.base_price),
                      capacity: String(room.capacity),
                      imagesText: room.images.join("\n"),
                      description: room.description ?? "",
                      status: room.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
                    })
                  }
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
                >
                  Edit
                </button>
                {isArchived ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => restoreRoom(room.id)}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
                  >
                    {isBusy ? "Restoring..." : "Restore"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => softDeleteRoom(room.id)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-60"
                  >
                    {isBusy ? "Archiving..." : "Archive"}
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
