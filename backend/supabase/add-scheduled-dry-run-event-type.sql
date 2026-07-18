-- Allow the Pi scheduler dry-run worker to log schedule decisions without
-- marking them as real dispense events.

alter table public.feeding_events
drop constraint if exists feeding_events_event_type_check;

alter table public.feeding_events
add constraint feeding_events_event_type_check
check (
  event_type in (
    'authorized',
    'denied',
    'dispensed',
    'consumed',
    'manual',
    'scheduled_dry_run'
  )
);
