import time
import math
import cv2
import numpy as np
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

app = FastAPI(title="Smart GuardX API Server")

# Allow CORS for React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionConfig(BaseModel):
    mode: str  # "demo", "webcam", "esp32"
    ip: str = ""

class MovePayload(BaseModel):
    direction: str

class PanPayload(BaseModel):
    angle: int

class SystemState:
    def __init__(self):
        self.mode = "demo"  # "demo", "webcam", "esp32"
        self.esp32_ip = ""
        self.connected = False
        self.servo_angle = 90
        self.current_direction = "stop"
        self.logs = []

state = SystemState()

def add_log(message: str):
    timestamp = time.strftime("%H:%M:%S")
    state.logs.append({"time": timestamp, "message": message})
    if len(state.logs) > 50:
        state.logs.pop(0)

add_log("System initialized. Mode: DEMO.")

def encode_jpeg(frame):
    ok, jpeg = cv2.imencode(".jpg", frame)
    if not ok:
        raise RuntimeError("Failed to encode frame as JPEG")
    return jpeg.tobytes()

def test_esp32_control(ip: str) -> bool:
    """Ping the ESP32 control API health endpoint before streaming."""
    res = requests.get(f"http://{ip}/health", timeout=1.5)
    res.raise_for_status()
    return True

def get_demo_frame(t_sec):
    # Base slate dark frame
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:] = [30, 20, 15]  # Slate/navy BGR
    
    # Draw cybergrid
    grid_size = 40
    for x in range(0, 640, grid_size):
        cv2.line(frame, (x, 0), (x, 480), (50, 35, 25), 1)
    for y in range(0, 480, grid_size):
        cv2.line(frame, (0, y), (640, y), (50, 35, 25), 1)
        
    # Draw radar scan circles in center
    center = (320, 240)
    for r in [80, 160, 240]:
        cv2.circle(frame, center, r, (70, 50, 35), 1)
        
    # Sweep line rotating
    sweep_angle = t_sec * 2.0
    sx = int(320 + 240 * math.cos(sweep_angle))
    sy = int(240 + 240 * math.sin(sweep_angle))
    cv2.line(frame, center, (sx, sy), (150, 100, 30), 1)
    
    # Draw fake moving targets
    # Target 1 (Intruder)
    t1_x = int(320 + 140 * math.cos(t_sec * 0.4))
    t1_y = int(240 + 90 * math.sin(t_sec * 0.3))
    cv2.rectangle(frame, (t1_x - 30, t1_y - 45), (t1_x + 30, t1_y + 45), (0, 0, 220), 2)
    cv2.putText(frame, "TARGET: INTRUDER (94%)", (t1_x - 30, t1_y - 52), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 220), 1, cv2.LINE_AA)
                
    # Target 2 (Friendly Guard Dog)
    t2_x = int(320 + 160 * math.cos(t_sec * 0.2 + 2.0))
    t2_y = int(240 + 120 * math.sin(t_sec * 0.25 + 1.0))
    cv2.rectangle(frame, (t2_x - 25, t2_y - 25), (t2_x + 25, t2_y + 25), (0, 200, 0), 2)
    cv2.putText(frame, "TARGET: PET (98%)", (t2_x - 25, t2_y - 32), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 200, 0), 1, cv2.LINE_AA)
                
    # HUD details
    cv2.putText(frame, "SYS_STATUS: ACTIVE", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, f"SERVO PAN: {state.servo_angle} DEG", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, f"DRIVE DIRECTION: {state.current_direction.upper()}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
    
    cv2.putText(frame, "STREAM_MODE: SIMULATION", (400, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 180, 255), 1, cv2.LINE_AA)
    cur_time = time.strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(frame, cur_time, (400, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 180, 255), 1, cv2.LINE_AA)
    
    cv2.putText(frame, "SMART GUARDX SECURE VIEW", (210, 450), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 255), 1, cv2.LINE_AA)
    
    # Blinking REC indicator
    if int(t_sec * 2) % 2 == 0:
        cv2.circle(frame, (600, 25), 6, (0, 0, 255), -1)
        cv2.putText(frame, "REC", (560, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)

    return encode_jpeg(frame)

def process_webcam_frame(frame, t_sec):
    frame = cv2.resize(frame, (640, 480))
    
    # Draw cyber HUD overlay
    cv2.putText(frame, "SYS_STATUS: ACTIVE", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(frame, f"SERVO PAN: {state.servo_angle} DEG", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(frame, f"DRIVE DIRECTION: {state.current_direction.upper()}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    
    cv2.putText(frame, "STREAM_MODE: LOCAL WEBCAM", (410, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    cur_time = time.strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(frame, cur_time, (410, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    
    cv2.putText(frame, "SMART GUARDX WEBCAM VIEW", (210, 450), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1, cv2.LINE_AA)
    
    # Blinking REC indicator
    if int(t_sec * 2) % 2 == 0:
        cv2.circle(frame, (600, 25), 6, (0, 0, 255), -1)
        cv2.putText(frame, "REC", (560, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
        
    return encode_jpeg(frame)

def process_esp32_frame(jpg_bytes, t_sec):
    try:
        frame = cv2.imdecode(np.frombuffer(jpg_bytes, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return jpg_bytes
        frame = cv2.resize(frame, (640, 480))
        
        # Draw HUD overlays on hardware feed
        cv2.putText(frame, "SYS_STATUS: CONNECTED", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(frame, f"SERVO PAN: {state.servo_angle} DEG", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(frame, f"DRIVE DIRECTION: {state.current_direction.upper()}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        
        cv2.putText(frame, f"ESP32-CAM: {state.esp32_ip}", (420, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        cur_time = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, cur_time, (420, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        
        cv2.putText(frame, "SMART GUARDX REMOTE VIEW", (210, 450), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        
        if int(t_sec * 2) % 2 == 0:
            cv2.circle(frame, (600, 25), 6, (0, 0, 255), -1)
            cv2.putText(frame, "REC", (560, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1, cv2.LINE_AA)
            
        return encode_jpeg(frame)
    except Exception as e:
        add_log(f"Warning: ESP32 frame overlay failed: {str(e)}")
        return jpg_bytes

def event_generator():
    cap = None
    esp32_response = None
    esp32_bytes = b""
    last_mode = None
    
    try:
        while True:
            current_mode = state.mode
            t_sec = time.time()
            
            # Switch cleanup
            if current_mode != last_mode:
                add_log(f"Stream source changed to {current_mode.upper()}")
                if cap is not None:
                    cap.release()
                    cap = None
                if esp32_response is not None:
                    esp32_response.close()
                    esp32_response = None
                esp32_bytes = b""
                last_mode = current_mode
                
            try:
                if current_mode == "demo":
                    jpg = get_demo_frame(t_sec)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpg + b'\r\n')
                    time.sleep(0.05)  # 20 FPS
                    
                elif current_mode == "webcam":
                    if cap is None:
                        cap = cv2.VideoCapture(0)
                        if not cap.isOpened():
                            add_log("Error: Webcam could not be initialized. Defaulting to Demo.")
                            state.mode = "demo"
                            cap = None
                            continue
                            
                    ret, frame = cap.read()
                    if not ret:
                        time.sleep(0.01)
                        continue
                    jpg = process_webcam_frame(frame, t_sec)
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + jpg + b'\r\n')
                    time.sleep(0.033)  # 30 FPS
                    
                elif current_mode == "esp32":
                    if not state.esp32_ip:
                        add_log("Error: ESP32 IP is empty. Defaulting to Demo.")
                        state.mode = "demo"
                        continue
                        
                    if esp32_response is None:
                        stream_url = f"http://{state.esp32_ip}:81/"
                        add_log(f"Connecting to ESP32 stream at {stream_url}...")
                        try:
                            esp32_response = requests.get(stream_url, stream=True, timeout=3.0)
                            esp32_response.raise_for_status()
                            state.connected = True
                            add_log("Successfully connected to ESP32 stream.")
                        except Exception as e:
                            add_log(f"Error: Connection to ESP32 stream failed: {str(e)}")
                            state.connected = False
                            state.mode = "demo"
                            esp32_response = None
                            continue
                    
                    try:
                        # Fetch chunks
                        chunk = next(esp32_response.iter_content(chunk_size=4096), None)
                        if chunk is None:
                            add_log("ESP32 stream disconnected.")
                            esp32_response.close()
                            esp32_response = None
                            state.connected = False
                            state.mode = "demo"
                            continue
                            
                        esp32_bytes += chunk
                        
                        while True:
                            a = esp32_bytes.find(b'\xff\xd8')
                            b = esp32_bytes.find(b'\xff\xd9')
                            if a != -1 and b != -1:
                                if b > a:
                                    raw_jpg = esp32_bytes[a:b+2]
                                    esp32_bytes = esp32_bytes[b+2:]
                                    
                                    processed_jpg = process_esp32_frame(raw_jpg, t_sec)
                                    yield (b'--frame\r\n'
                                           b'Content-Type: image/jpeg\r\n\r\n' + processed_jpg + b'\r\n')
                                else:
                                    esp32_bytes = esp32_bytes[b+2:]
                            else:
                                if a == -1:
                                    esp32_bytes = b""
                                elif a > 0:
                                    esp32_bytes = esp32_bytes[a:]
                                break
                    except Exception as e:
                        add_log(f"Error reading from ESP32 stream: {str(e)}")
                        if esp32_response is not None:
                            esp32_response.close()
                        esp32_response = None
                        state.connected = False
                        state.mode = "demo"
                        continue
            except Exception as e:
                add_log(f"Stream generation exception: {str(e)}")
                time.sleep(1.0)
    finally:
        if cap is not None:
            cap.release()
        if esp32_response is not None:
            esp32_response.close()

@app.get("/api/status")
def get_status():
    return {
        "mode": state.mode,
        "esp32_ip": state.esp32_ip,
        "connected": state.connected,
        "servo_angle": state.servo_angle,
        "current_direction": state.current_direction,
        "logs": state.logs
    }

@app.post("/api/connect")
def connect(config: ConnectionConfig):
    mode = config.mode.lower()
    if mode not in ["demo", "webcam", "esp32"]:
        raise HTTPException(status_code=400, detail="Invalid mode selected")
        
    state.mode = mode
    if mode == "esp32":
        if not config.ip:
            raise HTTPException(status_code=400, detail="IP address required for ESP32 mode")
        state.esp32_ip = config.ip
        add_log(f"Attempting control connection to ESP32: {config.ip}")
        try:
            test_esp32_control(config.ip)
            state.connected = True
            add_log("ESP32 control API reachable.")
        except Exception as e:
            add_log(f"Warning: ESP32 control API unreachable: {str(e)}. Stream will still be attempted.")
            state.connected = False
    elif mode == "webcam":
        state.esp32_ip = ""
        state.connected = False
        add_log("Switched to Local Webcam mode.")
    else:
        state.esp32_ip = ""
        state.connected = False
        add_log("Switched to Simulation/Demo mode.")
        
    return get_status()

@app.post("/api/control/move")
def move(payload: MovePayload):
    direction = payload.direction.lower()
    if direction not in ["forward", "backward", "left", "right", "stop"]:
        raise HTTPException(status_code=400, detail="Invalid direction")
        
    state.current_direction = direction
    add_log(f"Motor direction set to: {direction.upper()}")
    
    if state.mode == "esp32" and state.esp32_ip:
        esp32_url = f"http://{state.esp32_ip}/action?go={direction}"
        try:
            res = requests.get(esp32_url, timeout=1.5)
            res.raise_for_status()
            return {"status": "relayed", "esp32_response": res.text}
        except Exception as e:
            add_log(f"Failed to send movement to ESP32: {str(e)}")
            return {"status": "failed", "error": str(e)}

    return {"status": "simulated", "direction": direction}

@app.post("/api/control/pan")
def pan(payload: PanPayload):
    angle = payload.angle
    if not (0 <= angle <= 180):
        raise HTTPException(status_code=400, detail="Angle must be between 0 and 180")
        
    state.servo_angle = angle
    add_log(f"Camera Pan set to: {angle} degrees")
    
    if state.mode == "esp32" and state.esp32_ip:
        esp32_url = f"http://{state.esp32_ip}/pan?angle={angle}"
        try:
            res = requests.get(esp32_url, timeout=1.5)
            res.raise_for_status()
            return {"status": "relayed", "esp32_response": res.text}
        except Exception as e:
            add_log(f"Failed to send pan command to ESP32: {str(e)}")
            return {"status": "failed", "error": str(e)}

    return {"status": "simulated", "angle": angle}

@app.get("/api/stream")
def stream():
    return StreamingResponse(event_generator(), media_type="multipart/x-mixed-replace; boundary=frame")
