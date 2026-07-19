-- Persistent scheduled-meal run log and duplicate protection.
-- Run once in the Supabase SQL Editor for existing projects.

create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  schedule_id uuid references public.feeding_schedules(id) on delete set null,
  pet_id uuid references public.pets(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null
    check (status in ('claimed', 'skipped', 'command_sent', 'dispensed', 'failed')),
  target_grams numeric(8, 2) not null check (target_grams >= 0),
  starting_bowl_weight_grams numeric(8, 2),
  grams_needed numeric(8, 2) check (grams_needed is null or grams_needed >= 0),
  side text check (side in ('LEFT', 'RIGHT')),
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, scheduled_for)
);

create index if not exists schedule_runs_owner_id_scheduled_for_idx
  on public.schedule_runs(owner_id, scheduled_for desc);

create index if not exists schedule_runs_device_id_scheduled_for_idx
  on public.schedule_runs(device_id, scheduled_for desc);

drop trigger if exists set_schedule_runs_updated_at on public.schedule_runs;
create trigger set_schedule_runs_updated_at
before update on public.schedule_runs
for each row execute function public.set_updated_at();

alter table public.schedule_runs enable row level security;

create policy "Users can read own schedule runs"
on public.schedule_runs for select
using (auth.uid() = owner_id);
