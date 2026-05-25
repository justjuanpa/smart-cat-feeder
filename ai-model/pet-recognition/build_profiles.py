from pathlib import Path

from pet_recognizer import PetRecognizer, image_files, save_profiles


BASE_DIR = Path("ai-model/pet-recognition/known_pets")
PROFILE_PATH = Path("ai-model/pet-recognition/pet_profiles.npz")

PET_FOLDERS = {
    "spiderman": BASE_DIR / "pet1",
    "grogu": BASE_DIR / "pet2",
}


def main():
    recognizer = PetRecognizer()

    print("Building pet profiles...")

    profiles = {}

    for pet_name, pet_folder in PET_FOLDERS.items():
        train_folder = pet_folder / "train"
        profiles[pet_name] = recognizer.build_profile(train_folder)

        print(
            f"Built profile for {pet_name} "
            f"using {len(image_files(train_folder))} images."
        )

    save_profiles(profiles, PROFILE_PATH)

    print(f"\nSaved profiles to {PROFILE_PATH}")


if __name__ == "__main__":
    main()