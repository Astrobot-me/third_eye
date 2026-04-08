# Fix: ESP32 Authentication Stale Closure Bug

## Problem
The ESP32 biometric authentication flow in `make-payment.ts` had a **stale closure bug**. The polling loop read `esp32Deps.authStatus`, but this value was captured at handler creation time and never updated when React state changed.

### Broken Flow:
```
1. PaymentToolHandler creates esp32Deps → { authStatus: 'idle' }
2. Tool call invoked → sends "ASK_AUTH_VERIFY" to ESP32  
3. Poll loop checks esp32Deps.authStatus every 200ms
4. ESP32 sends AUTH_SUCCESS → context calls setAuthStatus('success')
5. ❌ Poll still sees 'idle' or 'pending' (stale closure)
6. ⏰ Times out after 20 seconds
```

## Solution
Replace static `authStatus` value with `getAuthStatus()` getter that reads from a ref.

## Changes Made

### 1. `src/contexts/Esp32Context.tsx`
- Added `authStatusRef: MutableRefObject<AuthStatus>` 
- Updated `setAuthStatus` to sync both ref and state:
  ```tsx
  const setAuthStatus = useCallback((status: AuthStatus) => {
    authStatusRef.current = status;  // Update ref immediately (synchronous)
    setAuthStatusState(status);      // Update state for UI re-renders
  }, [addLog]);
  ```
- Exposed `authStatusRef` in context value

### 2. `src/tools/make-payment.ts`  
- Changed `Esp32Deps` interface:
  ```tsx
  interface Esp32Deps {
    getAuthStatus: () => AuthStatus;  // Getter instead of value
    // ...
  }
  ```
- Updated polling to use getter:
  ```tsx
  const status = esp32Deps.getAuthStatus();  // Always current
  ```

### 3. `src/components/payment-tool-handler/PaymentToolHandler.tsx`
- Pass ref accessor instead of stale value:
  ```tsx
  const esp32Deps = {
    getAuthStatus: () => authStatusRef.current,
    // ...
  };
  ```

## Why This Works
- **Refs update synchronously** - when `setAuthStatus` is called, `authStatusRef.current` is updated immediately
- **Getter reads current ref** - `getAuthStatus()` always returns the current value, not a captured snapshot
- **No stale closure** - the function closure captures the ref object (stable), not the value (changing)

## Testing
1. Connect ESP32 and trigger payment flow
2. Verify "ASK_AUTH_VERIFY" is sent (check ESP32 logs)
3. Send AUTH_SUCCESS from ESP32
4. Verify payment proceeds immediately (not timing out)
