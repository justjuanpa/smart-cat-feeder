#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/justjuanpa/Projects/smart-cat-feeder}"
VENV_DIR="${VENV_DIR:-$REPO_DIR/.venv-torch-test}"

cd "$REPO_DIR"
source "$VENV_DIR/bin/activate"

exec python ai-model/uart_pet_gate.py \
  --no-save-debug \
  --enable-scheduled-dispense
