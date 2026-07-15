-- Add separate left/right bowl weight telemetry to existing Supabase projects.
-- Run this once in the Supabase SQL Editor if schema.sql was already applied.

alter table public.device_status
  add column if not exists left_bowl_weight_grams numeric(8, 2),
  add column if not exists right_bowl_weight_grams numeric(8, 2);
