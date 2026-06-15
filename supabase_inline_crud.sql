-- Required for inline public-page CRUD of hotel facilities.
-- Run this in Supabase SQL Editor before using facility create/edit/archive.

CREATE TABLE IF NOT EXISTS public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  icon text DEFAULT 'concierge',
  image_url text,
  status text DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
  sort_order integer DEFAULT 999,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facilities_public_order_idx
  ON public.facilities (deleted_at, status, sort_order, created_at);
