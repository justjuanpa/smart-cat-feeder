from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights


BASE_DIR = Path("ai-model/pet-recognition/known_pets")

PET_FOLDERS = {
    "spiderman": BASE_DIR / "pet1",
    "grogu": BASE_DIR / "pet2",
}

SIMILARITY_THRESHOLD = 0.70


weights = MobileNet_V2_Weights.DEFAULT
model = mobilenet_v2(weights=weights)
model.classifier = torch.nn.Identity()
model.eval()

preprocess = weights.transforms()


def get_embedding(img_path: Path) -> np.ndarray:
    img = Image.open(img_path).convert("RGB")
    img_tensor = preprocess(img).unsqueeze(0)

    with torch.no_grad():
        embedding = model(img_tensor)[0].numpy()

    norm = np.linalg.norm(embedding)
    if norm == 0:
        raise ValueError(f"Zero-norm embedding for {img_path}")

    return embedding / norm


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def image_files(folder: Path):
    valid_exts = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}
    return sorted([p for p in folder.iterdir() if p.suffix in valid_exts])


def build_pet_profile(train_folder: Path) -> np.ndarray:
    files = image_files(train_folder)

    if not files:
        raise FileNotFoundError(f"No training images found in {train_folder}")

    embeddings = [get_embedding(file) for file in files]
    profile = np.mean(embeddings, axis=0)
    profile = profile / np.linalg.norm(profile)

    return profile


def recognize_image(img_path: Path, profiles: dict[str, np.ndarray]):
    test_embedding = get_embedding(img_path)

    scores = {
        pet_name: cosine_similarity(test_embedding, profile)
        for pet_name, profile in profiles.items()
    }

    best_pet = max(scores, key=scores.get)
    best_score = scores[best_pet]

    if best_score < SIMILARITY_THRESHOLD:
        prediction = "unknown"
    else:
        prediction = best_pet

    return prediction, best_score, scores


def main():
    print("Building pet profiles...")

    profiles = {}
    for pet_name, pet_folder in PET_FOLDERS.items():
        train_folder = pet_folder / "train"
        profiles[pet_name] = build_pet_profile(train_folder)
        print(f"Built profile for {pet_name} using {len(image_files(train_folder))} images.")

    print("\nTesting images...\n")

    total = 0
    correct = 0

    for expected_pet, pet_folder in PET_FOLDERS.items():
        test_folder = pet_folder / "test"

        for img_path in image_files(test_folder):
            prediction, best_score, scores = recognize_image(img_path, profiles)

            is_correct = prediction == expected_pet
            total += 1
            correct += int(is_correct)

            result = "CORRECT" if is_correct else "WRONG"

            print(f"{img_path.name}")
            print(f"  Expected:   {expected_pet}")
            print(f"  Predicted:  {prediction}")
            print(f"  Best score: {best_score:.4f}")
            print(f"  All scores: {scores}")
            print(f"  Result:     {result}\n")

    accuracy = correct / total if total else 0
    print(f"Final accuracy: {correct}/{total} = {accuracy:.2%}")


if __name__ == "__main__":
    main()