"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";

type AuditLogEntry = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: unknown;
  new_data: unknown;
  performed_by: string | null;
  created_at: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
};

type AuditLogResponse = {
  logs: AuditLogEntry[];
};

const defaultFilters = {
  table_name: "",
  action: "",
  performed_by: "",
  dateFrom: "",
  dateTo: "",
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function getActorLabel(log: AuditLogEntry) {
  if (log.actor_name || log.actor_email) {
    return [log.actor_name, log.actor_email].filter(Boolean).join(" • ");
  }

  if (log.performed_by) {
    return log.performed_by;
  }

  return "System / Service";
}

export function AuditLogsPanel() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const loadLogs = (nextFilters = filters) => {
    startTransition(async () => {
      setError(null);

      try {
        const params = new URLSearchParams();

        for (const [key, value] of Object.entries(nextFilters)) {
          if (value) {
            params.set(key, value);
          }
        }

        const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
          cache: "no-store",
        });
        const result = (await response.json()) as AuditLogResponse & { error?: string };

        if (!response.ok) {
          setError(result.error ?? "Failed to load audit logs.");
          return;
        }

        setLogs(result.logs ?? []);
      } catch {
        setError("Failed to load audit logs.");
      }
    });
  };

  useEffect(() => {
    loadLogs(defaultFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
          Table
          <input
            value={filters.table_name}
            onChange={(event) => setFilters((prev) => ({ ...prev, table_name: event.target.value }))}
            placeholder="bookings"
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
          Action
          <input
            value={filters.action}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
            placeholder="UPDATE"
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
          Actor
          <input
            value={filters.performed_by}
            onChange={(event) => setFilters((prev) => ({ ...prev, performed_by: event.target.value }))}
            placeholder="UUID actor"
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-white/55">
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
            className="h-11 rounded-xl border border-white/10 bg-black/20 px-4 text-sm tracking-normal text-white outline-none transition-colors focus:border-primary/40"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => loadLogs()}
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
        >
          <Search className="size-4" />
          {isPending ? "Loading..." : "Apply Filters"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFilters(defaultFilters);
            loadLogs(defaultFilters);
          }}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
        >
          Reset
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        {logs.length === 0 && !isPending ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/55">
            No audit logs matched the current filters.
          </div>
        ) : null}

        {logs.map((log) => (
          <details
            key={log.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <summary className="cursor-pointer list-none">
              <div className="grid gap-4 md:grid-cols-[180px_140px_minmax(0,1fr)_180px]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Time</p>
                  <p className="mt-2 text-sm text-white">{formatTimestamp(log.created_at)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Table</p>
                  <p className="mt-2 text-sm text-white">{log.table_name}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Actor</p>
                  <p className="mt-2 text-sm text-white">{getActorLabel(log)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Action</p>
                  <p className="mt-2 text-sm text-primary">{log.action}</p>
                </div>
              </div>
            </summary>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Record ID</p>
                <p className="mt-2 break-all text-sm text-white">{log.record_id}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Performed By</p>
                <p className="mt-2 break-all text-sm text-white">{log.performed_by ?? "System / Service"}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Old Data</p>
                <pre className="mt-2 overflow-x-auto text-xs leading-6 text-white/70">
                  {JSON.stringify(log.old_data, null, 2) ?? "null"}
                </pre>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">New Data</p>
                <pre className="mt-2 overflow-x-auto text-xs leading-6 text-white/70">
                  {JSON.stringify(log.new_data, null, 2) ?? "null"}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
