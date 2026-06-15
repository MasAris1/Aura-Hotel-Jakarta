-- Admin CRUD schema patch for Aura.
-- Run this in Supabase SQL Editor when the live database still uses the legacy schema.
-- It adds the columns required for full soft-delete CRUD and richer suite editing.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

alter table public.bookings
  add column if not exists deleted_at timestamptz;

alter table public.room_rates
  add column if not exists deleted_at timestamptz;

alter table public.rooms
  add column if not exists type text default 'Room',
  add column if not exists capacity integer default 1,
  add column if not exists images jsonb default '[]'::jsonb,
  add column if not exists status text default 'AVAILABLE',
  add column if not exists updated_at timestamptz default now();

alter table public.facilities
  add column if not exists slug text;

create unique index if not exists facilities_slug_unique_idx
  on public.facilities (slug)
  where slug is not null;

create index if not exists bookings_deleted_at_created_at_idx
  on public.bookings (deleted_at, created_at desc);

create index if not exists profiles_deleted_at_created_at_idx
  on public.profiles (deleted_at, created_at desc);

create index if not exists rooms_deleted_at_created_at_idx
  on public.rooms (deleted_at, created_at desc);

create index if not exists room_rates_deleted_at_rate_date_idx
  on public.room_rates (deleted_at, rate_date desc);

update public.rooms
set
  type = coalesce(type, 'Room'),
  capacity = coalesce(capacity, 1),
  images = case
    when images is null and image_url is not null then jsonb_build_array(image_url)
    when images is null then '[]'::jsonb
    else images
  end,
  status = coalesce(status, 'AVAILABLE'),
  updated_at = coalesce(updated_at, created_at, now());
