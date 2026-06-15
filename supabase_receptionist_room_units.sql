create table if not exists public.room_units (
  id uuid primary key default extensions.uuid_generate_v4(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  unit_number text not null,
  floor integer not null default 1,
  status text not null default 'AVAILABLE' check (
    status in ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'CLEANING', 'RESERVED')
  ),
  current_guest_name text,
  current_guest_email text,
  check_in date,
  check_out date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists room_units_active_room_unit_number_key
  on public.room_units(room_id, unit_number)
  where deleted_at is null;

create index if not exists room_units_room_id_idx
  on public.room_units(room_id);

create index if not exists room_units_status_idx
  on public.room_units(status)
  where deleted_at is null;

alter table public.room_units enable row level security;

drop policy if exists "Staff can view room units" on public.room_units;
create policy "Staff can view room units"
  on public.room_units
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.role in ('admin', 'receptionist')
    )
  );

drop policy if exists "Staff can update room units" on public.room_units;
create policy "Staff can update room units"
  on public.room_units
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.role in ('admin', 'receptionist')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.deleted_at is null
        and p.role in ('admin', 'receptionist')
    )
  );

with active_rooms as (
  select
    id,
    row_number() over (order by created_at nulls last, name, id) as room_order
  from public.rooms
  where deleted_at is null
),
seeded_units as (
  select
    active_rooms.id as room_id,
    active_rooms.room_order::integer as floor,
    concat(active_rooms.room_order::text, lpad(unit_index::text, 2, '0')) as unit_number
  from active_rooms
  cross join generate_series(1, 5) as unit_index
)
insert into public.room_units (room_id, unit_number, floor, status)
select room_id, unit_number, floor, 'AVAILABLE'
from seeded_units
where not exists (
  select 1
  from public.room_units existing
  where existing.room_id = seeded_units.room_id
    and existing.unit_number = seeded_units.unit_number
    and existing.deleted_at is null
);
