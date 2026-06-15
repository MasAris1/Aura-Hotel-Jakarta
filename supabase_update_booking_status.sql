-- =====================================================================
-- SQL PATCH: PENYEDERHANAAN STATUS BOOKING & OTOMATISASI ROOM UNITS
-- Jalankan skrip ini di SQL Editor dashboard Supabase Anda.
-- =====================================================================

-- 1. Perbarui Constraint Double-Booking pada tabel bookings
--    Gunakan parameter daterange '[)' (inclusive-exclusive) dan batasi hanya untuk check_in >= '2026-05-25'
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_room_id_daterange_excl;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_room_id_daterange_excl
  EXCLUDE USING gist (
    room_id WITH =,
    daterange(check_in, check_out, '[)'::text) WITH &&
  )
  WHERE (check_in >= '2026-05-25' AND status <> 'EXPIRED' AND deleted_at IS NULL);

-- 2. Perbarui Cron Job Function: expire_unpaid_bookings_job()
CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- A. Ubah booking UNPAID yang sudah lebih dari 1 jam menjadi EXPIRED
    WITH expired_bookings AS (
        UPDATE public.bookings
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE status = 'UNPAID' AND created_at < NOW() - INTERVAL '1 hour'
        RETURNING id, total_price, room_id, email, check_in, check_out
    ),
    inserted_transactions AS (
        INSERT INTO public.transactions (booking_id, midtrans_order_id, amount, status)
        SELECT
            expired_bookings.id,
            expired_bookings.id,
            expired_bookings.total_price,
            'EXPIRED'
        FROM expired_bookings
        ON CONFLICT (midtrans_order_id) DO UPDATE
        SET
            amount = COALESCE(public.transactions.amount, EXCLUDED.amount),
            status = EXCLUDED.status
    )
    -- Bebaskan unit kamar untuk booking yang baru saja kedaluwarsa (EXPIRED)
    UPDATE public.room_units ru
    SET
        status = 'AVAILABLE',
        current_guest_name = null,
        current_guest_email = null,
        check_in = null,
        check_out = null,
        updated_at = NOW()
    FROM expired_bookings eb
    WHERE ru.room_id = eb.room_id
      AND ru.current_guest_email = eb.email
      AND ru.check_in = eb.check_in
      AND ru.status IN ('RESERVED', 'OCCUPIED');

    -- B. Pembersihan Otomatis Unit Kamar (Auto Check-Out & Release)
    -- 1. Jika OCCUPIED dan tanggal check-out telah terlewati, pindahkan ke CLEANING
    UPDATE public.room_units
    SET
        status = 'CLEANING',
        current_guest_name = null,
        current_guest_email = null,
        check_in = null,
        check_out = null,
        updated_at = NOW()
    WHERE status = 'OCCUPIED' AND check_out < CURRENT_DATE;

    -- 2. Jika RESERVED dan tanggal check-out telah terlewati (tidak pernah check-in/bayar), bebaskan ke AVAILABLE
    UPDATE public.room_units
    SET
        status = 'AVAILABLE',
        current_guest_name = null,
        current_guest_email = null,
        check_in = null,
        check_out = null,
        updated_at = NOW()
    WHERE status = 'RESERVED' AND check_out < CURRENT_DATE;

    -- 3. Jika RESERVED atau OCCUPIED tetapi booking terkait telah EXPIRED atau dihapus (deleted_at IS NOT NULL)
    UPDATE public.room_units ru
    SET
        status = 'AVAILABLE',
        current_guest_name = null,
        current_guest_email = null,
        check_in = null,
        check_out = null,
        updated_at = NOW()
    WHERE ru.status IN ('RESERVED', 'OCCUPIED')
      AND NOT EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.room_id = ru.room_id
          AND b.email = ru.current_guest_email
          AND b.check_in = ru.check_in
          AND b.status <> 'EXPIRED'
          AND b.deleted_at IS NULL
      );
END;
$function$;

-- 3. Satu kali Pembersihan Manual untuk membersihkan unit kamar yang saat ini terjebak RESERVED/OCCUPIED
--    karena data lama yang kedaluwarsa atau melewati batas check-out.

-- A. Bebaskan unit yang check-out nya sudah lewat
UPDATE public.room_units
SET
    status = 'CLEANING',
    current_guest_name = null,
    current_guest_email = null,
    check_in = null,
    check_out = null,
    updated_at = NOW()
WHERE status = 'OCCUPIED' AND check_out < CURRENT_DATE;

UPDATE public.room_units
SET
    status = 'AVAILABLE',
    current_guest_name = null,
    current_guest_email = null,
    check_in = null,
    check_out = null,
    updated_at = NOW()
WHERE status = 'RESERVED' AND check_out < CURRENT_DATE;

-- B. Bebaskan unit yang booking terkaitnya sudah EXPIRED atau dihapus
UPDATE public.room_units ru
SET
    status = 'AVAILABLE',
    current_guest_name = null,
    current_guest_email = null,
    check_in = null,
    check_out = null,
    updated_at = NOW()
WHERE ru.status IN ('RESERVED', 'OCCUPIED')
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = ru.room_id
      AND b.email = ru.current_guest_email
      AND b.check_in = ru.check_in
      AND b.status <> 'EXPIRED'
      AND b.deleted_at IS NULL
  );
