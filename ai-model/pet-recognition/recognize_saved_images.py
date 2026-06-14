from pathlib import Path

from pet_recognizer import PetRecognizer, image_files, load_profiles


SCRIPT_DIR = Path(__file__).resolve().parent

BASE_DIR = SCRIPT_DIR / "known_pets"
UNKNOWN_DIR = SCRIPT_DIR / "unknown"
PROFILE_PATH = SCRIPT_DIR / "pet_profiles.npz"

PET_FOLDERS = {
    "spiderman": BASE_DIR / "pet1",
    "grogu": BASE_DIR / "pet2",
}


def main():
    recognizer = PetRecognizer(
        similarity_threshold=0.70,
        margin_threshold=0.08,
    )

    profiles = load_profiles(PROFILE_PATH)

    print(f"Loaded profiles from {PROFILE_PATH}")
    print("\nTesting images...\n")

    total = 0
    correct = 0

    for expected_pet, pet_folder in PET_FOLDERS.items():
        test_folder = pet_folder / "test"

        for img_path in image_files(test_folder):
            is_correct = test_image(recognizer, img_path, profiles, expected_pet)
            total += 1
            correct += int(is_correct)

    if UNKNOWN_DIR.exists():
        for img_path in image_files(UNKNOWN_DIR):
            is_correct = test_image(recognizer, img_path, profiles, "unknown")
            total += 1
            correct += int(is_correct)
    else:
        print(f"Unknown folder not found, skipping: {UNKNOWN_DIR}\n")

    accuracy = correct / total if total else 0
    print(f"Final accuracy: {correct}/{total} = {accuracy:.2%}")


def test_image(
    recognizer: PetRecognizer,
    img_path: Path,
    profiles: dict,
    expected_pet: str,
) -> bool:
    result = recognizer.recognize(img_path, profiles)

    prediction = result["prediction"]
    is_correct = prediction == expected_pet
    status = "CORRECT" if is_correct else "WRONG"

    print(img_path.name)
    print(f"  Expected:    {expected_pet}")
    print(f"  Predicted:   {prediction}")
    print(f"  Best match:  {result['best_pet']}")
    print(f"  Best score:  {result['best_score']:.4f}")
    print(f"  Margin:      {result['margin']:.4f}")
    print(f"  Accepted:    {result['accepted']}")
    print(f"  All scores:  {format_scores(result['scores'])}")
    print(f"  Result:      {status}\n")

    return is_correct


def format_scores(scores: dict[str, float]) -> str:
    return ", ".join(
        f"{pet_name}={score:.4f}"
        for pet_name, score in sorted(scores.items())
    )


if __name__ == "__main__":
    main()