"use client";

import { useEffect, useState, useTransition } from "react";

type AdminUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  created_at: string | null;
};

type UsersResponse = {
  users: AdminUser[];
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function UserRoleManagementPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadUsers = () => {
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        const result = (await response.json()) as UsersResponse & { error?: string };

        if (!response.ok) {
          setError(result.error ?? "Failed to load users.");
          return;
        }

        setUsers(result.users ?? []);
      } catch {
        setError("Failed to load users.");
      }
    });
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const updateRole = (targetUserId: string, role: "guest" | "receptionist") => {
    setActiveUserId(targetUserId);
    startTransition(async () => {
      setError(null);

      try {
        const response = await fetch("/api/admin/users/role", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId, role }),
        });
        const result = (await response.json()) as { error?: string; user?: AdminUser };

        if (!response.ok || !result.user) {
          setError(result.error ?? "Failed to update role.");
          setActiveUserId(null);
          return;
        }

        setUsers((prev) =>
          prev.map((user) => (user.id === result.user?.id ? result.user : user)),
        );
      } catch {
        setError("Failed to update role.");
      } finally {
        setActiveUserId(null);
      }
    });
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {users.length === 0 && !isPending ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/55">
          No user profiles found.
        </div>
      ) : null}

      <div className="space-y-4">
        {users.map((user) => {
          const fullName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Guest";
          const isReceptionist = user.role === "receptionist";
          const isAdmin = user.role === "admin";
          const isBusy = activeUserId === user.id;

          return (
            <div
              key={user.id}
              className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:grid-cols-[minmax(0,1.2fr)_140px_140px_220px]"
            >
              <div>
                <p className="font-medium text-white">{fullName}</p>
                <p className="mt-1 text-sm text-white/55">{user.email}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.24em] text-white/38">
                  Joined {formatDate(user.created_at)}
                </p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Role</p>
                <p className="mt-2 text-sm text-white">{user.role ?? "guest"}</p>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">User ID</p>
                <p className="mt-2 break-all text-sm text-white/70">{user.id}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isAdmin || isReceptionist || isBusy}
                  onClick={() => updateRole(user.id, "receptionist")}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-40"
                >
                  {isBusy ? "Updating..." : "Promote to Receptionist"}
                </button>
                <button
                  type="button"
                  disabled={isAdmin || !isReceptionist || isBusy}
                  onClick={() => updateRole(user.id, "guest")}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06] disabled:opacity-40"
                >
                  Demote to Guest
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
