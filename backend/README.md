# PAWS Backend

This backend uses Supabase for authentication, Postgres data storage, Row Level
Security, and pet image storage.

## Start Here

1. Create a Supabase project at https://supabase.com.
2. Open the project dashboard.
3. Go to **SQL Editor**.
4. Copy the contents of `supabase/schema.sql`.
5. Run the SQL once.
6. Go to **Project Settings > API** and copy:
   - Project URL
   - publishable key
   - secret key for backend-only code
7. Copy `.env.example` to your local app/backend environment and fill in real
   values. Do not commit real keys.

## Why Supabase

PAWS needs user accounts, pet profiles, feeding schedules, feeding logs, device
status, and pet images. Supabase gives the project a real Postgres database,
mobile-friendly auth, storage, and access control without requiring the team to
host a custom backend server immediately.

## Data Model

- `profiles`: one row per signed-in app user.
- `devices`: feeder devices owned by a user.
- `pets`: pet profiles and food limits.
- `pet_images`: metadata for images uploaded to Supabase Storage.
- `feeding_schedules`: recurring meal targets.
- `feeding_events`: logged allow/deny/feed events.
- `device_status`: latest device telemetry for the dashboard.

## Device Ingestion

The Raspberry Pi should not use the mobile app anon key directly for trusted
device writes. The intended path is:

1. ESP32 sends trigger/control messages over UART to the Raspberry Pi.
2. Raspberry Pi runs vision and feeder decision logic.
3. Raspberry Pi sends feeding events to a Supabase Edge Function.
4. Edge Function verifies the device token and writes to `feeding_events` using
   the service role key.

That Edge Function is the next backend piece after the schema is live.

## Local Files

- `supabase/schema.sql`: database tables, indexes, and Row Level Security.
- `.env.example`: environment variables needed by the mobile app and backend
  tooling.
