# Smart Pet Feeder with Computer Vision

## Overview

This project is a smart automated pet feeder designed to identify individual pets using computer vision and control feeding access accordingly. The system uses a Raspberry Pi with a camera to detect and recognize pets approaching the feeder. A mobile application allows users to monitor feeding activity and configure feeder settings.

The goal of the project is to ensure that each pet only accesses its assigned food portion while providing remote monitoring and control through a mobile interface.

This system is being developed as part of a Senior Design project.

---

## Python Environment Setup (Computer Vision)

The computer vision components of this project use a Python virtual environment to isolate dependencies and ensure that all required packages are installed locally for the project.

### 1. Navigate to the project directory

cd ~/Projects/smart-cat-feeder

### 2. Create the virtual environment (first time only)

python3 -m venv .venv

### 3. Activate the virtual environment

source .venv/bin/activate

Your terminal should now show:

(.venv)

### 4. Install the required dependencies

pip install -r requirements.txt

---

## Normal Development Workflow

After the virtual environment has been created and dependencies installed, you only need to activate the environment when starting work.

cd ~/Projects/smart-cat-feeder  
source .venv/bin/activate

Then run Python scripts normally, for example:

python ai-model/live_yolo_test.py

---

## System Architecture

The system consists of several main components.

### Computer Vision System

Runs on a Raspberry Pi and performs real-time pet detection using a YOLOv8 model. The camera captures frames which are processed to detect pets approaching the feeder.

### Feeder Device

Controls the mechanical feeding system and sensors responsible for dispensing food.

### Mobile Application

Allows the user to interact with the feeder, monitor activity, and configure feeding behavior.

### Backend Communication

Handles communication between the feeder device and the mobile application.

---

### Directory Descriptions

ai-model/  
Contains the computer vision scripts and exported YOLO model used for pet detection.

feeder-device/  
Contains code related to the Raspberry Pi hardware and camera interface.

mobile-app/  
Will contain the React Native mobile application used to control and monitor the feeder.

---

## Computer Vision Pipeline

The computer vision system runs on a Raspberry Pi using a YOLOv8 object detection model.

The pipeline performs the following steps:

1. Capture an image from the Raspberry Pi camera
2. Run YOLO object detection
3. Detect pets approaching the feeder
4. Process detection results for feeder control logic

---

## Model Information

The object detection model used in this project is YOLOv8, exported to the NCNN format for efficient inference on the Raspberry Pi.

The exported model is stored in:

ai-model/yolov8n_ncnn_model/

This format allows the Raspberry Pi to run the model with improved performance compared to standard PyTorch inference.

---

## Requirements

Main Python dependencies include:

ultralytics  
torch  
torchvision  
ncnn  
numpy  
opencv-python  
matplotlib

All dependencies can be installed using:

pip install -r requirements.txt

---

## Future Work

Upcoming development stages include:

Pet identity recognition  
Pet profile creation and management  
Feeding control logic  
Backend communication with the mobile app  
Mobile application interface  
Feeding activity logging  
Sensor integration for monitoring food consumption

---

## Contributors

Senior Design Team

University of Central Florida
