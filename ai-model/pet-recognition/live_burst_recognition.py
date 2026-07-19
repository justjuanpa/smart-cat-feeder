from collections import Counter
from pathlib import Path
import tempfile
import time

import cv2
from picamera2 import Picamera2
from PIL import Image
from ultralytics import YOLO

from pet_recognizer import PetRecognizer, load_profiles


SCRIPT_DIR = Path(__file__).resolve().parent
AI_MODEL_DIR = SCRIPT_DIR.parent

MODEL_DIR = AI_MODEL_DIR / "yolov8n_ncnn_model"
PROFILE_PATH = SCRIPT_DIR / "pet_profiles_phone_sim_crops.npz"
DEBUG_DIR = SCRIPT_DIR / "live_burst_debug"
DEBUG_FRAME_DIR = DEBUG_DIR / "frames"
DEBUG_CROP_DIR = DEBUG_DIR / "crops"

ALLOWED_CLASSES = {"cat", "dog", "teddy bear"}

FRAME_COUNT = 8
YOLO_CONFIDENCE_THRESHOLD = 0.25
PADDING_RATIO = 0.00

SIMILARITY_THRESHOLD = 0.65
MARGIN_THRESHOLD = 0.03
MIN_ACCEPTED_FRAMES = 2

SAVE_DEBUG_CROPS = True


def main():
    model = YOLO(str(MODEL_DIR), task="detect")
    profiles = load_profiles(PROFILE_PATH)
    recognizer = PetRecognizer(
        similarity_threshold=SIMILARITY_THRESHOLD,
        margin_threshold=MARGIN_THRESHOLD,
    )

    picam2 = create_camera()

    if SAVE_DEBUG_CROPS:
        DEBUG_FRAME_DIR.mkdir(parents=True, exist_ok=True)
        DEBUG_CROP_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loaded YOLO model from {MODEL_DIR}")
    print(f"Loaded pet profiles from {PROFILE_PATH}")
    print(f"Capturing {FRAME_COUNT} frames...\n")

    try:
        picam2.start()
        time.sleep(1.0)

        result = run_burst_decision(
            picam2=picam2,
            yolo_model=model,
            recognizer=recognizer,
            profiles=profiles,
        )

        print_burst_result(result)

    finally:
        picam2.stop()
        picam2.close()


def create_camera():
    picam2 = Picamera2()
    config = picam2.create_preview_configuration(
        main={"size": (4608, 2592), "format": "RGB888"}
    )
    picam2.configure(config)
    return picam2


def run_burst_decision(picam2, yolo_model, recognizer, profiles) -> dict:
    accepted_counts = Counter()
    frame_results = []

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        for frame_index in range(1, FRAME_COUNT + 1):
            frame = picam2.capture_array()
            debug_timestamp = int(time.time())

            if SAVE_DEBUG_CROPS:
                debug_frame_path = DEBUG_FRAME_DIR / f"frame_{debug_timestamp}_{frame_index}.jpg"
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                Image.fromarray(frame_rgb).save(debug_frame_path)
            yolo_results = yolo_model(frame, verbose=False)
            print_yolo_detections(frame_index, yolo_results, yolo_model)
            detection = best_allowed_detection(yolo_results, yolo_model)

            if detection is None:
                frame_results.append(
                    {
                        "frame": frame_index,
                        "status": "no_yolo_detection",
                    }
                )
                continue

            x1, y1, x2, y2 = add_padding(
                detection["bbox"],
                image_width=frame.shape[1],
                image_height=frame.shape[0],
                padding_ratio=PADDING_RATIO,
            )

            crop = frame[y1:y2, x1:x2]

            if crop.size == 0:
                frame_results.append(
                    {
                        "frame": frame_index,
                        "status": "empty_crop",
                        "yolo_label": detection["label"],
                        "yolo_confidence": detection["confidence"],
                    }
                )
                continue

            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            crop_path = temp_dir / f"frame_{frame_index}.jpg"
            Image.fromarray(crop_rgb).save(crop_path)

            if SAVE_DEBUG_CROPS:
                debug_crop_path = DEBUG_CROP_DIR / f"crop_{debug_timestamp}_{frame_index}.jpg"
                Image.fromarray(crop_rgb).save(debug_crop_path)

            recognition = recognizer.recognize(crop_path, profiles)

            if recognition["accepted"]:
                accepted_counts[recognition["prediction"]] += 1

            frame_results.append(
                {
                    "frame": frame_index,
                    "status": "recognized",
                    "yolo_label": detection["label"],
                    "yolo_confidence": detection["confidence"],
                    "bbox": (x1, y1, x2, y2),
                    "prediction": recognition["prediction"],
                    "best_pet": recognition["best_pet"],
                    "best_score": recognition["best_score"],
                    "margin": recognition["margin"],
                    "accepted": recognition["accepted"],
                }
            )

    final_prediction = choose_final_prediction(accepted_counts)

    return {
        "final_prediction": final_prediction,
        "accepted": final_prediction != "unknown",
        "accepted_counts": accepted_counts,
        "frame_results": frame_results,
    }


def best_allowed_detection(results, model):
    best_match = None

    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])
        label = model.names[cls_id]

        if label not in ALLOWED_CLASSES:
            continue

        if confidence < YOLO_CONFIDENCE_THRESHOLD:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0])

        candidate = {
            "label": label,
            "confidence": confidence,
            "bbox": (x1, y1, x2, y2),
        }

        if best_match is None or confidence > best_match["confidence"]:
            best_match = candidate

    return best_match

def print_yolo_detections(frame_index: int, results, model) -> None:
    boxes = results[0].boxes

    if len(boxes) == 0:
        print(f"Frame {frame_index}: YOLO detected nothing")
        return

    print(f"Frame {frame_index}: YOLO detections")

    for box in boxes:
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])
        label = model.names[cls_id]
        x1, y1, x2, y2 = map(int, box.xyxy[0])

        allowed = "allowed" if label in ALLOWED_CLASSES else "ignored"

        print(
            f"  {label} "
            f"conf={confidence:.2f} "
            f"bbox=({x1}, {y1}, {x2}, {y2}) "
            f"{allowed}"
        )

def add_padding(
    bbox: tuple[int, int, int, int],
    image_width: int,
    image_height: int,
    padding_ratio: float,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox

    box_width = x2 - x1
    box_height = y2 - y1

    pad_x = int(box_width * padding_ratio)
    pad_y = int(box_height * padding_ratio)

    return (
        max(0, x1 - pad_x),
        max(0, y1 - pad_y),
        min(image_width, x2 + pad_x),
        min(image_height, y2 + pad_y),
    )


def choose_final_prediction(accepted_counts: Counter) -> str:
    if not accepted_counts:
        return "unknown"

    best_pet, best_count = accepted_counts.most_common(1)[0]

    if best_count < MIN_ACCEPTED_FRAMES:
        return "unknown"

    return best_pet


def print_burst_result(result: dict) -> None:
    print("Frame results:")

    for frame_result in result["frame_results"]:
        frame = frame_result["frame"]
        status = frame_result["status"]

        if status != "recognized":
            print(f"  Frame {frame}: {status}")
            continue

        print(
            f"  Frame {frame}: "
            f"yolo={frame_result['yolo_label']} "
            f"yolo_conf={frame_result['yolo_confidence']:.2f} "
            f"prediction={frame_result['prediction']} "
            f"best={frame_result['best_pet']} "
            f"score={frame_result['best_score']:.4f} "
            f"margin={frame_result['margin']:.4f} "
            f"accepted={frame_result['accepted']}"
        )

    print("\nBurst decision:")
    print(f"  Accepted counts:  {dict(result['accepted_counts'])}")
    print(f"  Final prediction: {result['final_prediction']}")
    print(f"  Accepted:         {result['accepted']}")

    if SAVE_DEBUG_CROPS:
        print(f"\nSaved debug frames to {DEBUG_FRAME_DIR}")
        print(f"Saved debug crops to {DEBUG_CROP_DIR}")


if __name__ == "__main__":
    main()