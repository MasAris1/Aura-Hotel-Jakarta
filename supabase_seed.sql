-- ==========================================
-- SEED DATA: Isi tabel rooms dengan data kamar
-- Jalankan di Supabase SQL Editor SETELAH:
-- 1. supabase_setup.sql
-- 2. supabase_reconcile.sql (untuk project yang sudah berjalan / live)
-- ==========================================

-- Hapus data lama jika ada (opsional)
-- DELETE FROM public.rooms;

INSERT INTO public.rooms (id, name, type, base_price, capacity, images, description, status)
VALUES
    (
        'f22968bc-5a24-4cda-8709-f17a68c0be85',
        'Kempinski Signature Suite',
        'Suite',
        8500000,
        2,
        '["https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"]'::jsonb,
        'Experience the epitome of luxury in our Signature Suite. Features a separate living area, panoramic city views from floor-to-ceiling windows, and a marble bathroom with a deep soaking tub.',
        'AVAILABLE'
    ),
    (
        '80c4dbb7-6afa-42c5-aebb-8095b21ff7bc',
        'Burj Executive Room',
        'Executive',
        4200000,
        2,
        '["https://images.unsplash.com/photo-1618773928121-c32242e63f39?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1582719508461-905c673771fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"]'::jsonb,
        'Our Executive Room seamlessly blends modern elegance with comfort. Enjoy exclusive access to the Executive Lounge, complimentary evening cocktails, and stunning sunset views.',
        'AVAILABLE'
    ),
    (
        'b31dc6a7-12d3-4578-9550-2fe12cbacb17',
        'Midnight Grand Deluxe',
        'Deluxe',
        2800000,
        2,
        '["https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1560067174-c5a3a8f37060?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"]'::jsonb,
        'Refined state-of-the-art living space wrapped in dark elegant tones. The Midnight Grand Deluxe is designed for tranquility and maximum comfort with exclusive gold accents.',
        'AVAILABLE'
    ),
    (
        '2b5f6a4f-8f98-4663-a2e0-d7dac79d0c41',
        'Opulent Presidential Villa',
        'Villa',
        25000000,
        4,
        '["https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1584622650111-993a426fbf0a?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"]'::jsonb,
        'An absolute masterpiece of hospitality. This villa features a private heated pool, a grand piano in the living room, formal dining area, and dedicated 24/7 personalized service.',
        'AVAILABLE'
    ),
    (
        'e3fa3e97-65b3-45a3-9994-47189f00cbb6',
        'Classic Premier Room',
        'Premier',
        3200000,
        3,
        '["https://images.unsplash.com/photo-1611892440504-42a792e24d32?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80","https://images.unsplash.com/photo-1598928506311-c55dd5802427?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"]'::jsonb,
        'Spacious and versatile, the Classic Premier Room is designed for small families or those needing a bit more space, featuring a comfortable pull-out sofa and elegant wooden flooring.',
        'AVAILABLE'
    )
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    base_price = EXCLUDED.base_price,
    capacity = EXCLUDED.capacity,
    images = EXCLUDED.images,
    description = EXCLUDED.description,
    status = EXCLUDED.status;

-- ==========================================
-- OPSIONAL: PROMOSIKAN USER MENJADI ADMIN / RECEPTIONIST
-- Jalankan setelah user terkait selesai registrasi agar profile sudah terbentuk.
-- ==========================================

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
