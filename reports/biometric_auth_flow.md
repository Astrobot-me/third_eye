# Biometric Authentication Flow - ESP32 ↔ React Integration

## Overview

The payment system supports optional biometric verification via ESP32 fingerprint sensor before processing UPI payments.

---

## Communication Protocol

### React App → ESP32

| Message | When Sent | Purpose |
|---------|-----------|---------|
| `ASK_AUTH_VERIFY` | After QR scan, before payment | Request biometric verification |

### ESP32 → React App

| Message | When Sent | Effect |
|---------|-----------|--------|
| `AUTH_SUCCESS` | Fingerprint verified ✓ | Payment proceeds, UPI app opens |
| `AUTH_FAILED` | Fingerprint denied ✗ | Payment cancelled, error displayed |

---

## Complete Flow

```
┌─────────────┐                              ┌─────────────┐
│  React App  │                              │    ESP32    │
└──────┬──────┘                              └──────┬──────┘
       │                                            │
       │  1. QR Code Scanned Successfully           │
       │  2. UPI Data Parsed                        │
       │                                            │
       │────── ASK_AUTH_VERIFY ────────────────────►│
       │                                            │
       │  [Show "Authenticating..." overlay]        │  3. Trigger fingerprint
       │  [Start 30s timeout]                       │     sensor
       │                                            │
       │                                            │  4. Wait for finger...
       │                                            │
       │◄───────── AUTH_SUCCESS ───────────────────│  5a. Fingerprint matched
       │                                            │
       │  6. Show success animation                 │
       │  7. Open UPI payment app                   │
       │                                            │
       │           ─── OR ───                       │
       │                                            │
       │◄───────── AUTH_FAILED ────────────────────│  5b. Fingerprint denied
       │                                            │
       │  6. Show error message                     │
       │  7. Cancel payment                         │
       │                                            │
```

---

## Timing

| Parameter | Value | Notes |
|-----------|-------|-------|
| Auth timeout | 30 seconds | If no response, auth fails |
| Poll interval | 200ms | How often React checks auth status |
| Success delay | 1.5 seconds | Brief pause after success before opening app |

---

## React Implementation Details

**File:** `src/tools/make-payment.ts`

```typescript
// Send auth request to ESP32
esp32Deps.sendToESP32("ASK_AUTH_VERIFY");

// Poll for response
const pollInterval = setInterval(() => {
  const status = esp32Deps.authStatus;
  if (status === 'success') {
    // Proceed with payment
  } else if (status === 'failed') {
    // Cancel payment
  }
}, 200);
```

**File:** `src/hooks/use-esp32-websocket.ts`

```typescript
// Handle auth responses
if (command === 'AUTH_SUCCESS') {
  setAuthStatus('success');
} else if (command === 'AUTH_FAILED') {
  setAuthStatus('failed');
}
```

---

## ESP32 Implementation Example

```cpp
// When ASK_AUTH_VERIFY received:
void handleAuthRequest() {
  // Trigger fingerprint sensor
  if (fingerprintSensor.getImage() == FINGERPRINT_OK) {
    if (fingerprintSensor.fingerSearch() == FINGERPRINT_OK) {
      webSocket.broadcastTXT("AUTH_SUCCESS");
    } else {
      webSocket.broadcastTXT("AUTH_FAILED");
    }
  } else {
    // Timeout or no finger
    webSocket.broadcastTXT("AUTH_FAILED");
  }
}
```

---

## Overlay States

| State | Description | User Action |
|-------|-------------|-------------|
| `authenticating` | Waiting for fingerprint | Can click "Cancel" |
| `auth_success` | Verification passed | Auto-proceeds to payment |
| `auth_failed` | Verification denied/timeout | Shows error, returns to idle |

---

## Error Scenarios

| Scenario | Behavior |
|----------|----------|
| ESP32 not connected | Auth skipped, payment proceeds directly |
| 30s timeout | `auth_failed` state, payment cancelled |
| User clicks Cancel | Payment cancelled, returns to idle |
| Fingerprint not recognized | `AUTH_FAILED` sent, payment cancelled |

---

## Testing

1. **Without ESP32:** Payment should work normally (auth skipped)
2. **With ESP32 connected:** Should show authenticating overlay
3. **Send `AUTH_SUCCESS` manually:** Payment should proceed
4. **Send `AUTH_FAILED` manually:** Payment should cancel
5. **Wait 30s:** Should timeout and cancel
