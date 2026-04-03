# Active Mode Implementation Plan v0 (Corrected)

## Overview

Implement a dual-mode system (Passive/Active) for a smart glasses application for blind users using the Google Gemini Multimodal Live API.

**Key Insight:** The Live API config (systemInstruction, tools) is set at connection time. To switch modes, we must **reconnect** with the new config—there is no runtime config update.

---

## Files to Create/Modify

### 1. Create `src/lib/active-mode-prompt.ts`

```typescript
export const ACTIVE_MODE_SYSTEM_PROMPT = `You are a situational awareness assistant for a blind user. Provide continuous, proactive narration of the environment with these priorities:

1. **URGENT HAZARDS FIRST**: Immediately warn about obstacles, steps, curbs, moving objects using clear spatial language ("Step 3 feet ahead", "Curb to your right")

2. **NAVIGATION CUES**: Provide guidance about paths, doors, turns when relevant

3. **SOCIAL CONTEXT**: Describe approaching people with distance and direction ("Person approaching from left, about 10 feet away")

4. **TEXT READING**: Read visible text unprompted (signs, menus, labels, screens)

5. **AMBIENT AWARENESS**: Provide environmental context every 3-5 seconds when no urgent info ("Quiet hallway", "Outdoor sidewalk, light traffic")

6. **SPATIAL CONSISTENCY**: Always use egocentric references (left/right/ahead/behind) with distance estimates

7. **CONCISE SPEECH**: Speak in short phrases. Don't repeat unchanged information.

8. **INTERRUPTION READY**: Stop immediately if user speaks or higher priority alert occurs`;

export const PASSIVE_MODE_SYSTEM_PROMPT = `You are a voice assistant. Only speak when directly asked a question. Answer concisely and wait for the next question.`;
```

### 2. Modify `src/hooks/use-live-api.ts`

Add mode state and reconnect logic:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GenAILiveClient } from "../lib/genai-live-client";
import { LiveClientOptions } from "../types";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";
import { LiveConnectConfig, Modality } from "@google/genai";
import { ACTIVE_MODE_SYSTEM_PROMPT, PASSIVE_MODE_SYSTEM_PROMPT } from "../lib/active-mode-prompt";

export type AppMode = 'passive' | 'active';

export type UseLiveAPIResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;
  model: string;
  setModel: (model: string) => void;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  // New mode properties
  mode: AppMode;
  toggleMode: () => Promise<void>;
};

export function useLiveAPI(options: LiveClientOptions): UseLiveAPIResults {
  const client = useMemo(() => new GenAILiveClient(options), [options]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [model, setModel] = useState<string>("models/gemini-2.5-flash-native-audio-preview-12-2025");
  const [config, setConfig] = useState<LiveConnectConfig>({});
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  const [mode, setMode] = useState<AppMode>('passive');

  // Build config based on mode
  const buildConfigForMode = useCallback((baseConfig: LiveConnectConfig, targetMode: AppMode): LiveConnectConfig => {
    const systemPrompt = targetMode === 'active' 
      ? ACTIVE_MODE_SYSTEM_PROMPT 
      : PASSIVE_MODE_SYSTEM_PROMPT;
    
    return {
      ...baseConfig,
      responseModalities: [Modality.AUDIO],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      tools: [{ googleSearch: {} }],
    };
  }, []);

  // Register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "audio-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-out", VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => setConnected(true);
    const onClose = () => setConnected(false);
    const onError = (error: ErrorEvent) => console.error("error", error);
    const stopAudioStreamer = () => audioStreamerRef.current?.stop();
    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on("error", onError)
      .on("open", onOpen)
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio);

    return () => {
      client
        .off("error", onError)
        .off("open", onOpen)
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .disconnect();
    };
  }, [client]);

  const connect = useCallback(async () => {
    const finalConfig = buildConfigForMode(config, mode);
    client.disconnect();
    await client.connect(model, finalConfig);
  }, [client, config, model, mode, buildConfigForMode]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  // Toggle mode with automatic reconnect
  const toggleMode = useCallback(async () => {
    const newMode = mode === 'passive' ? 'active' : 'passive';
    setMode(newMode);
    
    // If connected, reconnect with new mode config
    if (connected) {
      const finalConfig = buildConfigForMode(config, newMode);
      client.disconnect();
      await client.connect(model, finalConfig);
    }
  }, [mode, connected, config, model, client, buildConfigForMode]);

  return {
    client,
    config,
    setConfig,
    model,
    setModel,
    connected,
    connect,
    disconnect,
    volume,
    mode,
    toggleMode,
  };
}
```

### 3. Modify `src/components/control-tray/ControlTray.tsx`

Add mode toggle button and conditional video streaming:

```typescript
// Add to imports (already exists, just note we use it)
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";

// Inside ControlTray component, after existing hooks:
const { client, connected, connect, disconnect, volume, mode, toggleMode } =
  useLiveAPIContext();

// Modify the video frame sending useEffect to respect mode:
useEffect(() => {
  if (videoRef.current) {
    videoRef.current.srcObject = activeVideoStream;
  }

  let timeoutId = -1;

  function sendVideoFrame() {
    const video = videoRef.current;
    const canvas = renderCanvasRef.current;

    if (!video || !canvas) {
      return;
    }

    const ctx = canvas.getContext("2d")!;
    canvas.width = video.videoWidth * 0.25;
    canvas.height = video.videoHeight * 0.25;
    if (canvas.width + canvas.height > 0) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 1.0);
      const data = base64.slice(base64.indexOf(",") + 1, Infinity);
      client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
    }
    // Only continue loop if connected AND in active mode (or has video stream in passive)
    if (connected && activeVideoStream !== null) {
      timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
    }
  }
  
  // Only send video frames if:
  // - In active mode: always send when connected with video stream
  // - In passive mode: only send when video stream is explicitly active
  if (connected && activeVideoStream !== null) {
    requestAnimationFrame(sendVideoFrame);
  }
  
  return () => {
    clearTimeout(timeoutId);
  };
}, [connected, activeVideoStream, client, videoRef, mode]);

// Add mode toggle button in the JSX (inside the nav.actions-nav, before {children}):
<button
  className={cn("action-button mode-toggle", { active: mode === 'active' })}
  onClick={toggleMode}
  aria-label={`Switch to ${mode === 'passive' ? 'active' : 'passive'} mode`}
  title={mode === 'passive' ? 'Enable Active Mode' : 'Disable Active Mode'}
>
  <span className="material-symbols-outlined">
    {mode === 'active' ? 'visibility' : 'visibility_off'}
  </span>
</button>
```

### 4. Add styles to `src/components/control-tray/control-tray.scss`

```scss
.mode-toggle {
  position: relative;
  
  &.active {
    background-color: rgba(76, 175, 80, 0.2);
    
    &::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      background: rgba(76, 175, 80, 0.3);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: mode-pulse 2s infinite;
      pointer-events: none;
    }
  }
}

@keyframes mode-pulse {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
  }
  100% {
    transform: translate(-50%, -50%) scale(1.5);
    opacity: 0;
  }
}
```

---

## Implementation Notes

### Why Reconnect Instead of `setConfig()`?

The `@google/genai` Live API establishes session configuration at connection time:
- `systemInstruction` is fixed for the session
- `tools` are registered at connection
- There is no `updateConfig()` method on an active session

The only way to change these is to disconnect and reconnect with new config.

### Why No Custom Tool Declarations?

The original plan included tools like `announce_hazard`, `describe_person`, etc. These are **unnecessary** because:
1. Gemini already outputs audio directly—no need for TTS
2. The tools would require client-side handlers that duplicate what Gemini does naturally
3. The system prompt already instructs Gemini to speak these things

Simply changing the `systemInstruction` achieves the desired behavior.

### Video Streaming Strategy

| Mode | Video Behavior |
|------|----------------|
| **Passive** | Video only sent when user explicitly enables webcam/screen share |
| **Active** | Video sent continuously at 0.5 FPS when any video source is active |

The existing video logic already works—no changes needed to the frame rate or resolution.

### Mode Persistence

Mode is stored in React state and resets on page refresh. If persistence is needed later, add localStorage:

```typescript
const [mode, setMode] = useState<AppMode>(() => {
  return (localStorage.getItem('appMode') as AppMode) || 'passive';
});

// In toggleMode:
localStorage.setItem('appMode', newMode);
```

---

## Testing Checklist

- [ ] App starts in passive mode (mic muted, no proactive speech)
- [ ] Clicking mode toggle switches to active mode
- [ ] Mode toggle triggers reconnect (brief disconnect/connect)
- [ ] In active mode, Gemini proactively describes the environment
- [ ] In active mode, Gemini warns about hazards
- [ ] Switching back to passive mode stops proactive speech
- [ ] Video streaming continues to work in both modes
- [ ] Push-to-talk works in both modes

---

## Future Enhancements (Out of Scope)

1. **Proactive speech gate**: Implement 2-second minimum silence between Gemini utterances (client-side audio gating)
2. **Priority interruption**: When Gemini is speaking low-priority info and detects a hazard, interrupt itself
3. **Spatial audio**: Use Web Audio API for directional cues
4. **Haptic feedback**: Vibration patterns for different alert types (requires hardware)

---

## Summary

This plan achieves Passive/Active mode switching with:
- **1 new file**: `src/lib/active-mode-prompt.ts` (system prompts)
- **2 modified files**: `use-live-api.ts` (mode state + reconnect), `ControlTray.tsx` (toggle button)
- **1 style addition**: `control-tray.scss` (pulse animation)

No complex tool declarations. No duplicate TTS. Clean reconnect-based mode switching.
