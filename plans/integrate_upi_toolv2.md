# Plan: UPI Payment Flow with QR Scanning Integration (v2)

## Summary

Merge QR scanning and UPI payment into a seamless `make_payment` workflow where the AI can:
1. Scan a QR code via webcam
2. Parse UPI data (upi://pay?pa=&am=&pn=&tn=)
3. Initiate payment automatically

**Key Addition**: Real-time visual and TTS audio feedback **independent of Gemini** for instant user experience.

---

## Architecture

```
User: "Pay to this QR code"
         │
         ▼
┌─────────────────────────────────────────────────┐
│  AI Model calls make_payment tool               │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  Local Feedback Layer (Gemini-independent, instant)        │
│  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │  Visual Overlay      │  │  Browser TTS (SpeechSyn)   │  │
│  │  - Scanner frame     │  │  - "Scanning for QR..."    │  │
│  │  - Pulsing animation │  │  - "QR code detected"      │  │
│  │  - Success checkmark │  │  - "Payment to PhonePe,    │  │
│  │  - Parsed UPI info   │  │     500 rupees"            │  │
│  │  - Error states      │  │  - "Opening payment app"   │  │
│  └──────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Tool returns result to Gemini for follow-up    │
└─────────────────────────────────────────────────┘
```

---

## Visual Feedback Component

### File: `src/components/qr-scanner-overlay/QrScannerOverlay.tsx`

```tsx
interface QrScannerOverlayProps {
  state: 'idle' | 'scanning' | 'detected' | 'success' | 'error';
  upiData?: UpiQrData;
  errorMessage?: string;
}

// Visual states:
// - idle: hidden
// - scanning: animated scanner frame with pulsing corners
// - detected: brief flash, corners turn green
// - success: checkmark animation, UPI info displayed
// - error: red X, error message
```

**Visual elements**:
- Corner brackets (L-shaped) that pulse during scan
- Semi-transparent dark overlay outside scan area
- Centered text status ("Scanning...", "QR Detected!")
- UPI info card (merchant, amount) on success
- Auto-dismiss after 3 seconds

---

## TTS Feedback Service

### File: `src/lib/tts-feedback.ts`

```typescript
// Uses browser's SpeechSynthesis API - no external dependencies
export class TTSFeedback {
  private synth = window.speechSynthesis;
  
  speak(text: string, priority: 'low' | 'high' = 'low') {
    if (priority === 'high') {
      this.synth.cancel(); // Interrupt current speech
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for responsiveness
    utterance.lang = 'en-IN'; // Indian English for UPI context
    this.synth.speak(utterance);
  }
  
  // Predefined messages
  scanningStart() { this.speak("Scanning for QR code"); }
  qrDetected() { this.speak("QR code detected", 'high'); }
  paymentInfo(merchant: string, amount?: number) {
    const amtText = amount ? `for ${amount} rupees` : '';
    this.speak(`Payment to ${merchant} ${amtText}`, 'high');
  }
  openingApp() { this.speak("Opening payment app"); }
  error(msg: string) { this.speak(msg, 'high'); }
}
```

---

## Implementation Steps

### Step 1: Create TTS Feedback Service
**File**: `src/lib/tts-feedback.ts`
- Browser SpeechSynthesis wrapper
- Predefined messages for payment flow
- Priority system (can interrupt for important messages)

### Step 2: Create QR Scanner Overlay Component  
**File**: `src/components/qr-scanner-overlay/QrScannerOverlay.tsx`
- Scanner frame with animated corners
- State-based visual feedback
- UPI info display card
- SCSS for animations

### Step 3: Create UPI QR Parser Utility
**File**: `src/lib/upi-qr-parser.ts`

```typescript
export interface UpiQrData {
  pa: string;   // Payee VPA (e.g., merchant@paytm)
  am?: number;  // Amount
  pn?: string;  // Payee Name
  tn?: string;  // Transaction Note
  cu?: string;  // Currency (default INR)
  raw: string;  // Original QR string
}

export function parseUpiQr(qrData: string): UpiQrData | null {
  // Handle: upi://pay?pa=xxx&am=50&pn=StoreName
  // Handle: plain VPA like "merchant@upi"
  // Handle: partial data (no amount)
}
```

### Step 4: Create Payment Tools with Feedback Integration
**File**: `src/tools/payment-tools.ts`

```typescript
export function createPaymentToolsHandler(
  videoElement: HTMLVideoElement | null,
  setOverlayState: (state: OverlayState) => void,  // Visual feedback
  tts: TTSFeedback  // Audio feedback
) {
  const handleMakePayment: ToolHandler = async (args) => {
    // 1. Show scanning overlay + TTS
    setOverlayState({ state: 'scanning' });
    tts.scanningStart();
    
    // 2. Scan QR (using jsQR library)
    const qrData = await scanQrFromVideo(videoElement);
    
    if (!qrData) {
      setOverlayState({ state: 'error', message: 'No QR found' });
      tts.error("No QR code found. Please point camera at QR code.");
      return { success: false, error: 'No QR found' };
    }
    
    // 3. Parse UPI data
    setOverlayState({ state: 'detected' });
    tts.qrDetected();
    
    const upi = parseUpiQr(qrData);
    if (!upi) {
      setOverlayState({ state: 'error', message: 'Invalid QR' });
      tts.error("This is not a valid UPI QR code");
      return { success: false, error: 'Invalid UPI QR' };
    }
    
    // 4. Show success + speak payment info
    setOverlayState({ state: 'success', upiData: upi });
    tts.paymentInfo(upi.pn || upi.pa, upi.am);
    
    // 5. Open payment app
    await delay(1500); // Let user hear the info
    tts.openingApp();
    openUpiDeepLink(upi, args.amount);
    
    return { success: true, upiData: upi };
  };
  
  return { handleMakePayment, declarations };
}
```

### Step 5: Integrate into App
**File**: `src/App.tsx`

```tsx
function App() {
  const [overlayState, setOverlayState] = useState<OverlayState>({ state: 'idle' });
  const ttsRef = useRef(new TTSFeedback());
  
  // Pass to tool handler
  const paymentTools = useMemo(() => 
    createPaymentToolsHandler(videoRef.current, setOverlayState, ttsRef.current),
    [videoRef]
  );
  
  return (
    <>
      <QrScannerOverlay {...overlayState} />
      {/* rest of app */}
    </>
  );
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tts-feedback.ts` | Create | Browser TTS wrapper with predefined messages |
| `src/components/qr-scanner-overlay/QrScannerOverlay.tsx` | Create | Visual scanner overlay component |
| `src/components/qr-scanner-overlay/qr-scanner-overlay.scss` | Create | Animations and styling |
| `src/lib/upi-qr-parser.ts` | Create | Parse UPI QR format |
| `src/tools/payment-tools.ts` | Create | Tool handlers with feedback integration |
| `src/App.tsx` | Modify | Integrate overlay and TTS |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Browser SpeechSynthesis for TTS | No latency, works offline, no API cost |
| Visual overlay on video | User sees exactly where to point camera |
| Feedback before Gemini responds | Instant acknowledgment, accessible |
| 1.5s delay before opening app | User hears payment info first |
| Indian English TTS voice | Natural for UPI/rupees context |
| Auto-dismiss overlay after 3s | Clean UI, doesn't block video |

---

## TTS Message Flow

```
1. Tool called     → "Scanning for QR code"
2. QR detected     → "QR code detected"  
3. UPI parsed      → "Payment to PhonePe Merchant for 500 rupees"
4. Opening app     → "Opening payment app"
   
On error:
- No QR found     → "No QR code found. Please point camera at QR code."
- Invalid QR      → "This is not a valid UPI QR code"
- No amount       → "QR code has no amount. Please specify amount."
```

---

## Visual State Flow

```
idle → scanning → detected → success → idle (auto)
                     ↓
                   error → idle (auto after 3s)
```

---

## Dependencies

- `jsqr` - QR code scanning from canvas (already lightweight, ~30KB)
- Browser SpeechSynthesis API (built-in, no dependency)

---

## Testing Checklist

- [ ] TTS works in Chrome/Edge (SpeechSynthesis)
- [ ] Scanner overlay appears on tool call
- [ ] Pulsing animation during scanning
- [ ] Green success state when QR detected
- [ ] UPI info displayed correctly
- [ ] TTS speaks merchant name and amount
- [ ] Error states show and speak correctly
- [ ] Overlay auto-dismisses
- [ ] Deep link opens payment app
- [ ] Works without Gemini response (local feedback only)
