# Third Eye Application Modes

This document describes the two operational modes in the Third Eye smart glasses application.

---

## Overview

The application supports two modes designed for different use cases for blind users:

| Mode | Purpose | Video Streaming | AI Behavior |
|------|---------|-----------------|-------------|
| **Passive** | On-demand assistance | User-activated only | Responds when spoken to |
| **Active** | Continuous awareness | Auto-streams + narrates | Proactive environmental description |

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
| `src/lib/active-mode-prompt.ts` | System prompts for both modes |
| `src/hooks/use-live-api.ts` | Mode state, toggle logic, config building |
| `src/components/control-tray/ControlTray.tsx` | UI toggle, active mode trigger loop |
| `src/hooks/use-esp32-websocket.ts` | Hardware mode switching commands |

---

## Testing Checklist

- [ ] App starts in passive mode by default
- [ ] Mode toggle button switches modes
- [ ] Reconnection happens automatically on mode switch
- [ ] Active mode sends [DESCRIBE] every 4 seconds
- [ ] Passive mode only responds when user speaks
- [ ] ESP32 mode commands work with 300ms debounce
- [ ] Video streaming respects mode settings
