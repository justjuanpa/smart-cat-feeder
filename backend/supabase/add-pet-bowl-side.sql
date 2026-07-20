-- Add per-pet bowl assignment for existing Supabase projects.
-- Run this once in the Supabase SQL Editor.

alter table public.pets
add column if not exists bowl_side text not null default 'LEFT'
  check (bowl_side in ('LEFT', 'RIGHT'));

update public.pets
set bowl_side = 'LEFT'
where lower(name) = 'mimi';

update public.pets
set bowl_side = 'RIGHT'
where lower(name) = 'milo';
