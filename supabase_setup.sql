-- Aktifkan ekstensi yang dibutuhkan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Untuk fitur EXCLUDE USING gist (mencegah overlapping rentang tanggal)

-- ==========================================
-- 1. TABEL UTAMA: ROOMS (Skenario ini diasumsikan belum dibuat lengkap)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    base_price NUMERIC(15, 2) NOT NULL,
    capacity INT NOT NULL DEFAULT 2,
    images JSONB,
    description TEXT,
    status VARCHAR(50) DEFAULT 'AVAILABLE',
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. TABEL: ROOM_RATES (Kalkulasi Harga Dinamis Akhir Pekan/Libur)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.room_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    price_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.0, -- Contoh: 1.5 untuk +50%
    description VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fungsi untuk mendapatkan harga per hari berdasarkan room_rates
CREATE OR REPLACE FUNCTION get_dynamic_price(p_room_id UUID, p_date DATE)
RETURNS NUMERIC AS $$
DECLARE
    v_base_price NUMERIC;
    v_multiplier NUMERIC;
BEGIN
    -- Dapatkan base price
    SELECT base_price INTO v_base_price FROM public.rooms WHERE id = p_room_id AND deleted_at IS NULL;
    
    -- Dapatkan multiplier jika ada
    SELECT price_multiplier INTO v_multiplier 
    FROM public.room_rates 
    WHERE room_id = p_room_id AND p_date >= date_start AND p_date <= date_end
    ORDER BY price_multiplier DESC LIMIT 1;

    IF v_multiplier IS NULL THEN
        v_multiplier := 1.0;
    END IF;

    RETURN v_base_price * v_multiplier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- 3. TABEL: PROFILES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'guest',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 4. TABEL: BOOKINGS (Dengan Penguncian Konkurensi gist)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    room_id UUID REFERENCES public.rooms(id),
    
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    special_requests TEXT,
    
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    
    total_price NUMERIC(15, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'UNPAID', -- UNPAID, PAID, EXPIRED, CHECKED_IN, CHECKED_OUT, REFUNDED
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- FASE 3: Isolasi Mutlak untuk mencegah Overbooking di rentang tanggal yang sama
    -- Memastikan tidak ada booking dengan status selain EXPIRED/REFUNDED yang check-in check-out nya overlap
    EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in, check_out, '()') WITH &&
    ) WHERE (status NOT IN ('EXPIRED', 'REFUNDED'))
);

-- ==========================================
-- 5. TABEL: TRANSACTIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    midtrans_order_id VARCHAR(255) UNIQUE,
    payment_type VARCHAR(100),
    amount NUMERIC(15, 2),
    status VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ==========================================
-- 6. TABEL: AUDIT_LOGS & TRIGGERS (Fase 5/7)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS trigger AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, TG_OP, row_to_json(OLD), auth.uid());
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW), auth.uid());
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
         INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
         VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW), auth.uid());
         RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pasang trigger di bookings
DROP TRIGGER IF EXISTS audit_bookings_trigger ON public.bookings;
CREATE TRIGGER audit_bookings_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();


-- ==========================================
-- 7. PENYAPU OTOMATIS (PG_CRON) (Fase 6)
-- ==========================================
-- Mengubah booking yang UNPAID lebih dari 1 jam menjadi EXPIRED
-- Mengeksekusi setiap satu menit
SELECT cron.schedule('expire_unpaid_bookings', '* * * * *', $$
    UPDATE public.bookings 
    SET status = 'EXPIRED', updated_at = NOW()
    WHERE status = 'UNPAID' AND created_at < NOW() - INTERVAL '1 hour';
$$);

-- ==========================================
-- RLS (ROW LEVEL SECURITY)
-- ==========================================
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- POLICIES: ROOMS
-- ==========================================
-- Rooms bisa diakses semua orang asal status bukan deleted
CREATE POLICY "Public rooms are viewable by everyone." ON public.rooms FOR SELECT USING (deleted_at IS NULL);

-- ==========================================
-- POLICIES: ROOM_RATES
-- ==========================================
-- Room rates bisa dibaca semua orang (untuk kalkulasi harga)
CREATE POLICY "Public room rates are viewable by everyone." ON public.room_rates FOR SELECT USING (true);

-- ==========================================
-- POLICIES: PROFILES
-- ==========================================
-- User bisa baca profil sendiri
CREATE POLICY "Users can view own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
-- User bisa update profil sendiri
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- Insert profile saat signup (trigger atau client)
CREATE POLICY "Users can insert own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ==========================================
-- POLICIES: BOOKINGS
-- ==========================================
-- Guest bisa buat booking sendiri
CREATE POLICY "Users can insert their own bookings." ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Guest bisa lihat booking sendiri
CREATE POLICY "Users can view their own bookings." ON public.bookings FOR SELECT USING (auth.uid() = user_id);
-- Guest bisa update booking sendiri
CREATE POLICY "Users can update their own bookings." ON public.bookings FOR UPDATE USING (auth.uid() = user_id);
-- Admin/receptionist bisa lihat SEMUA bookings
CREATE POLICY "Admin can view all bookings." ON public.bookings FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'receptionist'))
);
-- Admin/receptionist bisa update SEMUA bookings (check-in, check-out, refund)
CREATE POLICY "Admin can update all bookings." ON public.bookings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'receptionist'))
);
-- Admin/receptionist bisa delete bookings (cancel)
CREATE POLICY "Admin can delete bookings." ON public.bookings FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'receptionist'))
);

-- ==========================================
-- POLICIES: TRANSACTIONS
-- ==========================================
-- Note: INSERT dilakukan oleh webhook via Service Role Key (bypass RLS)
-- User bisa lihat transaksi dari booking milik sendiri
CREATE POLICY "Users can view own transactions." ON public.transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.bookings WHERE bookings.id = transactions.booking_id AND bookings.user_id = auth.uid())
);
-- Admin bisa lihat semua transaksi
CREATE POLICY "Admin can view all transactions." ON public.transactions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'receptionist'))
);

-- ==========================================
-- POLICIES: AUDIT_LOGS
-- ==========================================
-- Hanya admin yang bisa lihat audit logs
CREATE POLICY "Admin can view audit logs." ON public.audit_logs FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

