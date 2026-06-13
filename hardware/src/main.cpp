// Arduino C++ Code တွေ ရေးမယ့်ဖိုင်

#include "esp_camera.h"
#include <ESP32Servo.h>
#include <WebServer.h>
#include <WiFi.h>


// ===== 1. Wi-Fi Settings =====
const char *ssid = "YOUR_WIFI_NAME";
const char *password = "YOUR_WIFI_PASSWORD";
const unsigned long WIFI_TIMEOUT_MS = 30000;

// ===== 2. Motor Pins (L298N) =====
#define IN1 13
#define IN2 14
#define IN3 15
#define IN4 2

// ===== 3. Servo Pin =====
#define SERVO_PIN 4
Servo camServo;

// ===== Servers =====
WebServer server(80);        // Motor & Servo ထိန်းချုပ်ရန် API Server
WiFiServer streamServer(81); // Video လွှင့်ရန် Stream Server

// ===== Camera Pins (AI-THINKER Model) =====
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

// --- Motor Function Prototypes ---
void stopCar();
void moveForward();
void moveBackward();
void turnLeft();
void turnRight();

// --- Motor Functions ---
void setupMotors() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  stopCar();
}

void stopCar() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}
void moveForward() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}
void moveBackward() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
}
void turnLeft() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}
void turnRight() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
}

// --- API Endpoints ---
void handleHealth() {
  server.send(200, "text/plain", "Smart GuardX ESP32 OK");
}

void handleAction() {
  if (server.hasArg("go")) {
    String dir = server.arg("go");
    if (dir == "forward")
      moveForward();
    else if (dir == "backward")
      moveBackward();
    else if (dir == "left")
      turnLeft();
    else if (dir == "right")
      turnRight();
    else if (dir == "stop")
      stopCar();
    else {
      server.send(400, "text/plain", "Invalid direction");
      return;
    }

    server.send(200, "text/plain", "Car Status: " + dir);
  } else {
    server.send(400, "text/plain", "Missing parameter");
  }
}

void handlePan() {
  if (!server.hasArg("angle")) {
    server.send(400, "text/plain", "Missing angle parameter");
    return;
  }

  int angle = server.arg("angle").toInt();
  if (angle < 0 || angle > 180) {
    server.send(400, "text/plain", "Angle must be between 0 and 180");
    return;
  }

  camServo.write(angle);
  server.send(200, "text/plain", "Servo angle: " + String(angle));
}

// --- Video Stream Task (Runs Independently) ---
void streamTask(void *pvParameters) {
  streamServer.begin();
  while (true) {
    WiFiClient client = streamServer.available();
    if (client) {
      String request = client.readStringUntil('\r');
      client.flush();
      client.println("HTTP/1.1 200 OK");
      client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
      client.println();

      while (client.connected()) {
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
          vTaskDelay(10 / portTICK_PERIOD_MS); // Yield to prevent Watchdog Timer (WDT) reset crash
          continue;
        }
        client.printf(
            "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
            fb->len);
        client.write((char *)fb->buf, fb->len);
        client.println();
        esp_camera_fb_return(fb);
        vTaskDelay(40 / portTICK_PERIOD_MS); // အကြမ်းဖျင်း 25 FPS
      }
      client.stop();
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

void setup() {
  Serial.begin(115200);

  // Hardware Setup
  setupMotors();

  // Allow allocation of LEDC timers 1, 2, 3 for Servos (Timer 0 is reserved for camera XCLK)
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  camServo.setPeriodHertz(50); // Standard 50Hz servo
  camServo.attach(SERVO_PIN);
  camServo.write(90); // စစချင်း ကင်မရာကို အလယ်တည့်တည့် (90 degree) တွင်ထားရန်

  // Camera Setup
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // Check PSRAM to configure appropriate frame size and buffer count
  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA; // VGA (640x480) is optimal for Python computer vision
    config.jpeg_quality = 10;          // Higher quality (0-63, lower is better)
    config.fb_count = 2;               // Double buffer for smoother streaming
  } else {
    config.frame_size = FRAMESIZE_CIF; // Fallback to lower resolution if no PSRAM to avoid crash
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    // Do not return early, so Wi-Fi and WebServer can still run for motor control
  }

  // Wi-Fi ချိတ်ဆက်ခြင်း
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed (timeout). Check SSID/password in main.cpp.");
  }

  // API လမ်းကြောင်းများ သတ်မှတ်ခြင်း
  server.on("/", handleHealth);
  server.on("/health", handleHealth);
  server.on("/action", handleAction);
  server.on("/pan", handlePan);
  server.begin();

  // Video Stream အတွက် သီးသန့် Task ခွဲခိုင်းခြင်း (ESP32 ၏ Dual Core ကို အသုံးချခြင်း)
  if (xTaskCreatePinnedToCore(streamTask, "StreamTask", 4096, NULL, 1, NULL, 1) != pdPASS) {
    Serial.println("Error: Failed to start stream task.");
  }
}

void loop() {
  // API Commands များကို အမြဲနားထောင်နေရန်
  server.handleClient();
}