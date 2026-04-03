# Active Mode Implementation Plan v0

## Overview
This plan implements a dual-mode system (Passive/Active) for a smart glasses application for blind users using the Google Gemini Multimodal Live API.

## Files to Create/Modify

### 1. Create `src/hooks/useModeController.ts`
```typescript
import { useState, useCallback } from 'react';

export type AppMode = 'passive' | 'active';

export const useModeController = () => {
  const [mode, setMode] = useState<AppMode>('passive');
  
  const toggleMode = useCallback(() => {
    setMode(prev => prev === 'passive' ? 'active' : 'passive');
  }, []);
  
  return { mode, toggleMode };
};
```

### 2. Create `src/lib/active-mode-prompt.ts`
```typescript
export const ACTIVE_MODE_SYSTEM_PROMPT = `You are a situational awareness assistant for a blind user. Your role is to provide continuous, proactive narration of the user's environment with the following priorities:

1. **URGENT HAZARDS FIRST**: Immediately warn about obstacles, steps, curbs, moving objects, or dangers using clear spatial language ("Step 3 feet to your right", "Curb directly ahead", "Wall 2 meters to your left")

2. **NAVIGATION CUES**: Provide guidance about paths, doors, turns, and route information when relevant

3. **SOCIAL CONTEXT**: Describe approaching people, their approximate distance, direction, and emotional tone when discernible ("Person approaching from left, appears happy", "Group of three people talking 5 feet ahead")

4. **TEXT READING**: Read aloud any visible text unprompted (signs, menus, labels, screens, documents)

5. **AMBIENT AWARENESS**: Provide environmental cues every 3-5 seconds when no urgent information is present ("Quiet office space", "Outdoor street with light traffic", "Open doorway to your right")

6. **SPATIAL CONSISTENCY**: Always use egocentric spatial references (left/right/ahead/behind) and distance estimates when possible

7. **PROACTIVE BUT NOT OVERWHELMING**: Speak in concise phrases, avoid repeating the same information unnecessarily, and respect the 2-second proactive speech gate enforced client-side

8. **INTERRUPTION READY**: Be prepared to stop speaking immediately if the user starts talking or if a higher priority alert occurs`;
```

### 3. Modify `src/contexts/LiveAPIContext.tsx`
Add imports and mode handling:
```typescript
// Add imports
import { useModeController } from '../hooks/useModeController';
import { ACTIVE_MODE_SYSTEM_PROMPT } from '../lib/active-mode-prompt';

// Inside LiveAPIProvider component
const { mode, toggleMode } = useModeController();

// Expose in context value
return (
  <LiveAPIContext.Provider value={{
    // ... existing values
    mode,
    toggleMode
  }}>
    {/* ... existing children */}
  </LiveAPIContext.Provider>
);

// Update setConfig call
useEffect(() => {
  let isMounted = true;
  
  const initializeClient = async () => {
    // ... existing client setup
    
    // Determine system prompt and tools based on mode
    const systemPrompt = mode === 'active' 
      ? ACTIVE_MODE_SYSTEM_PROMPT
      : 'You are a voice assistant. Only speak when directly asked. Answer concisely.';
      
    const tools = mode === 'active' ? [
      { googleSearch: {} },
      {
        functionDeclarations: [
          {
            name: "announce_hazard",
            description: "Announce a hazard with type, direction, and urgency",
            parameters: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING", description: "Type of hazard (step, curb, obstacle, etc.)" },
                direction: { type: "STRING", description: "Direction from user (left, right, ahead, etc.)" },
                urgency: { type: "STRING", description: "Urgency level (low, medium, high)" }
              },
              required: ["type", "direction", "urgency"]
            }
          },
          {
            name: "describe_person",
            description: "Describe a person with distance, direction, and emotion",
            parameters: {
              type: "OBJECT",
              properties = {
                distance: { type: "STRING", description: "Approximate distance" },
                direction: { type: "STRING", description: "Direction from user" },
                emotion: { type: "STRING", description: "Emotional tone if discernible" }
              },
              required: ["distance", "direction"]
            }
          },
          {
            name: "read_text",
            description: "Read visible text from signs, menus, etc.",
            parameters: {
              type: "OBJECT",
              properties: {
                content: { type: "STRING", description: "Text content to read" },
                source: { type: "STRING", description: "Source of text (sign, menu, screen, etc.)" }
              },
              required: ["content"]
            }
          },
          {
            name: "navigation_cue",
            description: "Provide navigation instruction",
            parameters: {
              type: "OBJECT",
              properties: {
                instruction: { type: "STRING", description: "Navigation instruction" }
              },
              required: ["instruction"]
            }
          }
        ]
      }
    ] : [
      { googleSearch: {} }
    ];

    await client.setConfig({
      // ... existing config
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      tools
    });
    
    // ... rest of initialization
  };
  
  // ... rest of effect
}, [mode]); // Important: re-run effect when mode changes
```

### 4. Update `src/components/control-tray/ControlTray.tsx`
Add mode toggle button:
```typescript
// Add import
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";

// Inside ControlTray component
const { mode, toggleMode } = useLiveAPIContext();

// Add to controls section (before children prop)
<button 
  className={cn("action-button mode-toggle", { active: mode === 'active' })}
  onClick={toggleMode}
  aria-label={`Switch to ${mode === 'passive' ? 'active' : 'passive'} mode`}
>
  <span className="material-symbols-outlined">
    {mode === 'passive' ? 'visibility' : 'visibility_off'}
  </span>
  <span className="mode-label">{mode === 'passive' ? 'Active' : 'Passive'}</span>
</button>

// CSS additions for control-tray.scss
/* Add to control-tray.scss */
.mode-toggle {
  position: relative;
  margin-left: 8px;
}

.mode-label {
  font-size: 0.75rem;
  margin-left: 4px;
}

/* Pulse animation for active mode */
.mode-toggle.active::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 20px;
  height: 20px;
  background: rgba(0, 255, 0, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
}
```

### 5. Handle Tool Calls
Update existing tool call handler (e.g., in Altair.tsx or create new handler):
```typescript
useEffect(() => {
  const onToolCall = (toolCall: LiveServerToolCall) => {
    if (!toolCall.functionCalls) return;
    
    // Handle Altair tool (existing)
    const fc = toolCall.functionCalls.find(fc => fc.name === declaration.name);
    if (fc) {
      // ... existing Altair handling
    }
    
    // Handle active mode tools
    toolCall.functionCalls.forEach(fc => {
      switch (fc.name) {
        case "announce_hazard":
          const { type, direction, urgency } = fc.args as any;
          // Trigger TTS announcement with hazard priority
          announceToUser(`Hazard: ${type} ${direction}. Urgency: ${urgency}`, 'high');
          break;
          
        case "describe_person":
          const { distance, direction, emotion } = fc.args as any;
          announceToUser(`Person ${distance} ${direction}. ${emotion ? `Appears ${emotion}.` : ''}`, 'medium');
          break;
          
        case "read_text":
          const { content, source } = fc.args as any;
          announceToUser(`${source}: ${content}`, 'medium');
          break;
          
        case "navigation_cue":
          const { instruction } = fc.args as any;
          announceToUser(`Navigation: ${instruction}`, 'high');
          break;
      }
    });
    
    // Send tool responses
    if (toolCall.functionCalls.length) {
      client.sendToolResponse({
        functionResponses: toolCall.functionCalls.map(fc => ({
          response: { output: { success: true } },
          id: fc.id,
          name: fc.name,
        })),
      });
    }
  };
  
  client.on("toolcall", onToolCall);
  return () => client.off("toolcall", onToolCall);
}, [client]);

// Helper function for announcements (integrate with your audio/TTS system)
const announceToUser = (text: string, priority: 'low' | 'medium' | 'high') => {
  // Implement based on your existing audio/TTS system
  // Respect the 2-second proactive speech gate (minimum 2s silence between utterances)
};
```

### 6. Video Frame Sending Logic
Modify in ControlTray.tsx sendVideoFrame function:
```typescript
if (connected && activeVideoStream !== null && mode === 'active') {
  requestAnimationFrame(sendVideoFrame);
}
// When in passive mode, don't send video frames
```

## Key Implementation Notes

1. **WebSocket Persistence**: Never disconnect/reconnect - only call `setConfig()` with new parameters when toggling modes
2. **Mode-Specific Tools**: Active mode tools registered only when in active mode
3. **System Prompt Swap**: Core intelligence difference comes from swapping system prompts
4. **Proactive Speech Gate**: Implement in audio/TTS system (2s minimum silence between utterances)
5. **Visual Indicators**: Mode toggle button shows state with pulse animation in active mode
6. **Default Behavior**: Passive mode remains default, preserving existing functionality

## FPS Strategy
- Passive mode: Video streaming paused (0 FPS when not actively asking visual questions)
- Active mode: Use existing 0.5 FPS / 2000ms interval (no changes to capture pipeline)

This plan follows the architecture precisely while maintaining compatibility with existing code patterns.