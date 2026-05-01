"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminRole = "admin" | "receptionist" | "guest";

type AdminUser = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_current_user?: boolean;
};

type UsersResponse = {
  users: AdminUser[];
};

const roleOptions: Array<{ value: AdminRole; label: string; description: string }> = [
  {
    value: "admin",
    label: "Admin",
    description: "Akses penuh dashboard admin",
  },
  {
    value: "receptionist",
    label: "Resepsionis",
    description: "Kelola operasional booking",
  },
  {
    value: "guest",
    label: "Guest",
    description: "Akses pelanggan biasa",
  },
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "Belum pernah login";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function getFullName(user: AdminUser) {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Guest";
}

function getRoleLabel(role: string | null) {
  return roleOptions.find((option) => option.value === role)?.label ?? "Guest";
}

function getRoleDescription(role: string | null) {
  return roleOptions.find((option) => option.value === role)?.description ?? "Akses pelanggan biasa";
}

function getRoleBadgeClassName(role: string | null) {
  if (role === "admin") {
    return "border-primary/25 bg-primary/12 text-primary";
  }

  if (role === "receptionist") {
    return "border-sky-300/20 bg-sky-300/10 text-sky-100";
  }

  return "border-white/12 bg-white/[0.04] text-white/72";
}

export function UserRoleManagementPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleCounts = useMemo(
    () =>
      roleOptions.map((option) => ({
        ...option,
        count: users.filter((user) => (user.role ?? "guest") === option.value).length,
      })),
    [users],
  );

  const loadUsers = useCallback(() => {
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
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const updateRole = (targetUserId: string, role: AdminRole) => {
    const targetUser = users.find((user) => user.id === targetUserId);

    if (!targetUser || targetUser.role === role) {
      return;
    }

    setActiveUserId(targetUserId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
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
          prev.map((user) =>
            user.id === result.user?.id
              ? {
                  ...user,
                  ...result.user,
                }
              : user,
          ),
        );
        setSuccess(`Role ${getFullName(targetUser)} diubah menjadi ${getRoleLabel(role)}.`);
      } catch {
        setError("Failed to update role.");
      } finally {
        setActiveUserId(null);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {roleCounts.map((item) => (
          <div
            key={item.value}
            className="rounded-lg border border-white/10 bg-black/16 p-4"
          >
            <Badge variant="outline" className={getRoleBadgeClassName(item.value)}>
              {item.label}
            </Badge>
            <p className="mt-3 text-2xl font-semibold text-white">{item.count}</p>
            <p className="mt-1 text-xs leading-5 text-white/48">{item.description}</p>
          </div>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      {users.length === 0 && !isPending ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/55">
          Tidak ada profil user.
        </div>
      ) : null}

      {users.length === 0 && isPending ? (
        <div className="rounded-lg border border-white/10 bg-black/15 p-5 text-sm text-white/55">
          Memuat data user...
        </div>
      ) : null}

      {users.length > 0 ? (
        <div className="rounded-lg border border-white/10">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-white/55">User</TableHead>
                <TableHead className="text-white/55">Role</TableHead>
                <TableHead className="text-white/55">Keterangan</TableHead>
                <TableHead className="text-white/55">Bergabung</TableHead>
                <TableHead className="text-white/55">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const currentRole = (user.role ?? "guest") as AdminRole;
                const isBusy = activeUserId === user.id;
                const isVerified = Boolean(user.email_confirmed_at);

                return (
                  <TableRow
                    key={user.id}
                    className="border-white/10 hover:bg-white/[0.03]"
                  >
                    <TableCell className="align-top">
                      <div className="flex min-w-[220px] flex-col">
                        <span className="font-medium text-white">{getFullName(user)}</span>
                        <span className="text-xs text-white/50">
                          {user.email || "Email tidak tersedia"}
                        </span>
                        <span className="mt-2 max-w-[220px] break-all text-[11px] text-white/35">
                          {user.id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant="outline"
                        className={getRoleBadgeClassName(currentRole)}
                      >
                        {getRoleLabel(currentRole)}
                      </Badge>
                      {user.is_current_user ? (
                        <p className="mt-2 text-xs text-primary">Akun Anda</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="min-w-[220px] space-y-1 text-sm">
                        <p className="text-white/72">{getRoleDescription(currentRole)}</p>
                        <p className="text-xs text-white/45">
                          {isVerified ? "Email terverifikasi" : "Email belum terverifikasi"}
                        </p>
                        <p className="text-xs text-white/45">
                          Login terakhir: {formatDateTime(user.last_sign_in_at)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-white/72">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell className="align-top">
                      <label className="sr-only" htmlFor={`role-${user.id}`}>
                        Ubah role {getFullName(user)}
                      </label>
                      <select
                        id={`role-${user.id}`}
                        value={currentRole}
                        disabled={isBusy || user.is_current_user}
                        onChange={(event) =>
                          updateRole(user.id, event.target.value as AdminRole)
                        }
                        className="h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition-colors focus:border-primary/40 disabled:opacity-45"
                      >
                        {roleOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            className="bg-slate-950 text-white"
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {isBusy ? (
                        <p className="mt-2 text-xs text-white/45">Menyimpan...</p>
                      ) : null}
                      {user.is_current_user ? (
                        <p className="mt-2 text-xs text-white/45">
                          Role akun sendiri tidak bisa diubah di sini.
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
