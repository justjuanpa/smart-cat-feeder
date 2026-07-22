# PAWS Raspberry Pi Automation

This folder turns the Raspberry Pi into a power-on PAWS feeder runtime.

It installs:

- `paws-feeder.service`: runs the live UART, camera, CV, schedule, dispense, and cloud-ingestion process.
- `paws-enrollment-sync.service`: syncs app-uploaded pet enrollment photos, crops them, and rebuilds recognition profiles.
- `paws-enrollment-sync.timer`: runs enrollment sync on boot and every 2 minutes.

## Install On The Pi

From the repo on the Pi:

```bash
cd /home/justjuanpa/Projects/smart-cat-feeder
bash deployment/pi/install.sh
```

Edit the private environment file:

```bash
sudo nano /etc/paws-feeder/paws.env
```

Set the real token:

```bash
PAWS_DEVICE_TOKEN=the_plain_device_token
```

Start and enable the services:

```bash
sudo systemctl enable --now paws-feeder.service
sudo systemctl enable --now paws-enrollment-sync.timer
sudo systemctl start paws-enrollment-sync.service
```

## Check Status

```bash
systemctl status paws-feeder.service
systemctl status paws-enrollment-sync.timer
systemctl status paws-enrollment-sync.service
```

Live feeder logs:

```bash
journalctl -u paws-feeder.service -f
```

Enrollment sync logs:

```bash
journalctl -u paws-enrollment-sync.service -n 80
```

## Stop / Restart

```bash
sudo systemctl restart paws-feeder.service
sudo systemctl stop paws-feeder.service
```

## Notes

- Keep `/etc/paws-feeder/paws.env` private.
- The feeder service restarts automatically if it crashes.
- Enrollment sync is idempotent: unchanged app enrollment data is skipped.
- If enrollment profiles change, the sync service restarts the feeder service so the new `.npz` profile is loaded.
