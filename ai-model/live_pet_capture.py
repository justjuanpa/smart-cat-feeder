import atexit
from pathlib import Path
import time

import cv2
from picamera2 import Picamera2
from ultralytics import YOLO


BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "yolov8n_ncnn_model"
CAPTURE_DIR = BASE_DIR / "captured_pets"
ALLOWED_CLASSES = {"cat", "dog", "teddy bear"}
DEFAULT_CONFIDENCE = 0.5
DEFAULT_FRAME_COUNT = 8

_MODEL = None
_CAMERA = None
_CAMERA_STARTED = False


def load_model():
    global _MODEL

    if _MODEL is None:
        _MODEL = YOLO(str(MODEL_DIR), task="detect")

    return _MODEL


def create_camera():
    picam2 = Picamera2()
    config = picam2.create_preview_configuration(
        main={"size": (640, 480), "format": "RGB888"}
    )
    picam2.configure(config)
    return picam2


def get_camera():
    global _CAMERA

    if _CAMERA is None:
        _CAMERA = create_camera()

    return _CAMERA


def ensure_camera_started(warmup_seconds=1.0):
    global _CAMERA_STARTED

    picam2 = get_camera()
    if not _CAMERA_STARTED:
        picam2.start()
        time.sleep(warmup_seconds)
        _CAMERA_STARTED = True

    return picam2


def close_camera():
    global _CAMERA
    global _CAMERA_STARTED

    if _CAMERA is not None:
        if _CAMERA_STARTED:
            _CAMERA.stop()
        _CAMERA.close()

    _CAMERA = None
    _CAMERA_STARTED = False


def best_allowed_detection(results, model, conf_threshold=DEFAULT_CONFIDENCE):
    best_match = None

    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = model.names[cls_id]

        if label not in ALLOWED_CLASSES or conf < conf_threshold:
            continue

        x1, y1, x2, y2 = map(int, box.xyxy[0])
        candidate = {
            "label": label,
            "confidence": conf,
            "bbox": (x1, y1, x2, y2),
        }

        if best_match is None or conf > best_match["confidence"]:
            best_match = candidate

    return best_match


def detect_allowed_pet(
    frame_count=DEFAULT_FRAME_COUNT,
    conf_threshold=DEFAULT_CONFIDENCE,
    warmup_seconds=1.0,
):
    model = load_model()
    picam2 = ensure_camera_started(warmup_seconds)
    best_match = None

    for _ in range(frame_count):
        frame = picam2.capture_array()
        results = model(frame, verbose=False)
        candidate = best_allowed_detection(results, model, conf_threshold)

        if candidate and (
            best_match is None or candidate["confidence"] > best_match["confidence"]
        ):
            best_match = candidate

    return best_match


def run_live_preview(
    conf_threshold=DEFAULT_CONFIDENCE,
    save_interval=2,
    save_dir=CAPTURE_DIR,
):
    model = load_model()
    picam2 = ensure_camera_started(2)
    save_path = Path(save_dir)
    last_save_time = 0.0

    save_path.mkdir(parents=True, exist_ok=True)

    try:
        while True:
            frame = picam2.capture_array()
            results = model(frame, verbose=False)
            annotated = results[0].plot()
            best_match = best_allowed_detection(results, model, conf_threshold)
            pet_found = best_match is not None

            if pet_found and time.time() - last_save_time > save_interval:
                timestamp = int(time.time())
                x1, y1, x2, y2 = best_match["bbox"]
                crop = frame[y1:y2, x1:x2]

                full_path = save_path / f"{best_match['label']}_full_{timestamp}.jpg"
                crop_path = save_path / f"{best_match['label']}_crop_{timestamp}.jpg"

                cv2.imwrite(str(full_path), frame)
                cv2.imwrite(str(crop_path), crop)
                print(f"Saved {full_path} and {crop_path}")
                last_save_time = time.time()

            status = "Pet Detected" if pet_found else "No Pet Detected"
            cv2.putText(
                annotated,
                status,
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0) if pet_found else (0, 0, 255),
                2,
            )

            cv2.imshow("Live Pet Capture", annotated)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
    finally:
        cv2.destroyAllWindows()
        close_camera()


atexit.register(close_camera)


if __name__ == "__main__":
    run_live_preview()
