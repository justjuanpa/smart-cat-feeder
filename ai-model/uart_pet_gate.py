import argparse
from collections import Counter
import os
from pathlib import Path
import sys
import tempfile
import time

import cv2
from PIL import Image
import serial

BASE_DIR = Path(__file__).resolve().parent
DEVICE_INGESTION_DIR = Path(__file__).resolve().parent / "device-ingestion"
PET_RECOGNITION_DIR = BASE_DIR / "pet-recognition"
sys.path.append(str(DEVICE_INGESTION_DIR))
sys.path.append(str(PET_RECOGNITION_DIR))

from paws_ingest_client import post_ingest
from embedded_data import parse_embedded_message
import live_burst_recognition as burst_recognition

VISION_VERSION = "uart-pet-gate-identity-v1"
DEFAULT_TRIGGER_MESSAGE = "PIR TRIGGERED"
PET_COMMANDS = {
    "mimi": "LEFT",
    "milo": "RIGHT",
}
SIDE_PETS = {
    "LEFT": "mimi",
    "RIGHT": "milo",
}
CLOSE_COMMANDS = {
    "LEFT": "CLOSE_LEFT",
    "RIGHT": "CLOSE_RIGHT",
}
OPENED_MESSAGES = {
    "OPENED_LEFT": "LEFT",
    "OPENED_RIGHT": "RIGHT",
}
PRESENCE_SIDE_ROI_DIR = burst_recognition.DEBUG_DIR / "presence_side_rois"


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


def side_for_bbox(bbox, image_width):
    x1, _, x2, _ = bbox
    center_x = (x1 + x2) / 2
    return "RIGHT" if center_x < image_width / 2 else "LEFT"


def crop_side_roi(frame, side):
    midpoint = frame.shape[1] // 2

    if side == "RIGHT":
        return frame[:, :midpoint]

    return frame[:, midpoint:]


def save_presence_side_roi(frame, side, frame_index):
    side_dir = PRESENCE_SIDE_ROI_DIR / side.lower()
    side_dir.mkdir(parents=True, exist_ok=True)

    timestamp_ms = int(time.time() * 1000)
    output_path = side_dir / f"{side.lower()}_{timestamp_ms}_{frame_index}.jpg"
    roi = crop_side_roi(frame, side)
    roi_rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    Image.fromarray(roi_rgb).save(output_path)

    return output_path


def recognize_detection_crop(frame, detection, recognizer, profiles):
    x1, y1, x2, y2 = burst_recognition.add_padding(
        detection["bbox"],
        image_width=frame.shape[1],
        image_height=frame.shape[0],
        padding_ratio=burst_recognition.PADDING_RATIO,
    )
    crop = frame[y1:y2, x1:x2]

    if crop.size == 0:
        return None

    with tempfile.TemporaryDirectory() as temp_dir:
        crop_path = Path(temp_dir) / "presence_crop.jpg"
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        Image.fromarray(crop_rgb).save(crop_path)
        return recognizer.recognize(crop_path, profiles)


def check_pet_present_on_side(
    camera,
    yolo_model,
    recognizer,
    profiles,
    side,
    expected_pet,
    frame_count,
    min_accepted_frames,
):
    accepted = 0
    seen_any_pet_in_side = 0
    predictions = Counter()

    for frame_index in range(1, frame_count + 1):
        frame = camera.capture_array()
        side_roi_path = save_presence_side_roi(frame, side, frame_index)
        print(f"Presence {side} frame {frame_index}: saved side ROI to {side_roi_path}")
        yolo_results = yolo_model(frame, verbose=False)
        detections = []

        for box in yolo_results[0].boxes:
            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = yolo_model.names[cls_id]

            if label not in burst_recognition.ALLOWED_CLASSES:
                continue

            if confidence < burst_recognition.YOLO_CONFIDENCE_THRESHOLD:
                continue

            bbox = tuple(map(int, box.xyxy[0]))
            if side_for_bbox(bbox, frame.shape[1]) != side:
                continue

            detections.append(
                {
                    "label": label,
                    "confidence": confidence,
                    "bbox": bbox,
                }
            )

        if not detections:
            print(f"Presence {side} frame {frame_index}: no pet in side ROI")
            continue

        seen_any_pet_in_side += 1
        best_detection = max(detections, key=lambda detection: detection["confidence"])
        recognition = recognize_detection_crop(frame, best_detection, recognizer, profiles)

        if recognition is None:
            print(f"Presence {side} frame {frame_index}: empty crop")
            continue

        prediction = recognition["prediction"].lower()
        predictions[prediction] += 1

        print(
            f"Presence {side} frame {frame_index}: "
            f"prediction={prediction} "
            f"best={recognition['best_pet']} "
            f"score={recognition['best_score']:.4f} "
            f"accepted={recognition['accepted']}"
        )

        if recognition["accepted"] and prediction == expected_pet:
            accepted += 1

    present = accepted >= min_accepted_frames
    print(
        f"Presence {side}: expected={expected_pet} "
        f"accepted={accepted}/{frame_count} "
        f"side_pet_frames={seen_any_pet_in_side}/{frame_count} "
        f"predictions={dict(predictions)} "
        f"present={present}"
    )
    return present


def any_bowl_active(bowl_state):
    return any(state["status"] in {"pending", "open"} for state in bowl_state.values())


def reset_stale_pending_bowls(bowl_state, args):
    now = time.monotonic()

    for side, state in bowl_state.items():
        if state["status"] != "pending":
            continue

        pending_since = state.get("pending_since")
        if pending_since is None:
            state["pending_since"] = now
            continue

        if now - pending_since < args.pending_timeout:
            continue

        print(
            f"{side} bowl pending for {now - pending_since:.1f}s "
            f"without OPENED_{side}; resetting to closed"
        )
        state["status"] = "closed"
        state["misses"] = 0
        state["next_check_at"] = None
        state["pending_since"] = None


def update_bowl_weight_state(bowl_state, payload):
    if "left_bowl_weight_grams" in payload:
        bowl_state["LEFT"]["latest_weight_grams"] = payload["left_bowl_weight_grams"]

    if "right_bowl_weight_grams" in payload:
        bowl_state["RIGHT"]["latest_weight_grams"] = payload["right_bowl_weight_grams"]


def mark_bowl_open(bowl_state, side, args):
    state = bowl_state[side]
    state["status"] = "open"
    state["misses"] = 0
    state["next_check_at"] = time.monotonic() + args.presence_check_interval
    state["pending_since"] = None
    print(f"{side} bowl is open; next presence check in {args.presence_check_interval}s")
    report_to_cloud(
        args,
        {
            "event_type": "dispensed",
            "authorized": True,
            "recognition_label": SIDE_PETS[side],
            "amount_grams": state.get("latest_weight_grams"),
            "notes": f"{side} bowl opened after dispense target",
            "raw_payload": {
                "side": side,
                "message": f"OPENED_{side}",
                "latest_weight_grams": state.get("latest_weight_grams"),
            },
        },
    )


def close_bowl(connection, bowl_state, side):
    send_line(connection, CLOSE_COMMANDS[side])
    print(f"UART => {CLOSE_COMMANDS[side]}")
    bowl_state[side]["status"] = "closed"
    bowl_state[side]["misses"] = 0
    bowl_state[side]["next_check_at"] = None
    bowl_state[side]["pending_since"] = None


def run_due_presence_checks(
    connection,
    bowl_state,
    args,
    camera,
    yolo_model,
    recognizer,
    profiles,
):
    now = time.monotonic()

    for side, state in bowl_state.items():
        if state["status"] != "open":
            continue

        if state["next_check_at"] is None or now < state["next_check_at"]:
            continue

        expected_pet = SIDE_PETS[side]
        print(f"Checking whether {expected_pet} is still at {side} bowl")
        present = check_pet_present_on_side(
            camera=camera,
            yolo_model=yolo_model,
            recognizer=recognizer,
            profiles=profiles,
            side=side,
            expected_pet=expected_pet,
            frame_count=args.presence_frames,
            min_accepted_frames=args.presence_min_accepted_frames,
        )

        if present:
            state["misses"] = 0
            state["next_check_at"] = time.monotonic() + args.presence_check_interval
            print(f"{expected_pet} still present at {side}; keeping lid open")
            continue

        state["misses"] += 1
        print(
            f"{expected_pet} missed at {side}: "
            f"{state['misses']}/{args.presence_misses_to_close}"
        )

        if state["misses"] >= args.presence_misses_to_close:
            close_bowl(connection, bowl_state, side)
        else:
            state["next_check_at"] = time.monotonic() + args.presence_check_interval


def handle_trigger(
    connection,
    bowl_state,
    args,
    camera,
    yolo_model,
    recognizer,
    profiles,
):
    report_to_cloud(args, {"motion_detected": True})

    command, result = detect_pet_identity(
        camera=camera,
        yolo_model=yolo_model,
        recognizer=recognizer,
        profiles=profiles,
    )

    if command is None:
        if any_bowl_active(bowl_state):
            print("No authorized pet detected, but a bowl is active; leaving lids to presence checks")
            return

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
        return

    side_state = bowl_state[command]
    pet_name = result["final_prediction"].lower()

    if side_state["status"] in {"pending", "open"}:
        print(f"{command} bowl already {side_state['status']} for {pet_name}; not restarting")
        return

    send_line(connection, command)
    side_state["status"] = "pending"
    side_state["misses"] = 0
    side_state["next_check_at"] = None
    side_state["pending_since"] = time.monotonic()
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
        default=True,
        help="Save burst frames and crops for debugging.",
    )
    parser.add_argument(
        "--no-save-debug",
        action="store_false",
        dest="save_debug",
        help="Disable saving regular recognition frames and crops.",
    )
    parser.add_argument(
        "--presence-check-interval",
        type=float,
        default=5.0,
        help="Seconds between presence checks while a lid is open.",
    )
    parser.add_argument(
        "--presence-frames",
        type=int,
        default=4,
        help="Frames to evaluate during each open-lid presence check.",
    )
    parser.add_argument(
        "--presence-min-accepted-frames",
        type=int,
        default=1,
        help="Accepted frames needed to consider the owner still present.",
    )
    parser.add_argument(
        "--presence-misses-to-close",
        type=int,
        default=2,
        help="Consecutive missed presence checks before closing a lid.",
    )
    parser.add_argument(
        "--pending-timeout",
        type=float,
        default=15.0,
        help="Seconds to wait for OPENED_LEFT/RIGHT before allowing a command retry.",
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
            bowl_state = {
                "LEFT": {
                    "status": "closed",
                    "misses": 0,
                    "next_check_at": None,
                    "pending_since": None,
                    "latest_weight_grams": None,
                },
                "RIGHT": {
                    "status": "closed",
                    "misses": 0,
                    "next_check_at": None,
                    "pending_since": None,
                    "latest_weight_grams": None,
                },
            }

            while True:
                reset_stale_pending_bowls(bowl_state, args)
                run_due_presence_checks(
                    connection=connection,
                    bowl_state=bowl_state,
                    args=args,
                    camera=camera,
                    yolo_model=yolo_model,
                    recognizer=recognizer,
                    profiles=profiles,
                )

                raw_message = connection.readline()
                if not raw_message:
                    continue

                message = raw_message.decode("utf-8", errors="ignore").strip()
                if not message:
                    continue

                print(f"UART <= {message}")

                if message in OPENED_MESSAGES:
                    mark_bowl_open(bowl_state, OPENED_MESSAGES[message], args)
                    continue

                embedded_message = parse_embedded_message(message)
                if embedded_message is not None:
                    print(f"Telemetry <= {embedded_message['payload']}")
                    update_bowl_weight_state(bowl_state, embedded_message["payload"])
                    report_to_cloud(args, embedded_message["payload"])
                    continue

                if message != args.trigger_message:
                    print("Ignoring unsupported UART message")
                    continue

                handle_trigger(
                    connection=connection,
                    bowl_state=bowl_state,
                    args=args,
                    camera=camera,
                    yolo_model=yolo_model,
                    recognizer=recognizer,
                    profiles=profiles,
                )
    finally:
        camera.stop()
        camera.close()


if __name__ == "__main__":
    main()
