# Offline Mode Implementation Plan

## Goal
Add a third operational mode called "offline" that uses the local YOLO worker instead of Gemini for obstacle detection and guidance.

---

## Current State

### Existing Modes
- **Passive** - Responds only when user speaks (Gemini)
- **Active** - Continuously streams to Gemini with periodic `[DESCRIBE]` prompts

### Offline Worker (Already exists)
- Python FastAPI server at `localhost:8765`
- Runs YOLOv8m model for object detection
- Returns detections + alert_message via `/detect` endpoint
- Has built-in SAPI voice alerts for danger-level objects

---

## Implementation Plan

### Phase 1: Extend App Mode Type
**Files:** `src/hooks/use-live-api.ts`

- Change `AppMode` type from `'passive' | 'active'` to `'passive' | 'active' | 'offline'`
- Update `buildConfigForMode()` to handle offline mode (no Gemini config needed)
- Update `toggleMode()` to cycle through all three modes

### Phase 2: Create Offline Mode Hook
**New file:** `src/hooks/use-offline-detection.ts`

- Manages connection to local YOLO worker at `localhost:8765`
- Handles frame sending to `/detect` endpoint
- Parses detection results and alert messages
- Uses Web Speech API for TTS (works in browser without SAPI)
- Implements similar cooldown/filtering logic as the worker

### Phase 3: Integrate into ControlTray
**Files:** `src/components/control-tray/ControlTray.tsx`

- Extend mode button to cycle: passive → active → offline → passive
- Update video frame sending logic to support offline mode
- In offline mode: send frames to local YOLO worker instead of Gemini, use Web Speech API for narration, show visual indicators

### Phase 4: UI Updates
**Files:** `src/components/control-tray/ControlTray.tsx`, `control-tray.scss`

- Update mode toggle button icon/label for offline mode
- Add visual styling for offline mode state

### Phase 5: ESP32 Hardware Support
**Files:** `src/hooks/use-esp32-websocket.ts`, `reports/modes_desc.md`

- Add new ESP32 command: `MODE_OFFLINE`
- Update mode state reporting to ESP32

---

## Key Design Decisions

### TTS Approach
- **Online (passive/active):** Gemini provides audio via Live API
- **Offline:** Use Web Speech API (`speechSynthesis`) for narration
  - Works in browser without external dependencies
  - Lower latency than Gemini for quick alerts

### Frame Sending
- **Online:** 0.5fps via `sendRealtimeInput()` to Gemini
- **Offline:** Same 0.5fps to local YOLO worker via REST API

---

## Backward Compatibility
- Default mode remains `passive`
- Offline mode only active when explicitly selected
- No breaking changes to existing passive/active behavior
- Worker remains optional (graceful degradation if not running)

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/hooks/use-live-api.ts` | Extend AppMode type, update buildConfigForMode |
| `src/hooks/use-offline-detection.ts` | NEW - Offline detection hook |
| `src/components/control-tray/ControlTray.tsx` | Integrate offline mode |
| `src/components/control-tray/control-tray.scss` | Add offline mode styles |
| `src/hooks/use-esp32-websocket.ts` | Add MODE_OFFLINE command |
| `reports/modes_desc.md` | Document offline mode |

---

## Testing Checklist
- [ ] Mode toggle cycles through all three modes
- [ ] Offline mode connects to worker at localhost:8765
- [ ] Frames sent at 0.5fps in offline mode
- [ ] Alerts spoken via Web Speech API
- [ ] Visual detection list displays correctly
- [ ] ESP32 MODE_OFFLINE command works
- [ ] No regression in passive/active modes
- [ ] Graceful fallback if worker not running
