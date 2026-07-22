#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/justjuanpa/Projects/smart-cat-feeder}"
VENV_DIR="${VENV_DIR:-$REPO_DIR/.venv-torch-test}"
PROFILE_PATH="$REPO_DIR/ai-model/pet-recognition/pet_profiles_phone_sim_crops.npz"
UPDATE_MARKER="/tmp/paws-enrollment-updated"

profile_hash() {
  if [ -f "$PROFILE_PATH" ]; then
    sha256sum "$PROFILE_PATH" | awk '{print $1}'
  else
    echo ""
  fi
}

cd "$REPO_DIR"
source "$VENV_DIR/bin/activate"

before_hash="$(profile_hash)"
python ai-model/pet-recognition/sync_app_enrollment_profiles.py
after_hash="$(profile_hash)"

if [ "$before_hash" != "$after_hash" ]; then
  touch "$UPDATE_MARKER"
  echo "Enrollment profiles changed; feeder service will be restarted."
else
  rm -f "$UPDATE_MARKER"
  echo "Enrollment profiles unchanged; feeder service will keep running."
fi
