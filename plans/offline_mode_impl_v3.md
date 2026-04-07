# Offline Mode Implementation Plan v2

## Goal
Add a third operational mode called "offline" that uses the local YOLO worker instead of Gemini for obstacle detection and guidance.

---

## Current State

### Existing Modes
- **Passive** - Responds only when user speaks (Gemini)
- **Active** - Continuously streams to Gemini with periodic `[DESCRIBE]` prompts

### Offline Worker (Already exists)
- Python FastAPI server at `offline_mode/third_eye_worker.py`
- Runs YOLOv8m model for object detection
- Returns detections + alert_message via `/detect` endpoint
- Has built-in SAPI voice alerts for danger-level objects

### Current Mode Implementation
- `AppMode` type: `'passive' | 'active'` (use-live-api.ts:26)
- `toggleMode()` is binary toggle - **must change to explicit setMode()**
- ESP32 commands use `toggleMode()` - **will break with 3 modes**
- ControlTray active mode trigger loop at lines 341-359

---

## Implementation Plan

### Phase 1: Extend App Mode Type & Expose setMode
**File:** `src/hooks/use-live-api.ts`

**Changes:**
1. Extend `AppMode` type:
```typescript
export type AppMode = 'passive' | 'active' | 'offline';
```

2. Expose `setMode` in return type (needed for ESP32 explicit mode commands):
```typescript
export type UseLiveAPIResults = {
  // ... existing
  mode: AppMode;
  setMode: (mode: AppMode) => Promise<void>;  // NEW - explicit mode setter
  toggleMode: () => Promise<void>;  // Keep for UI button cycling
};
```

3. Create `setMode()` function that handles reconnection:
```typescript
const setMode = useCallback(async (newMode: AppMode) => {
  if (newMode === mode) return;  // No-op if same mode
  
  const wasConnected = connected;
  
  // Disconnect from Gemini if switching TO offline
  if (newMode === 'offline' && wasConnected) {
    client.disconnect();
    setConnected(false);
  }
  
  setModeState(newMode);
  
  // Reconnect to Gemini if switching FROM offline to online mode
  if (mode === 'offline' && newMode !== 'offline' && wasConnected) {
    const finalConfig = buildConfigForMode(config, newMode);
    await client.connect(model, finalConfig);
  }
  // If switching between passive/active while connected, reconnect with new config
  else if (wasConnected && newMode !== 'offline') {
    const finalConfig = buildConfigForMode(config, newMode);
    client.disconnect();
    await client.connect(model, finalConfig);
  }
}, [mode, connected, config, model, client, buildConfigForMode]);
```

4. Update `toggleMode()` to cycle through 3 modes:
```typescript
const toggleMode = useCallback(async () => {
  const nextMode: Record<AppMode, AppMode> = {
    'passive': 'active',
    'active': 'offline',
    'offline': 'passive'
  };
  await setMode(nextMode[mode]);
}, [mode, setMode]);
```

5. Update `buildConfigForMode()` to handle offline (return null/skip):
```typescript
const buildConfigForMode = useCallback((baseConfig: LiveConnectConfig, targetMode: AppMode): LiveConnectConfig | null => {
  if (targetMode === 'offline') {
    return null;  // No Gemini config for offline mode
  }
  // ... existing logic for passive/active
}, []);
```

6. Guard `connect()` for offline mode:
```typescript
const connect = useCallback(async () => {
  if (mode === 'offline') {
    // In offline mode, don't connect to Gemini
    // The offline detection hook handles its own connection
    return;
  }
  // ... existing Gemini connection logic
}, [mode, ...]);
```

---

### Phase 2: Create Offline Detection Hook
**New file:** `src/hooks/use-offline-detection.ts`

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';

interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  danger_level: 'safe' | 'caution' | 'danger';
}

interface DetectionResult {
  detections: Detection[];
  alert_message: string | null;
  processing_time_ms: number;
}

interface UseOfflineDetectionOptions {
  enabled: boolean;
  workerUrl?: string;
  speakAlerts?: boolean;
}

interface UseOfflineDetectionReturn {
  isConnected: boolean;
  lastResult: DetectionResult | null;
  sendFrame: (imageData: string) => Promise<void>;
  error: string | null;
}

const DEFAULT_WORKER_URL = 'http://localhost:8765';

export function useOfflineDetection({
  enabled,
  workerUrl = DEFAULT_WORKER_URL,
  speakAlerts = true
}: UseOfflineDetectionOptions): UseOfflineDetectionReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAlertRef = useRef<string>('');
  const lastAlertTimeRef = useRef<number>(0);

  // Check worker health on mount/enable
  useEffect(() => {
    if (!enabled) {
      setIsConnected(false);
      return;
    }

    const checkHealth = async () => {
      try {
        const res = await fetch(`${workerUrl}/health`, { method: 'GET' });
        setIsConnected(res.ok);
        setError(null);
      } catch {
        setIsConnected(false);
        setError('YOLO worker not running');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [enabled, workerUrl]);

  // Web Speech API for alerts
  const speak = useCallback((text: string) => {
    if (!speakAlerts || !text) return;
    
    // Cooldown: don't repeat same alert within 3 seconds
    const now = Date.now();
    if (text === lastAlertRef.current && now - lastAlertTimeRef.current < 3000) {
      return;
    }
    
    lastAlertRef.current = text;
    lastAlertTimeRef.current = now;
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.2;  // Slightly faster for alerts
    utterance.pitch = 1.0;
    speechSynthesis.speak(utterance);
  }, [speakAlerts]);

  const sendFrame = useCallback(async (imageData: string) => {
    if (!enabled || !isConnected) return;

    try {
      const res = await fetch(`${workerUrl}/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });

      if (!res.ok) throw new Error('Detection failed');

      const result: DetectionResult = await res.json();
      setLastResult(result);
      setError(null);

      // Speak alert if present
      if (result.alert_message) {
        speak(result.alert_message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection error');
    }
  }, [enabled, isConnected, workerUrl, speak]);

  return { isConnected, lastResult, sendFrame, error };
}
```

---

### Phase 3: Update ESP32 WebSocket Hook
**File:** `src/hooks/use-esp32-websocket.ts`

**Changes:**
1. Add `MODE_OFFLINE` to ESP32Command type:
```typescript
export type ESP32Command = 
  | 'TOGGLE_MUTE' | 'MUTE_ON' | 'MUTE_OFF'
  | 'CONNECT' | 'DISCONNECT' | 'TOGGLE_CONNECT'
  | 'MODE_ACTIVE' | 'MODE_PASSIVE' | 'MODE_OFFLINE' | 'TOGGLE_MODE'  // Added MODE_OFFLINE
  | 'WEBCAM_ON' | 'WEBCAM_OFF'
  | 'PTT_START' | 'PTT_STOP'
  | 'AUTH_SUCCESS' | 'AUTH_FAILED';
```

2. Add `MODE_OFFLINE` to debounced commands:
```typescript
const DEBOUNCED_COMMANDS = new Set(['MODE_ACTIVE', 'MODE_PASSIVE', 'MODE_OFFLINE', 'TOGGLE_MODE']);
```

---

### Phase 4: Update ControlTray
**File:** `src/components/control-tray/ControlTray.tsx`

**Changes:**

1. Import offline detection hook and get `setMode`:
```typescript
import { useOfflineDetection } from '../../hooks/use-offline-detection';

// In component, destructure setMode
const { mode, setMode, toggleMode, ... } = useLiveAPIContext();
```

2. Initialize offline detection hook:
```typescript
const offlineDetection = useOfflineDetection({
  enabled: mode === 'offline',
  speakAlerts: true
});
```

3. **Fix ESP32 command handler** to use explicit `setMode()`:
```typescript
const handleESP32Command = useCallback((command: ESP32Command) => {
  switch (command) {
    // ... existing mute/connect commands
    
    // Mode controls - USE setMode() NOT toggleMode()
    case 'MODE_ACTIVE':
      if (mode !== 'active') setMode('active');
      break;
    case 'MODE_PASSIVE':
      if (mode !== 'passive') setMode('passive');
      break;
    case 'MODE_OFFLINE':
      if (mode !== 'offline') setMode('offline');
      break;
    case 'TOGGLE_MODE':
      toggleMode();  // This cycles through all 3 modes
      break;
    
    // ... rest of commands
  }
}, [mode, setMode, toggleMode, ...]);
```

4. **Guard active mode trigger loop** to exclude offline:
```typescript
useEffect(() => {
  // Only trigger in active mode (not offline)
  if (!connected || mode !== 'active' || !activeVideoStream) {
    return;
  }
  // ... existing [DESCRIBE] trigger logic
}, [connected, mode, activeVideoStream, client]);
```

5. **Add offline mode frame sending**:
```typescript
useEffect(() => {
  // Offline mode frame sending
  if (mode !== 'offline' || !activeVideoStream || !offlineDetection.isConnected) {
    return;
  }

  const sendFrameToWorker = () => {
    const canvas = renderCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !videoRef.current) return;

    // Draw current video frame to canvas
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64 JPEG
    const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    
    // Send to YOLO worker
    offlineDetection.sendFrame(imageData);
  };

  // Send frames at 0.5 FPS (every 2 seconds) - same as active mode
  const intervalId = setInterval(sendFrameToWorker, 2000);
  
  return () => clearInterval(intervalId);
}, [mode, activeVideoStream, offlineDetection, renderCanvasRef, videoRef]);
```

6. **Update mode toggle button** to show 3 states:
```typescript
const getModeIcon = () => {
  switch (mode) {
    case 'passive': return 'visibility_off';
    case 'active': return 'visibility';
    case 'offline': return 'wifi_off';
  }
};

const getModeLabel = () => {
  switch (mode) {
    case 'passive': return 'Passive';
    case 'active': return 'Active';
    case 'offline': return 'Offline';
  }
};

// In JSX:
<button
  className={cn("action-button mode-toggle", { 
    active: mode === 'active',
    offline: mode === 'offline' 
  })}
  onClick={() => toggleMode()}
  aria-label={`Current mode: ${mode}. Click to switch.`}
  title={`Mode: ${mode}`}
>
  <span className="material-symbols-outlined">{getModeIcon()}</span>
  <span className="mode-label">{getModeLabel()}</span>
</button>
```

---

### Phase 5: Update StatusBar
**File:** `src/components/status-bar/StatusBar.tsx`

**Changes:**
Add third button for offline mode:
```typescript
<div className="status-bar__toggle-group">
  <button
    className={cn("status-bar__toggle-btn", { "status-bar__toggle-btn--active": mode === "passive" })}
    onClick={() => setMode("passive")}
  >
    PASSIVE
  </button>
  <button
    className={cn("status-bar__toggle-btn", { "status-bar__toggle-btn--active": mode === "active" })}
    onClick={() => setMode("active")}
  >
    ACTIVE
  </button>
  <button
    className={cn("status-bar__toggle-btn", { "status-bar__toggle-btn--active": mode === "offline" })}
    onClick={() => setMode("offline")}
  >
    OFFLINE
  </button>
</div>
```

---

### Phase 6: Update LiveAPIContext
**File:** `src/contexts/LiveAPIContext.tsx`

Ensure `setMode` is exposed in context type:
```typescript
export type LiveAPIContextType = UseLiveAPIResults;
// This should now include setMode from the updated UseLiveAPIResults
```

---

### Phase 7: Update ESP32 State Sync
**File:** `src/components/control-tray/ControlTray.tsx`

Update the state sync effect to include offline:
```typescript
useEffect(() => {
  if (!esp32Connected) return;
  sendToESP32(`STATE:MODE=${mode}`);  // Sends 'passive', 'active', or 'offline'
}, [mode, esp32Connected, sendToESP32]);
```

---

### Phase 8: Add Offline Mode Styles
**File:** `src/components/control-tray/control-tray.scss`

```scss
.action-button.mode-toggle {
  &.offline {
    background: var(--offline-bg, #ff9800);
    
    .material-symbols-outlined {
      color: var(--offline-icon, #fff);
    }
  }
}

.offline-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 152, 0, 0.2);
  border-radius: 4px;
  font-size: 0.75rem;
  
  &.connected {
    background: rgba(76, 175, 80, 0.2);
  }
  
  &.error {
    background: rgba(244, 67, 54, 0.2);
  }
}
```

---

### Phase 9: Update Documentation
**File:** `reports/modes_desc.md`

Add section for offline mode with:
- Description and use case
- YOLO worker requirements
- Web Speech API usage
- Frame rate and detection details

---

## Backward Compatibility

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| Default mode | âœ… None | Remains `passive` |
| Passive/Active behavior | âœ… None | Logic unchanged |
| ESP32 MODE_ACTIVE/PASSIVE | âš ï¸ Fixed | Use `setMode()` instead of `toggleMode()` |
| UI mode button | âœ… None | Cycles through 3 modes |
| Active mode trigger | âœ… None | Guarded with `mode !== 'active'` check |

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/hooks/use-live-api.ts` | MODIFY | Extend AppMode, add setMode(), update toggleMode() |
| `src/hooks/use-offline-detection.ts` | CREATE | New hook for YOLO worker communication |
| `src/hooks/use-esp32-websocket.ts` | MODIFY | Add MODE_OFFLINE command |
| `src/contexts/LiveAPIContext.tsx` | MODIFY | Expose setMode in context |
| `src/components/control-tray/ControlTray.tsx` | MODIFY | Integrate offline mode, fix ESP32 handlers |
| `src/components/control-tray/control-tray.scss` | MODIFY | Add offline mode styles |
| `src/components/status-bar/StatusBar.tsx` | MODIFY | Add offline button |
| `reports/modes_desc.md` | MODIFY | Document offline mode |

---

## Dependencies

- YOLO worker must be running at `localhost:8765` for offline mode to function
- Web Speech API required for browser-side TTS (available in all modern browsers)
- No new npm packages required

---

## Testing Checklist

- [ ] App starts in passive mode (default unchanged)
- [ ] Mode toggle button cycles: passive â†’ active â†’ offline â†’ passive
- [ ] StatusBar shows 3 mode buttons
- [ ] ESP32 `MODE_ACTIVE` switches to active mode
- [ ] ESP32 `MODE_PASSIVE` switches to passive mode
- [ ] ESP32 `MODE_OFFLINE` switches to offline mode
- [ ] ESP32 `TOGGLE_MODE` cycles through all 3 modes
- [ ] Switching to offline disconnects from Gemini
- [ ] Switching from offline to active/passive reconnects to Gemini
- [ ] Offline mode connects to YOLO worker at localhost:8765
- [ ] Frames sent at 0.5fps in offline mode
- [ ] Alerts spoken via Web Speech API
- [ ] Active mode `[DESCRIBE]` trigger NOT fired in offline mode
- [ ] Graceful error handling if YOLO worker not running
- [ ] No regression in existing passive/active functionality
