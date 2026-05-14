import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react";
import {
  ReceptionistRoomBoard,
  type ReceptionistRoomUnit,
  type RoomUnitStatus,
} from "@/components/receptionist/ReceptionistRoomBoard";
import {
  ensureConfiguredAdminProfile,
  getProfileForUser,
  hasAdminAccess,
  hasStaffAccess,
} from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/utils/supabase/server";
import { getSupabaseAdmin } from "@/utils/supabase/admin";

const roomUnitSelect = `
  id,
  room_id,
  unit_number,
  floor,
  status,
  current_guest_name,
  current_guest_email,
  check_in,
  check_out,
  notes,
  updated_at,
  rooms (
    id,
    name,
    type,
    base_price,
    capacity
  )
`;

function normalizeRoomUnit(unit: Record<string, unknown>): ReceptionistRoomUnit {
  const room = unit.rooms as ReceptionistRoomUnit["rooms"] | ReceptionistRoomUnit["rooms"][] | null;

  return {
    id: String(unit.id ?? ""),
    room_id: String(unit.room_id ?? ""),
    unit_number: String(unit.unit_number ?? ""),
    floor: Number(unit.floor ?? 1),
    status: String(unit.status ?? "AVAILABLE") as RoomUnitStatus,
    current_guest_name:
      typeof unit.current_guest_name === "string" ? unit.current_guest_name : null,
    current_guest_email:
      typeof unit.current_guest_email === "string" ? unit.current_guest_email : null,
    check_in: typeof unit.check_in === "string" ? unit.check_in : null,
    check_out: typeof unit.check_out === "string" ? unit.check_out : null,
    notes: typeof unit.notes === "string" ? unit.notes : null,
    updated_at: typeof unit.updated_at === "string" ? unit.updated_at : null,
    rooms: Array.isArray(room) ? (room[0] ?? null) : room,
  };
}

export default async function ReceptionistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/receptionist");
  }

  const supabaseAdmin = getSupabaseAdmin();
  let profile = await getProfileForUser(supabase, user.id);

  if (!hasStaffAccess(profile?.role, user.email)) {
    redirect("/");
  }

  profile = await ensureConfiguredAdminProfile(supabaseAdmin, user, profile);
  const canOpenAdminDashboard = hasAdminAccess(profile?.role, user.email);

  const { data, error } = await supabaseAdmin
    .from("room_units")
    .select(roomUnitSelect)
    .is("deleted_at", null)
    .order("floor", { ascending: true })
    .order("unit_number", { ascending: true });

  const units = ((data ?? []) as Record<string, unknown>[]).map(normalizeRoomUnit);
  const receptionistName =
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user.email?.split("@")[0] ||
    "Resepsionis";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_rgba(15,19,27,0.98)_0%,_rgba(9,12,18,1)_100%)] pb-16 pt-28 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6">
        <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.26)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 text-primary"
              >
                <ShieldCheck className="size-3.5" />
                Admin & Resepsionis
              </Badge>
              <div>
                <h1 className="font-serif text-3xl text-white sm:text-4xl">
                  Dashboard Resepsionis
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/62">
                  Pantau ketersediaan unit kamar, status operasional, detail tamu,
                  tanggal inap, harga, dan catatan kamar dari satu halaman kerja.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-white/10 bg-black/18 px-4 py-3 text-sm text-white/70">
                Masuk sebagai{" "}
                <span className="font-medium text-white">{receptionistName}</span>
              </div>
              {canOpenAdminDashboard ? (
                <Link
                  href="/admin"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-sm font-medium text-white transition-all hover:bg-white/[0.08]"
                >
                  Dashboard Admin
                  <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {error ? (
          <section className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-5 text-amber-50">
            <div className="flex gap-3">
              <ClipboardList className="mt-0.5 size-5 shrink-0" />
              <div>
                <h2 className="font-medium">Data unit kamar belum tersedia</h2>
                <p className="mt-2 text-sm leading-6 text-amber-50/78">
                  Jalankan SQL pada <span className="font-mono">supabase_receptionist_room_units.sql</span>{" "}
                  untuk membuat tabel <span className="font-mono">room_units</span> dan seed 5
                  unit per kamar. Pesan database: {error.message}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <ReceptionistRoomBoard initialUnits={units} />
        )}
      </div>
    </main>
  );
}
