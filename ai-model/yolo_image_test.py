from ultralytics import YOLO
import cv2

# Load YOLO model
model = YOLO("yolov8n_ncnn_model", task="detect")

# Image you captured earlier from the pi camera
image_path = "../feeder-device/camera/test_frame.jpg"

# Run detection
results = model(image_path)

# Draw detection boxes
annotated = results[0].plot()

# Save result image
cv2.imwrite("yolo_result.jpg", annotated)

# Print detections
for box in results[0].boxes:
    cls_id = int(box.cls[0])
    conf = float(box.conf[0])
    label = model.names[cls_id]
    print(f"{label}: {conf:.2f}")

print("Saved yolo_result.jpg")