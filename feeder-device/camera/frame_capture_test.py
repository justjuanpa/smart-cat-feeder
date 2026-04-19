from picamera2 import Picamera2
import cv2
import time

picam2 = Picamera2()

config = picam2.create_preview_configuration(
    main={"size": (640, 480), "format": "RGB888"}
)

picam2.configure(config)
picam2.start()

time.sleep(2) # allow camera to warm up

frame = picam2.capture_array()

cv2.imwrite("test_frame.jpg", frame)

print("Saved test_frame.jpg")

picam2.stop()