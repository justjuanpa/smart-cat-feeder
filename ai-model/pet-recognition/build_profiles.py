from pathlib import Path

from pet_recognizer import PetRecognizer, image_files, save_profiles


SCRIPT_DIR = Path(__file__).resolve().parent

BASE_DIR = SCRIPT_DIR / "known_pets"
PROFILE_PATH = SCRIPT_DIR / "pet_profiles.npz"

PET_TRAIN_FOLDERS = {
    "spiderman": [
        BASE_DIR / "pet1" / "train",
        BASE_DIR / "pet1" / "train_camera",
    ],
    "grogu": [
        BASE_DIR / "pet2" / "train",
        BASE_DIR / "pet2" / "train_camera",
    ],
}


def main():
    recognizer = PetRecognizer()

    print("Building pet profiles...")

    profiles = {}

    for pet_name, train_folders in PET_TRAIN_FOLDERS.items():
        profiles[pet_name] = recognizer.build_profile_from_folders(train_folders)
        image_count = count_images(train_folders)

        print(f"Built profile for {pet_name} using {image_count} images.")

    save_profiles(profiles, PROFILE_PATH)

    print(f"\nSaved profiles to {PROFILE_PATH}")


def count_images(folders: list[Path]) -> int:
    total = 0

    for folder in folders:
        if folder.exists():
            total += len(image_files(folder))

    return total


if __name__ == "__main__":
    main()