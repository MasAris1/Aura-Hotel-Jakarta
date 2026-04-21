-- ==========================================
-- SUPABASE RECONCILIATION / STABILITY SCRIPT
-- Jalankan di Supabase SQL Editor pada project yang aktif di `.env.local`
-- Aman untuk dijalankan ulang saat audit atau sinkronisasi policy/trigger.
-- ==========================================

-- 1. Extensions yang dibutuhkan oleh schema lokal
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Trigger auto-profile untuk user auth baru
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name)
    VALUES (
        NEW.id,
        COALESCE(NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'Guest'),
        ''
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill user lama yang belum punya row di profiles
INSERT INTO public.profiles (id, first_name, last_name)
SELECT
    users.id,
    COALESCE(NULLIF(split_part(COALESCE(users.email, ''), '@', 1), ''), 'Guest'),
    ''
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles ON profiles.id = users.id
WHERE profiles.id IS NULL;

-- 4. Sinkronkan function harga harian dengan schema live `room_rates`
CREATE UNIQUE INDEX IF NOT EXISTS room_rates_room_id_rate_date_key
ON public.room_rates (room_id, rate_date);

CREATE OR REPLACE FUNCTION public.get_dynamic_price(p_room_id UUID, p_date DATE)
RETURNS NUMERIC AS $$
DECLARE
    v_base_price NUMERIC;
    v_daily_price NUMERIC;
BEGIN
    SELECT price
    INTO v_daily_price
    FROM public.room_rates
    WHERE room_id = p_room_id AND rate_date = p_date
    LIMIT 1;

    IF v_daily_price IS NOT NULL THEN
        RETURN v_daily_price;
    END IF;

    SELECT base_price
    INTO v_base_price
    FROM public.rooms
    WHERE id = p_room_id AND deleted_at IS NULL;

    RETURN v_base_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Pastikan audit trigger aktif di bookings
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD), auth.uid());
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, new_data, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW), auth.uid());
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_bookings_trigger ON public.bookings;
CREATE TRIGGER audit_bookings_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_transactions_trigger ON public.transactions;
CREATE TRIGGER audit_transactions_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Backfill row transaksi untuk booking lama yang belum punya histori pembayaran
INSERT INTO public.transactions (booking_id, midtrans_order_id, amount, status)
SELECT
    bookings.id,
    bookings.id,
    bookings.total_price,
    CASE
        WHEN bookings.status IN ('PAID', 'CHECKED_IN', 'CHECKED_OUT') THEN 'PAID'
        WHEN bookings.status = 'REFUNDED' THEN 'REFUNDED'
        WHEN bookings.status = 'EXPIRED' THEN 'EXPIRED'
        ELSE 'PENDING'
    END
FROM public.bookings AS bookings
LEFT JOIN public.transactions AS transactions ON transactions.booking_id = bookings.id
WHERE transactions.booking_id IS NULL;

-- 6. Pastikan cron job expire_unpaid_bookings tidak dobel
CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings_job()
RETURNS void AS $$
BEGIN
    WITH expired_bookings AS (
        UPDATE public.bookings
        SET status = 'EXPIRED', updated_at = NOW()
        WHERE status = 'UNPAID' AND created_at < NOW() - INTERVAL '1 hour'
        RETURNING id, total_price
    )
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
        status = EXCLUDED.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE
    existing_job RECORD;
BEGIN
    FOR existing_job IN
        SELECT jobid
        FROM cron.job
        WHERE jobname = 'expire_unpaid_bookings'
    LOOP
        PERFORM cron.unschedule(existing_job.jobid);
    END LOOP;
END;
$$;

SELECT cron.schedule('expire_unpaid_bookings', '* * * * *', $$SELECT public.expire_unpaid_bookings_job();$$);

-- 7. Pastikan RLS aktif
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 8. Recreate policies agar selaras dengan codebase saat ini
DROP POLICY IF EXISTS "Public rooms are viewable by everyone." ON public.rooms;
CREATE POLICY "Public rooms are viewable by everyone." ON public.rooms
FOR SELECT USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "Public room rates are viewable by everyone." ON public.room_rates;
CREATE POLICY "Public room rates are viewable by everyone." ON public.room_rates
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view own profile." ON public.profiles;
CREATE POLICY "Users can view own profile." ON public.profiles
FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
CREATE POLICY "Users can update own profile." ON public.profiles
FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile." ON public.profiles;
CREATE POLICY "Users can insert own profile." ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own bookings." ON public.bookings;
CREATE POLICY "Users can insert their own bookings." ON public.bookings
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own bookings." ON public.bookings;
CREATE POLICY "Users can view their own bookings." ON public.bookings
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own bookings." ON public.bookings;
CREATE POLICY "Users can update their own bookings." ON public.bookings
FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admin can view all bookings." ON public.bookings;
CREATE POLICY "Admin can view all bookings." ON public.bookings
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'receptionist')
    )
);

DROP POLICY IF EXISTS "Admin can update all bookings." ON public.bookings;
CREATE POLICY "Admin can update all bookings." ON public.bookings
FOR UPDATE USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'receptionist')
    )
);

DROP POLICY IF EXISTS "Users can view own transactions." ON public.transactions;
CREATE POLICY "Users can view own transactions." ON public.transactions
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE bookings.id = transactions.booking_id AND bookings.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Admin can view all transactions." ON public.transactions;
CREATE POLICY "Admin can view all transactions." ON public.transactions
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'receptionist')
    )
);

DROP POLICY IF EXISTS "Admin can view audit logs." ON public.audit_logs;
CREATE POLICY "Admin can view audit logs." ON public.audit_logs
FOR SELECT USING (
    EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- 9. Promote staff account jika diperlukan
-- Ganti email di bawah sebelum dijalankan.
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE id = (
--     SELECT id
--     FROM auth.users
--     WHERE email = 'admin@your-domain.com'
-- );

-- UPDATE public.profiles
-- SET role = 'receptionist'
-- WHERE id = (
--     SELECT id
--     FROM auth.users
--     WHERE email = 'frontdesk@your-domain.com'
-- );

-- 10. Query audit manual setelah reconciliation
-- SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_cron', 'btree_gist');
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'expire_unpaid_bookings';
-- SELECT id, email FROM auth.users WHERE id NOT IN (SELECT id FROM public.profiles);
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('on_auth_user_created', 'audit_bookings_trigger', 'audit_transactions_trigger');

-- Catatan kontrak:
-- `transactions.midtrans_order_id` diselaraskan di code untuk menyimpan Midtrans `order_id`
-- yang sama dengan `bookings.id`, bukan `transaction_id`.
-- Schema live yang dipakai script ini:
-- `room_rates(room_id, rate_date, price)`
-- `audit_logs(..., performed_by, created_at)`
