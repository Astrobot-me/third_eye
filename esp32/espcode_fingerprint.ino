#include <WiFi.h>
#include <WebSocketsServer.h>
#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>

// TOUCH
#define TOUCH1 4
#define TOUCH2 5

// WIFI
const char* ssid = "hr_shukla";
const char* password = "abcd12345";

// WEBSOCKET
WebSocketsServer webSocket(81);

// FINGERPRINT
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger(&mySerial);

// TOUCH STATE
bool lastTouch1 = LOW;
bool lastTouch2 = LOW;
unsigned long lastDebounce1 = 0;
const int debounceDelay = 200;

void sendCommand(String cmd) {
  webSocket.broadcastTXT(cmd);
  Serial.println("📤 Sent: " + cmd);
}

void verifyFingerprint() {
  Serial.println("🔐 AUTH FLOW STARTED");

  unsigned long start = millis();

  while (millis() - start < 30000) {

    if (finger.getImage() == FINGERPRINT_OK) {
      Serial.println("📸 Finger Detected");

      if (finger.image2Tz() == FINGERPRINT_OK) {

        if (finger.fingerFastSearch() == FINGERPRINT_OK) {
          Serial.print("✅ VERIFIED ID: ");
          Serial.println(finger.fingerID);

          sendCommand("AUTH_SUCCESS");
          return;

        } else {
          Serial.println("❌ Finger Not Matched");
          sendCommand("AUTH_FAILED");
          return;
        }
      }
    }

    delay(100);
  }

  Serial.println("⏱ Auth Timeout");
  sendCommand("AUTH_FAILED");
}

// 🔥 Dedicated Incoming Message Handler
void handleIncomingMessage(String msg) {
  Serial.println("\n📩 Incoming Message:");
  Serial.println(msg);

  if (msg == "ASK_AUTH_VERIFY") {
    Serial.println("🚀 Triggering Auth Verification");
    verifyFingerprint();
    return;
  }

  Serial.println("ℹ️ Message Ignored");
}

// WebSocket Event
void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {

  switch (type) {

    case WStype_CONNECTED:
      Serial.println("✅ Browser Connected");
      break;

    case WStype_DISCONNECTED:
      Serial.println("❌ Browser Disconnected");
      break;

    case WStype_TEXT: {
      String msg = "";

      for (size_t i = 0; i < length; i++) {
        msg += (char)payload[i];
      }

      handleIncomingMessage(msg);
      break;
    }
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TOUCH1, INPUT);
  pinMode(TOUCH2, INPUT);

  WiFi.begin(ssid, password);

  Serial.print("Connecting...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("ESP IP: ");
  Serial.println(WiFi.localIP());

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  mySerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("✅ Fingerprint Ready");
  } else {
    Serial.println("❌ Fingerprint NOT detected");
  }
}

void loop() {
  webSocket.loop();

  bool t1 = digitalRead(TOUCH1);
  bool t2 = digitalRead(TOUCH2);

  if (t1 == HIGH && lastTouch1 == LOW &&
      millis() - lastDebounce1 > debounceDelay) {

    sendCommand("TOGGLE_MODE");
    lastDebounce1 = millis();
  }

  if (t2 == HIGH && lastTouch2 == LOW) {
    sendCommand("PTT_START");
  }

  if (t2 == LOW && lastTouch2 == HIGH) {
    sendCommand("PTT_STOP");
  }

  lastTouch1 = t1;
  lastTouch2 = t2;
}