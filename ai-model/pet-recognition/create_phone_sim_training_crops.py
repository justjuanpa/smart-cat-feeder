from pathlib import Path

import cv2
from ultralytics import YOLO


SCRIPT_DIR = Path(__file__).resolve().parent
AI_MODEL_DIR = SCRIPT_DIR.parent

MODEL_DIR = AI_MODEL_DIR / "yolov8n_ncnn_model"
INPUT_DIR = SCRIPT_DIR / "train_phone_sim"
OUTPUT_DIR = SCRIPT_DIR / "train_phone_sim_crops"

ALLOWED_CLASSES = {"cat", "dog", "teddy bear"}
CONFIDENCE_THRESHOLD = 0.25
PADDING_RATIO = 0.20

PET_FOLDERS = {
    "pet1": INPUT_DIR / "pet1",
    "pet2": INPUT_DIR / "pet2",
    "pet3": INPUT_DIR / "pet3"
}


def main():
    model = YOLO(str(MODEL_DIR), task="detect")

    print(f"Loaded YOLO model from {MODEL_DIR}")
    print(f"Reading training images from {INPUT_DIR}")
    print(f"Saving crops to {OUTPUT_DIR}\n")

    for folder_name, input_folder in PET_FOLDERS.items():
        output_folder = OUTPUT_DIR / folder_name
        output_folder.mkdir(parents=True, exist_ok=True)

        if not input_folder.exists():
            print(f"Skipping missing folder: {input_folder}")
            continue

        for img_path in image_files(input_folder):
            process_image(model, img_path, output_folder)

    print("\nDone creating phone-sim training crops.")


def process_image(model: YOLO, img_path: Path, output_folder: Path) -> None:
    image = cv2.imread(str(img_path))

    if image is None:
        print(f"{img_path.name}: could not read image")
        return

    results = model(image, verbose=False)
    detection = best_allowed_detection(results, model)

    if detection is None:
        print(f"{img_path.name}: no allowed YOLO detection")
        return

    x1, y1, x2, y2 = add_padding(
        detection["bbox"],
        image_width=image.shape[1],
        image_height=image.shape[0],
        padding_ratio=PADDING_RATIO,
    )

    crop = image[y1:y2, x1:x2]

    if crop.size == 0:
        print(f"{img_path.name}: empty crop from bbox {detection['bbox']}")
        return

    output_path = output_folder / img_path.name
    cv2.imwrite(str(output_path), crop)

    print(
        f"{img_path.name}: saved crop "
        f"label={detection['label']} "
        f"conf={detection['confidence']:.2f} "
        f"bbox={detection['bbox']}"
    )


def best_allowed_detection(results, model: YOLO):
    best_match = None

    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])
        label = model.names[cls_id]

        if label not in ALLOWED_CLASSES:
            continue

        if confidence < CONFIDENCE_THRESHOLD:
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


def image_files(folder: Path) -> list[Path]:
    valid_exts = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}
    return sorted([p for p in folder.iterdir() if p.suffix in valid_exts])


if __name__ == "__main__":
    main()