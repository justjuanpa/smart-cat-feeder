-- Provision a demo PAWS feeder for Raspberry Pi ingestion testing.
--
-- 1. Replace the values in the `settings` CTE.
-- 2. Run this in the Supabase SQL Editor.
-- 3. Put the plain token, not the hash, on the Raspberry Pi as PAWS_DEVICE_TOKEN.
--
-- You can find the owner id in auth.users or public.profiles after signing in
-- from the mobile app.

with settings as (
  select
    'PAWS-DEMO-001'::text as serial_number,
    'PAWS Feeder Prototype'::text as device_name,
    '07b847f1-bc57-46ab-8590-414feb5d5dd1'::uuid as owner_id,
    'm28n2U69HORzaen6NhL4YKU2/+3NI+gDFFO0ndXJNSU'::text as plain_device_token
)
insert into public.devices (
  owner_id,
  name,
  serial_number,
  api_key_hash,
  status
)
select
  owner_id,
  device_name,
  serial_number,
  encode(digest(plain_device_token, 'sha256'), 'hex'),
  'offline'
from settings
on conflict (serial_number) do update set
  owner_id = excluded.owner_id,
  name = excluded.name,
  api_key_hash = excluded.api_key_hash,
  updated_at = now()
returning id, owner_id, name, serial_number, status;
