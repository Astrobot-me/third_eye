# Audio & Video WebSocket Intervals Specification

**Document Version:** 1.0  
**Last Updated:** 2026-03-26 06:30 UTC  
**Scope:** Audio_Pay Codebase - Real-time streaming intervals and rates

---

## Overview

This document specifies the exact intervals and rates at which audio and video data are sent to the WebSocket connection for the Google Gemini Multimodal Live API.

---

## Audio Streaming Specifications

### Audio Capture Stream

| Property | Value | Notes |
|----------|-------|-------|
| **Interval** | 128ms | Per chunk transmission |
| **Chunk Size** | 2048 samples | At 16kHz sample rate |
| **Sample Rate** | 16kHz (16000 Hz) | Standard speech quality |
| **Data Format** | PCM16 | Signed 16-bit integer (Int16Array) |
| **Frequency** | 8 chunks/second | 1000ms ÷ 128ms |
| **MIME Type** | `audio/pcm;rate=16000` | Sent in WebSocket message |
| **Source** | Microphone input | via `navigator.mediaDevices.getUserMedia()` |

**Calculation:**
```
2048 samples / 16000 Hz = 0.128 seconds = 128 milliseconds
1000 ms / 128 ms = 7.8125 ≈ 8 chunks per second
```

**Code Location:** `src/lib/worklets/audio-processing.ts` (lines 61-62)

**Code Reference:**
```typescript
// Audio processing worklet
buffer = new Int16Array(2048);  // Buffer size

// Comment in code:
// "send and clear buffer every 2048 samples, 
//  which at 16khz is about 8 times a second"

sendAndClearBuffer();  // Called when buffer reaches 2048 samples
```

---

### Audio Playback Stream (Server to Client)

| Property | Value | Notes |
|----------|-------|-------|
| **Sample Rate** | 24kHz (24000 Hz) | Higher than capture for smooth playback |
| **Buffer Size** | 7680 samples | Internal buffering |
| **Queue Check Interval** | 100ms | Checks for new audio data to schedule |
| **Schedule Ahead Time** | 200ms | Pre-buffers audio for smooth playback |
| **Initial Buffer Time** | 100ms | Startup buffer before playback begins |
| **Buffer Underrun Protection** | Yes | Prevents audio gaps and stuttering |

**Code Location:** `src/lib/audio-streamer.ts`

**Code Reference:**
```typescript
// Sample rate for playback (higher than capture)
private sampleRate: number = 24000;

// Internal buffer size
private bufferSize: number = 7680;

// Initial buffer for smooth startup
private initialBufferTime: number = 0.1;  // 100ms

// Queue check interval
const SCHEDULE_AHEAD_TIME = 0.2;  // 200ms
window.setInterval(() => {
  if (this.audioQueue.length > 0) {
    this.scheduleNextBuffer();
  }
}, 100)
```

---

### Volume Meter Updates

| Property | Value | Notes |
|----------|-------|-------|
| **Update Interval** | 25ms | UI feedback frequency |
| **Frequency** | 40 updates/second | 1000ms ÷ 25ms |
| **Purpose** | Volume level display | Not part of audio stream |
| **Data Format** | Uint8 | 0-255 range |

**Code Location:** `src/lib/worklets/vol-meter.ts`

**Code Reference:**
```typescript
this.updateIntervalInMS = 25;  // Volume meter update rate
```

---

## Video Streaming Specifications

### Video Frame Sending

| Property | Value | Notes |
|----------|-------|-------|
| **Interval** | 2000ms | Between successive frames |
| **Frame Rate** | 0.5 FPS | Highly throttled for bandwidth |
| **Resolution Scale** | 25% (0.25×) | Significant downscaling |
| **JPEG Quality** | 1.0 | Maximum quality setting |
| **Data Format** | JPEG | Base64 encoded image data |
| **MIME Type** | `image/jpeg` | Sent in WebSocket message |
| **Source** | Webcam or screen capture | Browser media APIs |
| **Trigger Mechanism** | `requestAnimationFrame` + `setTimeout` | Capture-then-throttle pattern |

**Calculation:**
```
Frame interval: 1000 ms / 0.5 FPS = 2000 ms
Resolution: Original × 0.25 = 25% of original dimensions
Example: 1920×1080 → 480×270 pixels
```

**Code Location:** `src/components/control-tray/ControlTray.tsx` (lines 140-150)

**Code Reference:**
```typescript
// Send video frame at 0.5 FPS (every 2000ms)
timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);  // 1000 / 0.5 = 2000ms

// Downscale video to 25% resolution
canvas.width = video.videoWidth * 0.25;
canvas.height = video.videoHeight * 0.25;

// Maximum JPEG quality
canvas.toDataURL("image/jpeg", 1.0)
```

### Video Sources

#### Webcam Input
- **API:** `navigator.mediaDevices.getUserMedia({ video: true })`
- **Location:** `src/hooks/use-webcam.ts`
- **Browser default FPS:** 24-30 FPS (before throttling)

#### Screen Capture Input
- **API:** `navigator.mediaDevices.getDisplayMedia({ video: true })`
- **Location:** `src/hooks/use-screen-capture.ts`
- **Browser default FPS:** 24-30 FPS (before throttling)

#### Media Stream Muxing
- **Location:** `src/hooks/use-media-stream-mux.ts`
- **Purpose:** Combine audio and video streams

---

## Comparative Summary

### Interval Comparison Table

| Component | Interval | Frequency | Sample Rate | Format | Use Case |
|-----------|----------|-----------|------------|--------|----------|
| **Audio Capture** | 128ms | 8/sec | 16kHz | PCM16 | Real-time speech |
| **Audio Playback** | 100ms (queue check) | Per queue | 24kHz | PCM16 | Smooth AI response |
| **Video Frames** | 2000ms | 0.5/sec | N/A | JPEG | Visual context |
| **Volume Meter** | 25ms | 40/sec | N/A | Uint8 | UI feedback |

---

## Key Design Decisions

### 1. Audio Prioritization
- **Reasoning:** Voice is the primary interaction modality
- **Implementation:** 8 chunks/second ensures low-latency, responsive conversation
- **Bandwidth:** ~100 kbps baseline for audio

### 2. Video Throttling
- **Reasoning:** Bandwidth constraint; video is secondary for context
- **Implementation:** 0.5 FPS (one frame every 2 seconds)
- **Downscaling:** 25% resolution maintains visual context while minimizing bandwidth
- **Bandwidth:** ~10-50 kbps for video (heavily optimized)

### 3. Asymmetric Streaming Ratio
- **Audio to Video Ratio:** 16:1
  - Audio: 8 chunks/sec
  - Video: 0.5 frames/sec
- **Total Frequency:** Audio dominates the WebSocket traffic

### 4. Playback Quality Enhancement
- **Higher Sample Rate:** 24kHz playback vs 16kHz capture
- **Buffer Ahead:** 200ms ahead scheduling prevents audio gaps
- **Queue Monitoring:** 100ms interval checks ensure consistent playback

### 5. UI Responsiveness
- **Volume Updates:** 25ms (40/sec) for smooth visual feedback
- **Not Streaming:** Volume data does not affect the audio stream to API

---

## Bandwidth Implications

### Estimated Data Rates

| Stream | Data Size Per Interval | Interval | Estimated Bandwidth |
|--------|----------------------|----------|-------------------|
| **Audio** | ~4KB per chunk | 128ms | ~250-300 kbps |
| **Video** | ~5-20KB per frame | 2000ms | ~20-80 kbps |
| **Total** | - | - | **~270-380 kbps** |

*Note: Estimates assume 16-bit stereo audio and moderate compression. Actual rates vary by content and network.*

---

## Timing Diagram

```
Audio Timeline (128ms chunks):
|-----|-----|-----|-----|-----|-----|-----|-----|
 128   256   384   512   640   768   896  1024  (ms)
 [A]   [A]   [A]   [A]   [A]   [A]   [A]   [A]   
 Chunk Chunk Chunk Chunk Chunk Chunk Chunk Chunk (8 per second)

Video Timeline (2000ms frames):
|-----|-----|-----|-----|-----|-----|-----|-----|
 0   2000  4000  6000  8000 10000 12000 14000  (ms)
                 [V]         [V]         [V]
              Frame 1     Frame 2     Frame 3  (0.5 FPS)

Combined (First 4 seconds):
  0ms:   [A1] [A2] [A3] [A4] [A5] [A6] [A7] [A8] [V1]
 500ms:                                        ...
1000ms:  [A9] [A10] ... (repeats)
2000ms:                                        [V2]
4000ms:                                        [V3]
```

---

## Configuration Sources

| Setting | File | Line(s) | Key Variable |
|---------|------|---------|--------------|
| Audio chunk size | `src/lib/worklets/audio-processing.ts` | 61-62 | `buffer = new Int16Array(2048)` |
| Audio sample rate | `src/lib/audio-recorder.ts` | - | `sampleRate = 16000` |
| Audio playback rate | `src/lib/audio-streamer.ts` | - | `sampleRate = 24000` |
| Volume meter interval | `src/lib/worklets/vol-meter.ts` | - | `updateIntervalInMS = 25` |
| Video FPS | `src/components/control-tray/ControlTray.tsx` | 140 | `1000 / 0.5` (= 2000ms) |
| Video resolution | `src/components/control-tray/ControlTray.tsx` | ~145 | `scale = 0.25` |
| JPEG quality | `src/components/control-tray/ControlTray.tsx` | ~148 | `quality = 1.0` |

---

## Recommendations for Modification

### To Increase Audio Fidelity
- Increase sample rate: 16kHz → 24kHz or 48kHz
- Increase chunk size: 2048 → 4096 samples
- **Trade-off:** Higher bandwidth usage

### To Decrease Bandwidth
- Decrease audio sample rate: 16kHz → 8kHz
- Reduce chunk frequency: Increase interval beyond 128ms
- **Trade-off:** Lower voice quality, higher latency

### To Improve Video Quality
- Increase FPS: 0.5 → 1.0 or 2.0 FPS
- Increase resolution scale: 0.25 → 0.5 or 1.0
- **Trade-off:** Significantly higher bandwidth

### To Reduce Video Bandwidth
- Decrease FPS: 0.5 → 0.25 FPS
- Further downscale: 0.25 → 0.125 resolution
- Reduce JPEG quality: 1.0 → 0.7-0.8
- **Trade-off:** Choppy or blurry video

---

## Testing & Validation

### How to Measure Intervals

1. **Inspect WebSocket Traffic:**
   - Open DevTools → Network tab → WebSocket message
   - Look for timestamp between consecutive messages
   - Audio: ~128ms between frames
   - Video: ~2000ms between frames

2. **Check Buffer Sizes:**
   - Search codebase for `2048` (audio) and `0.25` (video scale)
   - Verify constants haven't been changed

3. **Performance Monitoring:**
   - Monitor CPU usage during audio/video streaming
   - Check for buffer underruns in browser console
   - Measure actual bandwidth with network profiler

---

## Related Documentation

- **Project README:** `README.md`
- **Architecture Guide:** `explanation.md`
- **Audio Processing:** `src/lib/worklets/audio-processing.ts`
- **Video Capture:** `src/components/control-tray/ControlTray.tsx`
- **WebSocket Client:** `src/lib/genai-live-client.ts`

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-26 | Initial specification document |
