# Plan: UPI Payment Flow with QR Scanning Integration

## Summary

Merge QR scanning and UPI payment into a seamless `make_payment` workflow where the AI can:
1. Scan a QR code via webcam
2. Parse UPI data (upi://pay?pa=&am=&pn=&tn=)
3. Initiate payment automatically

---

## Architecture

```
User: "Pay 50 rupees to the QR code"
         │
         ▼
┌─────────────────────────────────────────────────┐
│  AI Model (sees tool calls)                     │
│  1. scan_qr_code tool → returns QR data         │
│  2. Parses: pa=merchant@upi, am=50              │
│  3. initiate_upi_payment → opens payment app    │
└─────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create UPI QR Parser Utility
**File**: `src/lib/upi-qr-parser.ts`

```typescript
export interface UpiQrData {
  pa: string;  // Payee VPA
  am?: number; // Amount
  pn?: string; // Payee Name
  tn?: string; // Transaction Note
  cu?: string; // Currency (default INR)
}

export function parseUpiQr(qrData: string): UpiQrData | null {
  // Handle: upi://pay?pa=xxx&am=50
  // Handle: plain text UPI ID like "merchant@upi"
  // Handle: upi://pay?pa=xxx (no amount - prompt user)
}
```

### Step 2: Create combined tool declarations and unified handler
**File**: `src/tools/payment-tools.ts`

```typescript
// Combined declaration for model instruction
export const makePaymentDeclaration: FunctionDeclaration = {
  name: "make_payment",
  description: "Scans a QR code and initiates UPI payment. Use when user wants to pay via QR.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "Payment amount in INR (optional - will be extracted from QR if present)",
      },
      note: {
        type: Type.STRING,
        description: "Optional note for payment",
      },
    },
  },
};

// Keep existing declarations: qrScanDeclaration, upiPaymentDeclaration
```

### Step 3: Create unified handler
**File**: `src/tools/payment-tools.ts`

```typescript
export function createPaymentToolsHandler(
  videoElement: HTMLVideoElement | null,
  deps?: PaymentDeps
) {
  const qrHandler = createQrScannerHandler(videoElement, deps?.qrDeps);
  const upiHandler = createUpiPaymentHandler(deps?.upiDeps);

  // Combined handler that orchestrates QR → Payment
  const handleMakePayment: ToolHandler = async (toolCall, sendResponse) => {
    // Step 1: Scan QR
    // Step 2: Parse UPI data
    // Step 3: Initiate payment
  };

  return {
    handleToolCall: combinedHandler,
    cleanup: () => { qrHandler.cleanup(); upiHandler.cleanup(); },
    declarations: [makePaymentDeclaration, qrScanDeclaration, upiPaymentDeclaration],
  };
}
```

### Step 4: Integrate into App
**File**: `src/App.tsx`

- Import `createPaymentToolsHandler`
- Pass `videoRef.current` to handler
- Register in `setConfig` alongside existing tools

---

## Key Design Decisions

| Decision | Rationale |
|----------|------------|
| Keep existing individual tools | Backward compatibility, model can call separately |
| Add `make_payment` as orchestrator | Simpler for user, model handles sequencing |
| Make amount optional in `make_payment` | QR may or may not have amount |
| Use existing `videoRef` | Already available, no new webcam needed |
| Parser handles multiple formats | QR codes vary in format |

---

## Model System Prompt Addition

Add to `useLiveAPI` or Altair system instruction:

```
When user asks to "pay" or "make payment":
1. Call make_payment tool
2. If QR has no amount, ask user for amount
3. If amount provided but QR has different amount, ask for confirmation
```

---

## Testing Checklist

- [ ] QR scanning works with existing webcam
- [ ] UPI QR format parsing works (upi://pay?pa=...)
- [ ] Amount extraction from QR works
- [ ] Fallback when amount not in QR (model asks user)
- [ ] Payment deep link opens correctly
- [ ] Existing Altair + Google Search still work