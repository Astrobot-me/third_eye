# Copilot Instructions for Multimodal Live API Web Console

## Build & Test Commands

```bash
npm install              # Install dependencies
npm start                # Dev server at http://localhost:3000
npm run start-https      # Dev server with HTTPS (needed for some media permissions)
npm run build            # Production build to build/
npm test                 # Jest in watch mode
npm test -- --watchAll=false                    # Run tests once
npm test -- --watchAll=false -t "test name"     # Run single test by name
npm test -- src/path/file.test.tsx --watchAll=false  # Run specific test file
```

Set `REACT_APP_GEMINI_API_KEY` in `.env` before running.

## Architecture

This is a React app for real-time AI interaction with the Gemini Multimodal Live API via WebSockets.

### Data Flow

```
User Input (mic/camera) → AudioRecorder/MediaStream → GenAILiveClient → WebSocket → Gemini API
                                                                              ↓
UI Components ← LiveAPIContext ← useLiveAPI hook ← GenAILiveClient ← Audio/Content/ToolCalls
```

### Core Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| **WebSocket Client** | `src/lib/genai-live-client.ts` | Event-emitting wrapper around `@google/genai` Live API |
| **React Hook** | `src/hooks/use-live-api.ts` | Manages client lifecycle, audio streaming, connection state |
| **Context** | `src/contexts/LiveAPIContext.tsx` | Exposes `useLiveAPI` to component tree |
| **Audio Processing** | `src/lib/audio-*.ts`, `src/lib/worklets/` | AudioWorklet-based recording (16kHz PCM) and playback (24kHz) |

### Key Events from GenAILiveClient

```typescript
client.on("audio", (data: ArrayBuffer) => {});      // Incoming audio from Gemini
client.on("content", (data: LiveServerContent) => {}); // Text/other content
client.on("toolcall", (toolCall: LiveServerToolCall) => {}); // Function calls
client.on("interrupted", () => {});                 // User interrupted AI
client.on("turncomplete", () => {});                // AI finished speaking
```

### Streaming Rates (from specs.md)

- **Audio capture**: 128ms chunks (8/sec), 16kHz PCM16
- **Audio playback**: 24kHz, 100ms queue checks
- **Video frames**: 2000ms interval (0.5 FPS), 25% resolution, JPEG

## Key Patterns

### Using the Live API Context

```typescript
const { client, connected, connect, disconnect, setConfig } = useLiveAPIContext();

// Configure on mount
useEffect(() => {
  setConfig({
    responseModalities: [Modality.AUDIO],
    systemInstruction: { parts: [{ text: "Your prompt here" }] },
    tools: [{ googleSearch: {} }, { functionDeclarations: [...] }],
  });
}, [setConfig]);
```

### Implementing Tool Calls

```typescript
useEffect(() => {
  const onToolCall = (toolCall: LiveServerToolCall) => {
    const fc = toolCall.functionCalls?.find(fc => fc.name === "my_tool");
    if (fc) {
      // Handle the tool call
      const result = processToolCall(fc.args);
      
      // Send response back
      client.sendToolResponse({
        functionResponses: [{ response: { output: result }, id: fc.id, name: fc.name }],
      });
    }
  };
  client.on("toolcall", onToolCall);
  return () => client.off("toolcall", onToolCall);
}, [client]);
```

### Sending Realtime Input

```typescript
// Audio (from AudioRecorder)
client.sendRealtimeInput([{ mimeType: "audio/pcm;rate=16000", data: base64Audio }]);

// Video frame (from canvas)
client.sendRealtimeInput([{ mimeType: "image/jpeg", data: base64Image }]);
```

### Media Stream Hooks

```typescript
const webcam = useWebcam();       // { isStreaming, start, stop }
const screen = useScreenCapture(); // { isStreaming, start, stop }

// Start returns MediaStream
const stream = await webcam.start();
```

## Conventions

- **Component files**: PascalCase (`ControlTray.tsx`)
- **Hook files**: kebab-case with use- prefix (`use-live-api.ts`)
- **Style files**: kebab-case SCSS beside component (`control-tray.scss`)
- **Shared types**: Define in `src/types.ts`
- **Tests**: Co-located as `Component.test.tsx`

### Ref Pattern for Event Callbacks

When using state values in event callbacks (like audio data handlers), use refs updated synchronously to avoid stale closures:

```typescript
const [muted, setMuted] = useState(true);
const mutedRef = useRef(muted);
mutedRef.current = muted;  // Update synchronously, not in useEffect

const onData = (data: string) => {
  if (!mutedRef.current) {  // Use ref, not state directly
    client.sendRealtimeInput([...]);
  }
};
```

## Important Notes

- Config is set at connection time via `client.connect(model, config)`. To change `systemInstruction` or `tools`, you must reconnect.
- Audio processing uses Web Audio API Worklets for low latency - changes to `src/lib/worklets/` require understanding AudioWorkletProcessor.
- The `Altair` component demonstrates the full tool-calling pattern with Vega-Lite visualization.
