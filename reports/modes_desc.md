# Third Eye Application Modes

This document describes the three operational modes in the Third Eye smart glasses application.

---

## Overview

The application supports three modes designed for different use cases for blind users:

| Mode | Purpose | Video Streaming | AI Behavior |
|------|---------|-----------------|-------------|
| **Passive** | On-demand assistance | User-activated only | Responds when spoken to (Gemini) |
| **Active** | Continuous awareness | Auto-streams + narrates | Proactive environmental description (Gemini) |
| **Offline** | No internet required | Streams to local YOLO | Object detection with Web Speech TTS |

---

## 1. Passive Mode (Default)

### Description
Voice assistant "Grace" - responds only when the user speaks.

### Behavior
- AI waits for user input before responding
- Video frames only sent when user explicitly enables webcam/screen share
- Conversational and friendly tone
- Answers questions concisely but completely

### Use Case
- On-demand help scenarios
- User asks questions, AI answers
- Lower battery/bandwidth usage

### System Prompt (from `active-mode-prompt.ts`)
```
You are a helpful voice assistant named "Grace" for a blind user wearing smart glasses with a camera.

**RESPONSE BEHAVIOR:**
- Respond naturally when the user speaks
- Keep answers concise yet not too short so you miss details, but complete
- Be conversational and friendly

**VISUAL ASSISTANCE:**
- When the user asks what you see or asks about their surroundings, describe the current camera view
- Read any text visible in the camera when asked
- Help identify objects, people, or locations when requested

**ACCESSIBILITY:**
- Use clear spatial language (left, right, ahead, behind)
- Provide distance estimates when relevant
- Prioritize safety-related information
```

---

## 2. Active Mode

### Description
Proactive situational awareness assistant for continuous environmental narration.

### Behavior
- Continuously streams video frames to Gemini
- Sends `[DESCRIBE]` trigger prompt every **4 seconds**
- Proactively narrates environment without being asked
- Uses `proactiveAudio: true` API setting

### Priority Order for Narration
1. **URGENT HAZARDS** - Obstacles, steps, curbs, moving objects
2. **NAVIGATION CUES** - Paths, doors, turns
3. **SOCIAL CONTEXT** - Approaching people with distance/direction
4. **TEXT READING** - Signs, menus, labels, screens
5. **AMBIENT AWARENESS** - Environmental context every 3-5 seconds

### Use Case
- Walking/navigation assistance
- Unfamiliar environments
- Situations requiring continuous awareness

### System Prompt (from `active-mode-prompt.ts`)
```
You are a situational awareness assistant for a blind user. Provide continuous, proactive narration of the environment with these priorities:

1. **URGENT HAZARDS FIRST**: Immediately warn about obstacles, steps, curbs, moving objects using clear spatial language ("Step 3 feet ahead", "Curb to your right")

2. **NAVIGATION CUES**: Provide guidance about paths, doors, turns when relevant

3. **SOCIAL CONTEXT**: Describe approaching people with distance and direction ("Person approaching from left, about 10 feet away")

4. **TEXT READING**: Read visible text unprompted (signs, menus, labels, screens)

5. **AMBIENT AWARENESS**: Provide environmental context every 3-5 seconds when no urgent info ("Quiet hallway", "Outdoor sidewalk, light traffic")

6. **SPATIAL CONSISTENCY**: Always use egocentric references (left/right/ahead/behind) with distance estimates

7. **CONCISE SPEECH**: Speak in short phrases. Don't repeat unchanged information.

8. **INTERRUPTION READY**: Stop immediately if user speaks or higher priority alert occurs

When you receive a "[DESCRIBE]" prompt, immediately analyze the current view and speak aloud anything important or changed. Keep responses under 15 words unless there's urgent information.
```

---

## Mode Switching

### UI Toggle
- Located in ControlTray component
- Visibility icon button (👁️)
- Shows current mode label

### Implementation (`use-live-api.ts`)
```typescript
const toggleMode = useCallback(async () => {
  const newMode = mode === 'passive' ? 'active' : 'passive';
  const wasConnected = connected;
  
  setMode(newMode);
  
  // If connected, reconnect with new mode config
  if (wasConnected) {
    const finalConfig = buildConfigForMode(config, newMode);
    client.disconnect();
    await client.connect(model, finalConfig);
  }
}, [mode, connected, config, model, client, buildConfigForMode]);
```

### ESP32 Hardware Control
Commands supported via WebSocket:
- `MODE_ACTIVE` - Switch to active mode
- `MODE_PASSIVE` - Switch to passive mode  
- `TOGGLE_MODE` - Toggle between modes

**Note:** 300ms debounce applied to mode commands to prevent race conditions during reconnection.

---

## Technical Details

### Active Mode Trigger Loop (`ControlTray.tsx`)
```typescript
useEffect(() => {
  if (!connected || mode !== 'active' || !activeVideoStream) {
    return;
  }

  // Send initial trigger after connecting
  const initialDelay = setTimeout(() => {
    client.sendRealtimeText(ACTIVE_MODE_TRIGGER_PROMPT);
  }, 1000);

  // Send trigger every 4 seconds
  const intervalId = setInterval(() => {
    client.sendRealtimeText(ACTIVE_MODE_TRIGGER_PROMPT);
  }, 4000);

  return () => {
    clearTimeout(initialDelay);
    clearInterval(intervalId);
  };
}, [connected, mode, activeVideoStream, client]);
```

### Config Building
The `buildConfigForMode()` function in `use-live-api.ts`:
- Selects appropriate system prompt based on mode
- Preserves existing tools (QR scanner, payment, etc.)
- Adds `googleSearch` tool if not present
- Sets `proactiveAudio: true` for active mode

---

## File References

| File | Purpose |
|------|---------|
| `src/lib/active-mode-prompt.ts` | System prompts for passive/active modes |
| `src/hooks/use-live-api.ts` | Mode state, setMode(), toggleMode(), config building |
| `src/hooks/use-offline-detection.ts` | YOLO worker communication for offline mode |
| `src/components/control-tray/ControlTray.tsx` | UI toggle, active mode trigger, offline frame sending |
| `src/hooks/use-esp32-websocket.ts` | Hardware mode switching commands |

---

## 3. Offline Mode

### Description
Local object detection using YOLO without internet. Does not connect to Gemini.

### Behavior
- Disconnects from Gemini when entering offline mode
- Sends video frames to local YOLO worker at `localhost:8765`
- Uses Web Speech API for TTS alerts (browser-based)
- Detects objects and classifies danger level (safe, caution, danger)
- 3-second cooldown between repeated alerts

### Use Case
- No internet connectivity
- Privacy-sensitive environments
- Faster response time for obstacle detection
- Lower latency for safety-critical alerts

### Requirements
- YOLO worker running at `http://localhost:8765`
- Install: `pip install fastapi uvicorn opencv-python ultralytics pywin32`
- Run: `python offline_mode/third_eye_worker.py`

### Technical Details

**Worker Endpoints:**
- `GET /health` - Health check (polled every 5 seconds)
- `POST /detect` - Send frame, receive detections

**Detection Response:**
```json
{
  "detections": [
    {
      "label": "person",
      "confidence": 0.85,
      "bbox": [x1, y1, x2, y2],
      "danger_level": "caution"
    }
  ],
  "alert_message": "Person ahead, caution"
}
```

**Web Speech TTS:**
```typescript
const utterance = new SpeechSynthesisUtterance(alertMessage);
utterance.rate = 1.2;  // Slightly faster for alerts
speechSynthesis.speak(utterance);
```

### Frame Sending (from `ControlTray.tsx`)
```typescript
useEffect(() => {
  if (mode !== 'offline' || !activeVideoStream || !offlineDetection.isConnected) {
    return;
  }

  const sendFrameToWorker = () => {
    // Draw video frame to canvas, convert to base64 JPEG
    const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    offlineDetection.sendFrame(imageData);
  };

  // Send frames at 0.5 FPS (every 2 seconds)
  const intervalId = setInterval(sendFrameToWorker, 2000);
  return () => clearInterval(intervalId);
}, [mode, activeVideoStream, offlineDetection]);
```

---

## Mode Switching

### UI Toggle
- Located in ControlTray component
- Cycles: passive → active → offline → passive
- Icons: visibility_off (passive) → visibility (active) → wifi_off (offline)

### Implementation (`use-live-api.ts`)
```typescript
// Explicit mode setter
const setMode = useCallback(async (newMode: AppMode) => {
  if (newMode === modeState) return;
  
  const wasConnected = connected;
  const previousMode = modeState;
  
  // Disconnect from Gemini if switching TO offline
  if (newMode === 'offline' && wasConnected) {
    client.disconnect();
    setConnected(false);
  }
  
  setModeInternal(newMode);
  
  // Reconnect to Gemini if switching FROM offline
  if (previousMode === 'offline' && newMode !== 'offline' && wasConnected) {
    await client.connect(model, buildConfigForMode(config, newMode));
  }
}, [modeState, connected, ...]);

// Toggle cycles through all 3 modes
const toggleMode = useCallback(async () => {
  const nextMode = { passive: 'active', active: 'offline', offline: 'passive' };
  await setMode(nextMode[modeState]);
}, [modeState, setMode]);
```

### ESP32 Hardware Control
Commands supported via WebSocket:
- `MODE_ACTIVE` - Switch to active mode
- `MODE_PASSIVE` - Switch to passive mode
- `MODE_OFFLINE` - Switch to offline mode
- `TOGGLE_MODE` - Cycle through all 3 modes

**Note:** 300ms debounce applied to mode commands to prevent race conditions.

---

## Testing Checklist

- [ ] App starts in passive mode by default
- [ ] Mode toggle button cycles: passive → active → offline → passive
- [ ] StatusBar shows 3 mode buttons
- [ ] Reconnection happens automatically on mode switch
- [ ] Active mode sends [DESCRIBE] every 4 seconds
- [ ] Passive mode only responds when user speaks
- [ ] Offline mode disconnects from Gemini
- [ ] Offline mode connects to YOLO worker
- [ ] Offline mode alerts spoken via Web Speech API
- [ ] ESP32 mode commands work with 300ms debounce
- [ ] Video streaming respects mode settings
