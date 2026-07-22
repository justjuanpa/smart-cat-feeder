#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/paws-feeder"
CONFIG_DIR="/etc/paws-feeder"
SYSTEMD_DIR="/etc/systemd/system"

sudo install -d -m 755 "$INSTALL_DIR"
sudo install -d -m 755 "$CONFIG_DIR"

sudo install -m 755 "$SCRIPT_DIR/scripts/run-feeder.sh" "$INSTALL_DIR/run-feeder.sh"
sudo install -m 755 "$SCRIPT_DIR/scripts/sync-enrollment.sh" "$INSTALL_DIR/sync-enrollment.sh"

sudo install -m 644 "$SCRIPT_DIR/paws-feeder.service" "$SYSTEMD_DIR/paws-feeder.service"
sudo install -m 644 "$SCRIPT_DIR/paws-enrollment-sync.service" "$SYSTEMD_DIR/paws-enrollment-sync.service"
sudo install -m 644 "$SCRIPT_DIR/paws-enrollment-sync.timer" "$SYSTEMD_DIR/paws-enrollment-sync.timer"

if [ ! -f "$CONFIG_DIR/paws.env" ]; then
  sudo install -m 600 "$SCRIPT_DIR/paws.env.example" "$CONFIG_DIR/paws.env"
  echo "Created $CONFIG_DIR/paws.env from the example."
  echo "Edit it and replace PAWS_DEVICE_TOKEN before starting services."
fi

sudo systemctl daemon-reload

echo "Installed PAWS systemd units."
echo
echo "Next:"
echo "  sudo nano $CONFIG_DIR/paws.env"
echo "  sudo systemctl enable --now paws-feeder.service"
echo "  sudo systemctl enable --now paws-enrollment-sync.timer"
echo "  sudo systemctl start paws-enrollment-sync.service"
