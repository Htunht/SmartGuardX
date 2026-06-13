# 🛡️ Smart GuardX

**Smart GuardX** is a modern, full-stack IoT surveillance system designed for real-time monitoring and remote robotic control. Built with an ESP32-CAM module, a robust FastAPI backend, and a sleek React (TypeScript) frontend, it allows users to stream live video and control a motorized rover seamlessly through a web interface.

### ✨ Key Features

- **Real-time Video Streaming:** Low-latency MJPEG streaming directly from the ESP32-CAM.
- **Remote Rover Control:** Interactive D-pad UI mapped to keyboard controls (W, A, S, D) for fluid motor operation.
- **Glassmorphism Dashboard:** A premium, dark-themed responsive UI built with React and Vite.
- **Multiple Testing Modes:** Includes ESP32-CAM mode, Local Webcam mode, and Simulation/Demo mode for rapid development and testing.

### 💻 Tech Stack

- **Frontend:** React, TypeScript, Vite, Custom CSS (Glassmorphism)
- **Backend:** Python, FastAPI, Uvicorn, OpenCV
- **Hardware:** ESP32-CAM, L298N Motor Driver, C++ (PlatformIO / Arduino Framework)
