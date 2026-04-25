# Aura Hotel Web

Project reservasi hotel berbasis Next.js dengan integrasi Supabase, Midtrans, Resend, dan `shadcn/ui`.

## Stack
- Next.js App Router
- Supabase Auth + Postgres + RLS
- Midtrans Snap + webhook server-side
- Tailwind CSS + `shadcn/ui`

## Environment
Salin `.env.example` ke `.env.local`, lalu isi semua value yang dibutuhkan.

Env wajib:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `MIDTRANS_SERVER_KEY`
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION` (opsional; `false` untuk sandbox, `true` untuk live)

Catatan penting:
- `SUPABASE_SERVICE_ROLE_KEY` wajib untuk route `src/app/api/webhook/midtrans/route.ts`, karena webhook datang tanpa user session dan harus bypass RLS.
- Jangan pernah expose `SUPABASE_SERVICE_ROLE_KEY` ke client.
- Vercel selalu menjalankan build/runtime sebagai production, jadi mode Midtrans tidak boleh bergantung pada `NODE_ENV`. Aplikasi otomatis memakai sandbox jika key diawali `SB-Mid-*`; gunakan `MIDTRANS_IS_PRODUCTION=true` hanya saat key Midtrans sudah live.
- 2FA authenticator app wajib untuk semua login. Untuk implementasi minimal ini, secret TOTP disimpan di metadata user Supabase dan challenge 2FA ditandatangani memakai secret server-side yang sudah ada.

## Local Development
```bash
npm install
npm run dev
```

Audit live Supabase dari env aktif:
```bash
npm run audit:supabase
```

Backup tabel legacy yang masih terisi sebelum cleanup:
```bash
npm run backup:legacy-supabase
```

Backfill transaksi untuk booking lama yang belum punya row `transactions`:
```bash
npm run backfill:transactions
```

## Setup Supabase
Jalankan SQL melalui Supabase SQL Editor dengan urutan berikut:

1. `supabase_setup.sql`
2. `supabase_reconcile.sql`
3. `supabase_seed.sql`
4. `supabase_cleanup_legacy.sql` jika ingin membersihkan tabel schema lama

Tujuan tiap file:
- `supabase_setup.sql`: bootstrap schema utama, trigger, cron, dan policy default.
- `supabase_reconcile.sql`: script aman untuk rerun di project aktif agar trigger, backfill profile, function harga, cron, dan policy tetap sinkron dengan codebase.
- `supabase_seed.sql`: seed kamar dan contoh promote staff.
- `supabase_cleanup_legacy.sql`: backup ke schema `archive` dan drop tabel/view legacy yang tidak dipakai code aktif.

Objek schema yang dipakai codebase aktif:
- `profiles`
- `rooms`
- `room_rates`
- `bookings`
- `transactions`
- `audit_logs`

Objek legacy yang terdeteksi tidak dipakai code aktif:
- kosong dan aman dibersihkan lebih dulu: `hotel`, `kamar`, `notifikasi`, `pembayaran`, `reservasi`, `v_active_hotels`
- masih berisi data legacy, jadi hanya diarsipkan dulu: `pengguna`, `reservations`

## Promote Admin atau Receptionist
Setelah user target selesai registrasi dan row `profiles` sudah ada, jalankan salah satu query yang ada di `supabase_seed.sql` atau `supabase_reconcile.sql`:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
    SELECT id
    FROM auth.users
    WHERE email = 'admin@your-domain.com'
);
```

Role resmi yang dipakai aplikasi:
- `guest`
- `admin`
- `receptionist`

## Kontrak Integrasi Supabase
- Redirect pasca-auth membaca `public.profiles.role`, bukan `user_metadata.role`.
- Setiap user auth harus punya row di `public.profiles`.
- Guest boleh:
  - insert booking milik sendiri
  - view booking milik sendiri
  - cancel booking milik sendiri yang masih `UNPAID`
- Staff (`admin` / `receptionist`) boleh view/update semua booking dan memproses refund secara server-side.
- Webhook Midtrans menyimpan `transactions.midtrans_order_id` sebagai Midtrans `order_id`, yang sama dengan `bookings.id`.
- Booking yang gagal dibayar atau dibatalkan tidak lagi dihapus; status diubah agar histori transaksi tetap tersimpan.

## Sinkronisasi Type Supabase
File `src/types/supabase.ts` adalah snapshot schema aplikasi saat ini dan sudah mencakup:
- `rooms`
- `room_rates`
- `profiles`
- `bookings`
- `transactions`
- `audit_logs`
- function `get_dynamic_price`

Jika schema live berubah lagi, regenerate type dan sinkronkan file ini sebelum merge perubahan yang menyentuh query Supabase.
Schema live yang saat ini sudah saya audit memakai struktur:
- `room_rates(room_id, rate_date, price)`
- `audit_logs(..., performed_by, created_at)`

## Post-deploy Checklist
- Auth:
  - guest login/password masuk ke area non-admin
  - staff login diarahkan ke `/admin`
  - semua login melewati `/verify-2fa` dan verifikasi kode dari aplikasi authenticator sebelum membuka route terlindungi
  - user baru atau user lama tanpa secret diarahkan ke setup QR code terlebih dahulu
  - protected route redirect ke `/login?redirect=...`
- Profiles:
  - signup user baru otomatis membuat row `profiles`
  - user lama tanpa profile sudah ter-backfill
- Bookings / RLS:
  - guest hanya melihat booking sendiri
  - guest bisa cancel booking `UNPAID`
  - staff bisa melihat dan mengubah semua booking
- Webhook:
  - Payment Notification URL di dashboard Midtrans mengarah ke `/api/webhook/midtrans`
  - signature Midtrans valid diproses
  - status booking berubah sesuai notifikasi
  - row `transactions` ter-upsert dengan `midtrans_order_id = order_id`
  - setiap booking punya row `transactions`
 - Cleanup legacy:
  - backup lokal `backups/supabase/...` berhasil dibuat
  - tabel `archive.pengguna_20260324` dan `archive.reservations_20260324` ada di Supabase
  - tabel/view kosong legacy sudah terhapus
- Build:
  - `npm run lint`
  - `npm exec tsc -- --noEmit`
  - `npm run build`
  - `npm run audit:supabase`

## Catatan Operasional
- Checkout sekarang meminta quote server-side dari Supabase agar subtotal, pajak, dan total yang tampil sama dengan nilai yang diproses saat pembuatan booking.
- `room_rates` dan function `get_dynamic_price` sudah aktif di schema live dan ikut dipakai dalam flow quote/booking.
- Jika ingin audit project Supabase live, gunakan `supabase_reconcile.sql`, `supabase_cleanup_legacy.sql`, dan script verifikasi yang sudah disediakan di repo.
