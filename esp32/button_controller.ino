/**
 * ESP32 Button Controller for Third Eye App
 * 
 * This sketch creates a WebSocket server on the ESP32 that sends
 * button press commands to the React app running on the same WiFi network.
 * 
 * Hardware:
 * - ESP32 board
 * - Push buttons connected to GPIO pins (active LOW with internal pullup)
 * 
 * Libraries Required:
 * - WiFi (built-in)
 * - WebSocketsServer (install via Arduino Library Manager: "WebSockets" by Markus Sattler)
 * 
 * Configuration:
 * 1. Update WIFI_SSID and WIFI_PASSWORD below
 * 2. Note the IP address printed to Serial (e.g., 192.168.1.100)
 * 3. Set REACT_APP_ESP32_IP=192.168.1.100:81 in React app's .env file
 */

#include <WiFi.h>
#include <WebSocketsServer.h>

// ============================================================================
// CONFIGURATION - UPDATE THESE
// ============================================================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// WebSocket server port
const int WS_PORT = 81;

// ============================================================================
// BUTTON PIN DEFINITIONS
// ============================================================================
// Connect buttons between GPIO and GND (uses internal pullup)
#define BTN_MUTE_PIN       4   // Toggle mute
#define BTN_CONNECT_PIN    5   // Toggle connection
#define BTN_MODE_PIN       18  // Toggle active/passive mode
#define BTN_PTT_PIN        19  // Push-to-talk (hold)

// LED for status feedback (optional, built-in LED on most ESP32 boards)
#define STATUS_LED_PIN     2

// ============================================================================
// TIMING CONSTANTS
// ============================================================================
const unsigned long DEBOUNCE_DELAY = 50;      // Button debounce (ms)
const unsigned long REPEAT_BLOCK_DELAY = 300; // Prevent rapid repeats (ms)
const unsigned long RECONNECT_INTERVAL = 5000; // WiFi reconnect interval (ms)

// ============================================================================
// GLOBAL STATE
// ============================================================================
WebSocketsServer webSocket = WebSocketsServer(WS_PORT);

struct ButtonState {
  int pin;
  const char* command;
  const char* releaseCommand;  // For PTT-style buttons (null if not applicable)
  bool lastState;
  unsigned long lastDebounceTime;
  unsigned long lastTriggerTime;
  bool isHoldButton;           // True for PTT-style buttons
};

ButtonState buttons[] = {
  { BTN_MUTE_PIN,    "TOGGLE_MUTE",    nullptr,     HIGH, 0, 0, false },
  { BTN_CONNECT_PIN, "TOGGLE_CONNECT", nullptr,     HIGH, 0, 0, false },
  { BTN_MODE_PIN,    "TOGGLE_MODE",    nullptr,     HIGH, 0, 0, false },
  { BTN_PTT_PIN,     "PTT_START",      "PTT_STOP",  HIGH, 0, 0, true  },
};
const int NUM_BUTTONS = sizeof(buttons) / sizeof(buttons[0]);

// App state (received from React for LED feedback)
bool appMuted = false;
bool appConnected = false;
String appMode = "passive";

// ============================================================================
// WEBSOCKET EVENT HANDLER
// ============================================================================
void webSocketEvent(uint8_t clientNum, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Client %u connected\n", clientNum);
      // Blink LED to indicate connection
      for (int i = 0; i < 3; i++) {
        digitalWrite(STATUS_LED_PIN, HIGH);
        delay(100);
        digitalWrite(STATUS_LED_PIN, LOW);
        delay(100);
      }
      break;
      
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client %u disconnected\n", clientNum);
      break;
      
    case WStype_TEXT:
      {
        String message = String((char*)payload);
        Serial.printf("[WS] Received: %s\n", payload);
        
        // Parse state updates from React app (for LED feedback)
        if (message.startsWith("STATE:")) {
          if (message.indexOf("MUTED=1") > 0) {
            appMuted = true;
          } else if (message.indexOf("MUTED=0") > 0) {
            appMuted = false;
          }
          if (message.indexOf("CONNECTED=1") > 0) {
            appConnected = true;
          } else if (message.indexOf("CONNECTED=0") > 0) {
            appConnected = false;
          }
          if (message.indexOf("MODE=active") > 0) {
            appMode = "active";
          } else if (message.indexOf("MODE=passive") > 0) {
            appMode = "passive";
          }
          updateStatusLED();
        }
      }
      break;
      
    case WStype_ERROR:
      Serial.printf("[WS] Error from client %u\n", clientNum);
      break;
      
    default:
      break;
  }
}

// ============================================================================
// LED STATUS FEEDBACK
// ============================================================================
void updateStatusLED() {
  // Simple status: LED on when connected and not muted
  if (appConnected && !appMuted) {
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ============================================================================
// BUTTON HANDLING
// ============================================================================
void processButton(ButtonState& btn) {
  bool reading = digitalRead(btn.pin);
  unsigned long now = millis();
  
  // Debounce
  if (reading != btn.lastState) {
    btn.lastDebounceTime = now;
  }
  
  if ((now - btn.lastDebounceTime) > DEBOUNCE_DELAY) {
    // State has been stable
    
    if (btn.isHoldButton) {
      // PTT-style button: send command on press and release
      if (reading == LOW && btn.lastState == HIGH) {
        // Button just pressed
        Serial.printf("[BTN] %s pressed -> %s\n", btn.command, btn.command);
        webSocket.broadcastTXT(btn.command);
      } else if (reading == HIGH && btn.lastState == LOW && btn.releaseCommand) {
        // Button just released
        Serial.printf("[BTN] Released -> %s\n", btn.releaseCommand);
        webSocket.broadcastTXT(btn.releaseCommand);
      }
    } else {
      // Toggle-style button: send command on press only
      if (reading == LOW && (now - btn.lastTriggerTime) > REPEAT_BLOCK_DELAY) {
        // Button pressed and enough time since last trigger
        Serial.printf("[BTN] %s triggered\n", btn.command);
        webSocket.broadcastTXT(btn.command);
        btn.lastTriggerTime = now;
      }
    }
  }
  
  btn.lastState = reading;
}

// ============================================================================
// WIFI CONNECTION
// ============================================================================
void connectWiFi() {
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.printf("[WiFi] IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] WebSocket URL: ws://%s:%d\n", WiFi.localIP().toString().c_str(), WS_PORT);
    Serial.println("[WiFi] Add to React .env: REACT_APP_ESP32_IP=" + WiFi.localIP().toString() + ":" + String(WS_PORT));
    
    // Blink LED to indicate WiFi connected
    for (int i = 0; i < 5; i++) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      delay(50);
      digitalWrite(STATUS_LED_PIN, LOW);
      delay(50);
    }
  } else {
    Serial.println("\n[WiFi] Connection failed!");
  }
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n[ESP32] Third Eye Button Controller Starting...");
  
  // Initialize LED
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  
  // Initialize buttons with internal pullup
  for (int i = 0; i < NUM_BUTTONS; i++) {
    pinMode(buttons[i].pin, INPUT_PULLUP);
  }
  
  // Connect to WiFi
  connectWiFi();
  
  // Start WebSocket server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.println("[WS] WebSocket server started");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  // Handle WebSocket events
  webSocket.loop();
  
  // Check WiFi connection
  static unsigned long lastWiFiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && (millis() - lastWiFiCheck) > RECONNECT_INTERVAL) {
    Serial.println("[WiFi] Connection lost, reconnecting...");
    connectWiFi();
    lastWiFiCheck = millis();
  }
  
  // Process all buttons
  for (int i = 0; i < NUM_BUTTONS; i++) {
    processButton(buttons[i]);
  }
}
