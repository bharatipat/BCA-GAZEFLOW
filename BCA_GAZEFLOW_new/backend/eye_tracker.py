# ╔══════════════════════════════════════════════════════════════╗
# ║  MODULE 3 — EYE TRACKER | GazeFlow Project BCA Edition        ║
# ║  Gaze | EAR Blink | Double Blink | Left/Right Eye Click     ║
# ║  Eye-Close Actions:                                         ║
# ║   <0.4s  → Left Click (blink)                              ║
# ║   1s     → Screenshot + beep + "Screenshot taken"          ║
# ║   2s     → Zoom IN   + beep + "Zoom in"                    ║
# ║   3s     → Zoom OUT  + beep + "Zoom out"                   ║
# ║   7s     → WARNING alarm + voice rest guidance             ║
# ║   10s    → CRITICAL alarm + urgent wake-up voice           ║
# ╚══════════════════════════════════════════════════════════════╝
import numpy as np, time
from scipy.spatial import distance as dist

LEFT_IRIS  = 468
RIGHT_IRIS = 473
L_EAR  = [33, 160, 158, 133, 153, 144]
R_EAR  = [362, 385, 387, 263, 373, 380]

EAR_THRESHOLD = 0.21   # below = eye closed
ALPHA         = 0.15   # EWMA smoothing

# ── Blink hold thresholds (seconds) ──────────────────────────
SHORT_BLINK    = 0.4   # < 0.4s       → single left click
SNAP_BLINK     = 1.0   # 1s hold      → screenshot (SNAP)
ZOOM_IN_BLINK  = 2.0   # 2s hold      → zoom in
ZOOM_OUT_BLINK = 3.0   # 3s hold      → zoom out
ONE_EYE_MOUSE_HOLD = 5.0  # one-eye hold -> mouse button

DROWSY_DUR     = 2.0   # 2s+          → drowsy alert
ALERT_7S       = 7.0   # 7s hold      → WARNING alert
ALERT_10S      = 10.0  # 10s hold     → CRITICAL alert

# Double-blink: two short blinks within this window (tightened for reliability)
DOUBLE_BLINK_WINDOW = 0.7   # seconds between blink ends

# Left-only blink → right-click gesture
EYE_ONLY_RATIO = 0.6

class EyeTracker:
    def __init__(self):
        print("👁️  Eye Tracker BCA v4.0 ready!")
        print(f"   Blink  (<{SHORT_BLINK}s)              → Left Click")
        print(f"   Double blink (<{DOUBLE_BLINK_WINDOW}s gap)   → Double Click")
        print(f"   Left eye wink                  → Right Click")
        print(f"   Hold {SNAP_BLINK}s                   → 📸 Screenshot + beep + voice")
        print(f"   Hold {ZOOM_IN_BLINK}s                   → 🔍 Zoom IN   + beep + voice")
        print(f"   Hold {ZOOM_OUT_BLINK}s                   → 🔍 Zoom OUT  + beep + voice")
        print(f"   Left eye hold {ONE_EYE_MOUSE_HOLD}s            → Left Mouse Button")
        print(f"   Right eye hold {ONE_EYE_MOUSE_HOLD}s           → Right Mouse Button")
        print(f"   Close eyes {ALERT_7S}s              → ⚠️  WARNING alarm + voice rest guide")
        print(f"   Close eyes {ALERT_10S}s             → 🚨 CRITICAL alarm + urgent wake-up voice")
        self.prev_x = self.prev_y = 0.5
        self.blink_counter   = 0
        self.total_blinks    = 0
        self.close_start     = None
        self._lat            = 0.0
        self._last_blink_t   = 0.0
        self._pending_click  = False
        self._pending_t      = 0.0
        self.last_action     = None
        self.drowsy_count    = 0
        self.zoom_level      = 1
        self.left_only_start = None
        self.right_only_start = None
        self._left_mouse_fired = False
        self._right_mouse_fired = False
        # Per-close-event alert flags (reset when eyes open)
        self._alerted_7  = False
        self._alerted_10 = False

    def _ear(self, lm, idx, w, h):
        pts = [(lm.landmark[i].x * w, lm.landmark[i].y * h) for i in idx]
        A = dist.euclidean(pts[1], pts[5])
        B = dist.euclidean(pts[2], pts[4])
        C = dist.euclidean(pts[0], pts[3])
        return (A + B) / (2.0 * C)

    def get_gaze(self, landmarks, fw, fh):
        iris = landmarks.landmark[LEFT_IRIS]
        sx = self.prev_x + ALPHA * (iris.x * fw - self.prev_x)
        sy = self.prev_y + ALPHA * (iris.y * fh - self.prev_y)
        self.prev_x, self.prev_y = sx, sy
        return int(sx), int(sy)

    def get_gaze_normalized(self, landmarks):
        iris = landmarks.landmark[LEFT_IRIS]
        return round(iris.x, 4), round(iris.y, 4)

    def get_ear_values(self, landmarks, fw, fh):
        le = self._ear(landmarks, L_EAR, fw, fh)
        re = self._ear(landmarks, R_EAR, fw, fh)
        return round(le, 3), round(re, 3)

    def get_ear_pct(self, landmarks, fw, fh):
        le, re = self.get_ear_values(landmarks, fw, fh)
        return round((le / 0.45) * 100, 1), round((re / 0.45) * 100, 1)

    def process_blink(self, landmarks, fw, fh):
        """
        Returns dict with blink actions:
          blink        → single left click
          double_blink → double click (open icon / image / desktop app)
          right_click  → left-eye-only wink
          left_mouse_5s  -> left-eye-only hold for mouse left button
          right_mouse_5s -> right-eye-only hold for mouse right button
          screenshot   → 1s hold
          zoom_in/out  → 2s / 3s hold
          drowsy       → eyes closed 2s+
          alert_7s     → eyes closed 7s  (WARNING)
          alert_10s    → eyes closed 10s (CRITICAL)
          closed, close_dur, close_pct
        """
        le, re = self.get_ear_values(landmarks, fw, fh)
        avg    = (le + re) / 2.0
        now    = time.time()

        result = {
            "blink":          False,
            "double_blink":   False,
            "right_click":    False,
            "left_mouse_5s":   False,
            "right_mouse_5s":  False,
            "screenshot":     False,
            "zoom_in":        False,
            "zoom_out":       False,
            "drowsy":         False,
            "alert_7s":       False,
            "alert_10s":      False,
            "closed":         False,
            "both_closed":    False,
            "close_dur":      0.0,
            "close_pct":      0.0,
        }

        left_closed  = le < EAR_THRESHOLD
        right_closed = re < EAR_THRESHOLD
        both_closed  = left_closed and right_closed
        left_only    = left_closed and not right_closed
        right_only   = right_closed and not left_closed

        if left_only:
            if self.left_only_start is None:
                self.left_only_start = now
                self._left_mouse_fired = False
            if now - self.left_only_start >= ONE_EYE_MOUSE_HOLD and not self._left_mouse_fired:
                result["left_mouse_5s"] = True
                self._left_mouse_fired = True
        else:
            self.left_only_start = None
            self._left_mouse_fired = False

        if right_only:
            if self.right_only_start is None:
                self.right_only_start = now
                self._right_mouse_fired = False
            if now - self.right_only_start >= ONE_EYE_MOUSE_HOLD and not self._right_mouse_fired:
                result["right_mouse_5s"] = True
                self._right_mouse_fired = True
        else:
            self.right_only_start = None
            self._right_mouse_fired = False

        # ── Eye closed ────────────────────────────────────────────────
        if both_closed:
            if self.close_start is None:
                self.close_start = now
                # Reset per-event flags on new close event
                self._alerted_7  = False
                self._alerted_10 = False
            dur = now - self.close_start
            result["closed"]    = True
            result["both_closed"] = True
            result["close_dur"] = round(dur, 2)
            result["close_pct"] = round(min(100.0, (dur / ZOOM_OUT_BLINK) * 100), 1)

            if dur >= DROWSY_DUR:
                result["drowsy"] = True
                self.drowsy_count += 1

            # 7s alert — fires exactly once per close event
            if dur >= ALERT_7S and not self._alerted_7:
                result["alert_7s"]  = True
                self._alerted_7     = True

            # 10s alert — fires exactly once per close event
            if dur >= ALERT_10S and not self._alerted_10:
                result["alert_10s"] = True
                self._alerted_10    = True

        else:
            # ── Eye just opened ───────────────────────────────────────
            if self.close_start is not None:
                dur    = now - self.close_start
                action = None

                if dur < SHORT_BLINK and (now - self._lat) > 0.3:
                    # Left-eye-only wink → RIGHT CLICK
                    if left_only and not right_closed:
                        result["right_click"] = True
                        action = "right_click"
                        self._lat = now

                    else:
                        # Double-blink detection
                        gap = now - self._last_blink_t
                        if self._last_blink_t > 0 and gap < DOUBLE_BLINK_WINDOW:
                            result["double_blink"] = True
                            action = "double_click"
                            self._last_blink_t = 0.0
                        else:
                            result["blink"]        = True
                            self._last_blink_t     = now
                            action = "click"

                        self.total_blinks += 1
                        self._lat = now

                elif SNAP_BLINK <= dur < ZOOM_IN_BLINK:
                    result["screenshot"] = True
                    action = "screenshot"

                elif ZOOM_IN_BLINK <= dur < ZOOM_OUT_BLINK:
                    result["zoom_in"] = True
                    self.zoom_level   = 2
                    action = "zoom_in"

                elif ZOOM_OUT_BLINK <= dur < ALERT_7S:
                    result["zoom_out"] = True
                    self.zoom_level    = 1
                    action = "zoom_out"

                self.close_start    = None
                self._alerted_7     = False
                self._alerted_10    = False
                if action:
                    self.last_action = action
                    if action not in ("click",):
                        self._lat = now

        return result
