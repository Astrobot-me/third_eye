# Plan: ESP32 WebSocket Button Control Integration

## Goal
Allow ESP32 to control button states (mute, connect, mode toggle, video) via WebSocket, while keeping React UI controls working normally. Either side can change states.

## Architecture

```
┌─────────────┐      WebSocket      ┌─────────────────┐
│   ESP32     │ ──────────────────► │   React App     │
│ (WS Server) │   "TOGGLE_MUTE"     │  (WS Client)    │
│  Port 81    │   "CONNECT"         │                 │
│             │   "MODE_ACTIVE"     │  Button States  │
└─────────────┘                     └─────────────────┘
     ▲                                      │
     │              Optional                │
     └──────────────────────────────────────┘
              State sync back to ESP
```

## Command Protocol

| ESP32 Command | React Action |
|---------------|--------------|
| `TOGGLE_MUTE` | Toggle mute state |
| `MUTE_ON` | Force mute on |
| `MUTE_OFF` | Force mute off |
| `CONNECT` | Start streaming |
| `DISCONNECT` | Stop streaming |
| `TOGGLE_CONNECT` | Toggle connection |
| `MODE_ACTIVE` | Switch to active mode |
| `MODE_PASSIVE` | Switch to passive mode |
| `TOGGLE_MODE` | Toggle mode |
| `WEBCAM_ON` | Start webcam |
| `WEBCAM_OFF` | Stop webcam |
| `PTT_START` | Start push-to-talk |
| `PTT_STOP` | Stop push-to-talk |

## Implementation

### 1. React: ESP32 WebSocket Hook
**File**: `src/hooks/use-esp32-websocket.ts`

- Connect to ESP32 WebSocket server on configurable IP/port
- Parse incoming commands
- Expose `sendToESP32()` for optional state sync back
- Auto-reconnect on disconnect

### 2. React: Integrate with ControlTray
**File**: `src/components/control-tray/ControlTray.tsx`

- Use the ESP32 hook
- Map received commands to existing state setters
- No changes to existing UI button logic

### 3. ESP32: Arduino Sketch
**File**: `esp32/button_controller.ino` (reference, user deploys)

- WiFi connection
- WebSocket server on port 81
- Button debounce
- Send commands on button press

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/use-esp32-websocket.ts` | Create | WebSocket client hook |
| `src/components/control-tray/ControlTray.tsx` | Modify | Integrate ESP32 commands |
| `esp32/button_controller.ino` | Create | Reference Arduino sketch |

## Configuration

ESP32 IP will be configurable via:
- Environment variable: `REACT_APP_ESP32_IP`
- Default: `192.168.1.100:81`
- Can be disabled if no ESP32 present

## Key Design Decisions

1. **ESP32 is WebSocket Server** — Simpler, no broker needed
2. **React is Client** — Connects on app load
3. **Commands are strings** — Simple parsing, easy debugging
4. **Graceful degradation** — App works normally if ESP32 not connected
5. **Optional bidirectional** — Can sync React state back to ESP32 for LED feedback

---

## Reference: ESP32 Arduino Sketch

```cpp
#include <WiFi.h>
#include <WebSocketsServer.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

WebSocketsServer webSocket = WebSocketsServer(81);

#define BUTTON_PIN 4  // GPIO4 for button

bool lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[%u] Connected\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected\n", num);
      break;
    case WStype_TEXT:
      Serial.printf("[%u] Received: %s\n", num, payload);
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  webSocket.loop();

  bool reading = digitalRead(BUTTON_PIN);
  
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }

  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading == LOW) {  // Button pressed (active low)
      webSocket.broadcastTXT("TOGGLE_MUTE");
      delay(300);  // Prevent rapid repeats
    }
  }

  lastButtonState = reading;
}
```

---

## Reference: React Hook

```typescript
// src/hooks/use-esp32-websocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';

type ESP32Command = 
  | 'TOGGLE_MUTE' | 'MUTE_ON' | 'MUTE_OFF'
  | 'CONNECT' | 'DISCONNECT' | 'TOGGLE_CONNECT'
  | 'MODE_ACTIVE' | 'MODE_PASSIVE' | 'TOGGLE_MODE'
  | 'WEBCAM_ON' | 'WEBCAM_OFF'
  | 'PTT_START' | 'PTT_STOP';

interface UseESP32WebSocketOptions {
  onCommand: (command: ESP32Command) => void;
  enabled?: boolean;
}

export function useESP32WebSocket({ onCommand, enabled = true }: UseESP32WebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const esp32Url = process.env.REACT_APP_ESP32_IP 
    ? `ws://${process.env.REACT_APP_ESP32_IP}`
    : 'ws://192.168.1.100:81';

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(esp32Url);

      ws.onopen = () => {
        console.log('[ESP32] Connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        const command = event.data.trim() as ESP32Command;
        console.log('[ESP32] Command:', command);
        onCommand(command);
      };

      ws.onclose = () => {
        console.log('[ESP32] Disconnected, reconnecting in 3s...');
        setIsConnected(false);
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[ESP32] Connection error:', err);
    }
  }, [enabled, esp32Url, onCommand]);

  const sendToESP32 = useCallback((message: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(message);
    }
  }, []);

  useEffect(() => {
    if (enabled) connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [enabled, connect]);

  return { isConnected, sendToESP32 };
}
```
