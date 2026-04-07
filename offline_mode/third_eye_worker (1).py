"""
FILE: Thirdeye/third_eye_worker.py
(save in root of project, next to package.json)

Lightweight YOLO detection worker.
React app sends frames here → returns detections as JSON.
Voice alerts are spoken by Gemini through the React app.

Install:
  pip install fastapi uvicorn opencv-python ultralytics pywin32

Run (one terminal, keep it open while React runs):
  python third_eye_worker.py

React connects automatically at http://localhost:8765
"""

import cv2
import time
import base64
import numpy as np
import threading
import queue
import pythoncom
import win32com.client
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import uvicorn

# ──────────────────────────────────────────────────────────────
#  CONFIG
# ──────────────────────────────────────────────────────────────

YOLO_MODEL         = "yolov8m.pt"
CONFIDENCE         = 0.32
APPROACH_THRESHOLD = 0.04
REAPPEAR_FRAMES    = 20

COOLDOWN = {
    "danger":  2,
    "warning": 4,
    "normal":  8,
}

# ──────────────────────────────────────────────────────────────
#  ALLOWLIST — only these objects ever produce alerts
# ──────────────────────────────────────────────────────────────

OBJECTS = {
    "car":           ("danger",  "Car"),
    "truck":         ("danger",  "Truck"),
    "bus":           ("danger",  "Bus"),
    "motorcycle":    ("danger",  "Motorcycle"),
    "bicycle":       ("warning", "Bicycle"),
    "train":         ("danger",  "Train"),
    "person":        ("warning", "Person"),
    "chair":         ("normal",  "Chair"),
    "couch":         ("normal",  "Sofa"),
    "bed":           ("normal",  "Bed"),
    "dining table":  ("normal",  "Table"),
    "door":          ("normal",  "Door"),
    "stairs":        ("warning", "Stairs"),
    "bench":         ("normal",  "Bench"),
    "cell phone":    ("normal",  "Phone"),
    "laptop":        ("normal",  "Laptop"),
    "bottle":        ("normal",  "Bottle"),
    "cup":           ("normal",  "Cup"),
    "backpack":      ("normal",  "Backpack"),
    "knife":         ("warning", "Knife"),
    "scissors":      ("warning", "Scissors"),
    "traffic light": ("warning", "Traffic light"),
    "stop sign":     ("warning", "Stop sign"),
    "potted plant":  ("normal",  "Plant"),
    "book":          ("normal",  "Book"),
    "umbrella":      ("normal",  "Umbrella"),
    "refrigerator":  ("normal",  "Fridge"),
    "sink":          ("normal",  "Sink"),
    "tv":            ("normal",  "TV"),
    "handbag":       ("normal",  "Bag"),
    "suitcase":      ("normal",  "Suitcase"),
}

# ──────────────────────────────────────────────────────────────
#  HELPERS
# ──────────────────────────────────────────────────────────────

def get_position(cx: int, fw: int) -> str:
    r = cx / fw
    if r < 0.35:   return "left"
    elif r > 0.65: return "right"
    return "center"

def position_spoken(pos: str) -> str:
    return {"left": "on your left", "right": "on your right", "center": "ahead"}[pos]

def proximity_label(box_area: int, frame_area: int) -> str:
    r = box_area / frame_area
    if r > 0.28:   return "very close"
    elif r > 0.10: return "nearby"
    return ""

def navigation_instruction(pos: str, priority: str) -> str:
    if pos == "center":
        return "Stop! Move to the side" if priority == "danger" else "Obstacle ahead. Step aside"
    elif pos == "left":  return "Move right to avoid"
    elif pos == "right": return "Move left to avoid"
    return ""

def build_alert(label: str, pos: str, prox: str, priority: str) -> str:
    phrase   = OBJECTS[label][1]
    pos_word = position_spoken(pos)
    nav      = navigation_instruction(pos, priority)
    if prox == "very close":
        base = f"{phrase} very close {pos_word}"
    elif prox == "nearby":
        base = f"{phrase} {pos_word} nearby"
    else:
        base = f"{phrase} {pos_word}"
    return f"{base}. {nav}" if nav else base


# ──────────────────────────────────────────────────────────────
#  SMART EVENT ENGINE — only alerts on new/approaching objects
# ──────────────────────────────────────────────────────────────

class EventEngine:
    def __init__(self):
        self._state: dict = {}

    def should_alert(self, key: str, current_area: int,
                     frame_area: int, priority: str) -> bool:
        now   = time.time()
        state = self._state.get(key)

        if state is None:
            self._state[key] = {
                "area": current_area, "absent": 0,
                "last_alert": now,
            }
            return True

        state["absent"] = 0
        if now - state["last_alert"] < COOLDOWN[priority]:
            state["area"] = current_area
            return False

        growth = (current_area - state["area"]) / frame_area
        alert  = growth > APPROACH_THRESHOLD
        state["area"] = current_area
        if alert:
            state["last_alert"] = now
        return alert

    def mark_absent(self, key: str):
        if key in self._state:
            self._state[key]["absent"] += 1
            if self._state[key]["absent"] > REAPPEAR_FRAMES:
                del self._state[key]

    def get_absent_keys(self, seen_keys: set) -> list:
        return [k for k in list(self._state.keys()) if k not in seen_keys]


# ──────────────────────────────────────────────────────────────
#  INSTANT WINDOWS VOICE (SAPI)
#  Speaks dangerous alerts locally AND returns them to React
#  so Gemini also narrates them
# ──────────────────────────────────────────────────────────────

class Speaker:
    def __init__(self):
        self._q      = queue.Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        pythoncom.CoInitialize()
        sapi = win32com.client.Dispatch("SAPI.SpVoice")
        sapi.Rate   = 2
        sapi.Volume = 100
        SVSFlagsAsync = 1

        while True:
            item = self._q.get()
            if item is None:
                break
            text, urgent = item
            try:
                if urgent:
                    sapi.SpeakAsyncCancelAll()
                sapi.Speak(text, SVSFlagsAsync)
                while sapi.Status.RunningState == 2:
                    time.sleep(0.05)
            except Exception as e:
                print(f"[Voice error] {e}")

        pythoncom.CoUninitialize()

    def say(self, text: str, priority: str = "normal"):
        print(f"  🔊  {text}")
        urgent = priority == "danger"
        if urgent:
            while not self._q.empty():
                try: self._q.get_nowait()
                except queue.Empty: break
        self._q.put((text, urgent))


# ──────────────────────────────────────────────────────────────
#  GLOBAL STATE
# ──────────────────────────────────────────────────────────────

print("[Boot] Loading YOLO model — please wait...")
yolo_model   = YOLO(YOLO_MODEL)
event_engine = EventEngine()
speaker      = Speaker()
print(f"[Boot] YOLO ready: {YOLO_MODEL}")


# ──────────────────────────────────────────────────────────────
#  FASTAPI APP
# ──────────────────────────────────────────────────────────────

app = FastAPI(title="Third Eye YOLO Worker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class FrameRequest(BaseModel):
    frame: str   # base64 JPEG from React ControlTray


@app.post("/detect")
def detect(req: FrameRequest):
    """
    Receives a base64 JPEG frame from React.
    Returns detected objects + alert message.
    React injects these into the Gemini prompt.
    """
    try:
        img_bytes = base64.b64decode(req.frame)
        arr       = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"detections": [], "alert_message": ""}

        fh, fw     = frame.shape[:2]
        frame_area = fh * fw

        results = yolo_model(frame, conf=CONFIDENCE, verbose=False)

        seen         : dict = {}
        alert_message: str  = ""
        detections   : list = []

        for result in results:
            for box in result.boxes:
                label = yolo_model.names[int(box.cls[0])]
                if label not in OBJECTS:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx       = (x1 + x2) // 2
                box_area = (x2 - x1) * (y2 - y1)
                priority, _ = OBJECTS[label]
                pos  = get_position(cx, fw)
                prox = proximity_label(box_area, frame_area)
                key  = f"{label}_{pos}"

                if key not in seen or box_area > seen[key]["box_area"]:
                    seen[key] = {
                        "label": label, "priority": priority,
                        "pos": pos, "prox": prox,
                        "box_area": box_area,
                    }

        seen_keys = set(seen.keys())

        for key, d in seen.items():
            should = event_engine.should_alert(
                key, d["box_area"], frame_area, d["priority"]
            )
            nav = navigation_instruction(d["pos"], d["priority"])

            # Always add to detections list for Gemini context
            detections.append({
                "label":     OBJECTS[d["label"]][1],
                "position":  d["pos"],
                "proximity": d["prox"],
                "priority":  d["priority"],
                "navigate":  nav,
            })

            # Only build alert message for new/approaching objects
            if should:
                msg = build_alert(d["label"], d["pos"], d["prox"], d["priority"])
                # Danger alerts → speak locally immediately (instant)
                if d["priority"] == "danger":
                    speaker.say(msg, priority="danger")
                alert_message = msg   # last alert sent to React/Gemini

        # Mark absent objects
        for k in event_engine.get_absent_keys(seen_keys):
            event_engine.mark_absent(k)

        return {
            "detections":    detections,
            "alert_message": alert_message,
        }

    except Exception as e:
        print(f"[Detect error] {e}")
        return {"detections": [], "alert_message": ""}


@app.get("/health")
def health():
    return {"status": "ok", "model": YOLO_MODEL}


# ──────────────────────────────────────────────────────────────
#  ENTRY POINT
# ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  Third Eye YOLO Worker")
    print("  Listening at http://localhost:8765")
    print("  React will connect automatically")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="warning")
    