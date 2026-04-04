# ESP32 Integration Plan - React State Compatibility Review

## Executive Summary

The ESP32 WebSocket integration plan is **largely compatible** with existing React state management. Minor adjustments needed for video stream controls and debouncing mode toggles.

---

## Current State Architecture

| Component | State Variable | Location |
|-----------|----------------|----------|
| ControlTray | `muted` | ControlTray.tsx:75 |
| ControlTray | `pushToTalkActive` | ControlTray.tsx:76 |
| ControlTray | `activeVideoStream` | ControlTray.tsx:70-71 |
| useLiveAPI | `mode` ('passive'/'active') | use-live-api.ts:51 |
| useLiveAPI | `connected` | use-live-api.ts:49 |

---

## Command Compatibility Matrix

| ESP32 Command | Plan Action | Status | Notes |
|---------------|-------------|--------|-------|
| `TOGGLE_MUTE` | `setMuted(!muted)` | ✅ OK | Works directly |
| `MUTE_ON` | `setMuted(true)` | ✅ OK | Works directly |
| `MUTE_OFF` | `setMuted(false)` | ✅ OK | Works directly |
| `CONNECT` | `connect()` | ✅ OK | From useLiveAPIContext |
| `DISCONNECT` | `disconnect()` | ✅ OK | From useLiveAPIContext |
| `TOGGLE_MODE` | `toggleMode()` | ✅ OK | Async, handles reconnect |
| `WEBCAM_ON/OFF` | use hook methods | ⚠️ | Needs handler access |
| `PTT_START/STOP` | `setPushToTalkActive()` | ✅ OK | Triggers audioStreamEnd |

---

## Identified Issues

### Issue 1: Video Stream Controls Not Directly Accessible
**Location**: ControlTray.tsx:247-258

The `changeStreams()` function is a closure inside ControlTray. The plan needs to either:
- Pass webcam/screenCapture hooks via props to the ESP32 handler
- Expose control functions from ControlTray

**Recommended**: Add `webcamControl` and `screenCaptureControl` props to ControlTray.

### Issue 2: PTT Release Triggers audioStreamEnd
**Location**: ControlTray.tsx:136-141

The existing code detects PTT release to end speech. When ESP32 sends `PTT_STOP`, it will correctly trigger this behavior. This is desired but worth noting.

### Issue 3: Mode Toggle Race Condition
**Location**: use-live-api.ts:156-173

`toggleMode()` is async and may reconnect the client. Rapid ESP32 toggles could cause concurrent reconnects.

**Recommended**: Add debounce in ESP32 command handler (300ms minimum).

### Issue 4: WebSocket Hook Dependency Issue
**Location**: Plan line 217

The hook has `onCommand` in useCallback dependencies. If `onCommand` is recreated each render, it causes unnecessary reconnects.

**Recommended**: Wrap `onCommand` in `useCallback` in the ControlTray integration.

---

## Audio Gating Pattern - Compatible

The code uses refs (`mutedRef`, `pushToTalkActiveRef`) updated synchronously:
```typescript
mutedRef.current = muted;
pushToTalkActiveRef.current = pushToTalkActive;
```

This pattern works correctly with ESP32 commands because state updates trigger re-render, then refs sync on next render.

---

## Recommendations for Implementation

1. **Add debounce** for mode toggle commands (300ms)
2. **Expose video control** - add `onWebcamToggle` and `onScreenCaptureToggle` props to ControlTray
3. **Use useCallback** for the command handler to prevent WebSocket reconnects
4. **Add connection status indicator** for ESP32 in UI (optional)

---

## Conclusion

The plan does NOT break React state handling. The existing architecture is well-designed with proper separation. With minor adjustments for video control exposure and debouncing, the integration will work cleanly.

**Status**: Ready for implementation with noted adjustments.