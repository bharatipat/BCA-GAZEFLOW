# ╔══════════════════════════════════════════════════════════════════╗
# ║  GAZEFLOW PROJECT — MAIN FLASK SERVER  (Port 5000)               ║
# ║  Modules: Camera | Face | Eye | Cursor | Screenshot            ║
# ║  Features: Gaze Heatmap | Cursor Speed Control                 ║
# ╚══════════════════════════════════════════════════════════════════╝

import cv2, threading, time, os, subprocess, webbrowser, sqlite3, json
from flask import Flask, Response, jsonify, request, send_file
from flask_cors import CORS
from datetime import datetime
from voice_assistant import VoiceAssistant

try:
    import pyautogui as _voice_keys
    _voice_keys.FAILSAFE = False
    _voice_keys.PAUSE = 0
    VOICE_KEYS_AVAILABLE = True
except Exception as _voice_keys_error:
    _voice_keys = None
    VOICE_KEYS_AVAILABLE = False
    print(f"⚠️  Voice keyboard control unavailable: {_voice_keys_error}")

# ── Beep / Sound alert (Windows) ──────────────────────────────────
import struct, math, io, sys
try:
    import winsound as _winsound
    BEEP_AVAILABLE = True
    print("🔔 winsound ready")
except ImportError:
    _winsound = None
    BEEP_AVAILABLE = False
    print("⚠️  winsound unavailable — using bell fallback")

def _make_wav(freq, dur_ms, volume=0.85):
    """Generate a pure-sine WAV as bytes for instant playback."""
    sample_rate = 44100
    n_samples   = int(sample_rate * dur_ms / 1000)
    buf = bytearray()
    for i in range(n_samples):
        # sine wave with fade-in/out to avoid clicks
        fade = min(i, n_samples - i, sample_rate // 100)
        amp  = volume * min(1.0, fade / (sample_rate // 100))
        val  = int(amp * 32767 * math.sin(2 * math.pi * freq * i / sample_rate))
        buf += struct.pack('<h', max(-32768, min(32767, val)))
    # WAV header
    data_size = len(buf)
    hdr = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
        b'data', data_size)
    return bytes(hdr) + bytes(buf)

def beep(freq=880, dur=400):
    """Play a tone non-blocking. Uses WAV bytes for reliability."""
    def _b():
        try:
            if BEEP_AVAILABLE:
                wav = _make_wav(int(freq), int(dur))
                _winsound.PlaySound(wav,
                    _winsound.SND_MEMORY | _winsound.SND_ASYNC | _winsound.SND_NODEFAULT)
            else:
                sys.stdout.write("\a"); sys.stdout.flush()
        except Exception as e:
            print(f"⚠️  Beep error: {e}")
            try:
                if BEEP_AVAILABLE:
                    _winsound.Beep(int(freq), int(dur))
            except Exception:
                pass
    threading.Thread(target=_b, daemon=True).start()

def beep_pattern(pattern):
    """Play multiple beeps sequentially in a background thread.
    pattern = list of (freq, dur_ms, pause_ms) tuples."""
    def _run():
        for freq, dur, pause in pattern:
            beep(freq, dur)
            time.sleep((dur + pause) / 1000.0)
    threading.Thread(target=_run, daemon=True).start()


from camera_module     import CameraModule
from face_module       import FaceModule
from eye_tracker       import EyeTracker
from cursor_controller import CursorController
from screenshot_module import take_screenshot, get_screenshot_list, delete_screenshot, SCREENSHOT_DIR


app = Flask(__name__)
CORS(app)

FATIGUE_ALERT_MESSAGE = (
    "You have been using the screen continuously. Eye fatigue detected. "
    "Look away from the screen, blink slowly, and rest your eyes."
)
SCREEN_FATIGUE_FIRST_REMINDER_SEC = 20 * 60
SCREEN_FATIGUE_REPEAT_SEC = 10 * 60
LOW_BLINK_REMINDER_AFTER_SEC = 90
LOW_BLINK_REMINDER_REPEAT_SEC = 5 * 60

# ── Modules ────────────────────────────────────────────────────────
camera = CameraModule()
face   = FaceModule()
eye    = EyeTracker()
cursor = CursorController()


def _voice_keyboard(action, value):
    if not VOICE_KEYS_AVAILABLE:
        return {"ok": False, "action": action, "result": "keyboard unavailable"}
    if action == "hotkey":
        _voice_keys.hotkey(*value)
    elif action == "press":
        _voice_keys.press(value)
    elif action == "type":
        _voice_keys.typewrite(value, interval=0.02)
    return {"ok": True, "action": action, "result": "ok"}


def _voice_response(action, result="ok", say=None, ok=True):
    return {"ok": ok, "action": action, "result": result, "say": say}


def _close_chrome():
    """Close all Google Chrome windows (cross-platform)."""
    _close_app_by_name("chrome")


# Map of friendly app names → process executable name(s)
_APP_PROCESS_MAP = {
    "chrome":           ["chrome.exe",       "chrome",      "chromium-browser", "chromium"],
    "firefox":          ["firefox.exe",       "firefox"],
    "edge":             ["msedge.exe",        "msedge",      "microsoft-edge"],
    "notepad":          ["notepad.exe",       "notepad"],
    "word":             ["WINWORD.EXE",       "soffice",     "libreoffice"],
    "excel":            ["EXCEL.EXE",         "soffice",     "libreoffice"],
    "powerpoint":       ["POWERPNT.EXE",      "soffice",     "libreoffice"],
    "paint":            ["mspaint.exe",       "pinta"],
    "calculator":       ["calc.exe",          "gnome-calculator", "kcalc"],
    "spotify":          ["Spotify.exe",       "spotify"],
    "whatsapp":         ["WhatsApp.exe",      "whatsapp"],
    "vlc":              ["vlc.exe",           "vlc"],
    "cmd":              ["cmd.exe",           "bash",        "xterm"],
    "vs code":          ["Code.exe",          "code"],
    "visual studio":    ["devenv.exe",        "code"],
    "file explorer":    ["explorer.exe",      "nautilus",    "thunar"],
    "task manager":     ["Taskmgr.exe",       "gnome-system-monitor"],
    "settings":         ["SystemSettings.exe","gnome-control-center"],
    "zoom":             ["Zoom.exe",          "zoom"],
    "teams":            ["Teams.exe",         "teams"],
    "discord":          ["Discord.exe",       "discord"],
    "skype":            ["Skype.exe",         "skype"],
    "outlook":          ["OUTLOOK.EXE",       "thunderbird"],
    "steam":            ["steam.exe",         "steam"],
    "obs":              ["obs64.exe",         "obs"],
}

def _close_app_by_name(app_key):
    """Close a specific app by friendly name key."""
    processes = _APP_PROCESS_MAP.get(app_key, [app_key + ".exe", app_key])
    for proc in processes:
        try:
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/IM", proc],
                               capture_output=True)
            else:
                subprocess.run(["pkill", "-f", proc],
                               capture_output=True)
        except Exception as e:
            print(f"Warning: close {proc}: {e}")


def _close_all_apps():
    """Close ALL known user-facing applications."""
    print("🔴 CLOSE ALL APPS — voice command triggered")
    for app_key in _APP_PROCESS_MAP:
        _close_app_by_name(app_key)


def _alarm_7s_warning():
    """7-second eye-close: escalating alarm + full voice rest guide."""
    # ── Stage 1: Alert beep pattern (700→900→1100 Hz) ─────────────
    beep_pattern([(700,350,80),(900,350,80),(1100,400,0)])
    time.sleep(1.4)  # let beeps finish before speaking

    # ── Stage 2: Fatigue alert + rest suggestion ───────────────────
    voice.speak_queued("Warning. Your eyes have been closed for 7 seconds.")
    time.sleep(2.0)
    voice.speak_queued("Please open your eyes, look away from the screen, and rest for a moment.")
    time.sleep(1.5)
    voice.speak_queued("If you feel sleepy, pause your work before it reaches 10 seconds.")
    time.sleep(2.5)

    # ── Stage 3: Breathing guide ───────────────────────────────────
    voice.speak_queued("Breathe in slowly...")
    time.sleep(3.0)
    voice.speak_queued("And breathe out. Well done.")
    time.sleep(1.5)

    # ── Stage 4: Recovery chime ────────────────────────────────────
    beep_pattern([(880,200,100),(1100,250,0)])
    voice.speak_queued("You may open your eyes now.")


def _alarm_10s_critical():
    """10-second eye-close: critical alarm + urgent wake-up voice."""
    # ── Stage 1: Urgent rapid alarm (3 × 2 bursts) ────────────────
    beep_pattern([
        (1400,280,60),(1400,280,60),(1400,280,300),
        (1400,280,60),(1400,280,60),(1400,280,0),
    ])
    time.sleep(2.2)  # let alarm finish

    # ── Stage 2: Critical voice alert ─────────────────────────────
    voice.speak_queued("Critical alert. Eye fatigue detected. Take a short break immediately.")
    time.sleep(2.0)
    voice.speak_queued("Your eyes have been closed for 10 seconds!")
    time.sleep(1.5)
    voice.speak_queued("Please open your eyes and stop what you are doing.")
    time.sleep(1.5)

    # ── Stage 3: Second siren burst ────────────────────────────────
    beep_pattern([(1600,350,80),(1600,350,80),(1600,350,0)])
    time.sleep(1.5)

    # ── Stage 4: Safety message ────────────────────────────────────
    voice.speak_queued("If you feel drowsy, please rest. Your safety is important.")


def _set_screen_fatigue_feedback(message, now_t):
    """Queue one screen-fatigue suggestion and expose it to the dashboard."""
    state["screen_fatigue_alert_id"] = state.get("screen_fatigue_alert_id", 0) + 1
    state["screen_fatigue_alert_msg"] = message
    state["screen_fatigue_alert_at"] = now_t
    voice.speak(message)
    print(f"SCREEN FATIGUE FEEDBACK - {message}")


def _maybe_screen_fatigue_feedback(now_t, blink_rate, close_dur):
    if not state.get("tracking") or not state.get("face_detected"):
        return
    if close_dur >= 0.4:
        return

    screen_time = state.get("screen_time_sec", 0) or 0
    last_tip = state.get("last_screen_fatigue_voice_at", 0.0) or 0.0
    last_blink_tip = state.get("last_low_blink_voice_at", 0.0) or 0.0

    if (
        screen_time >= LOW_BLINK_REMINDER_AFTER_SEC
        and blink_rate < 8
        and now_t - last_blink_tip >= LOW_BLINK_REMINDER_REPEAT_SEC
    ):
        state["last_low_blink_voice_at"] = now_t
        _set_screen_fatigue_feedback(
            "Your blink rate is low while using the screen. Blink slowly a few times, relax your eyes, and look away from the screen.",
            now_t,
        )
        return

    if (
        screen_time >= SCREEN_FATIGUE_FIRST_REMINDER_SEC
        and now_t - last_tip >= SCREEN_FATIGUE_REPEAT_SEC
    ):
        minutes = max(1, int(screen_time // 60))
        state["last_screen_fatigue_voice_at"] = now_t
        _set_screen_fatigue_feedback(
            f"You have been using the screen continuously for {minutes} minutes. Look away from the screen, blink gently, and close both eyes for 7 to 10 seconds if they feel tired.",
            now_t,
        )


def _send_eye_close_recovery_feedback(close_dur, now_t):
    seconds = int(round(close_dur))
    if close_dur >= 10:
        message = (
            f"You kept both eyes closed for about {seconds} seconds. "
            "Please pause your work and take a short eye rest before continuing."
        )
    else:
        message = (
            f"Good. Both eyes were closed for about {seconds} seconds. "
            "Now look away from the screen, blink slowly, and continue only when comfortable."
        )

    state["eye_close_recovery_id"] = state.get("eye_close_recovery_id", 0) + 1
    state["eye_close_recovery_msg"] = message
    state["eye_close_recovery_at"] = now_t
    voice.speak(message)
    print(f"EYE REST RECOVERY FEEDBACK - {message}")


def process_voice_command(raw):
    cmd = (raw or "").strip().lower()
    if not cmd:
        return _voice_response(None, "empty command", ok=False)

    if any(p in cmd for p in [
        "start tracking", "start gaze", "tracking on",
        "camera on", "turn on camera", "enable camera", "start camera"
    ]):
        state["tracking"] = True
        state["blinks"] = 0
        state["screenshot_count"] = 0
        state["heatmap_live"] = []
        return _voice_response("tracking_start", say="Camera on")

    if any(p in cmd for p in [
        "stop tracking", "stop gaze", "tracking off",
        "camera off", "turn off camera", "disable camera", "stop camera"
    ]):
        state["tracking"] = False
        return _voice_response("tracking_stop", say="Camera off")

    if any(p in cmd for p in ["left click", "click mouse", "mouse click"]) or cmd == "click":
        cursor.click()
        return _voice_response("left_click", say="Clicked")
    if "double click" in cmd:
        cursor.double_click()
        return _voice_response("double_click", say="Double click")
    if "right click" in cmd or "context menu" in cmd:
        cursor.right_click()
        return _voice_response("right_click", say="Right click")
    if "middle click" in cmd:
        cursor.middle_click()
        return _voice_response("middle_click", say="Middle click")

    if any(p in cmd for p in ["scroll up", "page up"]):
        cursor.scroll_up()
        return _voice_response("scroll_up", say="Scrolled up")
    if any(p in cmd for p in ["scroll down", "page down"]):
        cursor.scroll_down()
        return _voice_response("scroll_down", say="Scrolled down")
    if "zoom in" in cmd:
        cursor.zoom_in()
        return _voice_response("zoom_in", say="Zoomed in")
    if "zoom out" in cmd:
        cursor.zoom_out()
        return _voice_response("zoom_out", say="Zoomed out")
    if "reset zoom" in cmd or "zoom reset" in cmd:
        cursor.zoom_reset()
        return _voice_response("zoom_reset", say="Zoom reset")

    desktop_actions = [
        (["show desktop", "minimize all", "minimise all", "hide all windows"], cursor.show_desktop, "show_desktop", "Desktop shown"),
        (["start menu", "open start"], cursor.open_start_menu, "start_menu", "Start menu"),
        (["switch window", "alt tab", "next window", "change window"], cursor.switch_window, "switch_window", "Switched window"),
        (["close window", "close app", "close application", "close current app", "close current window", "alt f4"], cursor.close_window, "close_window", "Window closed"),
        # ── Close Google Chrome ────────────────────────────────────
        (["close google chrome", "close chrome", "close browser", "close google",
           "exit chrome", "quit chrome", "exit browser", "close chromium"],
         _close_chrome, "close_chrome", "Closing Google Chrome"),
        # ── Close all apps at once ─────────────────────────────────
        (["close all", "close all apps", "close everything", "close all applications",
           "exit all", "quit all", "shut everything", "close all windows"],
         _close_all_apps, "close_all_apps", "Closing all applications"),
        # ── Per-app close commands ─────────────────────────────────
        (["close notepad", "exit notepad"],
         lambda: _close_app_by_name("notepad"), "close_notepad", "Closing Notepad"),
        (["close firefox", "exit firefox", "quit firefox"],
         lambda: _close_app_by_name("firefox"), "close_firefox", "Closing Firefox"),
        (["close edge", "close microsoft edge", "exit edge"],
         lambda: _close_app_by_name("edge"), "close_edge", "Closing Edge"),
        (["close word", "close microsoft word", "exit word"],
         lambda: _close_app_by_name("word"), "close_word", "Closing Word"),
        (["close excel", "close microsoft excel", "exit excel"],
         lambda: _close_app_by_name("excel"), "close_excel", "Closing Excel"),
        (["close powerpoint", "close microsoft powerpoint", "exit powerpoint"],
         lambda: _close_app_by_name("powerpoint"), "close_powerpoint", "Closing PowerPoint"),
        (["close calculator", "close calc", "exit calculator"],
         lambda: _close_app_by_name("calculator"), "close_calculator", "Closing Calculator"),
        (["close paint", "exit paint"],
         lambda: _close_app_by_name("paint"), "close_paint", "Closing Paint"),
        (["close spotify", "exit spotify"],
         lambda: _close_app_by_name("spotify"), "close_spotify", "Closing Spotify"),
        (["close whatsapp", "exit whatsapp"],
         lambda: _close_app_by_name("whatsapp"), "close_whatsapp", "Closing WhatsApp"),
        (["close vlc", "exit vlc"],
         lambda: _close_app_by_name("vlc"), "close_vlc", "Closing VLC"),
        (["close vs code", "close visual studio code", "close vscode", "exit vs code"],
         lambda: _close_app_by_name("vs code"), "close_vscode", "Closing VS Code"),
        (["close zoom", "exit zoom"],
         lambda: _close_app_by_name("zoom"), "close_zoom", "Closing Zoom"),
        (["close teams", "close microsoft teams", "exit teams"],
         lambda: _close_app_by_name("teams"), "close_teams", "Closing Teams"),
        (["close discord", "exit discord"],
         lambda: _close_app_by_name("discord"), "close_discord", "Closing Discord"),
        (["close skype", "exit skype"],
         lambda: _close_app_by_name("skype"), "close_skype", "Closing Skype"),
        (["close outlook", "close microsoft outlook", "exit outlook"],
         lambda: _close_app_by_name("outlook"), "close_outlook", "Closing Outlook"),
        (["close steam", "exit steam"],
         lambda: _close_app_by_name("steam"), "close_steam", "Closing Steam"),
        (["close obs", "exit obs"],
         lambda: _close_app_by_name("obs"), "close_obs", "Closing OBS"),
        (["close terminal", "close command prompt", "close cmd", "exit terminal", "exit cmd"],
         lambda: _close_app_by_name("cmd"), "close_terminal", "Closing Terminal"),
        (["minimize window", "minimise window", "minimize app", "minimise app"], cursor.minimize_window, "minimize", "Window minimized"),
        (["maximize window", "maximise window", "maximize app", "maximise app"], cursor.maximize_window, "maximize", "Window maximized"),
        (["file explorer", "open files", "open explorer", "my computer"], cursor.open_file_explorer, "file_explorer", "File explorer"),
        (["task manager", "open task manager"], cursor.open_task_manager, "task_manager", "Task manager"),
        (["desktop left", "virtual desktop left"], cursor.virtual_desktop_left, "vdesk_left", "Desktop left"),
        (["desktop right", "virtual desktop right"], cursor.virtual_desktop_right, "vdesk_right", "Desktop right"),
    ]
    for phrases, fn, action, say in desktop_actions:
        if any(p in cmd for p in phrases):
            fn()
            return _voice_response(action, say=say)

    app_aliases = {
        "notepad": "notepad",
        "calculator": "calculator",
        "calc": "calculator",
        "paint": "paint",
        "camera": "camera",
        "settings": "settings",
        "control panel": "control panel",
        "chrome": "chrome",
        "edge": "microsoft edge",
        "firefox": "firefox",
        "browser": "chrome",
        "google": "chrome",
        "explorer": "explorer",
        "cmd": "cmd",
        "terminal": "cmd",
        "command prompt": "cmd",
        "word": "word",
        "excel": "excel",
        "powerpoint": "powerpoint",
        "vs code": "visual studio code",
        "visual studio code": "visual studio code",
        "whatsapp": "whatsapp",
        "spotify": "spotify",
    }
    if cmd.startswith("open "):
        target = cmd.replace("open ", "", 1).strip()
        app = app_aliases.get(target, target)
        if app in ["chrome", "google", "browser"]:
            webbrowser.open("https://www.google.com")
        else:
            cursor.open_app(app)
        return _voice_response(f"open:{app}", say=f"Opening {target}")

    if cmd.startswith("type "):
        text = cmd.replace("type ", "", 1).strip()
        if text:
            result = _voice_keyboard("type", text)
            return {**result, "say": "Typed"}

    key_commands = {
        "copy": ("hotkey", ["ctrl", "c"], "Copy"),
        "paste": ("hotkey", ["ctrl", "v"], "Paste"),
        "cut": ("hotkey", ["ctrl", "x"], "Cut"),
        "select all": ("hotkey", ["ctrl", "a"], "Select all"),
        "undo": ("hotkey", ["ctrl", "z"], "Undo"),
        "redo": ("hotkey", ["ctrl", "y"], "Redo"),
        "save": ("hotkey", ["ctrl", "s"], "Save"),
        "new tab": ("hotkey", ["ctrl", "t"], "New tab"),
        "close tab": ("hotkey", ["ctrl", "w"], "Close tab"),
        "next tab": ("hotkey", ["ctrl", "tab"], "Next tab"),
        "previous tab": ("hotkey", ["ctrl", "shift", "tab"], "Previous tab"),
        "reload": ("hotkey", ["ctrl", "r"], "Reload"),
        "refresh": ("hotkey", ["ctrl", "r"], "Refresh"),
        "find": ("hotkey", ["ctrl", "f"], "Find"),
        "print": ("hotkey", ["ctrl", "p"], "Print"),
        "lock pc": ("hotkey", ["win", "l"], "Lock PC"),
        "lock computer": ("hotkey", ["win", "l"], "Lock computer"),
        "enter": ("press", "enter", "Enter"),
        "tab": ("press", "tab", "Tab"),
        "escape": ("press", "esc", "Escape"),
        "backspace": ("press", "backspace", "Backspace"),
        "delete": ("press", "delete", "Delete"),
        "space": ("press", "space", "Space"),
        "up": ("press", "up", "Up"),
        "down": ("press", "down", "Down"),
        "left": ("press", "left", "Left"),
        "right": ("press", "right", "Right"),
        "home": ("press", "home", "Home"),
        "end": ("press", "end", "End"),
        "page up": ("press", "pageup", "Page up"),
        "page down": ("press", "pagedown", "Page down"),
        "volume up": ("press", "volumeup", "Volume up"),
        "volume down": ("press", "volumedown", "Volume down"),
        "mute": ("press", "volumemute", "Mute"),
    }
    for phrase, (kind, value, say) in key_commands.items():
        if cmd == phrase or phrase in cmd:
            result = _voice_keyboard(kind, value)
            return {**result, "action": f"keyboard:{phrase}", "say": say}

    if any(p in cmd for p in ["take screenshot", "screenshot", "capture screen", "snap"]):
        fn, fp = take_screenshot(None)
        if fn:
            state["screenshot_count"] += 1
            _db_save_screenshot(fn, fp)
            return _voice_response(f"screenshot:{fn}", say="Screenshot taken")
        return _voice_response("screenshot", "failed", say="Screenshot failed", ok=False)

    if any(p in cmd for p in ["stop voice", "voice stop", "assistant stop"]):
        return _voice_response("voice_stop", say="Voice assistant stopping")

    return _voice_response(None, "unrecognized", say="Command not recognized", ok=False)


voice = VoiceAssistant(
    on_command=process_voice_command,
    on_status=lambda msg: print(f"[VOICE] {msg}")
)


# ══════════════════════════════════════════════════════════
# SHARED STATE
# ══════════════════════════════════════════════════════════
state = {
    # Tracking
    "tracking":        False,
    "camera_open":     False,
    "face_detected":   False,
    # Gaze
    "gaze_x":          0,
    "gaze_y":          0,
    "gaze_x_pct":      50.0,
    "gaze_y_pct":      50.0,
    "gaze_norm_x":     0.5,
    "gaze_norm_y":     0.5,
    # EAR
    "left_ear":        0.0,
    "right_ear":       0.0,
    "left_ear_pct":    0.0,
    "right_ear_pct":   0.0,
    # Blink
    "blinks":          0,
    "double_blinks":   0,
    "right_clicks":    0,
    "close_dur":       0.0,
    "close_pct":       0.0,
    "last_action":     "",
    # Screenshot / Zoom
    "screenshot_count": 0,
    "zoom_level":       1,
    "heatmap_on":       True,
    "scroll_on":        False,
    "keys_typed":      0,
    "words_typed":     0,
    # Heatmap live buffer (last N points for live overlay)
    "heatmap_live":    [],
    # ── CURSOR SPEED SETTINGS ─────────────────────────────
    "cursor_speed":    1.0,
    "cursor_smooth":   0.5,
    "cursor_accel":    False,
    "cursor_deadzone": 0.02,
    # ── FATIGUE & DROWSINESS ───────────────────────────────
    "fatigue_level":   0,        # 0=alert 1=mild 2=tired 3=critical
    "drowsy_events":   0,        # total drowsy detections
    "blink_rate_pm":   0.0,      # blinks per minute
    "blink_times":     [],       # timestamps for rate calculation
    "eyes_closed_sec": 0.0,      # cumulative closed time this session
    # ── LONG EYE-CLOSE ALERT (7s / 10s) ──────────────────
    "eye_close_alerted_7":  False,
    "eye_close_alerted_10": False,
    "eye_alert_level":      0,     # 0=none 1=warning(7s) 2=critical(10s)
    # ── FATIGUE ALERT ──────────────────────────────────
    "fatigue_alert_shown":  False,  # True when fatigue alert is active
    "fatigue_alert_msg":    "",     # Current fatigue alert message
    "screen_fatigue_alert_id": 0,
    "screen_fatigue_alert_msg": "",
    "screen_fatigue_alert_at": 0.0,
    "last_screen_fatigue_voice_at": 0.0,
    "last_low_blink_voice_at": 0.0,
    "eye_close_recovery_id": 0,
    "eye_close_recovery_msg": "",
    "eye_close_recovery_at": 0.0,
    # ── HEATMAP ANALYTICS ─────────────────────────────────
    "focus_zones":     {},       # grid cell → dwell time
    "top_area":        "",       # most viewed area label
    "focus_duration":  0.0,      # seconds in focused zone
    "productivity":    0.0,      # productivity score 0–100
    # ── SESSION TRACKING ──────────────────────────────────
    "session_start":   None,     # datetime when tracking started
    "session_date":    "",       # date string YYYY-MM-DD
    "screen_time_sec": 0.0,      # total screen time this session (seconds)
    "screen_time_str": "00:00:00",  # formatted HH:MM:SS
}

# ── SQLite persistent session storage ──────────────────────────
_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'sessions.db')
os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)

def _db_conn():
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=TRUNCATE')
    return conn

def _db_init():
    with _db_conn() as c:
        # ── Sessions table ──────────────────────────────────────────
        c.execute('''CREATE TABLE IF NOT EXISTS sessions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            date          TEXT,
            start_time    TEXT,
            end_time      TEXT,
            duration_sec  INTEGER DEFAULT 0,
            duration_str  TEXT,
            blinks        INTEGER DEFAULT 0,
            screenshots   INTEGER DEFAULT 0,
            drowsy_events INTEGER DEFAULT 0,
            avg_fatigue   REAL    DEFAULT 0,
            top_area      TEXT    DEFAULT "—",
            productivity  REAL    DEFAULT 0
        )''')
        # ── Heatmap points per session ───────────────────────────────
        c.execute('''CREATE TABLE IF NOT EXISTS heatmap_points (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            gaze_norm_x REAL,
            gaze_norm_y REAL,
            gaze_x_pct  REAL,
            gaze_y_pct  REAL,
            ts          TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )''')
        # ── Cursor settings (single-row config) ──────────────────────
        c.execute('''CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )''')
        # ── Screenshots metadata ─────────────────────────────────────
        c.execute('''CREATE TABLE IF NOT EXISTS screenshots (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            filename   TEXT,
            filepath   TEXT,
            taken_at   TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )''')
        # ── Daily aggregates cache ───────────────────────────────────
        c.execute('''CREATE TABLE IF NOT EXISTS daily_stats (
            date              TEXT PRIMARY KEY,
            total_sessions    INTEGER DEFAULT 0,
            total_duration    INTEGER DEFAULT 0,
            total_blinks      INTEGER DEFAULT 0,
            total_screenshots INTEGER DEFAULT 0,
            total_drowsy      INTEGER DEFAULT 0
        )''')
_db_init()

# ── Settings helpers ────────────────────────────────────────────
def _settings_get(key, default=None):
    with _db_conn() as c:
        row = c.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
    return row['value'] if row else default

def _settings_set(key, value):
    with _db_conn() as c:
        c.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', (key, str(value)))

def _settings_get_all():
    with _db_conn() as c:
        rows = c.execute('SELECT key, value FROM settings').fetchall()
    return {r['key']: r['value'] for r in rows}

# ── Load persisted cursor settings on startup ───────────────────
def _load_cursor_settings():
    saved = _settings_get_all()
    if 'cursor_speed' in saved:
        state['cursor_speed']   = float(saved['cursor_speed'])
    if 'cursor_smooth' in saved:
        state['cursor_smooth']  = float(saved['cursor_smooth'])
    if 'cursor_accel' in saved:
        state['cursor_accel']   = saved['cursor_accel'] == 'True'
    if 'cursor_deadzone' in saved:
        state['cursor_deadzone']= float(saved['cursor_deadzone'])

# ── Heatmap helpers ─────────────────────────────────────────────
_current_session_id = None

def _db_save_heatmap_point(pt):
    if _current_session_id is None:
        return
    with _db_conn() as c:
        c.execute('''INSERT INTO heatmap_points
            (session_id, gaze_norm_x, gaze_norm_y, gaze_x_pct, gaze_y_pct, ts)
            VALUES (?,?,?,?,?,?)''',
            (_current_session_id,
             pt.get('gaze_norm_x', 0.5), pt.get('gaze_norm_y', 0.5),
             pt.get('gaze_x_pct', 50),   pt.get('gaze_y_pct', 50),
             datetime.now().strftime('%H:%M:%S')))

def _db_get_heatmap(session_id=None):
    with _db_conn() as c:
        if session_id:
            rows = c.execute('''SELECT * FROM heatmap_points WHERE session_id=?
                ORDER BY id''', (session_id,)).fetchall()
        else:
            last = c.execute('''SELECT id FROM sessions ORDER BY id DESC LIMIT 1''').fetchone()
            if not last:
                return []
            rows = c.execute('''SELECT * FROM heatmap_points WHERE session_id=?
                ORDER BY id''', (last['id'],)).fetchall()
    return [dict(r) for r in rows]

# ── Screenshot metadata helper ──────────────────────────────────
def _db_save_screenshot(filename, filepath):
    with _db_conn() as c:
        c.execute('''INSERT INTO screenshots (session_id, filename, filepath, taken_at)
            VALUES (?,?,?,?)''',
            (_current_session_id, filename, filepath,
             datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

def _db_get_screenshots(session_id=None):
    with _db_conn() as c:
        if session_id:
            rows = c.execute('''SELECT * FROM screenshots WHERE session_id=?
                ORDER BY id DESC''', (session_id,)).fetchall()
        else:
            rows = c.execute('''SELECT * FROM screenshots ORDER BY id DESC''').fetchall()
    return [dict(r) for r in rows]

# ── Daily stats update helper ───────────────────────────────────
def _db_update_daily(rec):
    d = rec['date']
    with _db_conn() as c:
        c.execute('''INSERT INTO daily_stats (date, total_sessions, total_duration,
            total_blinks, total_screenshots, total_drowsy) VALUES (?,1,?,?,?,?)
            ON CONFLICT(date) DO UPDATE SET
                total_sessions=total_sessions+1,
                total_duration=total_duration+excluded.total_duration,
                total_blinks=total_blinks+excluded.total_blinks,
                total_screenshots=total_screenshots+excluded.total_screenshots,
                total_drowsy=total_drowsy+excluded.total_drowsy''',
            (d, rec['duration_sec'], rec['blinks'],
             rec['screenshots'], rec['drowsy_events']))

def _session_to_dict(row):
    return {
        'id':           row['id'],
        'date':         row['date'],
        'start_time':   row['start_time'],
        'end_time':     row['end_time'],
        'duration_sec': row['duration_sec'],
        'duration_str': row['duration_str'],
        'blinks':       row['blinks'],
        'screenshots':  row['screenshots'],
        'drowsy_events':row['drowsy_events'],
        'avg_fatigue':  row['avg_fatigue'],
        'top_area':     row['top_area'],
        'productivity': row['productivity'],
    }

def _db_save_session(rec):
    with _db_conn() as c:
        cur = c.execute('''INSERT INTO sessions
            (date, start_time, end_time, duration_sec, duration_str,
             blinks, screenshots, drowsy_events, avg_fatigue, top_area, productivity)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (rec['date'], rec['start_time'], rec['end_time'], rec['duration_sec'],
             rec['duration_str'], rec['blinks'], rec['screenshots'], rec['drowsy_events'],
             rec['avg_fatigue'], rec['top_area'], rec['productivity']))
        return cur.lastrowid

def _db_update_session(session_id, rec):
    with _db_conn() as c:
        cur = c.execute('''UPDATE sessions SET
            date=?, start_time=?, end_time=?, duration_sec=?, duration_str=?,
            blinks=?, screenshots=?, drowsy_events=?, avg_fatigue=?,
            top_area=?, productivity=?
            WHERE id=?''',
            (rec['date'], rec['start_time'], rec['end_time'], rec['duration_sec'],
             rec['duration_str'], rec['blinks'], rec['screenshots'], rec['drowsy_events'],
             rec['avg_fatigue'], rec['top_area'], rec['productivity'], session_id))
        return cur.rowcount

def _db_get_sessions(limit=50):
    with _db_conn() as c:
        rows = c.execute('SELECT * FROM sessions ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
    return [_session_to_dict(r) for r in rows]

def _db_count():
    with _db_conn() as c:
        return c.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]

_session_id_counter = _db_count()  # resume counter from DB
_load_cursor_settings()           # restore saved cursor settings

latest_frame = None
frame_lock   = threading.Lock()

_gaze_frame_count = 0
GAZE_SAVE_EVERY   = 6

# ══════════════════════════════════════════════════════════
# TRACKING THREAD
# ══════════════════════════════════════════════════════════
def _fmt_time(secs):
    """Format seconds as HH:MM:SS string."""
    secs = int(max(0, secs))
    h, rem = divmod(secs, 3600)
    m, s   = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def tracking_loop():
    global latest_frame, _gaze_frame_count
    print("👁️  Tracking thread started...")

    while True:
        frame = camera.get_frame()
        if frame is None:
            state["camera_open"] = False
            state["face_detected"] = False
            with frame_lock:
                latest_frame = camera.placeholder_frame()
            time.sleep(0.25)
            continue
        state["camera_open"] = True

        if not state["tracking"]:
            cv2.putText(frame, "GAZEFLOW PROJECT — Click START TRACKING",
                        (10,30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (60,60,60), 1)
            with frame_lock: latest_frame = frame.copy()
            time.sleep(0.033)
            continue

        # ── Screen time counter ───────────────────────────────────
        if state["session_start"]:
            elapsed = (datetime.now() - state["session_start"]).total_seconds()
            state["screen_time_sec"] = round(elapsed, 1)
            state["screen_time_str"] = _fmt_time(int(elapsed))

        landmarks = face.get_landmarks(frame)
        if landmarks:
            frame = face.draw_landmarks(frame, landmarks)
            state["face_detected"] = True

            # ── Gaze ──────────────────────────────────────
            gx, gy = eye.get_gaze(landmarks, camera.width, camera.height)
            spd = state["cursor_speed"]
            if spd != 1.0:
                cx, cy = camera.width / 2, camera.height / 2
                gx = int(cx + (gx - cx) * spd)
                gy = int(cy + (gy - cy) * spd)
            dz = state["cursor_deadzone"]
            if dz > 0:
                nx = gx / camera.width
                ny = gy / camera.height
                if abs(nx - 0.5) < dz and abs(ny - 0.5) < dz:
                    gx = int(camera.width  * 0.5)
                    gy = int(camera.height * 0.5)
            cursor.smooth = state["cursor_smooth"]
            sx, sy = cursor.move(gx, gy, camera.width, camera.height)
            state["gaze_x"]      = gx
            state["gaze_y"]      = gy
            state["gaze_x_pct"]  = round((gx / camera.width)  * 100, 1)
            state["gaze_y_pct"]  = round((gy / camera.height) * 100, 1)
            state["gaze_norm_x"] = round(landmarks.landmark[468].x, 4)
            state["gaze_norm_y"] = round(landmarks.landmark[468].y, 4)

            # ── Store gaze for heatmap (throttled) ────────
            _gaze_frame_count += 1
            if _gaze_frame_count >= GAZE_SAVE_EVERY:
                _gaze_frame_count = 0
                nx = state["gaze_norm_x"]
                ny = state["gaze_norm_y"]
                xp = state["gaze_x_pct"]
                yp = state["gaze_y_pct"]
                buf = state["heatmap_live"]
                buf.append({"x": nx, "y": ny})
                if len(buf) > 500:
                    state["heatmap_live"] = buf[-500:]

            # ── EAR ───────────────────────────────────────
            le, re = eye.get_ear_values(landmarks, camera.width, camera.height)
            state["left_ear"]      = le
            state["right_ear"]     = re
            state["left_ear_pct"]  = round((le / 0.45) * 100, 1)
            state["right_ear_pct"] = round((re / 0.45) * 100, 1)
            state["close_dur"]     = 0.0
            state["close_pct"]     = 0.0

            # ── Blink / Actions ───────────────────────────
            prev_close_dur = state.get("close_dur", 0.0)
            result = eye.process_blink(landmarks, camera.width, camera.height)
            state["close_dur"] = result["close_dur"]
            state["close_pct"] = result["close_pct"]

            blink_now = result["blink"]

            if blink_now:
                cursor.click()
                state["blinks"]     += 1
                state["last_action"] = "click"
                # record blink time for rate calc
                bt = state["blink_times"]
                bt.append(time.time())
                state["blink_times"] = [t for t in bt if time.time()-t <= 60]

            if result.get("double_blink"):
                cursor.double_click()
                state["double_blinks"] += 1
                state["last_action"]    = "double_click"

            if result.get("right_click"):
                cursor.right_click()
                state["right_clicks"] += 1
                state["last_action"]   = "right_click"

            if result.get("left_mouse_5s"):
                cursor.click()
                state["blinks"] += 1
                state["last_action"] = "left_mouse_5s"
                print("🖱️ LEFT MOUSE — left eye 5s hold")

            if result.get("right_mouse_5s"):
                cursor.right_click()
                state["right_clicks"] += 1
                state["last_action"] = "right_mouse_5s"
                print("🖱️ RIGHT MOUSE — right eye 5s hold")

            # ── BLINK RATE (per minute) ───────────────────
            state["blink_rate_pm"] = round(len(state["blink_times"]), 1)

            # ── FATIGUE / DROWSINESS DETECTION ────────────
            close_dur   = result["close_dur"]
            blink_rate  = state["blink_rate_pm"]
            drowsy_flag = result.get("drowsy", False)
            now_t       = time.time()

            # Accumulate eyes-closed time
            if result["closed"]:
                state["eyes_closed_sec"] = round(
                    state.get("eyes_closed_sec", 0) + (1.0 / 30), 2)

            # ── 7s EYE-CLOSE WARNING ──────────────────────────────────
            if result.get("alert_7s"):
                state["eye_close_alerted_7"] = True
                state["eye_alert_level"]     = 1
                print("⚠️  7s EYE-CLOSE ALERT fired")
                threading.Thread(target=_alarm_7s_warning, daemon=True).start()

            # ── 10s EYE-CLOSE CRITICAL ────────────────────────────────
            if result.get("alert_10s"):
                state["eye_close_alerted_10"] = True
                state["eye_alert_level"]      = 2
                print("🚨 10s EYE-CLOSE CRITICAL ALERT fired")
                threading.Thread(target=_alarm_10s_critical, daemon=True).start()

            # Reset eye alert level when eyes open
            if not result["closed"]:
                state["eye_alert_level"] = 0
                if prev_close_dur >= 7.0:
                    _send_eye_close_recovery_feedback(prev_close_dur, now_t)

            # Fatigue scoring: 0=alert 1=mild 2=tired 3=critical
            fatigue = 0
            if drowsy_flag or close_dur >= 1.5:
                fatigue = 3
            elif close_dur >= 0.8 or blink_rate < 5:
                fatigue = 2
            elif close_dur >= 0.4 or blink_rate < 10:
                fatigue = 1

            if drowsy_flag:
                state["drowsy_events"] = state.get("drowsy_events", 0) + 1

            # ── FATIGUE ALERT: warn user when fatigue level reaches critical ──
            prev_fatigue = state.get("fatigue_level", 0)
            state["fatigue_level"] = fatigue

            if fatigue == 3 and prev_fatigue < 3 and not state.get("fatigue_alert_shown"):
                # Play warning sound + set alert message
                beep(1000, 400)
                alert_msg = FATIGUE_ALERT_MESSAGE
                state["fatigue_alert_shown"] = True
                state["fatigue_alert_msg"]   = alert_msg
                voice.speak(alert_msg)
                print(f"😴 FATIGUE DETECTED — {alert_msg}")

            # Clear fatigue alert when user recovers (fatigue drops below critical)
            if fatigue < 3:
                state["fatigue_alert_shown"] = False
                state["fatigue_alert_msg"]   = ""

            _maybe_screen_fatigue_feedback(now_t, blink_rate, close_dur)

            # ── HEATMAP ANALYTICS — focus zones + productivity ─
            nx_a = state["gaze_norm_x"]
            ny_a = state["gaze_norm_y"]
            # 3×3 zone grid
            col = int(min(nx_a * 3, 2))
            row = int(min(ny_a * 3, 2))
            zone_key = f"{row}_{col}"
            fz = state.setdefault("focus_zones", {})
            fz[zone_key] = round(fz.get(zone_key, 0) + (1.0/30), 2)
            # top area label
            zone_names = {
                "0_0":"Top-Left","0_1":"Top-Center","0_2":"Top-Right",
                "1_0":"Mid-Left","1_1":"Center","1_2":"Mid-Right",
                "2_0":"Bot-Left","2_1":"Bot-Center","2_2":"Bot-Right",
            }
            if fz:
                top_k = max(fz, key=fz.get)
                state["top_area"] = zone_names.get(top_k, top_k)
                total_gaze = sum(fz.values())
                center_time = fz.get("1_1", 0)
                # productivity = % time in center zone (focused reading/work)
                state["productivity"] = round(
                    min(100, (center_time / max(total_gaze, 1)) * 100 + blink_rate), 1)
                state["focus_duration"] = round(center_time, 1)


            # ── 1s hold → SNAP (Screenshot) ──────────────
            if result["screenshot"]:
                fn, fp = take_screenshot(None)
                if fn:
                    state["screenshot_count"] += 1
                    state["last_action"]        = "screenshot"
                    _db_save_screenshot(fn, fp)
                    beep(1200, 150)          # short camera-shutter beep
                    voice.speak("Screenshot taken")
                    print("📸 SNAP — 1s hold screenshot")
                else:
                    voice.speak("Screenshot failed")
                    print("📸 SNAP — screenshot FAILED")

            # ── 2s hold → ZOOM IN ─────────────────────────
            if result["zoom_in"]:
                cursor.zoom_in()
                state["zoom_level"]  = 2
                state["last_action"] = "zoom_in"
                beep(900, 200)           # rising tone = zoom in
                voice.speak("Zoom in")
                print("🔍 ZOOM IN — 2s hold")

            # ── 3s hold → ZOOM OUT ────────────────────────
            if result["zoom_out"]:
                cursor.zoom_out()
                state["zoom_level"]  = 1
                state["last_action"] = "zoom_out"
                beep(600, 200)           # falling tone = zoom out
                voice.speak("Zoom out")
                print("🔍 ZOOM OUT — 3s hold")

            # ── Overlay on frame ──────────────────────────
            h, w = frame.shape[:2]
            cv2.rectangle(frame, (0,0), (w,50), (5,12,24), -1)
            cv2.circle(frame, (gx, gy), 14, (0,212,255), 2)
            cv2.circle(frame, (gx, gy),  5, (0,212,255), -1)

            lp = state["left_ear_pct"]
            rp = state["right_ear_pct"]
            cv2.putText(frame,
                f"GAZE ({gx},{gy})  X:{state['gaze_x_pct']}%  Y:{state['gaze_y_pct']}%",
                (8,16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0,212,255), 1)
            cv2.putText(frame,
                f"L:{le:.2f}({lp}%)  R:{re:.2f}({rp}%)  BLINKS:{state['blinks']}",
                (8,34), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255,200,0), 1)

            if result["close_dur"] > 0:
                bw = int(min(1.0, result["close_dur"] / 2.5) * (w - 20))
                col = (0,0,220) if result["close_dur"]>2.5 else \
                      (0,140,255) if result["close_dur"]>1.5 else (0,212,255)
                cv2.rectangle(frame, (10, h-14), (10+bw, h-6), col, -1)
                cv2.putText(frame,
                    f"BLINK {result['close_pct']:.0f}%  {result['close_dur']:.1f}s",
                    (10, h-18), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (200,200,200), 1)

        else:
            state["face_detected"] = False
            cv2.putText(frame, "NO FACE — Move closer",
                        (10,30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,0,255), 2)

        with frame_lock:
            latest_frame = frame.copy()

threading.Thread(target=tracking_loop, daemon=True).start()

# ══════════════════════════════════════════════════════════
# VIDEO STREAM
# ══════════════════════════════════════════════════════════
def gen_frames():
    while True:
        with frame_lock: f = latest_frame
        if f is None: time.sleep(0.01); continue
        _, buf = cv2.imencode('.jpg', f, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
               + buf.tobytes() + b'\r\n')
        time.sleep(0.033)

# ══════════════════════════════════════════════════════════
# ROUTES — CORE
# ══════════════════════════════════════════════════════════
@app.route('/video')
def video():
    return Response(gen_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/status')
def get_status():
    s = dict(state)
    s.pop('heatmap_live', None)
    s.pop('blink_times',  None)
    # Add live date/time and session info
    now = datetime.now()
    s['current_date']     = now.strftime('%Y-%m-%d')
    s['current_time']     = now.strftime('%H:%M:%S')
    s['current_day']      = now.strftime('%A, %d %B %Y')
    s['screen_time_sec']  = state.get('screen_time_sec', 0.0)
    s['screen_time_str']  = state.get('screen_time_str', '00:00:00')
    s['session_date']     = state.get('session_date', '')
    s['session_start_str']= state['session_start'].strftime('%H:%M:%S') if state.get('session_start') else '--:--:--'
    s['total_sessions']   = _db_count()
    s['camera_id']        = getattr(camera, 'camera_id', None)
    s['camera_backend']   = getattr(camera, 'backend_name', None)
    s['camera_error']     = getattr(camera, 'error', '')
    return jsonify(s)

@app.route('/toggle', methods=['POST'])
def toggle():
    global _session_id_counter, _current_session_id
    was_tracking = state["tracking"]

    if not was_tracking and not camera.is_opened():
        camera.reconnect(force=True)
        if not camera.is_opened():
            state["tracking"] = False
            state["camera_open"] = False
            msg = getattr(camera, 'error', '') or 'Camera is not available.'
            print(f"Tracking not started: {msg}")
            return jsonify({
                "tracking": False,
                "camera_open": False,
                "error": msg,
            }), 503

    state["tracking"] = not state["tracking"]

    if state["tracking"] and not was_tracking:
        # ── Session STARTED ─────────────────────────────────────
        now = datetime.now()
        state["session_start"]   = now
        state["session_date"]    = now.strftime('%Y-%m-%d')
        state["screen_time_sec"] = 0.0
        state["screen_time_str"] = "00:00:00"
        state["blinks"]          = 0
        state["screenshot_count"]= 0
        state["eyes_closed_sec"] = 0.0
        state["drowsy_events"]   = 0
        state["fatigue_alert_shown"] = False
        state["eye_close_alerted_7"] = False
        state["eye_close_alerted_10"]= False
        state["screen_fatigue_alert_id"] = 0
        state["screen_fatigue_alert_msg"] = ""
        state["screen_fatigue_alert_at"] = 0.0
        state["last_screen_fatigue_voice_at"] = 0.0
        state["last_low_blink_voice_at"] = 0.0
        state["eye_close_recovery_id"] = 0
        state["eye_close_recovery_msg"] = ""
        state["eye_close_recovery_at"] = 0.0
        state["focus_zones"]     = {}
        session_rec = {
            "date":         state["session_date"],
            "start_time":   now.strftime('%H:%M:%S'),
            "end_time":     "LIVE",
            "duration_sec": 0,
            "duration_str": "00:00:00",
            "blinks":       0,
            "screenshots":  0,
            "drowsy_events":0,
            "avg_fatigue":  0,
            "top_area":     "—",
            "productivity": 0,
        }
        _current_session_id = _db_save_session(session_rec)
        _session_id_counter = _current_session_id
        voice.speak("Tracking started. Good luck!")
        print(f"▶  Session #{_session_id_counter} started at {now.strftime('%H:%M:%S')}")

    elif not state["tracking"] and was_tracking:
        # ── Session STOPPED — save to history ───────────────────
        now = datetime.now()
        dur = (now - state["session_start"]).total_seconds() if state["session_start"] else 0
        session_rec = {
            "id":           _session_id_counter,
            "date":         state["session_date"],
            "start_time":   state["session_start"].strftime('%H:%M:%S') if state["session_start"] else "--:--:--",
            "end_time":     now.strftime('%H:%M:%S'),
            "duration_sec": round(dur),
            "duration_str": _fmt_time(round(dur)),
            "blinks":       state["blinks"],
            "screenshots":  state["screenshot_count"],
            "drowsy_events":state["drowsy_events"],
            "avg_fatigue":  state["fatigue_level"],
            "top_area":     state["top_area"] or "—",
            "productivity": state["productivity"],
        }
        if _current_session_id is not None:
            _db_update_session(_current_session_id, session_rec)
        else:
            _current_session_id = _db_save_session(session_rec)
        _db_update_daily(session_rec)
        _current_session_id = None
        voice.speak(f"Tracking stopped. Session lasted {_fmt_time(round(dur))}. Total blinks: {state['blinks']}.")
        print(f"⏹  Session #{_session_id_counter} saved — {_fmt_time(round(dur))}")
    if state["tracking"]:
        state["blinks"]            = 0
        state["double_blinks"]     = 0
        state["right_clicks"]      = 0
        state["screenshot_count"]  = 0
        state["keys_typed"]        = 0
        state["words_typed"]       = 0
        state["heatmap_live"]      = []
        state["heatmap_on"]        = True
        state["scroll_on"]         = False
        print(f"▶ Tracking started")
    else:
        print("⏹ Tracking stopped")
    return jsonify({"tracking": state["tracking"], "session_id": _current_session_id})

# ══════════════════════════════════════════════════════════
# ROUTES — HEATMAP
# ══════════════════════════════════════════════════════════
@app.route('/heatmap/live')
def heatmap_live():
    return jsonify({"points": state["heatmap_live"],
                    "count": len(state["heatmap_live"])})

@app.route('/heatmap/session')
def heatmap_session():
    session_id = request.args.get('session_id', type=int)
    if session_id:
        pts = _db_get_heatmap(session_id)
        return jsonify({"points": pts, "count": len(pts), "session_id": session_id})
    # live session points
    pts = state["heatmap_live"]
    return jsonify({"points": pts, "count": len(pts)})

@app.route('/sessions/<int:sid>/heatmap')
def session_heatmap(sid):
    pts = _db_get_heatmap(sid)
    return jsonify({"points": pts, "count": len(pts), "session_id": sid})

@app.route('/heatmap/clear', methods=['POST'])
def heatmap_clear():
    state["heatmap_live"] = []
    return jsonify({"success": True})

# ══════════════════════════════════════════════════════════
# ROUTES — SCREENSHOT
# ══════════════════════════════════════════════════════════
@app.route('/screenshot', methods=['POST'])
def manual_screenshot():
    fn, fp = take_screenshot(None)
    if fn:
        state["screenshot_count"] += 1
        _db_save_screenshot(fn, fp)
        return jsonify({"success": True, "filename": fn})
    return jsonify({"success": False})


@app.route('/screenshots/metadata')
def screenshots_metadata():
    session_id = request.args.get('session_id', type=int)
    return jsonify(_db_get_screenshots(session_id))

@app.route('/screenshots')
def list_screenshots():
    return jsonify(get_screenshot_list())

@app.route('/screenshots/<filename>')
def serve_screenshot(filename):
    path = os.path.join(SCREENSHOT_DIR, filename)
    if os.path.exists(path): return send_file(path, mimetype='image/png')
    return jsonify({"error": "not found"}), 404

@app.route('/screenshots/<filename>', methods=['DELETE'])
def del_screenshot(filename):
    return jsonify({"success": delete_screenshot(filename)})

# ══════════════════════════════════════════════════════════
# ROUTES — ZOOM
# ══════════════════════════════════════════════════════════
@app.route('/zoom_in',    methods=['POST'])
def z_in():    cursor.zoom_in();    return jsonify({"zoom": "in"})
@app.route('/zoom_out',   methods=['POST'])
def z_out():   cursor.zoom_out();   return jsonify({"zoom": "out"})
@app.route('/zoom_reset', methods=['POST'])
def z_reset(): cursor.zoom_reset(); return jsonify({"zoom": "reset"})

# ══════════════════════════════════════════════════════════
# ROUTES — MOUSE BUTTONS
# ══════════════════════════════════════════════════════════
@app.route('/mouse/left_click',   methods=['POST'])
def mouse_left():
    cursor.click()
    state["last_action"] = "click"
    return jsonify({"action": "left_click"})

@app.route('/mouse/right_click',  methods=['POST'])
def mouse_right():
    cursor.right_click()
    state["last_action"] = "right_click"
    return jsonify({"action": "right_click"})

@app.route('/mouse/double_click', methods=['POST'])
def mouse_double():
    cursor.double_click()
    state["last_action"] = "double_click"
    return jsonify({"action": "double_click"})

@app.route('/mouse/middle_click', methods=['POST'])
def mouse_middle():
    cursor.middle_click()
    state["last_action"] = "middle_click"
    return jsonify({"action": "middle_click"})

# ══════════════════════════════════════════════════════════
# ROUTES — DESKTOP & WINDOWS CONTROL
# ══════════════════════════════════════════════════════════
@app.route('/desktop/show',          methods=['POST'])
def desk_show():   cursor.show_desktop();        return jsonify({"action": "show_desktop"})

@app.route('/desktop/start_menu',    methods=['POST'])
def desk_start():  cursor.open_start_menu();     return jsonify({"action": "start_menu"})

@app.route('/desktop/switch_window', methods=['POST'])
def desk_switch(): cursor.switch_window();       return jsonify({"action": "alt_tab"})

@app.route('/desktop/close_window',  methods=['POST'])
def desk_close():  cursor.close_window();        return jsonify({"action": "close_window"})

@app.route('/desktop/minimize',      methods=['POST'])
def desk_min():    cursor.minimize_window();     return jsonify({"action": "minimize"})

@app.route('/desktop/maximize',      methods=['POST'])
def desk_max():    cursor.maximize_window();     return jsonify({"action": "maximize"})

@app.route('/desktop/file_explorer', methods=['POST'])
def desk_files():  cursor.open_file_explorer();  return jsonify({"action": "file_explorer"})

@app.route('/desktop/task_manager',  methods=['POST'])
def desk_task():   cursor.open_task_manager();   return jsonify({"action": "task_manager"})

@app.route('/desktop/vdesk_left',    methods=['POST'])
def desk_vl():     cursor.virtual_desktop_left(); return jsonify({"action": "vdesk_left"})

@app.route('/desktop/vdesk_right',   methods=['POST'])
def desk_vr():     cursor.virtual_desktop_right();return jsonify({"action": "vdesk_right"})

@app.route('/desktop/open_app',      methods=['POST'])
def desk_open_app():
    data = request.get_json() or {}
    name = data.get("app", "")
    if not name:
        return jsonify({"error": "app name required"}), 400
    cursor.open_app(name)
    return jsonify({"action": "open_app", "app": name})


@app.route('/sessions')
def sessions():
    limit = int(request.args.get('limit', 50))
    return jsonify(_db_get_sessions(limit))

@app.route('/stats/today')
def today():
    today_str = datetime.now().strftime('%Y-%m-%d')
    with _db_conn() as c:
        rows = c.execute('SELECT * FROM sessions WHERE date=?', (today_str,)).fetchall()
    ss = [_session_to_dict(r) for r in rows]
    return jsonify({
        'date':               today_str,
        'total_sessions':     len(ss),
        'total_duration':     sum(s['duration_sec'] for s in ss),
        'total_blinks':       sum(s['blinks'] for s in ss),
        'total_screenshots':  sum(s['screenshots'] for s in ss),
        'total_drowsy':       sum(s['drowsy_events'] for s in ss),
        'avg_fatigue':        round(sum(s['avg_fatigue'] for s in ss) / max(1, len(ss)), 1),
    })

@app.route('/stats/daily')
def daily():
    days = int(request.args.get('days', 7))
    with _db_conn() as c:
        rows = c.execute('''SELECT date,
            COUNT(*) as total_sessions,
            SUM(duration_sec) as total_duration,
            SUM(blinks) as total_blinks,
            SUM(screenshots) as total_screenshots
            FROM sessions GROUP BY date ORDER BY date DESC LIMIT ?''', (days,)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/stats/alltime')
def alltime():
    with _db_conn() as c:
        row = c.execute('''SELECT COUNT(*) as total_sessions,
            SUM(duration_sec) as total_duration,
            SUM(blinks) as total_blinks,
            SUM(screenshots) as total_screenshots
            FROM sessions''').fetchone()
    return jsonify(dict(row))

@app.route('/export')
def export():
    all_sessions = _db_get_sessions(limit=10000)
    return jsonify({'sessions': all_sessions, 'total': len(all_sessions)})

# ══════════════════════════════════════════════════════════
# ROUTES — CURSOR SPEED CONTROL
# ══════════════════════════════════════════════════════════
@app.route('/cursor/settings', methods=['GET'])
def cursor_settings_get():
    return jsonify({
        "cursor_speed":    state["cursor_speed"],
        "cursor_smooth":   state["cursor_smooth"],
        "cursor_accel":    state["cursor_accel"],
        "cursor_deadzone": state["cursor_deadzone"],
    })

@app.route('/cursor/settings', methods=['POST'])
def cursor_settings_set():
    data = request.get_json() or {}
    if "cursor_speed" in data:
        v = float(data["cursor_speed"])
        state["cursor_speed"]  = max(0.1, min(3.0, v))
    if "cursor_smooth" in data:
        v = float(data["cursor_smooth"])
        state["cursor_smooth"] = max(0.05, min(0.95, v))
        cursor.smooth = state["cursor_smooth"]
    if "cursor_accel" in data:
        state["cursor_accel"] = bool(data["cursor_accel"])
    if "cursor_deadzone" in data:
        v = float(data["cursor_deadzone"])
        state["cursor_deadzone"] = max(0.0, min(0.1, v))
    # Persist to DB
    for k in ["cursor_speed","cursor_smooth","cursor_accel","cursor_deadzone"]:
        _settings_set(k, state[k])
    print(f"⚙️  Cursor settings saved: speed={state['cursor_speed']:.2f} "
          f"smooth={state['cursor_smooth']:.2f} accel={state['cursor_accel']} "
          f"deadzone={state['cursor_deadzone']:.3f}")
    return jsonify({"success": True, **{k: state[k] for k in
        ["cursor_speed","cursor_smooth","cursor_accel","cursor_deadzone"]}})

@app.route('/cursor/preset', methods=['POST'])
def cursor_preset():
    data    = request.get_json() or {}
    preset  = data.get("preset", "medium")
    presets = {
        "slow":      {"cursor_speed": 0.4, "cursor_smooth": 0.80, "cursor_accel": False, "cursor_deadzone": 0.04},
        "medium":    {"cursor_speed": 1.0, "cursor_smooth": 0.50, "cursor_accel": False, "cursor_deadzone": 0.02},
        "fast":      {"cursor_speed": 1.8, "cursor_smooth": 0.25, "cursor_accel": True,  "cursor_deadzone": 0.01},
        "precision": {"cursor_speed": 0.6, "cursor_smooth": 0.85, "cursor_accel": False, "cursor_deadzone": 0.05},
        "gaming":    {"cursor_speed": 2.5, "cursor_smooth": 0.15, "cursor_accel": True,  "cursor_deadzone": 0.005},
    }
    if preset not in presets:
        return jsonify({"error": f"Unknown preset '{preset}'"}), 400
    p = presets[preset]
    for k, v in p.items():
        state[k] = v
    cursor.smooth = state["cursor_smooth"]
    print(f"⚙️  Cursor preset: {preset}")
    return jsonify({"success": True, "preset": preset, **p})


# ══════════════════════════════════════════════════════════
# ROUTES — VOICE ASSISTANT
# ══════════════════════════════════════════════════════════
@app.route('/voice/status', methods=['GET'])
def voice_status():
    return jsonify(voice.status())

@app.route('/voice/start', methods=['POST'])
def voice_start():
    ok, msg = voice.start()
    return jsonify({"ok": ok, "message": msg, **voice.status()})

@app.route('/voice/stop', methods=['POST'])
def voice_stop():
    ok, msg = voice.stop()
    return jsonify({"ok": ok, "message": msg, **voice.status()})

@app.route('/voice/command', methods=['POST'])
def voice_command():
    data = request.get_json() or {}
    text = data.get("command", "")
    result = voice.handle_text(text)
    if result.get("action") == "voice_stop":
        voice.stop()
    return jsonify(result)

@app.route('/voice/speak', methods=['POST'])
def voice_speak():
    data = request.get_json() or {}
    message = data.get("message", "")
    if not message:
        return jsonify({"ok": False, "error": "message required"}), 400
    voice.speak(message)
    return jsonify({"ok": True, "spoken": message})


@app.route('/')
def home():
    return jsonify({
        "name":    "GazeFlow Project API",
        "version": "4.0",
        "port":    5000,
        "heatmap": True,
        "cursor_speed_control": True,
        "voice_assistant": True,
        "features": [
            "cursor_control", "cursor_speed_control",
            "screenshot_on_blink", "zoom_on_blink",
            "gaze_heatmap", "sessions_db",
            "daily_stats", "voice_assistant"
        ]
    })

# ══════════════════════════════════════════════════════════
if __name__ == '__main__':
    print("=" * 60)
    print("  👁️  GAZEFLOW PROJECT — All-in-One Server (Port 5000)")
    print("  📸  Eye Close 1s    = Screenshot  + beep + voice")
    print("  🔍  Eye Close 2s    = Zoom IN     + beep + voice")
    print("  🔍  Eye Close 3s    = Zoom OUT    + beep + voice")
    print("  ⚠️   Eye Close 7s    = WARNING alarm + voice rest guide")
    print("  🚨  Eye Close 10s   = CRITICAL alarm + urgent wake-up voice")
    print("  🌡️  Gaze Heatmap: /heatmap/live  /heatmap/session")
    print("  ⚙️  Cursor Speed:  /cursor/settings  /cursor/preset")
    print("  🎙️  Voice Assistant: /voice/start  /voice/command")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, threaded=True, debug=False)
