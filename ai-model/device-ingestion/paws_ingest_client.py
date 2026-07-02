import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def post_ingest(url, serial_number, token, payload):
    body = {
        "serial_number": serial_number,
        **payload,
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-paws-device-token": token,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        return error.code, {"error": detail}


def build_payload(args):
    payload = {
        "firmware_version": args.firmware_version,
        "vision_version": args.vision_version,
    }

    if args.event_type:
        payload["event_type"] = args.event_type
        payload["authorized"] = args.authorized
        payload["recognition_label"] = args.label
        payload["recognition_confidence"] = args.confidence
        payload["amount_grams"] = args.amount_grams
        payload["notes"] = args.notes

    if args.current_weight_grams is not None:
        payload["current_weight_grams"] = args.current_weight_grams

    if args.motion_detected:
        payload["motion_detected"] = True

    return {key: value for key, value in payload.items() if value is not None}


def main():
    parser = argparse.ArgumentParser(
        description="Send PAWS feeder status and feeding events to Supabase ingestion."
    )
    parser.add_argument(
        "--url",
        default=os.getenv("PAWS_INGEST_URL"),
        help="Supabase Edge Function URL",
    )
    parser.add_argument(
        "--serial",
        default=os.getenv("PAWS_DEVICE_SERIAL", "PAWS-DEMO-001"),
        help="Provisioned feeder serial number",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("PAWS_DEVICE_TOKEN"),
        help="Plain device token configured during provisioning",
    )
    parser.add_argument(
        "--event-type",
        choices=["authorized", "denied", "dispensed", "consumed"],
        help="Optional feeding event type; omit for heartbeat-only status updates",
    )
    parser.add_argument("--label", help="Recognized pet label, such as Milo or Mimi")
    parser.add_argument("--confidence", type=float, help="Recognition confidence from 0 to 1")
    parser.add_argument("--authorized", action="store_true", help="Whether access was allowed")
    parser.add_argument("--amount-grams", type=float, help="Food amount dispensed or consumed")
    parser.add_argument("--current-weight-grams", type=float, help="Current bowl/load-cell weight")
    parser.add_argument("--motion-detected", action="store_true", help="Whether motion was observed")
    parser.add_argument("--firmware-version", help="ESP32/feeder firmware version")
    parser.add_argument("--vision-version", help="Vision pipeline version")
    parser.add_argument("--notes", help="Debug notes to store with the feeding event")
    args = parser.parse_args()

    if not args.url or not args.token:
        print("PAWS_INGEST_URL and PAWS_DEVICE_TOKEN are required.", file=sys.stderr)
        return 2

    status, response = post_ingest(
        args.url,
        args.serial,
        args.token,
        build_payload(args),
    )
    print(json.dumps(response, indent=2))

    return 0 if 200 <= status < 300 else 1


if __name__ == "__main__":
    raise SystemExit(main())
