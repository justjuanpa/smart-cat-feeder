import argparse
import os
from pathlib import Path
import sys
import time

import serial

BASE_DIR = Path(__file__).resolve().parent
DEVICE_INGESTION_DIR = Path(__file__).resolve().parent / "device-ingestion"
PET_RECOGNITION_DIR = BASE_DIR / "pet-recognition"
sys.path.append(str(DEVICE_INGESTION_DIR))
sys.path.append(str(PET_RECOGNITION_DIR))

from paws_ingest_client import post_ingest
import live_burst_recognition as burst_recognition

VISION_VERSION = "uart-pet-gate-identity-v1"
DEFAULT_TRIGGER_MESSAGE = "PIR TRIGGERED"
PET_COMMANDS = {
    "milo": "LEFT",
    "mimi": "RIGHT",
}


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


def create_identity_pipeline(args):
    burst_recognition.FRAME_COUNT = args.frames
    burst_recognition.YOLO_CONFIDENCE_THRESHOLD = args.yolo_threshold
    burst_recognition.MIN_ACCEPTED_FRAMES = args.min_accepted_frames
    burst_recognition.SAVE_DEBUG_CROPS = args.save_debug

    if args.save_debug:
        burst_recognition.DEBUG_FRAME_DIR.mkdir(parents=True, exist_ok=True)
        burst_recognition.DEBUG_CROP_DIR.mkdir(parents=True, exist_ok=True)

    profile_path = Path(args.profile_path) if args.profile_path else burst_recognition.PROFILE_PATH
    yolo_model = burst_recognition.YOLO(str(burst_recognition.MODEL_DIR), task="detect")
    profiles = burst_recognition.load_profiles(profile_path)
    recognizer = burst_recognition.PetRecognizer(
        similarity_threshold=args.similarity_threshold,
        margin_threshold=args.margin_threshold,
    )
    camera = burst_recognition.create_camera()

    print(f"Loaded YOLO model from {burst_recognition.MODEL_DIR}")
    print(f"Loaded pet profiles from {profile_path}")
    print(f"Pet command map: {PET_COMMANDS}")

    return camera, yolo_model, recognizer, profiles


def detect_pet_identity(camera, yolo_model, recognizer, profiles):
    result = burst_recognition.run_burst_decision(
        picam2=camera,
        yolo_model=yolo_model,
        recognizer=recognizer,
        profiles=profiles,
    )
    burst_recognition.print_burst_result(result)

    if not result["accepted"]:
        return None, result

    pet_name = result["final_prediction"].lower()
    command = PET_COMMANDS.get(pet_name)

    if command is None:
        return None, result

    return command, result


def main():
    parser = argparse.ArgumentParser(
        description="UART bridge for trigger-driven pet identity recognition"
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
        default=None,
        help="Alias for --yolo-threshold.",
    )
    parser.add_argument(
        "--yolo-threshold",
        type=float,
        default=burst_recognition.YOLO_CONFIDENCE_THRESHOLD,
        help="Minimum YOLO confidence required before pet identity recognition.",
    )
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=burst_recognition.SIMILARITY_THRESHOLD,
        help="Minimum identity similarity score required for an allow decision.",
    )
    parser.add_argument(
        "--margin-threshold",
        type=float,
        default=burst_recognition.MARGIN_THRESHOLD,
        help="Minimum identity score margin over the second-best pet.",
    )
    parser.add_argument(
        "--min-accepted-frames",
        type=int,
        default=burst_recognition.MIN_ACCEPTED_FRAMES,
        help="Minimum accepted frames needed for a burst decision.",
    )
    parser.add_argument(
        "--warmup",
        type=float,
        default=1.0,
        help="Camera warmup time in seconds after a trigger",
    )
    parser.add_argument(
        "--trigger-message",
        default=DEFAULT_TRIGGER_MESSAGE,
        help="UART trigger line expected from the ESP32.",
    )
    parser.add_argument(
        "--profile-path",
        default=None,
        help="Path to a pet profile .npz file. Defaults to the cropped phone-sim profiles.",
    )
    parser.add_argument(
        "--save-debug",
        action="store_true",
        help="Save burst frames and crops for debugging.",
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
    if args.threshold is not None:
        args.yolo_threshold = args.threshold
    args.ingest_url = args.ingest_url or os.getenv("PAWS_INGEST_URL")
    args.device_serial = os.getenv("PAWS_DEVICE_SERIAL", args.device_serial)
    args.device_token = args.device_token or os.getenv("PAWS_DEVICE_TOKEN")

    camera, yolo_model, recognizer, profiles = create_identity_pipeline(args)

    try:
        camera.start()
        time.sleep(args.warmup)

        with serial.Serial(args.port, args.baud, timeout=1.0) as connection:
            time.sleep(2)
            connection.reset_input_buffer()
            connection.reset_output_buffer()

            print(f"Listening for '{args.trigger_message}' on {args.port} @ {args.baud}")
            report_to_cloud(
                args,
                {"motion_detected": False, "notes": "UART identity gate started"},
            )

            while True:
                raw_message = connection.readline()
                if not raw_message:
                    continue

                message = raw_message.decode("utf-8", errors="ignore").strip()
                if not message:
                    continue

                print(f"UART <= {message}")

                if message != args.trigger_message:
                    print("Ignoring unsupported UART message")
                    continue

                report_to_cloud(args, {"motion_detected": True})

                command, result = detect_pet_identity(
                    camera=camera,
                    yolo_model=yolo_model,
                    recognizer=recognizer,
                    profiles=profiles,
                )

                if command is None:
                    send_line(connection, "DENY")
                    print("UART => DENY")
                    report_to_cloud(
                        args,
                        {
                            "event_type": "denied",
                            "authorized": False,
                            "recognition_label": result["final_prediction"],
                            "notes": "No authorized pet identity detected after trigger",
                        },
                    )
                    continue

                pet_name = result["final_prediction"].lower()
                send_line(connection, command)
                print(f"UART => {command} ({pet_name})")
                report_to_cloud(
                    args,
                    {
                        "event_type": "authorized",
                        "authorized": True,
                        "recognition_label": pet_name,
                        "notes": f"Camera authorized {pet_name}; sent {command}",
                    },
                )
    finally:
        camera.stop()
        camera.close()


if __name__ == "__main__":
    main()
