# Plan: Improve Offline YOLO Alert Richness

## Problem Statement
The current offline YOLO alerts in `server.py` are too vague. Messages like "Car on your left" lack critical information for blind users including:
- **Distance estimation** (how far away?)
- **Object counts** (how many?)
- **Movement detection** (approaching/stationary?)
- **Scene context** (multiple objects combined)

## Proposed Approach
Enhance `offline_mode/server.py` with richer, more informative alerts while maintaining real-time performance (balanced approach).

---

## Implementation Todos

### 1. Add Distance Estimation (`distance-estimation`)
**Current:** `proximity_label()` returns vague "very close", "nearby", or empty string.  
**Improved:** Add approximate distance using bounding box size relative to known object sizes.

```python
# Map typical object heights (in cm) for distance calculation
OBJECT_HEIGHTS = {
    "person": 170, "car": 150, "bicycle": 100, ...
}

def estimate_distance(label, box_height, frame_height, focal_length_px):
    """Use pinhole camera model: distance = (real_height * focal) / pixel_height"""
```

**Output:** "Car about 3 meters ahead" instead of "Car ahead"

---

### 2. Add Object Counting (`object-counting`)
**Current:** Reports only one instance per object+position key.  
**Improved:** Count same-type objects and include in alert.

```python
# Group by label only (not label+position) for counting
object_counts = Counter(d["label"] for d in seen.values())
```

**Output:** "2 people on your left" instead of "Person on your left"

---

### 3. Add Movement/Velocity Tracking (`movement-tracking`)
**Current:** `should_alert()` detects approach via area growth but doesn't expose speed.  
**Improved:** Track velocity and classify as "approaching fast", "approaching", "stationary", "moving away".

```python
class EventEngine:
    def get_velocity(self, key):
        """Return area change rate over time"""
        
    def get_movement_label(self, velocity):
        if velocity > 0.08: return "approaching fast"
        elif velocity > 0.03: return "approaching"
        elif velocity < -0.03: return "moving away"
        return ""
```

**Output:** "Car approaching fast from the right" instead of "Car on your right"

---

### 4. Build Contextual Scene Summaries (`scene-summary`)
**Current:** Single alert for highest-priority object.  
**Improved:** Combine multiple detections into coherent scene description when multiple hazards exist.

```python
def build_scene_summary(detections: list) -> str:
    """Combine multiple detections into natural summary.
    
    Examples:
    - "Busy intersection: car ahead, 2 people on left, bicycle approaching from right"
    - "Clear path with person 5m ahead"
    """
```

**Output:** Contextual awareness instead of isolated alerts

---

### 5. Enhance Alert Phrasing (`alert-phrasing`)
**Current:** Fixed template: `"{phrase} {pos_word} {prox}. {nav}"`  
**Improved:** More natural, varied phrasing with all new data points.

```python
def build_rich_alert(label, pos, distance, count, movement, priority):
    """Build natural language alert with all context.
    
    Examples:
    - "Stop! Car very close, about 2 meters ahead"
    - "2 people approaching on your left, 4 meters away"  
    - "Bicycle moving away to your right"
    """
```

---

### 6. Update Detection Response Schema (`update-response`)
**Current:** Returns `{detections, alert_message}` with basic fields.  
**Improved:** Include richer metadata for UI consumption.

```python
detections.append({
    "label": ...,
    "position": ...,
    "distance_m": 3.2,        # NEW
    "distance_label": "about 3 meters",  # NEW
    "movement": "approaching",  # NEW
    "count": 2,               # NEW (for grouped alerts)
    "priority": ...,
})
```

---

## Dependencies
```
distance-estimation  → (none)
object-counting      → (none)
movement-tracking    → (none)
scene-summary        → object-counting, movement-tracking, distance-estimation
alert-phrasing       → distance-estimation, movement-tracking, object-counting
update-response      → all above
```

---

## Performance Considerations
- **Distance estimation:** ~0ms (simple math on existing bbox data)
- **Object counting:** ~0ms (Counter on existing list)
- **Movement tracking:** ~0ms (extend existing EventEngine state)
- **Scene summary:** ~1ms (string building)
- **Total overhead:** < 5ms per frame (negligible vs YOLO inference ~50-100ms)

---

## Testing Plan
1. Test distance estimation with known object sizes at measured distances
2. Verify counting accuracy with multiple same-type objects
3. Test movement labels by moving objects toward/away from camera
4. Validate scene summaries combine correctly
5. Ensure no performance regression (measure frame processing time)

---

## Files to Modify
| File | Changes |
|------|---------|
| `offline_mode/server.py` | All detection logic enhancements |
| `src/hooks/use-offline-detection.ts` | Update `Detection` interface for new fields |
