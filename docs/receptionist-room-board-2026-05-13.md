# Receptionist Room Board - 2026-05-13

## Tujuan

Membuat halaman terpisah untuk resepsionis di `/receptionist`.
Halaman ini hanya boleh diakses oleh role `admin` dan `receptionist`.
Admin juga tetap bisa mengakses dashboard admin di `/admin`.

## Fitur

- Ringkasan ketersediaan unit kamar berdasarkan status.
- Daftar unit kamar dengan nomor kamar, lantai, tipe kamar, harga, kapasitas, tamu, email, tanggal check-in/check-out, catatan, dan status.
- Status dapat diubah langsung dari tabel.
- Link halaman resepsionis ditambahkan ke dropdown akun yang sama dengan Profil, Dashboard Admin, dan Logout.

## Status Unit Kamar

- `AVAILABLE`: Kosong
- `OCCUPIED`: Terisi
- `MAINTENANCE`: Maintenance
- `CLEANING`: Dibersihkan
- `RESERVED`: Reservasi

## Database

Schema target ada di `supabase_receptionist_room_units.sql`.
Tabel baru: `public.room_units`.

Tabel `rooms` tetap menjadi katalog/tipe kamar.
Tabel `room_units` menyimpan unit fisik kamar, masing-masing 5 unit per baris aktif di `rooms`.

Kolom penting:

- `room_id`: referensi ke `rooms.id`
- `unit_number`: nomor unit kamar
- `floor`: lantai
- `status`: status operasional unit
- `current_guest_name`, `current_guest_email`: data tamu aktif
- `check_in`, `check_out`: tanggal inap
- `notes`: catatan resepsionis

## Catatan MCP

Supabase MCP sudah digunakan untuk membaca schema live dengan `list_tables`.
Percobaan `apply_migration` gagal karena project MCP berada dalam read-only mode:

`Cannot apply migration in read-only mode.`

Karena itu migrasi disimpan sebagai file SQL repo. Jalankan isi `supabase_receptionist_room_units.sql` di Supabase SQL Editor atau Supabase CLI agar halaman live memiliki tabel dan seed data.

## File Utama

- `src/app/receptionist/page.tsx`
- `src/components/receptionist/ReceptionistRoomBoard.tsx`
- `src/app/api/receptionist/room-units/[id]/route.ts`
- `src/components/Navbar.tsx`
- `src/lib/auth.ts`
- `src/lib/adminApi.ts`
- `src/types/supabase.ts`
- `supabase_receptionist_room_units.sql`
