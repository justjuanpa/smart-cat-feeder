from pathlib import Path

from pet_recognizer import PetRecognizer, image_files, save_profiles


SCRIPT_DIR = Path(__file__).resolve().parent

PHONE_CROP_TRAIN_DIR = SCRIPT_DIR / "train_phone_sim_crops"
PROFILE_PATH = SCRIPT_DIR / "pet_profiles_phone_sim_crops.npz"

PET_TRAIN_FOLDERS = {
    "spiderman": [PHONE_CROP_TRAIN_DIR / "pet1"],
    "milo": [PHONE_CROP_TRAIN_DIR / "pet2"],
    "mimi": [PHONE_CROP_TRAIN_DIR / "pet3"],
}


def main():
    recognizer = PetRecognizer()

    print("Building phone-sim cropped pet profiles...")

    profiles = {}

    for pet_name, train_folders in PET_TRAIN_FOLDERS.items():
        profiles[pet_name] = recognizer.build_embedding_set_from_folders(train_folders)
        image_count = count_images(train_folders)

        print(f"Built profile for {pet_name} using {image_count} images.")

    save_profiles(profiles, PROFILE_PATH)

    print(f"\nSaved phone-sim cropped profiles to {PROFILE_PATH}")


def count_images(folders: list[Path]) -> int:
    total = 0

    for folder in folders:
        if folder.exists():
            total += len(image_files(folder))

    return total


if __name__ == "__main__":
    main()