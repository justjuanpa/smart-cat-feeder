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
   ```

The function has `verify_jwt = false` in `supabase/config.toml` because device
authentication is handled with the per-device token in the
`x-paws-device-token` header.

### Test From The Pi Or Laptop

Heartbeat/status only:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --current-weight-grams 0 \
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

## Local Files

- `supabase/schema.sql`: database tables, indexes, and Row Level Security.
- `supabase/config.toml`: Supabase function settings.
- `supabase/functions/ingest-device/index.ts`: secure device ingestion endpoint.
- `supabase/provision-demo-device.sql`: helper SQL for creating a prototype
  feeder credential.
- `.env.example`: environment variables needed by the mobile app and backend
  tooling.
