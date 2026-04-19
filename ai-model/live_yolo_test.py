from picamera2 import Picamera2
from ultralytics import YOLO
import cv2
import time

picam2 = Picamera2()
config = picam2.create_preview_configuration(
    main={"size": (640, 480), "format": "RGB888"}
)
picam2.configure(config)
picam2.start()
time.sleep(2)

model = YOLO("yolov8n_ncnn_model", task="detect")

while True:
    frame = picam2.capture_array()

    results = model(frame, verbose=False)
    annotated = results[0].plot()

    cv2.imshow("Live YOLO Detection", annotated)

    key = cv2.waitKey(1) & 0xFF
    if key == ord("q"):
        break

cv2.destroyAllWindows()
picam2.stop()