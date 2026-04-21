-- Cleanup schema legacy yang tidak lagi dipakai codebase aktif.
-- Jalankan di Supabase SQL Editor setelah memverifikasi backup lokal sudah ada.
-- Tahap 1 aman: backup tabel legacy yang masih berisi data + drop tabel/view kosong yang tidak dipakai.
-- Tahap 2 opsional: drop tabel legacy yang masih berisi data, hanya setelah archive diverifikasi.

BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

-- Snapshot data legacy yang masih berisi row.
DROP TABLE IF EXISTS archive.pengguna_20260324;
CREATE TABLE archive.pengguna_20260324 AS
SELECT *, NOW() AS archived_at
FROM public.pengguna;

DROP TABLE IF EXISTS archive.reservations_20260324;
CREATE TABLE archive.reservations_20260324 AS
SELECT *, NOW() AS archived_at
FROM public.reservations;

-- Bersihkan objek kosong yang tidak dipakai aplikasi aktif.
-- Urutan drop dimulai dari child table agar FK legacy seperti kamar -> hotel
-- tidak memblokir proses cleanup.
DROP VIEW IF EXISTS public.v_active_hotels;

DROP TABLE IF EXISTS public.notifikasi;
DROP TABLE IF EXISTS public.pembayaran;
DROP TABLE IF EXISTS public.reservasi;
DROP TABLE IF EXISTS public.kamar;
DROP TABLE IF EXISTS public.hotel;

COMMIT;

-- Tahap 2: opsional, jalankan terpisah setelah Anda memverifikasi archive.* dan yakin
-- tidak ada integrasi luar yang masih memakai schema lama.
--
-- BEGIN;
-- DROP TABLE IF EXISTS public.pengguna;
-- DROP TABLE IF EXISTS public.reservations;
-- COMMIT;
