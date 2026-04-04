# Plan: UPI Payment Flow with QR Scanning Integration (v3)

## Summary

Integrate QR scanning + UPI payment with real-time visual/audio feedback, while **fixing existing architecture issues** that would cause conflicts.

**Key fixes over v2:**
1. Fix Altair responding to ALL tool calls (breaks other tools)
2. Centralize tool registration (currently scattered)
3. Wrap existing handlers with feedback layer (don't rewrite)

---

## Critical Issues to Fix

### Issue 1: Altair Responds to ALL Tool Calls

**Current behavior** (Altair.tsx lines 83-93):
```tsx
if (toolCall.functionCalls.length) {
  client.sendToolResponse({
    functionResponses: toolCall.functionCalls?.map((fc) => ({
      response: { output: { success: true } },  // Responds to EVERY tool!
      id: fc.id,
      name: fc.name,
    })),
  });
}
```

**Problem**: When QR scanner or UPI tool is called, Altair immediately responds with `success: true` before the actual handler runs.

**Fix**: Only respond to tools Altair owns:
```tsx
const altairCalls = toolCall.functionCalls.filter(fc => fc.name === 'render_altair');
if (altairCalls.length) {
  client.sendToolResponse({
    functionResponses: altairCalls.map((fc) => ({ ... })),
  });
}
```

---

### Issue 2: Scattered Tool Registration

**Current state**:
- Altair.tsx: registers `render_altair` + `googleSearch`
- qr-scanner.ts: exports declaration but doesn't register
- upi-payment.ts: exports declaration but doesn't register

**Problem**: Tools are registered in Altair's useEffect, but QR/UPI are never added.

**Fix**: Create centralized tool registry that Altair uses.

---

## Architecture (v3)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Registry (centralized)                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │render_altair│ │scan_qr_code │ │upi_payment  │ │make_payment│ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Dispatcher                               │
│  on("toolcall") → routes to correct handler based on name       │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │   Altair    │    │  QR Scanner │    │ UPI Payment │
   │  (graphs)   │    │ + Feedback  │    │ + Feedback  │
   └─────────────┘    └─────────────┘    └─────────────┘
                              │                   │
                              └─────────┬─────────┘
                                        ▼
                      ┌─────────────────────────────┐
                      │  Local Feedback Layer       │
                      │  - Visual Overlay           │
                      │  - TTS (SpeechSynthesis)    │
                      └─────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Tool Registry
**File**: `src/lib/tool-registry.ts`

```typescript
import { FunctionDeclaration, LiveServerToolCall } from "@google/genai";

export type ToolHandler = (
  toolCall: LiveServerToolCall,
  sendResponse: (responses: any[]) => void
) => void | Promise<void>;

export interface ToolDefinition {
  declaration: FunctionDeclaration;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(name: string, definition: ToolDefinition) {
    this.tools.set(name, definition);
  }

  getDeclarations(): FunctionDeclaration[] {
    return Array.from(this.tools.values()).map(t => t.declaration);
  }

  handleToolCall(
    toolCall: LiveServerToolCall,
    sendResponse: (responses: any[]) => void
  ) {
    if (!toolCall.functionCalls) return;

    for (const fc of toolCall.functionCalls) {
      const tool = this.tools.get(fc.name);
      if (tool) {
        tool.handler(toolCall, sendResponse);
      }
    }
  }
}

export const toolRegistry = new ToolRegistry();
```

### Step 2: Create TTS Feedback Service
**File**: `src/lib/tts-feedback.ts`

```typescript
export class TTSFeedback {
  private synth = window.speechSynthesis;
  private enabled = true;

  setEnabled(enabled: boolean) { this.enabled = enabled; }

  speak(text: string, priority: 'low' | 'high' = 'low') {
    if (!this.enabled) return;
    if (priority === 'high') this.synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.lang = 'en-IN';
    this.synth.speak(utterance);
  }

  // QR/Payment specific
  scanningStart() { this.speak("Scanning for QR code"); }
  qrDetected() { this.speak("QR code detected", 'high'); }
  paymentInfo(merchant: string, amount?: number) {
    const amtText = amount ? `for ${amount} rupees` : '';
    this.speak(`Payment to ${merchant} ${amtText}`, 'high');
  }
  openingApp() { this.speak("Opening payment app"); }
  error(msg: string) { this.speak(msg, 'high'); }
}

export const tts = new TTSFeedback();
```

### Step 3: Create QR Scanner Overlay Component
**File**: `src/components/qr-scanner-overlay/QrScannerOverlay.tsx`

```tsx
export type OverlayState = 
  | { state: 'idle' }
  | { state: 'scanning' }
  | { state: 'detected' }
  | { state: 'success'; upiData: UpiQrData }
  | { state: 'error'; message: string };

export function QrScannerOverlay({ state, upiData, message }: OverlayState) {
  if (state === 'idle') return null;
  
  return (
    <div className="qr-scanner-overlay">
      {state === 'scanning' && <ScanningFrame />}
      {state === 'detected' && <DetectedFlash />}
      {state === 'success' && <SuccessCard upiData={upiData} />}
      {state === 'error' && <ErrorCard message={message} />}
    </div>
  );
}
```

### Step 4: Create UPI QR Parser
**File**: `src/lib/upi-qr-parser.ts`

```typescript
export interface UpiQrData {
  pa: string;   // Payee VPA
  am?: number;  // Amount
  pn?: string;  // Payee Name
  tn?: string;  // Transaction Note
  cu?: string;  // Currency
  raw: string;
}

export function parseUpiQr(qrData: string): UpiQrData | null {
  // Handle: upi://pay?pa=xxx&am=50&pn=StoreName
  if (qrData.startsWith('upi://pay?')) {
    const params = new URLSearchParams(qrData.replace('upi://pay?', ''));
    const pa = params.get('pa');
    if (!pa) return null;
    
    return {
      pa,
      am: params.get('am') ? parseFloat(params.get('am')!) : undefined,
      pn: params.get('pn') || undefined,
      tn: params.get('tn') || undefined,
      cu: params.get('cu') || 'INR',
      raw: qrData,
    };
  }
  
  // Handle plain VPA: merchant@upi
  if (qrData.includes('@')) {
    return { pa: qrData, raw: qrData };
  }
  
  return null;
}
```

### Step 5: Wrap Existing QR Scanner with Feedback
**File**: `src/tools/qr-scanner-with-feedback.ts`

```typescript
import { createQrScannerHandler, qrScanDeclaration } from './qr-scanner';
import { tts } from '../lib/tts-feedback';
import { parseUpiQr } from '../lib/upi-qr-parser';

export function createQrScannerWithFeedback(
  videoElement: HTMLVideoElement | null,
  setOverlayState: (state: OverlayState) => void
) {
  const baseHandler = createQrScannerHandler(videoElement);

  const handleToolCall = (toolCall, sendResponse) => {
    // Show scanning UI + TTS
    setOverlayState({ state: 'scanning' });
    tts.scanningStart();

    // Wrap the response to add feedback
    const wrappedSendResponse = (responses) => {
      const result = responses[0]?.response?.output;
      
      if (result?.success && result?.data) {
        setOverlayState({ state: 'detected' });
        tts.qrDetected();
        
        const upi = parseUpiQr(result.data);
        if (upi) {
          setTimeout(() => {
            setOverlayState({ state: 'success', upiData: upi });
            tts.paymentInfo(upi.pn || upi.pa, upi.am);
          }, 500);
        }
        
        // Auto-dismiss after 3s
        setTimeout(() => setOverlayState({ state: 'idle' }), 3500);
      } else {
        setOverlayState({ state: 'error', message: result?.error || 'Scan failed' });
        tts.error(result?.error || 'Scan failed');
        setTimeout(() => setOverlayState({ state: 'idle' }), 3000);
      }
      
      sendResponse(responses);
    };

    baseHandler.handleToolCall(toolCall, wrappedSendResponse);
  };

  return {
    handleToolCall,
    cleanup: baseHandler.cleanup,
    declaration: qrScanDeclaration,
  };
}
```

### Step 6: Create Combined Payment Tool
**File**: `src/tools/make-payment.ts`

```typescript
import { FunctionDeclaration, Type } from "@google/genai";
import { createQrScannerWithFeedback } from './qr-scanner-with-feedback';
import { createUpiPaymentHandler } from './upi-payment';
import { tts } from '../lib/tts-feedback';

export const makePaymentDeclaration: FunctionDeclaration = {
  name: "make_payment",
  description: "Scans QR code and initiates UPI payment. Use when user wants to pay via QR.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "Payment amount (optional - extracted from QR if present)",
      },
      note: {
        type: Type.STRING,
        description: "Optional payment note",
      },
    },
  },
};

export function createMakePaymentHandler(
  videoElement: HTMLVideoElement | null,
  setOverlayState: (state: OverlayState) => void
) {
  const qrHandler = createQrScannerWithFeedback(videoElement, setOverlayState);
  const upiHandler = createUpiPaymentHandler();

  const handleToolCall = async (toolCall, sendResponse) => {
    // 1. First scan QR
    // 2. Parse UPI data
    // 3. Initiate payment
    // (Orchestrates existing handlers)
  };

  return { handleToolCall, declaration: makePaymentDeclaration };
}
```

### Step 7: Fix Altair.tsx
**File**: `src/components/altair/Altair.tsx`

```diff
  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) return;
      
-     const fc = toolCall.functionCalls.find(fc => fc.name === declaration.name);
+     // Only handle render_altair, not other tools
+     const altairCalls = toolCall.functionCalls.filter(
+       fc => fc.name === declaration.name
+     );
+     
+     const fc = altairCalls[0];
      if (fc) {
        const str = (fc.args as any).json_graph;
        setJSONString(str);
      }
      
-     // BUG: This responds to ALL tools!
-     if (toolCall.functionCalls.length) {
+     // Only respond to altair calls
+     if (altairCalls.length) {
        setTimeout(() =>
          client.sendToolResponse({
-           functionResponses: toolCall.functionCalls?.map((fc) => ({
+           functionResponses: altairCalls.map((fc) => ({
              response: { output: { success: true } },
              id: fc.id,
              name: fc.name,
            })),
          }),
          200
        );
      }
    };
```

### Step 8: Integrate Everything in App.tsx
**File**: `src/App.tsx`

```tsx
import { QrScannerOverlay, OverlayState } from './components/qr-scanner-overlay/QrScannerOverlay';
import { toolRegistry } from './lib/tool-registry';
import { createQrScannerWithFeedback } from './tools/qr-scanner-with-feedback';
import { createUpiPaymentHandler } from './tools/upi-payment';
import { createMakePaymentHandler } from './tools/make-payment';

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>({ state: 'idle' });

  // Register tools once
  useEffect(() => {
    const qrTool = createQrScannerWithFeedback(videoRef.current, setOverlayState);
    const upiTool = createUpiPaymentHandler();
    const paymentTool = createMakePaymentHandler(videoRef.current, setOverlayState);

    toolRegistry.register('scan_qr_code', {
      declaration: qrTool.declaration,
      handler: qrTool.handleToolCall,
    });
    toolRegistry.register('initiate_upi_payment', {
      declaration: upiTool.declaration,
      handler: upiTool.handleToolCall,
    });
    toolRegistry.register('make_payment', {
      declaration: paymentTool.declaration,
      handler: paymentTool.handleToolCall,
    });

    return () => {
      qrTool.cleanup();
    };
  }, []);

  return (
    <div className="App">
      <LiveAPIProvider options={apiOptions}>
        <QrScannerOverlay {...overlayState} />
        <AppLayout ... />
      </LiveAPIProvider>
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tool-registry.ts` | **Create** | Centralized tool registration |
| `src/lib/tts-feedback.ts` | **Create** | Browser TTS wrapper |
| `src/lib/upi-qr-parser.ts` | **Create** | Parse UPI QR format |
| `src/components/qr-scanner-overlay/QrScannerOverlay.tsx` | **Create** | Visual feedback overlay |
| `src/components/qr-scanner-overlay/qr-scanner-overlay.scss` | **Create** | Overlay styling |
| `src/tools/qr-scanner-with-feedback.ts` | **Create** | Wraps existing scanner with feedback |
| `src/tools/make-payment.ts` | **Create** | Combined QR→Payment tool |
| `src/components/altair/Altair.tsx` | **Modify** | Fix tool response bug |
| `src/App.tsx` | **Modify** | Integrate overlay + register tools |

---

## Migration Path (No Breaking Changes)

1. **Step 1**: Fix Altair.tsx (blocks other tools from working)
2. **Step 2**: Create tool-registry.ts (infrastructure)
3. **Step 3**: Create feedback components (TTS, Overlay)
4. **Step 4**: Create wrapped handlers (add feedback to existing)
5. **Step 5**: Integrate in App.tsx
6. **Step 6**: Test existing flows still work (Altair graphs, Google Search)

---

## Testing Checklist

- [ ] Altair `render_altair` still works
- [ ] Google Search still works
- [ ] QR scan works AND shows visual overlay
- [ ] QR scan speaks "Scanning...", "Detected", etc.
- [ ] UPI payment works with deep link
- [ ] `make_payment` orchestrates scan → pay
- [ ] Overlay auto-dismisses
- [ ] No double responses to tool calls
- [ ] Passive mode voice response works
- [ ] Active mode narration works
