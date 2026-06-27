-- PAWS Supabase schema
-- Run this in the Supabase SQL Editor after creating the project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'PAWS Feeder',
  serial_number text unique,
  api_key_hash text,
  status text not null default 'offline'
    check (status in ('offline', 'online', 'error', 'maintenance')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  species text not null default 'cat',
  breed text,
  daily_gram_limit numeric(8, 2) not null default 0
    check (daily_gram_limit >= 0),
  recognition_threshold numeric(4, 3) not null default 0.700
    check (recognition_threshold >= 0 and recognition_threshold <= 1),
  margin_threshold numeric(4, 3) not null default 0.080
    check (margin_threshold >= 0 and margin_threshold <= 1),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pet_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  storage_path text not null,
  image_role text not null default 'training'
    check (image_role in ('training', 'profile', 'test', 'debug')),
  created_at timestamptz not null default now()
);

create table if not exists public.feeding_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  meal_name text not null,
  scheduled_time time not null,
  portion_grams numeric(8, 2) not null check (portion_grams >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feeding_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  event_type text not null
    check (event_type in ('authorized', 'denied', 'dispensed', 'consumed', 'manual')),
  occurred_at timestamptz not null default now(),
  authorized boolean,
  amount_grams numeric(8, 2) check (amount_grams is null or amount_grams >= 0),
  recognition_label text,
  recognition_confidence numeric(5, 4)
    check (recognition_confidence is null or (recognition_confidence >= 0 and recognition_confidence <= 1)),
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.device_status (
  device_id uuid primary key references public.devices(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  online boolean not null default false,
  current_weight_grams numeric(8, 2),
  last_motion_at timestamptz,
  last_event_at timestamptz,
  firmware_version text,
  vision_version text,
  updated_at timestamptz not null default now()
);

create index if not exists devices_owner_id_idx on public.devices(owner_id);
create index if not exists pets_owner_id_idx on public.pets(owner_id);
create index if not exists pet_images_owner_id_idx on public.pet_images(owner_id);
create index if not exists pet_images_pet_id_idx on public.pet_images(pet_id);
create index if not exists feeding_schedules_owner_id_idx on public.feeding_schedules(owner_id);
create index if not exists feeding_schedules_pet_id_idx on public.feeding_schedules(pet_id);
create index if not exists feeding_events_owner_id_occurred_at_idx
  on public.feeding_events(owner_id, occurred_at desc);
create index if not exists feeding_events_pet_id_occurred_at_idx
  on public.feeding_events(pet_id, occurred_at desc);
create index if not exists device_status_owner_id_idx on public.device_status(owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists set_pets_updated_at on public.pets;
create trigger set_pets_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

drop trigger if exists set_feeding_schedules_updated_at on public.feeding_schedules;
create trigger set_feeding_schedules_updated_at
before update on public.feeding_schedules
for each row execute function public.set_updated_at();

drop trigger if exists set_device_status_updated_at on public.device_status;
create trigger set_device_status_updated_at
before update on public.device_status
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.pets enable row level security;
alter table public.pet_images enable row level security;
alter table public.feeding_schedules enable row level security;
alter table public.feeding_events enable row level security;
alter table public.device_status enable row level security;

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can manage own devices"
on public.devices for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Users can manage own pets"
on public.pets for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Users can manage own pet images"
on public.pet_images for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Users can manage own schedules"
on public.feeding_schedules for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "Users can read own feeding events"
on public.feeding_events for select
using (auth.uid() = owner_id);

create policy "Users can insert own manual feeding events"
on public.feeding_events for insert
with check (auth.uid() = owner_id and event_type = 'manual');

create policy "Users can read own device status"
on public.device_status for select
using (auth.uid() = owner_id);

create policy "Users can update own device status"
on public.device_status for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', false)
on conflict (id) do nothing;
