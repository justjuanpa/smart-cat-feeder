import argparse
import json
import os
from pathlib import Path
import re
import shutil
import sys
import urllib.error
import urllib.request

import numpy as np
from PIL import Image, UnidentifiedImageError

from pet_recognizer import PetRecognizer, image_files, load_profiles, save_profiles


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TRAIN_DIR = SCRIPT_DIR / "app_enrollment_training"
DEFAULT_PROFILE_PATH = SCRIPT_DIR / "pet_profiles_phone_sim_crops.npz"


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
        profiles[pet_key] = merge_profile_vectors(profiles.get(pet_key), app_profile)
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


def load_existing_profiles(profile_path):
    if not profile_path.exists():
        return {}

    profiles = load_profiles(profile_path)
    print(f"Loaded existing profile(s): {', '.join(sorted(profiles))}.")

    return profiles


def merge_profile_vectors(existing, incoming):
    if existing is None:
        return incoming

    existing_vectors = np.atleast_2d(existing)
    incoming_vectors = np.atleast_2d(incoming)

    return np.vstack([existing_vectors, incoming_vectors])


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
            "By default, existing Pi-trained profiles are preserved and app images are merged in."
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

    synced_pets = sync_training_images(response.get("pets", []), args.train_dir, clean=args.clean)
    build_profiles(
        synced_pets,
        args.output_profile,
        args.min_images,
        merge_existing=not args.replace_existing,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
