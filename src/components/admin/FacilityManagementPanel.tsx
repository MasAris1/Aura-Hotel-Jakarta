"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchAdmin } from "@/lib/adminFetch";

type FacilityStatus = "AVAILABLE" | "UNAVAILABLE";

type AdminFacility = {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  image_url: string | null;
  status: FacilityStatus | null;
  sort_order: number | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FacilitiesResponse = {
  facilities: AdminFacility[];
};

type FacilityFormState = {
  id?: string;
  title: string;
  description: string;
  icon: string;
  image_url: string;
  status: FacilityStatus;
  sort_order: string;
};

const emptyForm: FacilityFormState = {
  title: "",
  description: "",
  icon: "concierge",
  image_url: "",
  status: "AVAILABLE",
  sort_order: "999",
};

const iconOptions = [
  { value: "fitness", label: "Fitness" },
  { value: "pool", label: "Pool" },
  { value: "view", label: "City View" },
  { value: "restaurant", label: "Restaurant" },
  { value: "spa", label: "Spa" },
  { value: "concierge", label: "Concierge" },
];

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function toPayload(form: FacilityFormState) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    icon: form.icon.trim() || "concierge",
    image_url: form.image_url.trim() || null,
    status: form.status,
    sort_order: form.sort_order.trim() ? Number(form.sort_order) : null,
  };
}

export function FacilityManagementPanel() {
  const [facilities, setFacilities] = useState<AdminFacility[]>([]);
  const [form, setForm] = useState<FacilityFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingFacility = facilities.find((facility) => facility.id === form.id) ?? null;

  const loadFacilities = () => {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetchAdmin("/api/admin/facilities");
        const result = (await response.json()) as FacilitiesResponse & { error?: string };

        if (!response.ok) {
          setError(result.error ?? "Failed to load facilities.");
          return;
        }

        setFacilities(result.facilities ?? []);
      } catch {
        setError("Failed to load facilities.");
      }
    });
  };

  useEffect(() => {
    loadFacilities();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
  };

  const saveFacility = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const isEdit = Boolean(form.id);
        const response = await fetch(
          isEdit ? `/api/admin/facilities/${form.id}` : "/api/admin/facilities",
          {
            method: isEdit ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toPayload(form)),
          },
        );
        const result = (await response.json()) as { error?: string; facility?: AdminFacility };

        if (!response.ok || !result.facility) {
          setError(result.error ?? "Failed to save facility.");
          return;
        }

        setFacilities((prev) =>
          isEdit
            ? prev.map((facility) =>
                facility.id === result.facility?.id ? result.facility : facility,
              )
            : [result.facility!, ...prev],
        );
        setSuccess(isEdit ? "Fasilitas diperbarui." : "Fasilitas dibuat.");
        resetForm();
      } catch {
        setError("Failed to save facility.");
      }
    });
  };

  const archiveFacility = (facilityId: string) => {
    setActiveFacilityId(facilityId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/facilities/${facilityId}`, {
          method: "DELETE",
        });
        const result = (await response.json()) as { error?: string; facility?: AdminFacility };

        if (!response.ok || !result.facility) {
          setError(result.error ?? "Failed to archive facility.");
          return;
        }

        setFacilities((prev) =>
          prev.map((facility) =>
            facility.id === result.facility?.id ? result.facility : facility,
          ),
        );
        setSuccess("Fasilitas diarsipkan.");
      } catch {
        setError("Failed to archive facility.");
      } finally {
        setActiveFacilityId(null);
      }
    });
  };

  const restoreFacility = (facilityId: string) => {
    setActiveFacilityId(facilityId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/facilities/${facilityId}/restore`, {
          method: "POST",
        });
        const result = (await response.json()) as { error?: string; facility?: AdminFacility };

        if (!response.ok || !result.facility) {
          setError(result.error ?? "Failed to restore facility.");
          return;
        }

        setFacilities((prev) =>
          prev.map((facility) =>
            facility.id === result.facility?.id ? result.facility : facility,
          ),
        );
        setSuccess("Fasilitas dipulihkan.");
      } catch {
        setError("Failed to restore facility.");
      } finally {
        setActiveFacilityId(null);
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
              {editingFacility ? "Edit fasilitas" : "Tambah fasilitas"}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-white">
              {editingFacility?.title ?? "Fasilitas hotel"}
            </h3>
          </div>
          {editingFacility ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              Batal
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Nama fasilitas
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            URL gambar
            <input
              type="url"
              value={form.image_url}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, image_url: event.target.value }))
              }
              placeholder="https://..."
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40 placeholder:text-white/30"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Icon
            <select
              value={form.icon}
              onChange={(event) => setForm((prev) => ({ ...prev, icon: event.target.value }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            >
              {iconOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-950 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as FacilityStatus }))
              }
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            >
              <option value="AVAILABLE" className="bg-slate-950 text-white">
                Available
              </option>
              <option value="UNAVAILABLE" className="bg-slate-950 text-white">
                Unavailable
              </option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55 md:col-span-2">
            Deskripsi
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              rows={4}
              className="rounded-lg border border-white/10 bg-black/25 px-3 py-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Urutan
            <input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sort_order: event.target.value }))
              }
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveFacility}
            disabled={isPending || !form.title.trim() || !form.description.trim()}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
          >
            {isPending ? "Menyimpan..." : editingFacility ? "Update Fasilitas" : "Tambah Fasilitas"}
          </button>
          <button
            type="button"
            onClick={loadFacilities}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {facilities.map((facility) => {
          const isArchived = Boolean(facility.deleted_at);
          const isBusy = activeFacilityId === facility.id;

          return (
            <div
              key={facility.id}
              className="grid gap-4 rounded-lg border border-white/10 bg-black/12 p-4 lg:grid-cols-[220px_minmax(0,1fr)_150px_110px]"
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: facility.id,
                      title: facility.title,
                      description: facility.description,
                      icon: facility.icon ?? "concierge",
                      image_url: facility.image_url ?? "",
                      status: facility.status === "UNAVAILABLE" ? "UNAVAILABLE" : "AVAILABLE",
                      sort_order: String(facility.sort_order ?? 999),
                    })
                  }
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white transition-colors hover:bg-white/[0.07]"
                >
                  Edit
                </button>
                {isArchived ? (
                  <button
                    type="button"
                    onClick={() => restoreFacility(facility.id)}
                    disabled={isBusy}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 text-sm text-emerald-100 transition-colors hover:bg-emerald-300/15 disabled:opacity-60"
                  >
                    Pulihkan
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => archiveFacility(facility.id)}
                    disabled={isBusy}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-red-300/20 bg-red-500/10 px-3 text-sm text-red-100 transition-colors hover:bg-red-500/15 disabled:opacity-60"
                  >
                    Arsipkan
                  </button>
                )}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{facility.title}</p>
                  {isArchived ? (
                    <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-xs text-red-100">
                      Archived
                    </span>
                  ) : null}
                  {facility.status === "UNAVAILABLE" ? (
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">
                      Unavailable
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-white/58">{facility.description}</p>
                <p className="mt-2 text-xs text-white/38">{facility.image_url || "Tanpa URL gambar"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Icon</p>
                <p className="mt-2 text-sm text-white">{facility.icon ?? "concierge"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Urutan</p>
                <p className="mt-2 text-sm text-white">{facility.sort_order ?? 999}</p>
                <p className="mt-1 text-xs text-white/38">{formatDate(facility.created_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
