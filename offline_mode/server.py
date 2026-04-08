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
from collections import Counter
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
#  OBJECT HEIGHTS (cm) — for distance estimation via pinhole model
#  Using average real-world heights for common objects
# ──────────────────────────────────────────────────────────────

OBJECT_HEIGHTS_CM = {
    "person":        170,
    "car":           150,
    "truck":         250,
    "bus":           300,
    "motorcycle":    110,
    "bicycle":       100,
    "train":         400,
    "chair":          90,
    "couch":          85,
    "bed":            60,
    "dining table":   75,
    "door":          200,
    "stairs":        100,
    "bench":          45,
    "cell phone":     15,
    "laptop":         25,
    "bottle":         25,
    "cup":            12,
    "backpack":       50,
    "knife":          30,
    "scissors":       20,
    "traffic light": 120,
    "stop sign":      75,
    "potted plant":   50,
    "book":           25,
    "umbrella":       90,
    "refrigerator":  170,
    "sink":           40,
    "tv":             60,
    "handbag":        30,
    "suitcase":       70,
}

# Assumed camera focal length in pixels (calibrated for typical webcam ~640px wide)
# This can be adjusted based on actual camera specs
FOCAL_LENGTH_PX = 600

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

def estimate_distance(label: str, box_height: int, frame_height: int) -> tuple[float, str]:
    """
    Estimate distance using pinhole camera model.
    Returns (distance_meters, human_readable_label).
    """
    real_height_cm = OBJECT_HEIGHTS_CM.get(label, 100)  # default 100cm
    if box_height <= 0:
        return (10.0, "far away")
    
    # Pinhole model: distance = (real_height * focal_length) / pixel_height
    # Scale factor accounts for frame scaling (camera sends 25% resolution)
    scale_factor = 4  # Since we receive 25% resolution frames
    actual_box_height = box_height * scale_factor
    distance_cm = (real_height_cm * FOCAL_LENGTH_PX) / actual_box_height
    distance_m = distance_cm / 100.0
    
    # Clamp to reasonable range
    distance_m = max(0.5, min(distance_m, 20.0))
    
    # Human-readable label
    if distance_m < 1.0:
        label_str = "less than 1 meter"
    elif distance_m < 2.0:
        label_str = "about 1 meter"
    elif distance_m < 3.0:
        label_str = "about 2 meters"
    elif distance_m < 5.0:
        label_str = f"about {int(round(distance_m))} meters"
    elif distance_m < 10.0:
        label_str = f"about {int(round(distance_m))} meters"
    else:
        label_str = "far away"
    
    return (round(distance_m, 1), label_str)

def proximity_label(box_area: int, frame_area: int) -> str:
    """Legacy proximity label for backward compatibility."""
    r = box_area / frame_area
    if r > 0.28:   return "very close"
    elif r > 0.10: return "nearby"
    return ""

def navigation_instruction(pos: str, priority: str, distance_m: float = None) -> str:
    """Generate navigation instruction based on position, priority, and distance."""
    # More urgent instructions for very close objects
    if distance_m and distance_m < 2.0:
        if pos == "center":
            return "Stop! Move to the side immediately" if priority == "danger" else "Obstacle very close. Step aside now"
        elif pos == "left":
            return "Move right now"
        elif pos == "right":
            return "Move left now"
    
    if pos == "center":
        return "Stop! Move to the side" if priority == "danger" else "Obstacle ahead. Step aside"
    elif pos == "left":  return "Move right to avoid"
    elif pos == "right": return "Move left to avoid"
    return ""

def build_alert(label: str, pos: str, prox: str, priority: str) -> str:
    """Legacy alert builder for backward compatibility."""
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

def pluralize(label: str, count: int) -> str:
    """Return pluralized form of object label."""
    if count == 1:
        return label
    # Handle irregular plurals
    irregulars = {
        "Person": "People",
        "Knife": "Knives",
    }
    if label in irregulars:
        return irregulars[label]
    # Standard pluralization
    if label.endswith("s") or label.endswith("x") or label.endswith("ch"):
        return label + "es"
    return label + "s"

def build_rich_alert(
    label: str,
    pos: str,
    distance_m: float,
    distance_label: str,
    count: int,
    movement: str,
    priority: str
) -> str:
    """
    Build a rich, natural-language alert with all context.
    
    Examples:   
    - "Stop! Car very close, less than 1 meter ahead"
    - "2 People approaching on your left, about 3 meters away"
    - "Bicycle moving away to your right"
    """
    phrase = OBJECTS[label][1]
    pos_word = position_spoken(pos)
    
    # Handle count
    if count > 1:
        phrase = f"{count} {pluralize(phrase, count)}"
    
    # Build base description
    parts = []
    
    # Movement prefix for approaching objects
    if movement == "approaching fast":
        parts.append(f"{phrase} approaching fast")
    elif movement == "approaching":
        parts.append(f"{phrase} approaching")
    elif movement == "moving away":
        parts.append(f"{phrase} moving away")
    else:
        parts.append(phrase)
    
    # Position
    parts.append(pos_word)
    
    # Distance (only add if informative)
    if distance_label and distance_label != "far away":
        parts.append(f", {distance_label} away")
    
    base = " ".join(parts[:2]) + (parts[2] if len(parts) > 2 else "")
    
    # Navigation instruction for danger/warning
    nav = navigation_instruction(pos, priority, distance_m)
    
    # Prepend urgent warning for danger objects that are close
    if priority == "danger" and distance_m < 3.0:
        if pos == "center":
            return f"Stop! {base}. {nav}"
        return f"Warning! {base}. {nav}"
    
    return f"{base}. {nav}" if nav else base

def build_scene_summary(detections: list) -> str:
    """
    Build a contextual scene summary when multiple objects are detected.
    
    Examples:
    - "Busy area: Car ahead, 2 People on left, Bicycle approaching from right"
    - "Clear path with Person about 5 meters ahead"
    """
    if not detections:
        return ""
    
    if len(detections) == 1:
        d = detections[0]
        return build_rich_alert(
            d["raw_label"], d["position"], d["distance_m"],
            d["distance_label"], d.get("count", 1),
            d.get("movement", ""), d["priority"]
        )
    
    # Group by priority for ordering
    danger = [d for d in detections if d["priority"] == "danger"]
    warning = [d for d in detections if d["priority"] == "warning"]
    normal = [d for d in detections if d["priority"] == "normal"]
    
    # Build summary parts
    parts = []
    
    # Process danger items first (most urgent)
    for d in danger:
        movement = d.get("movement", "")
        move_str = f" {movement}" if movement else ""
        dist_str = f", {d['distance_label']}" if d['distance_label'] != "far away" else ""
        parts.append(f"{d['label']}{move_str} {position_spoken(d['position'])}{dist_str}")
    
    # Then warnings
    for d in warning[:2]:  # Limit to 2 warnings to keep summary short
        movement = d.get("movement", "")
        move_str = f" {movement}" if movement else ""
        parts.append(f"{d['label']}{move_str} {position_spoken(d['position'])}")
    
    # Normal items only if no danger/warning
    if not danger and not warning:
        for d in normal[:2]:
            parts.append(f"{d['label']} {position_spoken(d['position'])}")
    
    if not parts:
        return ""
    
    # Prefix based on scene complexity
    if len(detections) >= 4:
        prefix = "Busy area: "
    elif danger:
        prefix = "Caution: "
    else:
        prefix = ""
    
    return prefix + ", ".join(parts)


# ──────────────────────────────────────────────────────────────
#  SMART EVENT ENGINE — tracks objects, velocity, and alert timing
# ──────────────────────────────────────────────────────────────

# Velocity thresholds for movement classification (area growth rate per second)
VELOCITY_FAST_APPROACH = 0.08    # Rapidly getting closer
VELOCITY_APPROACH = 0.02        # Getting closer
VELOCITY_MOVING_AWAY = -0.02    # Moving away

class EventEngine:
    def __init__(self):
        self._state: dict = {}

    def update_and_check_alert(self, key: str, current_area: int,
                               frame_area: int, priority: str) -> tuple[bool, str]:
        """
        Update state and check if alert should trigger.
        Returns (should_alert, movement_label).
        Movement labels: "approaching fast", "approaching", "moving away", ""
        """
        now = time.time()
        state = self._state.get(key)

        if state is None:
            # New object - initialize state
            self._state[key] = {
                "area": current_area,
                "prev_area": current_area,
                "absent": 0,
                "last_alert": now,
                "last_update": now,
                "velocity": 0.0,  # Area change rate per second
            }
            return (True, "")  # New object always triggers alert, no movement yet

        state["absent"] = 0
        dt = now - state["last_update"]
        
        # Calculate velocity (area change rate)
        if dt > 0.1:  # Only update velocity if enough time passed
            area_change = (current_area - state["prev_area"]) / frame_area
            # Smooth velocity with exponential moving average
            instant_velocity = area_change / dt if dt > 0 else 0
            state["velocity"] = 0.7 * state["velocity"] + 0.3 * instant_velocity
            state["prev_area"] = state["area"]
            state["last_update"] = now
        
        state["area"] = current_area
        
        # Determine movement label
        velocity = state["velocity"]
        if velocity > VELOCITY_FAST_APPROACH:
            movement = "approaching fast"
        elif velocity > VELOCITY_APPROACH:
            movement = "approaching"
        elif velocity < VELOCITY_MOVING_AWAY:
            movement = "moving away"
        else:
            movement = ""
        
        # Check cooldown
        if now - state["last_alert"] < COOLDOWN[priority]:
            return (False, movement)
        
        # Alert if approaching significantly
        growth = (current_area - state.get("alert_area", current_area)) / frame_area
        should_alert = growth > APPROACH_THRESHOLD or velocity > VELOCITY_FAST_APPROACH
        
        if should_alert:
            state["last_alert"] = now
            state["alert_area"] = current_area
        
        return (should_alert, movement)
    
    def get_movement(self, key: str) -> str:
        """Get the current movement label for an object."""
        state = self._state.get(key)
        if not state:
            return ""
        velocity = state.get("velocity", 0)
        if velocity > VELOCITY_FAST_APPROACH:
            return "approaching fast"
        elif velocity > VELOCITY_APPROACH:
            return "approaching"
        elif velocity < VELOCITY_MOVING_AWAY:
            return "moving away"
        return ""

    def should_alert(self, key: str, current_area: int,
                     frame_area: int, priority: str) -> bool:
        """Legacy method for backward compatibility."""
        should, _ = self.update_and_check_alert(key, current_area, frame_area, priority)
        return should

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
    Returns detected objects with rich metadata + contextual alert message.
    
    Enhanced features:
    - Distance estimation (meters)
    - Object counting (grouped by type)
    - Movement tracking (approaching/moving away)
    - Scene summaries (multiple objects combined)
    """
    try:
        img_bytes = base64.b64decode(req.frame)
        arr       = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"detections": [], "alert_message": "", "scene_summary": ""}

        fh, fw     = frame.shape[:2]
        frame_area = fh * fw

        results = yolo_model(frame, conf=CONFIDENCE, verbose=False)

        # First pass: collect all detections with metadata
        raw_detections: list = []
        
        for result in results:
            for box in result.boxes:
                label = yolo_model.names[int(box.cls[0])]
                if label not in OBJECTS:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cx = (x1 + x2) // 2
                box_height = y2 - y1
                box_area = (x2 - x1) * box_height
                priority, display_name = OBJECTS[label]
                pos = get_position(cx, fw)
                prox = proximity_label(box_area, frame_area)
                
                # Estimate distance
                distance_m, distance_label = estimate_distance(label, box_height, fh)
                
                raw_detections.append({
                    "raw_label": label,
                    "label": display_name,
                    "priority": priority,
                    "pos": pos,
                    "prox": prox,
                    "box_area": box_area,
                    "box_height": box_height,
                    "distance_m": distance_m,
                    "distance_label": distance_label,
                })

        # Second pass: group by label+position, keep largest box per group
        seen: dict = {}
        for d in raw_detections:
            key = f"{d['raw_label']}_{d['pos']}"
            if key not in seen or d["box_area"] > seen[key]["box_area"]:
                seen[key] = {**d, "key": key}

        # Count objects by type (for "2 people" style alerts)
        label_counts = Counter(d["raw_label"] for d in raw_detections)
        
        seen_keys = set(seen.keys())
        detections: list = []
        alert_parts: list = []
        highest_priority_alert: str = ""
        highest_priority_level: int = 3  # 1=danger, 2=warning, 3=normal
        
        priority_rank = {"danger": 1, "warning": 2, "normal": 3}

        for key, d in seen.items():
            # Update tracking and get movement info
            should_alert, movement = event_engine.update_and_check_alert(
                key, d["box_area"], frame_area, d["priority"]
            )
            
            # Get count for this object type
            count = label_counts.get(d["raw_label"], 1)
            
            # Navigation instruction with distance awareness
            nav = navigation_instruction(d["pos"], d["priority"], d["distance_m"])

            # Build rich detection object
            detection = {
                "label":          d["label"],
                "raw_label":      d["raw_label"],
                "position":       d["pos"],
                "proximity":      d["prox"],
                "priority":       d["priority"],
                "navigate":       nav,
                "distance_m":     d["distance_m"],
                "distance_label": d["distance_label"],
                "movement":       movement,
                "count":          count if count > 1 else 1,
            }
            detections.append(detection)

            # Build alert for new/approaching objects
            if should_alert:
                msg = build_rich_alert(
                    d["raw_label"], d["pos"], d["distance_m"],
                    d["distance_label"], count, movement, d["priority"]
                )
                alert_parts.append({
                    "msg": msg,
                    "priority": d["priority"],
                    "distance": d["distance_m"],
                })
                
                # Track highest priority alert for immediate speech
                rank = priority_rank[d["priority"]]
                if rank < highest_priority_level or (rank == highest_priority_level and d["distance_m"] < 3.0):
                    highest_priority_level = rank
                    highest_priority_alert = msg

        # Mark absent objects
        for k in event_engine.get_absent_keys(seen_keys):
            event_engine.mark_absent(k)

        # Build scene summary when multiple objects detected
        scene_summary = build_scene_summary(detections) if len(detections) > 1 else ""

        # Determine final alert message
        if highest_priority_alert:
            alert_message = highest_priority_alert
            # Speak danger alerts immediately (locally)
            if highest_priority_level == 1:  # danger
                speaker.say(alert_message, priority="danger")
            elif highest_priority_level == 2 and len(alert_parts) > 0:  # warning with close distance
                closest = min(alert_parts, key=lambda x: x["distance"])
                if closest["distance"] < 2.0:
                    speaker.say(closest["msg"], priority="warning")
        elif scene_summary and len(detections) >= 3:
            # Use scene summary for complex scenes without urgent alerts
            alert_message = scene_summary
        else:
            alert_message = ""

        return {
            "detections":    detections,
            "alert_message": alert_message,
            "scene_summary": scene_summary,
            "object_count":  len(raw_detections),
        }

    except Exception as e:
        print(f"[Detect error] {e}")
        return {"detections": [], "alert_message": "", "scene_summary": ""}


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
    