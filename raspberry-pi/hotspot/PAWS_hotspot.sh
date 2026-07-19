#!/bin/bash
set -euo pipefail

HOTSPOT_NAME="PAWS_Setup"
HOTSPOT_PASSWORD="paws12345"

nmcli connection delete "$HOTSPOT_NAME" 2>/dev/null || true
nmcli connection add type wifi ifname wlan0 con-name "$HOTSPOT_NAME" autoconnect no ssid "$HOTSPOT_NAME"
nmcli connection modify "$HOTSPOT_NAME" \
  802-11-wireless.mode ap \
  802-11-wireless.band bg \
  ipv4.method shared \
  ipv4.addresses 10.42.0.1/24 \
  ipv6.method disabled
nmcli connection modify "$HOTSPOT_NAME" \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$HOTSPOT_PASSWORD"
