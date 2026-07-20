# PAWS Device Ingestion Client

This folder contains a small Python client for sending Raspberry Pi feeder
status and feeding events to the Supabase Edge Function.

## Environment

Set these on the Raspberry Pi:

```bash
export PAWS_INGEST_URL="https://your-project-ref.supabase.co/functions/v1/ingest-device"
export PAWS_PET_ENROLLMENT_URL="https://your-project-ref.supabase.co/functions/v1/device-pet-enrollment"
export PAWS_DEVICE_SERIAL="PAWS-DEMO-001"
export PAWS_DEVICE_TOKEN="the-plain-token-used-in-provision-demo-device.sql"
```

## Heartbeat

Use this while only the camera is connected:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --motion-detected \
  --vision-version camera-only-test
```

## Feeding Event

Use this after the CV pipeline makes an allow/deny decision:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --event-type authorized \
  --label Milo \
  --confidence 0.91 \
  --authorized \
  --notes "Camera recognized Milo"
```

When motors and sensors are integrated, add values such as:

```bash
python ai-model/device-ingestion/paws_ingest_client.py \
  --event-type dispensed \
  --label Milo \
  --confidence 0.91 \
  --authorized \
  --amount-grams 22 \
  --left-bowl-weight-grams 118 \
  --right-bowl-weight-grams 94
```

## UART Bridge Integration

`ai-model/uart_pet_gate.py` now reports to the cloud automatically when these
environment variables are set. It still works without them, so local UART tests
are not blocked by Wi-Fi or Supabase.

```bash
export PAWS_INGEST_URL="https://your-project-ref.supabase.co/functions/v1/ingest-device"
export PAWS_DEVICE_SERIAL="PAWS-DEMO-001"
export PAWS_DEVICE_TOKEN="the-plain-token-used-in-provision-demo-device.sql"

python ai-model/uart_pet_gate.py --port /dev/serial0 --baud 115200
```

Cloud writes performed by `uart_pet_gate.py`:

- startup heartbeat: marks the device reachable
- `PIR TRIGGERED` received: updates motion/status
- no allowed pet detected: writes a `denied` feeding event
- allowed pet detected: writes an `authorized` feeding event and requests the
  matching access lid
- `OPENED_LEFT` / `OPENED_RIGHT` received: starts open-lid presence checks
- `DISPENSED_LEFT` / `DISPENSED_RIGHT` received, with an optional final
  weight like `DISPENSED_RIGHT 21`: writes a scheduled `dispensed` event
  without opening the access lid; if the lid was already open, presence checks
  continue after the scheduled dispense completes
- scheduled `FEED_LEFT` / `FEED_RIGHT` commands use a longer pending timeout
  because the ESP32 may need time to dispense and settle the load-cell reading
- `Left Bowl Grams: N` / `Right Bowl Grams: N` received: updates the matching device bowl weight
- `Left Access Lid: ...`, `Right Access Lid: ...`, and `Ledstrip: ...` are parsed as telemetry notes

Motor and load-cell results should be added later as `dispensed` and
`consumed` events once those hardware pieces are connected.

Do not run `embedded_data.py` as a second process. It is imported by
`uart_pet_gate.py` as a parser so only one process owns `/dev/serial0`.

## App Pet Enrollment

The mobile app can upload recognition training photos from each pet profile.
After uploading photos, rebuild the Pi recognition profile before testing CV:

```bash
export PAWS_PET_ENROLLMENT_URL="https://your-project-ref.supabase.co/functions/v1/device-pet-enrollment"
export PAWS_DEVICE_SERIAL="PAWS-DEMO-001"
export PAWS_DEVICE_TOKEN="the-plain-token-used-in-provision-demo-device.sql"

python ai-model/pet-recognition/sync_app_enrollment_profiles.py --clean
```

The script downloads the app-uploaded training images for the feeder owner,
then writes `ai-model/pet-recognition/pet_profiles_phone_sim_crops.npz`, which
is the profile file loaded by `uart_pet_gate.py`. Restart the Pi bridge after
building profiles.
