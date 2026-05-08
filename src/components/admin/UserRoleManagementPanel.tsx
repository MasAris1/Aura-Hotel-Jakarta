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
  deleted_at: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  is_current_user?: boolean;
};

type UsersResponse = {
  users: AdminUser[];
};

type UserFormState = {
  id?: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: AdminRole;
};

const emptyForm: UserFormState = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  role: "guest",
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

function toPayload(form: UserFormState) {
  return {
    email: form.email,
    password: form.password,
    first_name: form.first_name,
    last_name: form.last_name || null,
    role: form.role,
  };
}

export function UserRoleManagementPanel() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editingUser = users.find((user) => user.id === form.id) ?? null;
  const roleCounts = useMemo(
    () =>
      roleOptions.map((option) => ({
        ...option,
        count: users.filter((user) => !user.deleted_at && (user.role ?? "guest") === option.value).length,
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

  const resetForm = () => {
    setForm(emptyForm);
  };

  const saveUser = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const isEdit = Boolean(form.id);
        const response = await fetch(isEdit ? `/api/admin/users/${form.id}` : "/api/admin/users", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(form)),
        });
        const result = (await response.json()) as { error?: string; user?: AdminUser };

        if (!response.ok || !result.user) {
          setError(result.error ?? "Failed to save user.");
          return;
        }

        setUsers((prev) =>
          isEdit
            ? prev.map((user) => (user.id === result.user?.id ? result.user : user))
            : [result.user!, ...prev],
        );
        setSuccess(isEdit ? "User diperbarui." : "User dibuat.");
        resetForm();
      } catch {
        setError("Failed to save user.");
      }
    });
  };

  const archiveUser = (targetUserId: string) => {
    setActiveUserId(targetUserId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${targetUserId}`, { method: "DELETE" });
        const result = (await response.json()) as { error?: string; user?: AdminUser };

        if (!response.ok || !result.user) {
          setError(result.error ?? "Failed to archive user.");
          return;
        }

        setUsers((prev) => prev.map((user) => (user.id === result.user?.id ? result.user : user)));
        setSuccess(`${getFullName(result.user)} diarsipkan.`);
      } catch {
        setError("Failed to archive user.");
      } finally {
        setActiveUserId(null);
      }
    });
  };

  const restoreUser = (targetUserId: string) => {
    setActiveUserId(targetUserId);
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${targetUserId}/restore`, { method: "POST" });
        const result = (await response.json()) as { error?: string; user?: AdminUser };

        if (!response.ok || !result.user) {
          setError(result.error ?? "Failed to restore user.");
          return;
        }

        setUsers((prev) => prev.map((user) => (user.id === result.user?.id ? result.user : user)));
        setSuccess(`${getFullName(result.user)} dipulihkan.`);
      } catch {
        setError("Failed to restore user.");
      } finally {
        setActiveUserId(null);
      }
    });
  };

  return (
    <div className="space-y-6">
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

      <div className="rounded-lg border border-white/10 bg-black/16 p-5">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary/70">
              {editingUser ? "Edit user" : "Tambah user"}
            </p>
            <h3 className="mt-2 font-serif text-2xl text-white">
              {editingUser ? getFullName(editingUser) : "Akun admin baru"}
            </h3>
          </div>
          {editingUser ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
            >
              Batal
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={editingUser ? "Kosongkan jika tidak diganti" : "Minimal 8 karakter"}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none placeholder:text-white/30 focus:border-primary/40"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs uppercase tracking-[0.18em] text-white/55">
            Role
            <select
              value={form.role}
              disabled={editingUser?.is_current_user}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as AdminRole }))}
              className="h-11 rounded-lg border border-white/10 bg-black/25 px-3 text-sm tracking-normal text-white outline-none focus:border-primary/40 disabled:opacity-45"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-950 text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveUser}
            disabled={
              isPending ||
              !form.first_name ||
              !form.email ||
              (!editingUser && form.password.length < 8)
            }
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_16px_36px_rgba(198,155,73,0.35)] disabled:opacity-60"
          >
            {isPending ? "Menyimpan..." : editingUser ? "Update User" : "Tambah User"}
          </button>
          <button
            type="button"
            onClick={loadUsers}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-5 text-sm font-medium text-white transition-colors hover:bg-white/[0.06]"
          >
            Refresh
          </button>
        </div>
      </div>

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
        <div className="overflow-hidden rounded-lg border border-white/10">
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
                const isArchived = Boolean(user.deleted_at);

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
                      {isArchived ? (
                        <p className="mt-2 text-xs text-red-200">Archived</p>
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              id: user.id,
                              email: user.email,
                              password: "",
                              first_name: user.first_name ?? "",
                              last_name: user.last_name ?? "",
                              role: currentRole,
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
                            onClick={() => restoreUser(user.id)}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                          >
                            {isBusy ? "Memulihkan..." : "Restore"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy || user.is_current_user}
                            onClick={() => archiveUser(user.id)}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-45"
                          >
                            {isBusy ? "Mengarsipkan..." : "Archive"}
                          </button>
                        )}
                      </div>
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
