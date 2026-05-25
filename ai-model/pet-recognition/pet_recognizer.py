from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2


VALID_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}


class PetRecognizer:
    def __init__(
        self,
        similarity_threshold: float = 0.70,
        margin_threshold: float = 0.08,
    ):
        self.similarity_threshold = similarity_threshold
        self.margin_threshold = margin_threshold

        self.weights = MobileNet_V2_Weights.DEFAULT
        self.model = mobilenet_v2(weights=self.weights)
        self.model.classifier = torch.nn.Identity()
        self.model.eval()

        self.preprocess = self.weights.transforms()

    def get_embedding(self, img_path: Path) -> np.ndarray:
        img = Image.open(img_path).convert("RGB")
        img_tensor = self.preprocess(img).unsqueeze(0)

        with torch.no_grad():
            embedding = self.model(img_tensor)[0].numpy()

        return self._normalize(embedding, f"embedding for {img_path}")

    def build_profile(self, train_folder: Path) -> np.ndarray:
        files = image_files(train_folder)

        if not files:
            raise FileNotFoundError(f"No training images found in {train_folder}")

        embeddings = [self.get_embedding(file) for file in files]
        profile = np.mean(embeddings, axis=0)

        return self._normalize(profile, f"profile for {train_folder}")

    def recognize(self, img_path: Path, profiles: dict[str, np.ndarray]) -> dict:
        test_embedding = self.get_embedding(img_path)

        scores = {
            pet_name: cosine_similarity(test_embedding, profile)
            for pet_name, profile in profiles.items()
        }

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        best_pet, best_score = ranked[0]

        second_score = ranked[1][1] if len(ranked) > 1 else 0.0
        margin = best_score - second_score

        accepted = (
            best_score >= self.similarity_threshold
            and margin >= self.margin_threshold
        )

        prediction = best_pet if accepted else "unknown"

        return {
            "prediction": prediction,
            "best_pet": best_pet,
            "best_score": best_score,
            "second_score": second_score,
            "margin": margin,
            "scores": scores,
            "accepted": accepted,
        }

    def _normalize(self, vector: np.ndarray, label: str) -> np.ndarray:
        norm = np.linalg.norm(vector)

        if norm == 0:
            raise ValueError(f"Zero-norm vector while creating {label}")

        return vector / norm


def image_files(folder: Path) -> list[Path]:
    return sorted([p for p in folder.iterdir() if p.suffix in VALID_IMAGE_EXTS])


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def save_profiles(profiles: dict[str, np.ndarray], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(output_path, **profiles)


def load_profiles(profile_path: Path) -> dict[str, np.ndarray]:
    if not profile_path.exists():
        raise FileNotFoundError(f"Profile file not found: {profile_path}")

    data = np.load(profile_path)
    return {pet_name: data[pet_name] for pet_name in data.files}