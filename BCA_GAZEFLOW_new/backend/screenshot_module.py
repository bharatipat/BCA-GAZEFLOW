# ╔══════════════════════════════════════════╗
# ║  MODULE 5 — SCREENSHOT | GazeFlow Project       ║
# ╚══════════════════════════════════════════╝
import pyautogui, os
from datetime import datetime

SCREENSHOT_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'data', 'screenshots')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def take_screenshot(session_id=None):
    try:
        now   = datetime.now()
        fname = now.strftime("screenshot_%Y-%m-%d_%H-%M-%S.png")
        fpath = os.path.join(SCREENSHOT_DIR, fname)
        pyautogui.screenshot().save(fpath)
        print(f"📸 Screenshot: {fname}")
        return fname, fpath
    except Exception as e:
        print(f"❌ Screenshot failed: {e}")
        return None, None

def get_screenshot_list():
    files = []
    if os.path.exists(SCREENSHOT_DIR):
        for f in sorted(os.listdir(SCREENSHOT_DIR), reverse=True):
            if f.endswith(('.png', '.jpg')):
                path = os.path.join(SCREENSHOT_DIR, f)
                files.append({
                    "filename": f,
                    "filepath": path,
                    "size_kb": round(os.path.getsize(path)/1024, 1),
                    "date": f[11:21] if len(f)>20 else "",
                    "time": f[22:30].replace('-',':') if len(f)>29 else ""
                })
    return files

def delete_screenshot(filename):
    path = os.path.join(SCREENSHOT_DIR, filename)
    if os.path.exists(path): os.remove(path); return True
    return False
