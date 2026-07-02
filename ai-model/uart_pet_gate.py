import argparse
import os
from pathlib import Path
import sys
import time

import serial

DEVICE_INGESTION_DIR = Path(__file__).resolve().parent / "device-ingestion"
sys.path.append(str(DEVICE_INGESTION_DIR))

from paws_ingest_client import post_ingest
from live_pet_capture import DEFAULT_CONFIDENCE, detect_allowed_pet

VISION_VERSION = "uart-pet-gate-camera-v1"


def send_line(connection, message):
    connection.write(f"{message}\r\n".encode("utf-8"))
    connection.flush()


def report_to_cloud(args, payload):
    if not args.ingest_url or not args.device_token:
        return

    try:
        status, response = post_ingest(
            args.ingest_url,
            args.device_serial,
            args.device_token,
            {
                "vision_version": args.vision_version,
                **payload,
            },
        )
        print(f"Cloud ingest <= HTTP {status}: {response}")
    except Exception as error:
        print(f"Cloud ingest failed: {error}")


def main():
    parser = argparse.ArgumentParser(
        description="UART bridge for trigger-driven pet detection"
    )
    parser.add_argument("--port", default="/dev/serial0", help="UART device path")
    parser.add_argument("--baud", type=int, default=115200, help="UART baud rate")
    parser.add_argument(
        "--frames",
        type=int,
        default=8,
        help="Frames to evaluate after each trigger",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_CONFIDENCE,
        help="Minimum confidence required for an allow decision",
    )
    parser.add_argument(
        "--warmup",
        type=float,
        default=1.0,
        help="Camera warmup time in seconds after a trigger",
    )
    parser.add_argument(
        "--ingest-url",
        default=None,
        help="Supabase Edge Function URL. Defaults to PAWS_INGEST_URL.",
    )
    parser.add_argument(
        "--device-serial",
        default="PAWS-DEMO-001",
        help="Provisioned feeder serial. Defaults to PAWS_DEVICE_SERIAL or PAWS-DEMO-001.",
    )
    parser.add_argument(
        "--device-token",
        default=None,
        help="Plain device token. Defaults to PAWS_DEVICE_TOKEN.",
    )
    parser.add_argument(
        "--vision-version",
        default=VISION_VERSION,
        help="Version string reported to the backend.",
    )
    args = parser.parse_args()
    args.ingest_url = args.ingest_url or os.getenv("PAWS_INGEST_URL")
    args.device_serial = os.getenv("PAWS_DEVICE_SERIAL", args.device_serial)
    args.device_token = args.device_token or os.getenv("PAWS_DEVICE_TOKEN")

    with serial.Serial(args.port, args.baud, timeout=1.0) as connection:
        time.sleep(2)
        connection.reset_input_buffer()
        connection.reset_output_buffer()

        print(f"Listening for trigger events on {args.port} @ {args.baud}")
        report_to_cloud(args, {"motion_detected": False, "notes": "UART pet gate started"})

        while True:
            raw_message = connection.readline()
            if not raw_message:
                continue

            message = raw_message.decode("utf-8", errors="ignore").strip()
            if not message:
                continue

            print(f"UART <= {message}")

            if message != "TRIGGER":
                print("Ignoring unsupported UART message")
                continue

            report_to_cloud(args, {"motion_detected": True})

            detection = detect_allowed_pet(
                frame_count=args.frames,
                conf_threshold=args.threshold,
                warmup_seconds=args.warmup,
            )

            if detection is None:
                send_line(connection, "DENY")
                print("UART => DENY")
                report_to_cloud(
                    args,
                    {
                        "event_type": "denied",
                        "authorized": False,
                        "notes": "No allowed pet detected after trigger",
                    },
                )
                continue

            response = (
                f"ALLOW {detection['label']} {detection['confidence']:.2f}"
            )
            send_line(connection, response)
            print(f"UART => {response}")
            report_to_cloud(
                args,
                {
                    "event_type": "authorized",
                    "authorized": True,
                    "recognition_label": detection["label"],
                    "recognition_confidence": detection["confidence"],
                    "notes": "Camera authorized pet after trigger",
                },
            )


if __name__ == "__main__":
    main()
