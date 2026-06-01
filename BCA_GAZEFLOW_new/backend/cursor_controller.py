# ╔══════════════════════════════════════════════════════════╗
# ║  MODULE 4 — CURSOR + ACTIONS | GazeFlow Project BCA       ║
# ║  Move | Click | Double Click | Right Click              ║
# ║  Scroll | Zoom | Desktop | Windows App Launch           ║
# ║  Background mode: works even when VS Code is minimised  ║
# ╚══════════════════════════════════════════════════════════╝
import pyautogui, numpy as np, subprocess, os, time

# ── PyAutoGUI safety ─────────────────────────────────────────────
pyautogui.FAILSAFE = False   # never raise FailSafeException
pyautogui.PAUSE    = 0       # zero delay between calls (max speed)

SCREEN_W, SCREEN_H = pyautogui.size()

# ── Windows background input (works when any window is minimised) ─
try:
    import ctypes
    _user32 = ctypes.windll.user32
    BACKGROUND_INPUT = True
    print("✅ Windows background input enabled (ctypes.user32)")
except Exception:
    _user32 = None
    BACKGROUND_INPUT = False
    print("⚠️  ctypes unavailable — background input disabled")

# SendInput structures for reliable background mouse events
if BACKGROUND_INPUT:
    INPUT_MOUSE    = 0
    MOUSEEVENTF_LEFTDOWN   = 0x0002
    MOUSEEVENTF_LEFTUP     = 0x0004
    MOUSEEVENTF_RIGHTDOWN  = 0x0008
    MOUSEEVENTF_RIGHTUP    = 0x0010
    MOUSEEVENTF_MIDDLEDOWN = 0x0020
    MOUSEEVENTF_MIDDLEUP   = 0x0040
    MOUSEEVENTF_MOVE       = 0x0001
    MOUSEEVENTF_ABSOLUTE   = 0x8000

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx",        ctypes.c_long),
                    ("dy",        ctypes.c_long),
                    ("mouseData", ctypes.c_ulong),
                    ("dwFlags",   ctypes.c_ulong),
                    ("time",      ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]

    class INPUT(ctypes.Structure):
        class _INPUT(ctypes.Union):
            _fields_ = [("mi", MOUSEINPUT)]
        _anonymous_ = ("_input",)
        _fields_    = [("type", ctypes.c_ulong), ("_input", _INPUT)]

    def _send_mouse(flags, dx=0, dy=0):
        inp = INPUT()
        inp.type = INPUT_MOUSE
        inp.mi   = MOUSEINPUT(dx, dy, 0, flags, 0, None)
        _user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))

    def _bg_move(sx, sy):
        """Move cursor using SendInput (works in background)."""
        # Normalise to 0–65535
        nx = int(sx * 65535 / SCREEN_W)
        ny = int(sy * 65535 / SCREEN_H)
        _send_mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, nx, ny)

    def _bg_left_click():
        _send_mouse(MOUSEEVENTF_LEFTDOWN)
        time.sleep(0.01)
        _send_mouse(MOUSEEVENTF_LEFTUP)

    def _bg_right_click():
        _send_mouse(MOUSEEVENTF_RIGHTDOWN)
        time.sleep(0.01)
        _send_mouse(MOUSEEVENTF_RIGHTUP)

    def _bg_double_click():
        _bg_left_click()
        time.sleep(0.05)
        _bg_left_click()

    def _bg_middle_click():
        _send_mouse(MOUSEEVENTF_MIDDLEDOWN)
        time.sleep(0.01)
        _send_mouse(MOUSEEVENTF_MIDDLEUP)


class CursorController:
    def __init__(self):
        print(f"🖱️  Cursor ready! Screen: {SCREEN_W}x{SCREEN_H}")
        print(f"   Background input: {'✅ SendInput (ctypes)' if BACKGROUND_INPUT else '⚠️  pyautogui fallback'}")
        self.smooth = 0.5
        self.prev_x = SCREEN_W // 2
        self.prev_y = SCREEN_H // 2

    def move(self, gx, gy, cw, ch):
        sx = np.interp(gx, [50, cw-50], [0, SCREEN_W])
        sy = np.interp(gy, [30, ch-30], [0, SCREEN_H])
        sx = self.prev_x + (sx - self.prev_x) * (1 - self.smooth)
        sy = self.prev_y + (sy - self.prev_y) * (1 - self.smooth)
        sx = int(np.clip(sx, 0, SCREEN_W-1))
        sy = int(np.clip(sy, 0, SCREEN_H-1))
        if BACKGROUND_INPUT:
            _bg_move(sx, sy)
        else:
            pyautogui.moveTo(sx, sy)
        self.prev_x, self.prev_y = sx, sy
        return sx, sy

    # ── Mouse Buttons ──────────────────────────────────────────────
    def click(self):
        if BACKGROUND_INPUT:
            _bg_left_click()
        else:
            pyautogui.click()
        print("🖱️  LEFT CLICK")

    def right_click(self):
        if BACKGROUND_INPUT:
            _bg_right_click()
        else:
            pyautogui.rightClick()
        print("🖱️  RIGHT CLICK")

    def double_click(self):
        """Double click — opens icons, files, images when focused by gaze."""
        if BACKGROUND_INPUT:
            _bg_double_click()
        else:
            pyautogui.doubleClick()
        print("🖱️🖱️ DOUBLE CLICK — open icon/app/image")

    def middle_click(self):
        if BACKGROUND_INPUT:
            _bg_middle_click()
        else:
            pyautogui.middleClick()
        print("🖱️  MIDDLE CLICK")

    # ── Scroll ─────────────────────────────────────────────────────
    def scroll_up(self):    pyautogui.scroll(3)
    def scroll_down(self):  pyautogui.scroll(-3)

    # ── Zoom ───────────────────────────────────────────────────────
    def zoom_in(self):    pyautogui.hotkey('ctrl', '+');  print("🔍 Zoom IN (Ctrl++)")
    def zoom_out(self):   pyautogui.hotkey('ctrl', '-');  print("🔍 Zoom OUT (Ctrl+-)")
    def zoom_reset(self): pyautogui.hotkey('ctrl', '0');  print("🔍 Zoom RESET")

    # ── Windows Desktop Controls ───────────────────────────────────
    def show_desktop(self):
        pyautogui.hotkey('win', 'd')
        print("🖥️  SHOW DESKTOP (Win+D)")

    def open_start_menu(self):
        pyautogui.press('win')
        print("🪟  START MENU (Win key)")

    def open_task_manager(self):
        pyautogui.hotkey('ctrl', 'shift', 'esc')
        print("📋 TASK MANAGER")

    def switch_window(self):
        pyautogui.hotkey('alt', 'tab')
        print("🔄 ALT+TAB — Switch window")

    def close_window(self):
        pyautogui.hotkey('alt', 'f4')
        print("❌ ALT+F4 — Close window")

    def minimize_window(self):
        pyautogui.hotkey('win', 'down')
        print("➖ Minimize window")

    def maximize_window(self):
        pyautogui.hotkey('win', 'up')
        print("⬆️  Maximize window")

    def open_file_explorer(self):
        pyautogui.hotkey('win', 'e')
        print("📁 File Explorer (Win+E)")

    def virtual_desktop_left(self):
        pyautogui.hotkey('ctrl', 'win', 'left')
        print("◀️  Virtual Desktop ←")

    def virtual_desktop_right(self):
        pyautogui.hotkey('ctrl', 'win', 'right')
        print("▶️  Virtual Desktop →")

    def open_app(self, app_name):
        """Launch a Windows app by name via Start menu search."""
        try:
            low = app_name.lower()
            if low in ('notepad', 'notepad.exe'):
                subprocess.Popen('notepad.exe')
            elif low in ('calculator', 'calc'):
                subprocess.Popen('calc.exe')
            elif low in ('paint', 'mspaint'):
                subprocess.Popen('mspaint.exe')
            elif low in ('explorer', 'file explorer'):
                subprocess.Popen('explorer.exe')
            elif low == 'cmd':
                subprocess.Popen('cmd.exe')
            elif low in ('chrome', 'google chrome', 'google', 'browser'):
                if os.name == 'nt':
                    subprocess.Popen(['cmd', '/c', 'start', '', 'chrome', 'https://www.google.com'])
                else:
                    subprocess.Popen(['google-chrome', 'https://www.google.com'])
            else:
                pyautogui.press('win')
                time.sleep(0.5)
                pyautogui.typewrite(app_name, interval=0.05)
                time.sleep(0.8)
                pyautogui.press('enter')
            print(f"🚀 Launched: {app_name}")
        except Exception as e:
            print(f"⚠️  App launch failed: {e}")

    def type_key(self, key):
        special = {'SPACE':'space','BACKSPACE':'backspace','ENTER':'enter',
                   'CAPS':'capslock','TAB':'tab','ESC':'esc'}
        if key in special: pyautogui.press(special[key])
        elif len(key)==1:  pyautogui.typewrite(key, interval=0.02)
