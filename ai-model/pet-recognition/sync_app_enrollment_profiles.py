import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import urllib.error
import urllib.request

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

from pet_recognizer import PetRecognizer, image_files, load_profiles, save_profiles


SCRIPT_DIR = Path(__file__).resolve().parent
AI_MODEL_DIR = SCRIPT_DIR.parent
DEFAULT_TRAIN_DIR = SCRIPT_DIR / "app_enrollment_training"
DEFAULT_CROP_DIR = SCRIPT_DIR / "app_enrollment_training_crops"
DEFAULT_PROFILE_PATH = SCRIPT_DIR / "pet_profiles_phone_sim_crops.npz"
DEFAULT_BOWL_MAP_PATH = SCRIPT_DIR / "pet_bowl_map.json"
DEFAULT_MANIFEST_PATH = SCRIPT_DIR / "app_enrollment_manifest.json"
DEFAULT_MODEL_PATH = AI_MODEL_DIR / "yolov8n_ncnn_model"
ALLOWED_CROP_CLASSES = {"cat", "dog", "teddy bear"}
DEFAULT_YOLO_CONFIDENCE = 0.25
DEFAULT_CROP_PADDING = 0.00


def default_enrollment_url():
    explicit_url = os.getenv("PAWS_PET_ENROLLMENT_URL")
    if explicit_url:
        return explicit_url

    ingest_url = os.getenv("PAWS_INGEST_URL")
    if ingest_url and ingest_url.endswith("/ingest-device"):
        return f"{ingest_url.removesuffix('/ingest-device')}/device-pet-enrollment"

    return None


def fetch_enrollment(url, serial_number, token):
    body = {
        "serial_number": serial_number,
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
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8")
        return error.code, {"error": detail}


class DownloadedImageError(RuntimeError):
    pass


def download_image(url, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(url, timeout=30) as response:
        content = response.read()

    output_path.write_bytes(content)
    validate_image_file(output_path, content)


def validate_image_file(image_path, content):
    try:
        with Image.open(image_path) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as error:
        image_path.unlink(missing_ok=True)
        prefix = content[:80].decode("utf-8", errors="replace").replace("\n", " ")
        raise DownloadedImageError(
            f"{image_path.name} is not a supported image file. First bytes: {prefix!r}"
        ) from error


def sync_training_images(pets, train_dir, clean=False):
    if clean and train_dir.exists():
        shutil.rmtree(train_dir)

    synced_pets = []

    for pet in pets:
        pet_name = str(pet.get("name") or "").strip()
        pet_key = pet_name.lower()
        images = pet.get("images") or []

        if not pet_name or not images:
            print(f"Skipping {pet_name or 'unnamed pet'}: no enrollment images.")
            continue

        pet_dir = train_dir / slugify(pet_name)
        pet_dir.mkdir(parents=True, exist_ok=True)

        downloaded = 0
        for index, image in enumerate(images, start=1):
            signed_url = image.get("signed_url")
            storage_path = image.get("storage_path") or f"{pet_key}-{index}.jpg"

            if not signed_url:
                continue

            output_path = pet_dir / local_image_name(storage_path, index)
            if output_path.exists() and output_path.stat().st_size > 0:
                try:
                    validate_image_file(output_path, output_path.read_bytes())
                    downloaded += 1
                except DownloadedImageError as error:
                    print(f"Skipping invalid cached image for {pet_name}: {error}")
                continue

            print(f"Downloading {pet_name}: {storage_path}")
            try:
                download_image(signed_url, output_path)
                downloaded += 1
            except DownloadedImageError as error:
                print(f"Skipping invalid enrollment image for {pet_name}: {error}")

        if downloaded:
            synced_pets.append((pet_key, pet_dir))
            print(f"Synced {downloaded} enrollment image(s) for {pet_name}.")

    return synced_pets


def crop_training_images(
    synced_pets,
    crop_dir,
    model_path,
    confidence_threshold,
    padding_ratio,
    clean=False,
):
    if clean and crop_dir.exists():
        shutil.rmtree(crop_dir)

    if not synced_pets:
        return []

    model = YOLO(str(model_path), task="detect")
    cropped_pets = []

    print(f"Loaded YOLO model from {model_path} for enrollment crops.")

    for pet_key, pet_dir in synced_pets:
        pet_crop_dir = crop_dir / pet_key
        pet_crop_dir.mkdir(parents=True, exist_ok=True)

        cropped = 0
        for image_path in image_files(pet_dir):
            output_path = pet_crop_dir / f"{image_path.stem}.jpg"
            if output_path.exists() and output_path.stat().st_size > 0:
                cropped += 1
                continue

            if crop_training_image(
                model=model,
                image_path=image_path,
                output_path=output_path,
                confidence_threshold=confidence_threshold,
                padding_ratio=padding_ratio,
            ):
                cropped += 1

        if cropped:
            cropped_pets.append((pet_key, pet_crop_dir))
            print(f"Cropped {cropped} enrollment image(s) for {pet_key}.")
        else:
            print(f"Skipping {pet_key}: YOLO found no cat, dog, or teddy bear crops.")

    return cropped_pets


def crop_training_image(model, image_path, output_path, confidence_threshold, padding_ratio):
    image = cv2.imread(str(image_path))

    if image is None:
        print(f"{image_path.name}: could not read image for YOLO crop")
        return False

    results = model(image, verbose=False)
    detection = best_allowed_detection(results, model, confidence_threshold)

    if detection is None:
        print(f"{image_path.name}: no cat, dog, or teddy bear YOLO detection")
        return False

    x1, y1, x2, y2 = add_padding(
        detection["bbox"],
        image_width=image.shape[1],
        image_height=image.shape[0],
        padding_ratio=padding_ratio,
    )
    crop = image[y1:y2, x1:x2]

    if crop.size == 0:
        print(f"{image_path.name}: empty crop from bbox {detection['bbox']}")
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), crop)
    print(
        f"{image_path.name}: saved enrollment crop "
        f"label={detection['label']} "
        f"conf={detection['confidence']:.2f} "
        f"bbox={detection['bbox']}"
    )

    return True


def best_allowed_detection(results, model, confidence_threshold):
    best_match = None

    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        confidence = float(box.conf[0])
        label = model.names[cls_id]

        if label not in ALLOWED_CROP_CLASSES:
            continue

        if confidence < confidence_threshold:
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


def add_padding(bbox, image_width, image_height, padding_ratio):
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


def build_profiles(synced_pets, output_path, min_images, merge_existing=True):
    recognizer = PetRecognizer()
    profiles = load_existing_profiles(output_path) if merge_existing else {}
    updated_pet_keys = set()

    for pet_key, pet_dir in synced_pets:
        count = len(image_files(pet_dir))
        if count < min_images:
            print(
                f"Warning: {pet_key} has {count} image(s); "
                f"{min_images}+ is recommended for enrollment."
            )

        app_profile = recognizer.build_embedding_set_from_folders([pet_dir])
        profiles[pet_key] = app_profile
        updated_pet_keys.add(pet_key)
        print(f"Built profile for {pet_key} from {count} image(s).")

    if not profiles:
        raise RuntimeError(
            "No pet profiles were built. Upload enrollment photos in the app first "
            "or run this on the Pi with an existing profile file to preserve."
        )

    preserved_pet_keys = sorted(set(profiles) - updated_pet_keys)
    if preserved_pet_keys:
        print(f"Preserved existing profile(s): {', '.join(preserved_pet_keys)}.")

    backup_existing_profile(output_path)
    save_profiles(profiles, output_path)
    print(f"Saved enrolled pet profiles to {output_path}")


def save_bowl_map(pets, output_path):
    bowl_map = {}

    for pet in pets:
        pet_name = str(pet.get("name") or "").strip()
        bowl_side = str(pet.get("bowl_side") or "").strip().upper()

        if not pet_name or bowl_side not in {"LEFT", "RIGHT"}:
            continue

        bowl_map[pet_name.lower()] = bowl_side

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bowl_map, indent=2, sort_keys=True), encoding="utf-8")

    if bowl_map:
        readable_map = ", ".join(f"{pet}: {side}" for pet, side in sorted(bowl_map.items()))
        print(f"Saved pet bowl map to {output_path}: {readable_map}")
    else:
        print(f"Saved empty pet bowl map to {output_path}")


def load_existing_profiles(profile_path):
    if not profile_path.exists():
        return {}

    profiles = load_profiles(profile_path)
    print(f"Loaded existing profile(s): {', '.join(sorted(profiles))}.")

    return profiles


def enrollment_manifest_hash(pets):
    manifest = []

    for pet in pets:
        images = pet.get("images") or []
        manifest.append(
            {
                "name": str(pet.get("name") or "").strip().lower(),
                "bowl_side": str(pet.get("bowl_side") or "").strip().upper(),
                "images": sorted(
                    str(image.get("storage_path") or "")
                    for image in images
                    if image.get("storage_path")
                ),
            }
        )

    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def manifest_is_unchanged(manifest_path, manifest_hash):
    if not manifest_path.exists():
        return False

    try:
        cached = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return cached.get("hash") == manifest_hash


def save_manifest(manifest_path, manifest_hash):
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps({"hash": manifest_hash}, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"Saved enrollment manifest cache to {manifest_path}")


def backup_existing_profile(profile_path):
    if not profile_path.exists():
        return

    backup_path = profile_path.with_suffix(f"{profile_path.suffix}.bak")
    shutil.copy2(profile_path, backup_path)
    print(f"Backed up previous profile file to {backup_path}")


def local_image_name(storage_path, index):
    source_name = Path(storage_path).name
    suffix = Path(source_name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png"}:
        suffix = ".jpg"

    stem = re.sub(r"[^a-zA-Z0-9_.-]+", "-", Path(source_name).stem).strip("-")
    if not stem:
        stem = f"enrollment-{index}"

    return f"{index:03d}-{stem}{suffix}"


def slugify(value):
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return slug or "pet"


def main():
    parser = argparse.ArgumentParser(
        description="Sync pet enrollment photos from the PAWS app and rebuild Pi recognition profiles."
    )
    parser.add_argument(
        "--url",
        default=default_enrollment_url(),
        help="Supabase Edge Function URL for device-pet-enrollment.",
    )
    parser.add_argument(
        "--serial",
        default=os.getenv("PAWS_DEVICE_SERIAL", "PAWS-DEMO-001"),
        help="Provisioned feeder serial number.",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("PAWS_DEVICE_TOKEN"),
        help="Plain device token configured during provisioning.",
    )
    parser.add_argument(
        "--train-dir",
        type=Path,
        default=DEFAULT_TRAIN_DIR,
        help="Local folder where enrollment images should be downloaded.",
    )
    parser.add_argument(
        "--output-profile",
        type=Path,
        default=DEFAULT_PROFILE_PATH,
        help="Recognition profile .npz file to write.",
    )
    parser.add_argument(
        "--output-bowl-map",
        type=Path,
        default=DEFAULT_BOWL_MAP_PATH,
        help="Pet-to-bowl JSON map to write for uart_pet_gate.py.",
    )
    parser.add_argument(
        "--manifest-cache",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Manifest hash cache used to skip unchanged enrollment rebuilds.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild profiles even when the enrollment manifest has not changed.",
    )
    parser.add_argument(
        "--crop-dir",
        type=Path,
        default=DEFAULT_CROP_DIR,
        help="Local folder where YOLO-cropped enrollment images should be written.",
    )
    parser.add_argument(
        "--yolo-model-path",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help="YOLO model path used to crop app enrollment images.",
    )
    parser.add_argument(
        "--yolo-confidence",
        type=float,
        default=DEFAULT_YOLO_CONFIDENCE,
        help="Minimum YOLO confidence for enrollment crops.",
    )
    parser.add_argument(
        "--crop-padding",
        type=float,
        default=DEFAULT_CROP_PADDING,
        help="Padding ratio around YOLO enrollment crops.",
    )
    parser.add_argument(
        "--no-yolo-crop",
        action="store_true",
        help="Build app-enrolled profiles from full downloaded images instead of YOLO crops.",
    )
    parser.add_argument(
        "--min-images",
        type=int,
        default=5,
        help="Recommended minimum image count per pet before warning.",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Delete the local enrollment image folder before downloading.",
    )
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help=(
            "Replace the profile file with only app enrollment images. "
            "By default, existing Pi-trained profiles are preserved for pets without app images."
        ),
    )
    args = parser.parse_args()

    if not args.url or not args.token:
        print("PAWS_PET_ENROLLMENT_URL and PAWS_DEVICE_TOKEN are required.", file=sys.stderr)
        return 2

    status, response = fetch_enrollment(args.url, args.serial, args.token)
    if status < 200 or status >= 300:
        print(f"Enrollment sync failed <= HTTP {status}: {response}", file=sys.stderr)
        return 1

    pets = response.get("pets", [])
    manifest_hash = enrollment_manifest_hash(pets)
    if not args.force and manifest_is_unchanged(args.manifest_cache, manifest_hash):
        print("Enrollment manifest unchanged; skipping profile rebuild.")
        return 0

    synced_pets = sync_training_images(pets, args.train_dir, clean=args.clean)
    save_bowl_map(pets, args.output_bowl_map)
    profile_pets = (
        synced_pets
        if args.no_yolo_crop
        else crop_training_images(
            synced_pets=synced_pets,
            crop_dir=args.crop_dir,
            model_path=args.yolo_model_path,
            confidence_threshold=args.yolo_confidence,
            padding_ratio=args.crop_padding,
            clean=args.clean,
        )
    )
    build_profiles(
        profile_pets,
        args.output_profile,
        args.min_images,
        merge_existing=not args.replace_existing,
    )
    save_manifest(args.manifest_cache, manifest_hash)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
