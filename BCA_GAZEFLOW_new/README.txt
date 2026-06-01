╔══════════════════════════════════════════════════════════════════╗
║         GAZEFLOW PROJECT — BCA Edition                            ║
║   Gaze Controlled PC          |  Eye Blink Mouse              ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  QUICK START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Double-click START_BACKEND.bat  (starts Flask on port 5000)
  2. Double-click START_FRONTEND.bat (starts React on port 3000)
  3. Open browser → http://localhost:3000
  4. Click ▶ START TRACKING

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EYE BLINK ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Short blink  (< 0.4s)   → Left Click
  Double blink (< 0.7s)   → Double Click  ← OPEN ICON / IMAGE / APP
  Left eye wink            → Right Click
  Close both eyes 1s       → Screenshot (SNAP)
  Close both eyes 2s       → Zoom IN  (Ctrl + +)
  Close both eyes 3s       → Zoom OUT (Ctrl + -)
  Hold 4s+                 → STOP tracking (heat off, scroll on)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EYE-CLOSE ALERT SYSTEM (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Eyes closed 5 seconds   → ⚠️  WARNING + beep (880 Hz)
                             Red overlay appears on dashboard
  Eyes closed 10 seconds  → 🚨 CRITICAL alarm + triple beep (1400 Hz)
                             Full-screen red alert overlay

  Both alerts fire ONCE per close event and reset when eyes open.
  Uses winsound.Beep (Windows system beep).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BACKGROUND OPERATION (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Eye cursor works even when VS Code (or any window) is minimised.
  Uses Windows SendInput (ctypes.windll.user32) for background
  mouse events — more reliable than pyautogui alone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  pip install -r requirements.txt

  Key packages: flask, flask-cors, opencv-python, mediapipe,
                pyautogui, scipy, numpy
  winsound is built into Python on Windows (no install needed).
