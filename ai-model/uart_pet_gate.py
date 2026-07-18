import argparse
from collections import Counter
import datetime as dt
import os
from pathlib import Path
import queue
import sys
import tempfile
import threading
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
from paws_schedule_client import claim_schedule_run, fetch_device_schedules
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
CLOSED_MESSAGES = {
    "CLOSED_LEFT": "LEFT",
    "CLOSED_RIGHT": "RIGHT",
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


class CloudReporter:
    def __init__(self, args):
        self.args = args
        self.enabled = bool(args.ingest_url and args.device_token)
        self.queue = queue.Queue(maxsize=args.cloud_queue_size)
        self.thread = None
        self.stop_requested = threading.Event()
        self.dropped_telemetry = 0
        self.dropped_events = 0

    def start(self):
        if not self.enabled:
            print("Cloud ingest disabled")
            return

        self.thread = threading.Thread(
            target=self._run,
            name="cloud-reporter",
            daemon=True,
        )
        self.thread.start()
        print("Cloud ingest worker started")

    def submit(self, payload, low_priority=False):
        if not self.enabled:
            return

        try:
            self.queue.put_nowait((payload, low_priority))
            return
        except queue.Full:
            pass

        if low_priority:
            self.dropped_telemetry += 1
            if self.dropped_telemetry == 1 or self.dropped_telemetry % 25 == 0:
                print(
                    "Cloud ingest queue full; "
                    f"dropped {self.dropped_telemetry} telemetry payload(s)"
                )
            return

        self.dropped_events += 1
        print(
            "Cloud ingest queue full; "
            f"dropped important event payload #{self.dropped_events}: {payload}"
        )

    def stop(self):
        if not self.enabled or self.thread is None:
            return

        self.stop_requested.set()
        self.thread.join(timeout=self.args.cloud_shutdown_timeout)
        if self.thread.is_alive():
            print("Cloud ingest worker still draining; exiting without waiting")

    def _run(self):
        while not self.stop_requested.is_set() or not self.queue.empty():
            try:
                payload, _low_priority = self.queue.get(timeout=0.2)
            except queue.Empty:
                continue

            try:
                report_to_cloud(self.args, payload)
            finally:
                self.queue.task_done()


class ScheduleWorker:
    def __init__(self, args, bowl_state, bowl_state_lock, command_queue):
        self.args = args
        self.bowl_state = bowl_state
        self.bowl_state_lock = bowl_state_lock
        self.command_queue = command_queue
        self.enabled = bool(
            args.schedule_url
            and args.device_token
            and (args.enable_scheduled_dispense or not args.no_schedule_dry_run)
        )
        self.thread = None
        self.stop_requested = threading.Event()
        self.handled_runs = set()

    def start(self):
        if not self.enabled:
            print("Schedule worker disabled")
            return

        self.thread = threading.Thread(
            target=self._run,
            name="schedule-worker",
            daemon=True,
        )
        self.thread.start()
        mode = "dispense" if self.args.enable_scheduled_dispense else "dry-run"
        print(f"Schedule worker started in {mode} mode; polling every {self.args.schedule_check_interval}s")

    def stop(self):
        if not self.enabled or self.thread is None:
            return

        self.stop_requested.set()
        self.thread.join(timeout=2.0)
        if self.thread.is_alive():
            print("Schedule worker still stopping; exiting without waiting")

    def _run(self):
        while not self.stop_requested.is_set():
            self._check_schedules_once()
            self.stop_requested.wait(self.args.schedule_check_interval)

    def _check_schedules_once(self):
        try:
            status, response = fetch_device_schedules(
                self.args.schedule_url,
                self.args.device_serial,
                self.args.device_token,
            )
        except Exception as error:
            print(f"Schedule fetch failed: {error}")
            return

        if status < 200 or status >= 300:
            print(f"Schedule fetch <= HTTP {status}: {response}")
            return

        schedules = response.get("schedules", [])
        now = dt.datetime.now().astimezone()
        self._prune_old_runs(now)

        for schedule in schedules:
            due_at = due_datetime(schedule.get("scheduled_time"), now)
            if due_at is None:
                continue

            elapsed = (now - due_at).total_seconds()
            if elapsed < 0 or elapsed >= self.args.schedule_window_seconds:
                continue

            run_key = f"{schedule.get('id')}:{due_at.date().isoformat()}:{due_at.strftime('%H:%M')}"
            if run_key in self.handled_runs:
                continue

            handled = self._handle_due_schedule(schedule, due_at, run_key)
            if handled:
                self.handled_runs.add(run_key)

    def _handle_due_schedule(self, schedule, due_at, run_key):
        pet = schedule_pet(schedule)
        pet_name = (pet.get("name") or "").strip()
        side = PET_COMMANDS.get(pet_name.lower())
        target_grams = as_float(schedule.get("portion_grams"))
        meal_name = schedule.get("meal_name") or "Scheduled meal"
        scheduled_for = due_at.isoformat()

        if side is None:
            notes = f"Scheduled meal dry run skipped: no bowl mapping for {pet_name or 'unknown pet'}"
            decision = "skipped_no_bowl_mapping"
            current_weight = None
            grams_needed = None
        else:
            current_weight, weight_age = self._latest_weight(side)
            bowl_status = self._bowl_status(side)
            if bowl_status in {"pending", "open", "closing"}:
                notes = (
                    f"Scheduled meal dry run skipped: {side.lower()} bowl is already "
                    f"{bowl_status}"
                )
                decision = "skipped_bowl_active"
                grams_needed = None
            elif current_weight is None:
                notes = f"Scheduled meal dry run skipped: no {side.lower()} bowl weight available"
                decision = "skipped_missing_weight"
                grams_needed = None
            elif weight_age is None or weight_age > self.args.schedule_weight_max_age:
                notes = (
                    f"Scheduled meal dry run skipped: {side.lower()} bowl weight is stale "
                    f"({weight_age:.1f}s old)"
                )
                decision = "skipped_stale_weight"
                grams_needed = None
            elif current_weight < target_grams:
                grams_needed = round(target_grams - current_weight, 2)
                notes = (
                    f"Scheduled meal dry run: {meal_name} for {pet_name} would dispense "
                    f"{grams_needed:g}g to reach {target_grams:g}g"
                )
                decision = "would_dispense"
            else:
                notes = (
                    f"Scheduled meal dry run: {meal_name} for {pet_name} skipped; "
                    f"{side.lower()} bowl already has {current_weight:g}g"
                )
                decision = "skipped_enough_food"
                grams_needed = 0

        if self.args.enable_scheduled_dispense:
            if decision == "would_dispense":
                return self._claim_and_queue_command(
                    schedule=schedule,
                    pet_name=pet_name,
                    meal_name=meal_name,
                    side=side,
                    target_grams=target_grams,
                    current_weight=current_weight,
                    grams_needed=grams_needed,
                    scheduled_for=scheduled_for,
                    run_key=run_key,
                )

            if decision in {"skipped_missing_weight", "skipped_stale_weight", "skipped_bowl_active"}:
                print(f"{notes}; will retry while schedule window is still open")
                return False

            return self._claim_skipped_run(
                schedule=schedule,
                pet_name=pet_name,
                meal_name=meal_name,
                side=side,
                target_grams=target_grams,
                current_weight=current_weight,
                grams_needed=grams_needed,
                scheduled_for=scheduled_for,
                decision=decision,
                notes=notes,
            )

        print(notes)
        queue_cloud_report(
            self.args,
            {
                "event_type": "scheduled_dry_run",
                "authorized": True,
                "recognition_label": pet_name or None,
                "amount_grams": grams_needed,
                "notes": notes,
                "raw_payload": {
                    "schedule_id": schedule.get("id"),
                    "pet_id": schedule.get("pet_id"),
                    "pet_name": pet_name or None,
                    "meal_name": meal_name,
                    "scheduled_time": schedule.get("scheduled_time"),
                    "scheduled_for": due_at.isoformat(),
                    "target_grams": target_grams,
                    "side": side,
                    "current_weight_grams": current_weight,
                    "decision": decision,
                    "dry_run": True,
                },
            },
        )
        return decision not in {"skipped_missing_weight", "skipped_stale_weight", "skipped_bowl_active"}

    def _claim_and_queue_command(
        self,
        schedule,
        pet_name,
        meal_name,
        side,
        target_grams,
        current_weight,
        grams_needed,
        scheduled_for,
        run_key,
    ):
        if not self.args.claim_schedule_run_url:
            print("Scheduled dispense skipped: PAWS_CLAIM_SCHEDULE_RUN_URL is not configured")
            return False

        notes = (
            f"Scheduled meal command: {meal_name} for {pet_name} will dispense "
            f"{grams_needed:g}g to reach {target_grams:g}g"
        )
        claim_payload = self._run_payload(
            schedule=schedule,
            pet_name=pet_name,
            meal_name=meal_name,
            side=side,
            target_grams=target_grams,
            current_weight=current_weight,
            grams_needed=grams_needed,
            scheduled_for=scheduled_for,
            status="command_sent",
            notes=notes,
            decision="command_sent",
        )

        try:
            status, response = claim_schedule_run(
                self.args.claim_schedule_run_url,
                self.args.device_serial,
                self.args.device_token,
                claim_payload,
            )
        except Exception as error:
            print(f"Schedule run claim failed: {error}")
            return False

        if status < 200 or status >= 300:
            print(f"Schedule run claim <= HTTP {status}: {response}")
            return False

        if not response.get("claimed"):
            print(f"Scheduled meal already claimed; skipping {meal_name} for {pet_name}")
            return True

        command = f"FEED_{side} {int(round(target_grams))}"
        try:
            self.command_queue.put_nowait(
                {
                    "command": command,
                    "side": side,
                    "pet_name": pet_name,
                    "meal_name": meal_name,
                    "target_grams": target_grams,
                    "current_weight_grams": current_weight,
                    "grams_needed": grams_needed,
                    "scheduled_for": scheduled_for,
                    "schedule_id": schedule.get("id"),
                    "schedule_run_id": response.get("schedule_run", {}).get("id"),
                }
            )
        except queue.Full:
            print(f"Scheduled command queue full; could not send {command}")
            return False

        print(f"{notes}; queued UART command {command}")
        return True

    def _claim_skipped_run(
        self,
        schedule,
        pet_name,
        meal_name,
        side,
        target_grams,
        current_weight,
        grams_needed,
        scheduled_for,
        decision,
        notes,
    ):
        if not self.args.claim_schedule_run_url:
            print(notes)
            return True

        try:
            status, response = claim_schedule_run(
                self.args.claim_schedule_run_url,
                self.args.device_serial,
                self.args.device_token,
                self._run_payload(
                    schedule=schedule,
                    pet_name=pet_name,
                    meal_name=meal_name,
                    side=side,
                    target_grams=target_grams,
                    current_weight=current_weight,
                    grams_needed=grams_needed,
                    scheduled_for=scheduled_for,
                    status="skipped",
                    notes=notes,
                    decision=decision,
                ),
            )
        except Exception as error:
            print(f"Schedule skipped-run claim failed: {error}")
            return False

        if status < 200 or status >= 300:
            print(f"Schedule skipped-run claim <= HTTP {status}: {response}")
            return False

        if response.get("claimed"):
            print(notes)
            return True

        print(f"Scheduled meal already claimed; skipping {meal_name} for {pet_name}")
        return True

    def _run_payload(
        self,
        schedule,
        pet_name,
        meal_name,
        side,
        target_grams,
        current_weight,
        grams_needed,
        scheduled_for,
        status,
        notes,
        decision,
    ):
        return {
            "schedule_id": schedule.get("id"),
            "scheduled_for": scheduled_for,
            "status": status,
            "target_grams": target_grams,
            "starting_bowl_weight_grams": current_weight,
            "grams_needed": grams_needed,
            "side": side,
            "notes": notes,
            "raw_payload": {
                "pet_id": schedule.get("pet_id"),
                "pet_name": pet_name or None,
                "meal_name": meal_name,
                "scheduled_time": schedule.get("scheduled_time"),
                "decision": decision,
                "dry_run": False,
            },
        }

    def _latest_weight(self, side):
        with self.bowl_state_lock:
            state = self.bowl_state[side]
            weight = state.get("latest_weight_grams")
            updated_at = state.get("latest_weight_updated_at")

        if updated_at is None:
            return weight, None

        return weight, time.monotonic() - updated_at

    def _bowl_status(self, side):
        with self.bowl_state_lock:
            return self.bowl_state[side].get("status")

    def _prune_old_runs(self, now):
        today_prefix = now.date().isoformat()
        self.handled_runs = {run for run in self.handled_runs if f":{today_prefix}:" in run}


def queue_cloud_report(args, payload, low_priority=False):
    reporter = getattr(args, "cloud_reporter", None)
    if reporter is None:
        report_to_cloud(args, payload)
        return

    reporter.submit(payload, low_priority=low_priority)


def schedule_pet(schedule):
    pet = schedule.get("pets") or {}
    if isinstance(pet, list):
        return pet[0] if pet else {}

    return pet


def as_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def due_datetime(scheduled_time, now):
    if not scheduled_time:
        return None

    try:
        hour, minute, second = scheduled_time.split(":")[:3]
        return now.replace(
            hour=int(hour),
            minute=int(minute),
            second=int(float(second)),
            microsecond=0,
        )
    except (TypeError, ValueError):
        print(f"Ignoring schedule with invalid time: {scheduled_time}")
        return None


def derive_schedule_url(ingest_url):
    if not ingest_url:
        return None

    if ingest_url.endswith("/ingest-device"):
        return f"{ingest_url[:-len('/ingest-device')]}/device-schedules"

    return None


def derive_claim_schedule_run_url(ingest_url):
    if not ingest_url:
        return None

    if ingest_url.endswith("/ingest-device"):
        return f"{ingest_url[:-len('/ingest-device')]}/claim-schedule-run"

    return None


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
    save_debug,
):
    accepted = 0
    seen_any_pet_in_side = 0
    predictions = Counter()

    for frame_index in range(1, frame_count + 1):
        frame = camera.capture_array()
        if save_debug:
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
    return any(state["status"] in {"pending", "open", "closing"} for state in bowl_state.values())


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
        state["close_sent_at"] = None
        state["scheduled_context"] = None


def update_bowl_weight_state(bowl_state, payload, bowl_state_lock=None):
    lock = bowl_state_lock or threading.Lock()
    with lock:
        update_time = time.monotonic()

        if "left_bowl_weight_grams" in payload:
            bowl_state["LEFT"]["latest_weight_grams"] = payload["left_bowl_weight_grams"]
            bowl_state["LEFT"]["latest_weight_updated_at"] = update_time

        if "right_bowl_weight_grams" in payload:
            bowl_state["RIGHT"]["latest_weight_grams"] = payload["right_bowl_weight_grams"]
            bowl_state["RIGHT"]["latest_weight_updated_at"] = update_time


def mark_bowl_open(bowl_state, side, args):
    state = bowl_state[side]
    if state["status"] == "open":
        return

    scheduled_context = state.get("scheduled_context")
    state["status"] = "open"
    state["misses"] = 0
    state["next_check_at"] = time.monotonic() + args.presence_check_interval
    state["pending_since"] = None
    state["close_sent_at"] = None
    print(f"{side} bowl is open; next presence check in {args.presence_check_interval}s")

    queue_cloud_report(
        args,
        {
            "event_type": "dispensed",
            "authorized": True,
            "recognition_label": (
                scheduled_context.get("pet_name")
                if scheduled_context is not None
                else SIDE_PETS[side]
            ),
            "amount_grams": (
                scheduled_context.get("grams_needed")
                if scheduled_context is not None
                else state.get("latest_weight_grams")
            ),
            "notes": (
                f"Scheduled meal {scheduled_context.get('meal_name')} opened {side} bowl"
                if scheduled_context is not None
                else f"{side} bowl opened after dispense target"
            ),
            "raw_payload": {
                "side": side,
                "message": f"OPENED_{side}",
                "latest_weight_grams": state.get("latest_weight_grams"),
                "scheduled_context": scheduled_context,
            },
        },
    )
    state["scheduled_context"] = None


def mark_bowl_closed(bowl_state, side, message):
    print(message)
    state = bowl_state[side]
    state["status"] = "closed"
    state["misses"] = 0
    state["next_check_at"] = None
    state["pending_since"] = None
    state["close_sent_at"] = None
    state["scheduled_context"] = None


def run_queued_scheduled_commands(connection, bowl_state, command_queue):
    while True:
        try:
            command = command_queue.get_nowait()
        except queue.Empty:
            return

        side = command["side"]
        state = bowl_state[side]
        if state["status"] in {"pending", "open", "closing"}:
            print(f"{side} bowl already {state['status']}; skipping scheduled command {command['command']}")
            command_queue.task_done()
            continue

        send_line(connection, command["command"])
        state["status"] = "pending"
        state["misses"] = 0
        state["next_check_at"] = None
        state["pending_since"] = time.monotonic()
        state["close_sent_at"] = None
        state["scheduled_context"] = {
            "pet_name": command.get("pet_name"),
            "meal_name": command.get("meal_name"),
            "target_grams": command.get("target_grams"),
            "starting_bowl_weight_grams": command.get("current_weight_grams"),
            "grams_needed": command.get("grams_needed"),
            "scheduled_for": command.get("scheduled_for"),
            "schedule_id": command.get("schedule_id"),
            "schedule_run_id": command.get("schedule_run_id"),
        }
        print(f"UART => {command['command']} ({command.get('meal_name')} for {command.get('pet_name')})")
        command_queue.task_done()


def sync_lid_state_from_telemetry(bowl_state, payload, args):
    raw_payload = payload.get("raw_payload", {})
    lid_fields = {
        "LEFT": raw_payload.get("left_access_lid"),
        "RIGHT": raw_payload.get("right_access_lid"),
    }

    for side, status in lid_fields.items():
        if status is None:
            continue

        normalized_status = status.strip().lower()
        state = bowl_state[side]

        if normalized_status == "open":
            if state["status"] == "closing":
                close_sent_at = state.get("close_sent_at")
                close_elapsed = (
                    time.monotonic() - close_sent_at
                    if close_sent_at is not None
                    else args.close_telemetry_grace
                )

                if close_elapsed < args.close_telemetry_grace:
                    print(
                        f"{side} lid telemetry still says open "
                        f"{close_elapsed:.1f}s after close command; waiting"
                    )
                    continue

                print(f"{side} lid telemetry still says open after close command; waiting for close confirmation")
                continue

            if state["status"] != "open":
                print(f"{side} lid telemetry says open; marking bowl open")
            mark_bowl_open(bowl_state, side, args)
            continue

        if normalized_status != "closed":
            continue

        if state["status"] not in {"open", "closing"}:
            continue

        message = (
            f"{side} lid telemetry confirms close"
            if state["status"] == "closing"
            else f"{side} lid telemetry says closed; marking bowl closed"
        )
        mark_bowl_closed(bowl_state, side, message)


def should_report_telemetry(telemetry_report_cache, payload, args):
    raw_payload = payload.get("raw_payload", {})
    if not raw_payload:
        return True

    key = ",".join(sorted(raw_payload.keys()))
    value = tuple(sorted(raw_payload.items()))
    now = time.monotonic()
    previous = telemetry_report_cache.get(key)

    is_lid_status = "left_access_lid" in raw_payload or "right_access_lid" in raw_payload
    value_changed = previous is None or previous["value"] != value
    last_reported_at = previous["reported_at"] if previous is not None else None

    if is_lid_status and value_changed:
        telemetry_report_cache[key] = {"value": value, "reported_at": now}
        return True

    if last_reported_at is None or now - last_reported_at >= args.telemetry_report_interval:
        telemetry_report_cache[key] = {"value": value, "reported_at": now}
        return True

    telemetry_report_cache[key] = {
        "value": value,
        "reported_at": last_reported_at,
    }
    return False


def close_bowl(connection, bowl_state, side):
    connection.reset_input_buffer()
    send_line(connection, CLOSE_COMMANDS[side])
    print(f"UART => {CLOSE_COMMANDS[side]}")
    bowl_state[side]["status"] = "closing"
    bowl_state[side]["misses"] = 0
    bowl_state[side]["next_check_at"] = None
    bowl_state[side]["pending_since"] = None
    bowl_state[side]["close_sent_at"] = time.monotonic()


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
            save_debug=args.save_debug,
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
    queue_cloud_report(args, {"motion_detected": True})

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
        queue_cloud_report(
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

    if side_state["status"] in {"pending", "open", "closing"}:
        print(f"{command} bowl already {side_state['status']} for {pet_name}; not restarting")
        return

    send_line(connection, command)
    side_state["status"] = "pending"
    side_state["misses"] = 0
    side_state["next_check_at"] = None
    side_state["pending_since"] = time.monotonic()
    side_state["close_sent_at"] = None
    side_state["scheduled_context"] = None
    print(f"UART => {command} ({pet_name})")
    queue_cloud_report(
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
        "--close-telemetry-grace",
        type=float,
        default=4.0,
        help="Seconds to ignore open telemetry after sending CLOSE_LEFT/RIGHT.",
    )
    parser.add_argument(
        "--telemetry-report-interval",
        type=float,
        default=10.0,
        help="Minimum seconds between cloud reports for repeated ESP32 telemetry.",
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
        "--schedule-url",
        default=None,
        help=(
            "Supabase device schedule Edge Function URL. Defaults to PAWS_SCHEDULE_URL "
            "or is derived from PAWS_INGEST_URL."
        ),
    )
    parser.add_argument(
        "--claim-schedule-run-url",
        default=None,
        help=(
            "Supabase schedule-run claim Edge Function URL. Defaults to "
            "PAWS_CLAIM_SCHEDULE_RUN_URL or is derived from PAWS_INGEST_URL."
        ),
    )
    parser.add_argument(
        "--enable-scheduled-dispense",
        action="store_true",
        help="Allow due schedules to send FEED_LEFT/FEED_RIGHT UART commands after claim protection.",
    )
    parser.add_argument(
        "--no-schedule-dry-run",
        action="store_true",
        help="Disable schedule polling and dry-run schedule decision events.",
    )
    parser.add_argument(
        "--schedule-check-interval",
        type=float,
        default=30.0,
        help="Seconds between schedule checks.",
    )
    parser.add_argument(
        "--schedule-window-seconds",
        type=float,
        default=60.0,
        help="Seconds after a scheduled meal time when the dry-run worker may handle it.",
    )
    parser.add_argument(
        "--schedule-weight-max-age",
        type=float,
        default=120.0,
        help="Maximum age in seconds for bowl telemetry used by schedule dry runs.",
    )
    parser.add_argument(
        "--no-cloud",
        action="store_true",
        help="Disable all cloud ingest calls for local UART/CV latency testing.",
    )
    parser.add_argument(
        "--cloud-queue-size",
        type=int,
        default=100,
        help="Maximum queued cloud payloads before low-priority telemetry is dropped.",
    )
    parser.add_argument(
        "--cloud-shutdown-timeout",
        type=float,
        default=2.0,
        help="Seconds to wait for queued cloud payloads when shutting down.",
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
    args.schedule_url = (
        args.schedule_url
        or os.getenv("PAWS_SCHEDULE_URL")
        or derive_schedule_url(args.ingest_url)
    )
    args.claim_schedule_run_url = (
        args.claim_schedule_run_url
        or os.getenv("PAWS_CLAIM_SCHEDULE_RUN_URL")
        or derive_claim_schedule_run_url(args.ingest_url)
    )
    if args.no_cloud:
        args.ingest_url = None
        args.device_token = None
        args.schedule_url = None
        args.claim_schedule_run_url = None

    cloud_reporter = CloudReporter(args)
    args.cloud_reporter = cloud_reporter

    camera, yolo_model, recognizer, profiles = create_identity_pipeline(args)
    schedule_worker = None

    try:
        cloud_reporter.start()
        camera.start()
        time.sleep(args.warmup)

        with serial.Serial(args.port, args.baud, timeout=1.0) as connection:
            time.sleep(2)
            connection.reset_input_buffer()
            connection.reset_output_buffer()

            print(f"Listening for '{args.trigger_message}' on {args.port} @ {args.baud}")
            queue_cloud_report(
                args,
                {"motion_detected": False, "notes": "UART identity gate started"},
            )
            bowl_state = {
                "LEFT": {
                    "status": "closed",
                    "misses": 0,
                    "next_check_at": None,
                    "pending_since": None,
                    "close_sent_at": None,
                    "latest_weight_grams": None,
                    "latest_weight_updated_at": None,
                    "scheduled_context": None,
                },
                "RIGHT": {
                    "status": "closed",
                    "misses": 0,
                    "next_check_at": None,
                    "pending_since": None,
                    "close_sent_at": None,
                    "latest_weight_grams": None,
                    "latest_weight_updated_at": None,
                    "scheduled_context": None,
                },
            }
            bowl_state_lock = threading.Lock()
            scheduled_command_queue = queue.Queue(maxsize=10)
            schedule_worker = ScheduleWorker(
                args,
                bowl_state,
                bowl_state_lock,
                scheduled_command_queue,
            )
            schedule_worker.start()
            telemetry_report_cache = {}

            while True:
                run_queued_scheduled_commands(
                    connection=connection,
                    bowl_state=bowl_state,
                    command_queue=scheduled_command_queue,
                )
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

                if message in CLOSED_MESSAGES:
                    side = CLOSED_MESSAGES[message]
                    mark_bowl_closed(bowl_state, side, f"{side} bowl close confirmed by ESP")
                    continue

                embedded_message = parse_embedded_message(message)
                if embedded_message is not None:
                    print(f"Telemetry <= {embedded_message['payload']}")
                    update_bowl_weight_state(
                        bowl_state,
                        embedded_message["payload"],
                        bowl_state_lock,
                    )
                    sync_lid_state_from_telemetry(
                        bowl_state,
                        embedded_message["payload"],
                        args,
                    )
                    if should_report_telemetry(
                        telemetry_report_cache,
                        embedded_message["payload"],
                        args,
                    ):
                        queue_cloud_report(
                            args,
                            embedded_message["payload"],
                            low_priority=True,
                        )
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
        if schedule_worker is not None:
            schedule_worker.stop()
        camera.stop()
        camera.close()
        cloud_reporter.stop()


if __name__ == "__main__":
    main()
