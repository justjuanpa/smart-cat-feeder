-- Tighten pet-owned relationship policies for existing Supabase projects.
-- Run this once in the Supabase SQL Editor.

delete from public.feeding_schedules schedule
where not exists (
  select 1
  from public.pets pet
  where pet.id = schedule.pet_id
    and pet.owner_id = schedule.owner_id
);

delete from public.pet_images image
where not exists (
  select 1
  from public.pets pet
  where pet.id = image.pet_id
    and pet.owner_id = image.owner_id
);

drop policy if exists "Users can manage own pet images" on public.pet_images;
create policy "Users can manage own pet images"
on public.pet_images for all
using (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pets pet
    where pet.id = pet_images.pet_id
      and pet.owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pets pet
    where pet.id = pet_images.pet_id
      and pet.owner_id = auth.uid()
  )
);

drop policy if exists "Users can manage own schedules" on public.feeding_schedules;
create policy "Users can manage own schedules"
on public.feeding_schedules for all
using (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pets pet
    where pet.id = feeding_schedules.pet_id
      and pet.owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  and exists (
    select 1
    from public.pets pet
    where pet.id = feeding_schedules.pet_id
      and pet.owner_id = auth.uid()
  )
);
