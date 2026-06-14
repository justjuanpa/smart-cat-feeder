from collections import Counter
from pathlib import Path

from pet_recognizer import PetRecognizer, image_files, load_profiles


SCRIPT_DIR = Path(__file__).resolve().parent

YOLO_CROP_DIR = SCRIPT_DIR / "yolo_crop_tests"
PROFILE_PATH = SCRIPT_DIR / "pet_profiles.npz"

TEST_FOLDERS = {
    "spiderman": YOLO_CROP_DIR / "pet1",
    "grogu": YOLO_CROP_DIR / "pet2",
    "unknown": YOLO_CROP_DIR / "unknown",
}

MIN_ACCEPTED_FRAMES = 2


def main():
    recognizer = PetRecognizer(
        similarity_threshold=0.70,
        margin_threshold=0.08,
    )

    profiles = load_profiles(PROFILE_PATH)

    print(f"Loaded profiles from {PROFILE_PATH}")
    print(f"Evaluating burst folders from {YOLO_CROP_DIR}")
    print(f"Minimum accepted frames: {MIN_ACCEPTED_FRAMES}\n")

    total = 0
    correct = 0

    for expected_pet, folder in TEST_FOLDERS.items():
        result = evaluate_burst(recognizer, folder, profiles)

        final_prediction = result["final_prediction"]
        is_correct = final_prediction == expected_pet

        total += 1
        correct += int(is_correct)

        status = "CORRECT" if is_correct else "WRONG"

        print(f"{folder.name}/")
        print(f"  Expected:          {expected_pet}")
        print(f"  Final prediction:  {final_prediction}")
        print(f"  Accepted counts:   {dict(result['accepted_counts'])}")
        print(f"  Frames evaluated:  {result['frames_evaluated']}")
        print(f"  Accepted frames:   {result['accepted_frames']}")
        print(f"  Result:            {status}")

        for frame_result in result["frame_results"]:
            print(
                f"    {frame_result['image_name']}: "
                f"prediction={frame_result['prediction']} "
                f"best={frame_result['best_pet']} "
                f"score={frame_result['best_score']:.4f} "
                f"margin={frame_result['margin']:.4f} "
                f"accepted={frame_result['accepted']}"
            )

        print()

    accuracy = correct / total if total else 0
    print(f"Final burst accuracy: {correct}/{total} = {accuracy:.2%}")


def evaluate_burst(
    recognizer: PetRecognizer,
    folder: Path,
    profiles: dict,
) -> dict:
    accepted_counts = Counter()
    frame_results = []

    if not folder.exists():
        return {
            "final_prediction": "unknown",
            "accepted_counts": accepted_counts,
            "frames_evaluated": 0,
            "accepted_frames": 0,
            "frame_results": frame_results,
        }

    for img_path in image_files(folder):
        result = recognizer.recognize(img_path, profiles)

        frame_result = {
            "image_name": img_path.name,
            "prediction": result["prediction"],
            "best_pet": result["best_pet"],
            "best_score": result["best_score"],
            "margin": result["margin"],
            "accepted": result["accepted"],
        }

        frame_results.append(frame_result)

        if result["accepted"]:
            accepted_counts[result["prediction"]] += 1

    final_prediction = choose_final_prediction(accepted_counts)

    return {
        "final_prediction": final_prediction,
        "accepted_counts": accepted_counts,
        "frames_evaluated": len(frame_results),
        "accepted_frames": sum(accepted_counts.values()),
        "frame_results": frame_results,
    }


def choose_final_prediction(accepted_counts: Counter) -> str:
    if not accepted_counts:
        return "unknown"

    best_pet, best_count = accepted_counts.most_common(1)[0]

    if best_count < MIN_ACCEPTED_FRAMES:
        return "unknown"

    return best_pet


if __name__ == "__main__":
    main()