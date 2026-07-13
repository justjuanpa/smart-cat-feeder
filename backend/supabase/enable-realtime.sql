-- Enable Supabase Realtime for PAWS app updates.
-- Run this once in the Supabase SQL Editor if realtime updates do not arrive.

alter table public.device_status replica identity full;
alter table public.feeding_events replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'device_status'
  ) then
    alter publication supabase_realtime add table public.device_status;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feeding_events'
  ) then
    alter publication supabase_realtime add table public.feeding_events;
  end if;
end $$;
