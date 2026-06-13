# 🛡️ Smart GuardX Local Setup Guide

This guide details how to clone, set up, and run the Smart GuardX full-stack surveillance dashboard locally on your system.

---

## 📂 Project Architecture

- **`backend/`**: Python FastAPI server coordinating video streams and robotic control commands.
- **`frontend/`**: React (TypeScript) dashboard styled with a custom Glassmorphic Cyberpunk design.
- **`hardware/`**: C++ PlatformIO project for uploading control firmware onto the ESP32-CAM.

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <your-repository-git-url>
cd "Smart GuardX"
```

---

## 🐍 2. Backend Setup (FastAPI)

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create a virtual environment (`venv`):
   - **Windows:**
     ```powershell
     python -m venv venv
     ```

3. Activate the virtual environment:
   - **Windows (PowerShell):**
     ```powershell
     .\venv\Scripts\activate
     ```

   > [!NOTE]
   > On Windows, if you run into a PowerShell execution policy error (_"Script execution is disabled"_), bypass it for your current terminal session:
   > `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process`

4. Install the backend dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Run the FastAPI development server:

   ```bash
   uvicorn main:app --reload
   ```

   - The API server will start running at `http://127.0.0.1:8000`
   - Interactive Swagger documentation is accessible at `http://127.0.0.1:8000/docs`

---

## ⚛️ 3. Frontend Setup (React & Vite)

Open a **separate terminal window**, navigate to the project directory, and run the following:

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install npm package dependencies:

   ```bash
   npm install
   ```

3. Run the frontend development build:

   ```bash
   npm run dev
   ```

   - The dashboard web interface will start running at `http://localhost:5173`

---

## 🔌 4. Hardware Upload (ESP32-CAM)

If you are deploying the code to a physical robot:

1. Open the **`hardware/`** subfolder in VS Code.
2. Install the **PlatformIO IDE** extension in VS Code.
3. Open `hardware/src/main.cpp` and update the Wi-Fi credentials:

   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```

   > For Hardware You can skip this right now cause you dont have esp32 cam

4. Connect the ESP32-CAM via an FTDI adapter to your computer.
5. Click the PlatformIO **Upload** button (the arrow icon in the status bar) to build and flash the firmware.
6. Open the Serial Monitor to find the IP address assigned to the board. Enter this IP in the Dashboard connection controller to start streaming.

---

## 🛠️ Testing Without Hardware

If you do not have the physical hardware, you can still develop and verify features:

1. Open the React frontend dashboard at `http://localhost:5173`.
2. Locate the **Connection Controller** card on the right panel.
3. Choose **Demo** or **Webcam** mode and click **Apply**.
   - **Demo Mode:** Streams a radar HUD simulation and logs controller commands locally.
   - **Webcam Mode:** Captures your local computer webcam with a cyberpunk HUD overlay.
