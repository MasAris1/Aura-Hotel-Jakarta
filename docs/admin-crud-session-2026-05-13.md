# Admin CRUD Session - 2026-05-13

## Tujuan

Memperbaiki kegagalan CRUD admin untuk suites dan facilities, terutama:

- Edit facilities dan suites dari halaman utama gagal.
- Dashboard admin gagal load users, bookings, rooms, dan room rates karena API 500.
- Data statis homepage perlu disinkronkan ke Supabase agar bisa diedit dan update di database.

## Temuan Utama

Project Supabase live: `https://ajbwbmlmikttytnczrpj.supabase.co`.

MCP Supabase berhasil dipakai untuk audit read-only. Tool MCP pada sesi ini berjalan dalam mode read-only, sehingga `ALTER TABLE` tidak bisa dieksekusi langsung dari MCP.

Schema live masih legacy dibanding tipe/kode aplikasi:

- `rooms` belum punya `type`, `capacity`, `images`, `status`, `updated_at`.
- `bookings` belum punya `deleted_at`.
- `profiles` belum punya `deleted_at`.
- `room_rates` belum punya `deleted_at`.
- `facilities` sudah ada, tetapi awalnya kosong dan ID database bertipe UUID, sedangkan katalog statis memakai slug seperti `skyline-fitness-club`.

Akibatnya request PostgREST gagal 400, lalu endpoint Next.js mengembalikan 500.

## Perubahan Kode

- Menambahkan panel fasilitas di dashboard admin:
  - `src/components/admin/FacilityManagementPanel.tsx`
  - create, update, archive, restore.
- Menambahkan restore endpoint fasilitas:
  - `src/app/api/admin/facilities/[id]/restore/route.ts`
- Membuat API admin lebih tahan terhadap schema legacy:
  - rooms, bookings, users, room-rates sekarang membaca `select("*")`/fallback dan menormalisasi field yang belum ada.
  - beberapa filter `.is("deleted_at", null)` dihapus dari jalur yang harus tetap jalan pada schema legacy.
  - archive/restore akan fallback terbatas bila kolom `deleted_at` belum ada.
- Homepage facilities sekarang membaca Supabase melalui `/api/facilities`.
- Facilities statis yang sudah disinkronkan ke DB dicegah agar tidak tampil dobel dengan fallback statis.
- Admin owner email `aris.maulana.am57@gmail.com` tetap dipastikan sebagai admin profile saat server melihat user tersebut.

## File Baru Penting

- `supabase_admin_crud_schema_patch.sql`
  - SQL patch untuk menyamakan schema live dengan fitur CRUD penuh.
  - Harus dijalankan di Supabase SQL Editor untuk soft delete penuh dan edit semua field suite.
- `scripts/sync-static-catalogs-to-live.mjs`
  - Sinkronisasi data statis suites dan facilities ke Supabase memakai `SUPABASE_SERVICE_ROLE_KEY`.
- `docs/admin-crud-session-2026-05-13.md`
  - Dokumentasi sesi ini.

## Command yang Sudah Dijalankan

```bash
npm run audit:supabase
node scripts/sync-static-catalogs-to-live.mjs
npm run lint
npm run build
```

Hasil sinkronisasi katalog:

- Suites tersinkron: 5
- Facilities tersinkron: 6

Hasil verifikasi:

- `npm run lint`: berhasil
- `npm run build`: berhasil

Audit Supabase terakhir sempat gagal sebagian karena `ECONNRESET` dari Auth API, tetapi MCP SQL read-only mengonfirmasi:

- `facilities`: 6
- `rooms`: 10
- `bookings`: 47
- `room_rates`: 155

## Langkah Lanjutan yang Disarankan

Jalankan `supabase_admin_crud_schema_patch.sql` di Supabase SQL Editor agar fitur CRUD admin lengkap:

- soft delete users/bookings/room_rates aktif via `deleted_at`
- suites bisa menyimpan `type`, `capacity`, `images`, `status`, `updated_at`
- facilities mendapat `slug` unik untuk identitas katalog statis

Setelah SQL patch dijalankan, jalankan ulang:

```bash
npm run sync:catalogs-live
npm run audit:supabase
```

Catatan: sebelum SQL patch dijalankan, aplikasi sudah tidak seharusnya 500 untuk load admin, tetapi beberapa field suite yang belum punya kolom database belum bisa persist penuh di Supabase.

## Update 2026-05-14 - Intermittent 401 Admin API

User melaporkan request admin seperti `/api/admin/users`, `/api/admin/rooms`, `/api/admin/bookings`, dan `/api/admin/audit-logs` kadang mengembalikan `401 Unauthorized` secara acak di `npm run dev`, meskipun navbar masih menunjukkan user login. Polanya tidak hanya terjadi pada first load; setelah halaman lama dibuka pun bisa muncul. Refresh kadang membuat beberapa panel berhasil dan beberapa panel lain gagal.

Perubahan untuk menstabilkan auth admin API:

- `src/utils/supabase/middleware.ts`
  - Middleware tidak lagi melakukan auth gate langsung untuk `/api/admin/*` dan `/api/receptionist/*`.
  - Request API staff/admin dilewatkan ke route handler supaya tidak ada dua lapis `supabase.auth.getUser()` yang saling membuat hasil terlihat flapping saat banyak request paralel di dev.
- `src/lib/adminApi.ts`
  - `requireAdminApi()` dan `requireStaffApi()` sekarang melakukan retry pendek saat `supabase.auth.getUser()` belum mengembalikan user.
  - Validasi 2FA dipindahkan ke route guard API agar tetap aman setelah middleware melewati endpoint staff/admin.
  - Admin configured email tetap memakai `hasAdminAccess`, sehingga `aris.maulana.am57@gmail.com` tetap dianggap admin walaupun profile perlu disinkronkan.
- `src/lib/adminFetch.ts`
  - Helper client untuk request admin GET.
  - Mengirim `credentials: "same-origin"`, `cache: "no-store"`, dan retry pendek jika respons `401`.
- Panel admin yang memakai helper baru:
  - `UserRoleManagementPanel`
  - `BookingManagementPanel`
  - `RoomManagementPanel`
  - `RoomRateManagementPanel`
  - `FacilityManagementPanel`
  - `AuditLogsPanel`

Jika 401 masih muncul setelah perubahan ini, cek log server dari route handler API, bukan middleware, karena middleware sekarang sengaja tidak memutus `/api/admin/*`.
