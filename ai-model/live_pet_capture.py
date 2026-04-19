from picamera2 import Picamera2
from ultralytics import YOLO
import cv2
import time
import os

picam2 = Picamera2()
config = picam2.create_preview_configuration(
    main={"size": (640, 480), "format": "RGB888"}
)
picam2.configure(config)
picam2.start()
time.sleep(2)

model = YOLO("yolov8n_ncnn_model", task="detect")

save_dir = "captured_pets"
os.makedirs(save_dir, exist_ok=True)

last_save_time = 0
save_interval = 2  # seconds between saves

allowed_classes = {"cat", "dog", "teddy bear"}

while True:
    frame = picam2.capture_array()
    results = model(frame, verbose=False)
    annotated = results[0].plot()

    pet_found = False

    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = model.names[cls_id]

        if label in allowed_classes and conf > 0.5:
            pet_found = True

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            crop = frame[y1:y2, x1:x2]

            current_time = time.time()
            if current_time - last_save_time > save_interval:
                timestamp = int(current_time)

                full_path = os.path.join(save_dir, f"{label}_full_{timestamp}.jpg")
                crop_path = os.path.join(save_dir, f"{label}_crop_{timestamp}.jpg")

                cv2.imwrite(full_path, frame)
                cv2.imwrite(crop_path, crop)

                print(f"Saved {full_path} and {crop_path}")
                last_save_time = current_time

    status = "Pet Detected" if pet_found else "No Pet Detected"
    cv2.putText(
        annotated,
        status,
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0) if pet_found else (0, 0, 255),
        2
    )

    cv2.imshow("Live Pet Capture", annotated)

    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break

cv2.destroyAllWindows()
picam2.stop()