# Feeder Device (Raspberry Pi)

This code runs on the Raspberry Pi connected to the feeder. It:

1. Captures an image from the Pi camera.
2. Runs facial/cat recognition to check if the cat is Mimi.
3. If it is Mimi, opens the feeder (servo/motor).
4. Sends a log to the backend.

## Run

pip install -r requirements.txt
python src/main.py
