#include <WiFi.h>
#include <WebSocketsServer.h>

// 🔌 PINS
#define TOUCH1 4
#define TOUCH2 5

// 📡 WIFI
const char* ssid = "hr_shukla";
const char* password = "abcd12345";

// 🌐 WebSocket Server
WebSocketsServer webSocket = WebSocketsServer(81);

// 🧠 STATES
bool lastTouch1 = LOW;
bool lastTouch2 = LOW;

// 👆 Touch timing (for debounce + press detection)
unsigned long lastDebounce1 = 0;
unsigned long lastDebounce2 = 0;
const int debounceDelay = 200;

// 📤 Send command
void sendCommand(String cmd) {
  webSocket.broadcastTXT(cmd);
  Serial.println("📤 " + cmd);
}

// 🔌 WebSocket Events
void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {

    case WStype_CONNECTED:
      Serial.println("✅ Browser Connected");
      break;

    case WStype_DISCONNECTED:
      Serial.println("❌ Browser Disconnected");
      break;
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(TOUCH1, INPUT);
  pinMode(TOUCH2, INPUT);

  // 📡 Connect WiFi
  WiFi.begin(ssid, password);

  Serial.print("Connecting...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nConnected!");
  Serial.print("ESP IP: ");
  Serial.println(WiFi.localIP());

  // 🌐 Start WebSocket
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  webSocket.loop();

  bool t1 = digitalRead(TOUCH1);
  bool t2 = digitalRead(TOUCH2);

  // 🔹 TOUCH 1 → TOGGLE MODE
  if (t1 == HIGH && lastTouch1 == LOW && millis() - lastDebounce1 > debounceDelay) {
    sendCommand("TOGGLE_MODE");
    lastDebounce1 = millis();
  }

  // 🔹 TOUCH 2 → PUSH TO TALK (HOLD)
  if (t2 == HIGH && lastTouch2 == LOW) {
    sendCommand("PTT_START");
  }

  if (t2 == LOW && lastTouch2 == HIGH) {
    sendCommand("PTT_STOP");
  }

  lastTouch1 = t1;
  lastTouch2 = t2;
}