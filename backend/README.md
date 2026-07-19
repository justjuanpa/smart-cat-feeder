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

For a real customer product, pairing would usually work like this:

1. User signs into the mobile app.
2. User scans a QR code on the feeder.
3. The phone temporarily connects to the feeder through Bluetooth or setup Wi-Fi.
4. The phone gives the feeder the home Wi-Fi credentials and a cloud pairing
   token.
5. The feeder stores its device token locally and talks to the cloud directly.

For the senior-design prototype, use the same cloud shape with simpler manual
provisioning:

1. Sign into the mobile app once so your user exists in `profiles`.
2. Copy that profile/user id.
3. Run `supabase/provision-demo-device.sql` in the Supabase SQL Editor after
   replacing the owner id, serial number, and plain token.
4. Configure the Raspberry Pi with:
   - `PAWS_INGEST_URL`
   - `PAWS_DEVICE_SERIAL`
   - `PAWS_DEVICE_TOKEN`
5. Deploy the function:

   ```bash
   supabase functions deploy ingest-device
   supabase functions deploy device-schedules
   supabase functions deploy claim-schedule-run
   ```

The function has `verify_jwt = false` in `supabase/config.toml` because device
authentication is handled with the per-device token in the
`x-paws-device-token` header.

If your database already existed before scheduled dry-run events were added,
run `supabase/add-scheduled-dry-run-event-type.sql` once in the Supabase SQL
Editor before testing the scheduler.

Before enabling real scheduled dispensing, run
`supabase/add-schedule-runs.sql` once in the Supabase SQL Editor. This creates
the persistent run log that prevents a scheduled meal occurrence from being
claimed twice.

### Test From The Pi Or Laptop

Heartbeat/status only:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --left-bowl-weight-grams 0 \
  --right-bowl-weight-grams 0 \
  --motion-detected \
  --vision-version phone-camera-test
```

Camera recognition event:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --event-type authorized \
  --label Milo \
  --confidence 0.91 \
  --authorized \
  --notes "Camera-only integration test"
```

Schedule dry-run polling from `uart_pet_gate.py` uses the same device token as
ingest. If `PAWS_INGEST_URL` ends in `/ingest-device`, the Pi automatically
derives the schedule endpoint by replacing that suffix with `/device-schedules`.
It also derives the run-claim endpoint by replacing that suffix with
`/claim-schedule-run`. You can also set them explicitly:

```bash
export PAWS_SCHEDULE_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/device-schedules"
export PAWS_CLAIM_SCHEDULE_RUN_URL="https://YOUR_PROJECT_REF.supabase.co/functions/v1/claim-schedule-run"
```

Real scheduled dispensing is opt-in on the Pi:

```bash
python ai-model/uart_pet_gate.py --enable-scheduled-dispense
```

Scheduled `FEED_LEFT` / `FEED_RIGHT` commands dispense to the target bowl
weight. The ESP32 replies with `DISPENSED_LEFT` / `DISPENSED_RIGHT` and leaves
the access lid closed. CV-triggered `LEFT` / `RIGHT` commands only open the
matching access lid and reply with `OPENED_LEFT` / `OPENED_RIGHT`; scheduled
meals are the only path that dispenses food.

## Local Files

- `supabase/schema.sql`: database tables, indexes, and Row Level Security.
- `supabase/add-bowl-weight-columns.sql`: one-time helper for adding separate
  left/right bowl telemetry to an existing project.
- `supabase/add-scheduled-dry-run-event-type.sql`: one-time helper for allowing
  schedule dry-run decisions in an existing project.
- `supabase/add-schedule-runs.sql`: one-time helper for scheduled-meal run
  history and duplicate protection.
- `supabase/enable-pet-image-storage.sql`: one-time helper for allowing signed-in
  users to upload private pet profile pictures.
- `supabase/enable-realtime.sql`: enables realtime app refreshes for
  `device_status` and `feeding_events`.
- `supabase/config.toml`: Supabase function settings.
- `supabase/functions/ingest-device/index.ts`: secure device ingestion endpoint.
- `supabase/functions/device-schedules/index.ts`: secure endpoint for the Pi to
  fetch the owner's enabled feeding schedules.
- `supabase/functions/claim-schedule-run/index.ts`: secure endpoint for the Pi
  to claim one scheduled meal occurrence before sending a motor command.
- `supabase/provision-demo-device.sql`: helper SQL for creating a prototype
  feeder credential.
- `.env.example`: environment variables needed by the mobile app and backend
  tooling.
