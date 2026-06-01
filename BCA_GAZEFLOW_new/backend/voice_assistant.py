# ╔══════════════════════════════════════════════════════════════╗
# ║  VOICE ASSISTANT | GazeFlow Project                    ║
# ║  TTS: pyttsx3 with single-queue thread (thread-safe)       ║
# ║  Fallback: Windows SAPI via subprocess if pyttsx3 fails    ║
# ╚══════════════════════════════════════════════════════════════╝
import threading
import queue
import time
import subprocess
import sys
from datetime import datetime

try:
    import speech_recognition as sr
    SR_AVAILABLE = True
except Exception:
    sr = None
    SR_AVAILABLE = False

try:
    import pyttsx3
    TTS_AVAILABLE = True
except Exception:
    pyttsx3 = None
    TTS_AVAILABLE = False


def _sapi_speak(text):
    """Fallback TTS via Windows PowerShell SAPI — works even without pyttsx3."""
    try:
        safe = text.replace("'", "").replace('"', "")
        cmd = (
            f"Add-Type -AssemblyName System.Speech; "
            f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$s.Rate = 1; $s.Volume = 100; $s.Speak('{safe}');"
        )
        subprocess.Popen(
            ["powershell", "-WindowStyle", "Hidden", "-Command", cmd],
            creationflags=0x08000000 if sys.platform == "win32" else 0,
        )
    except Exception as e:
        print(f"[TTS-SAPI] error: {e}")


class VoiceAssistant:
    def __init__(self, on_command, on_status=None):
        self.on_command  = on_command
        self.on_status   = on_status or (lambda msg: None)
        self.running     = False
        self.listening   = False
        self.last_command = ""
        self.last_result  = ""
        self.status_message = ""
        self.log          = []
        self._thread      = None
        self._lock        = threading.Lock()

        # ── Speech recognition ────────────────────────────────────
        self._recognizer = None
        if SR_AVAILABLE:
            self._recognizer = sr.Recognizer()
            self._recognizer.dynamic_energy_threshold  = True
            self._recognizer.pause_threshold           = 0.7
            self._recognizer.non_speaking_duration     = 0.4

        # ── TTS: single background queue thread ───────────────────
        self._tts       = None
        self._tts_queue = queue.Queue()
        self._tts_ok    = False
        self._init_tts()
        self._tts_worker = threading.Thread(
            target=self._tts_loop, daemon=True, name="tts-worker"
        )
        self._tts_worker.start()

    # ── TTS init ─────────────────────────────────────────────────
    def _init_tts(self):
        if not TTS_AVAILABLE:
            print("⚠️  pyttsx3 not installed — using PowerShell SAPI fallback")
            return
        try:
            self._tts = pyttsx3.init()
            self._tts.setProperty("rate",   155)
            self._tts.setProperty("volume", 1.0)
            # pick a clear voice if available
            voices = self._tts.getProperty("voices")
            for v in voices:
                if "zira" in v.name.lower() or "david" in v.name.lower():
                    self._tts.setProperty("voice", v.id)
                    break
            self._tts_ok = True
            print("✅ pyttsx3 TTS ready")
        except Exception as e:
            self._tts    = None
            self._tts_ok = False
            print(f"⚠️  pyttsx3 init failed ({e}) — using PowerShell SAPI fallback")

    # ── TTS worker: drains the queue one message at a time ────────
    def _tts_loop(self):
        while True:
            msg = self._tts_queue.get()          # blocks until something arrives
            if msg is None:
                break
            try:
                if self._tts_ok and self._tts:
                    self._tts.say(msg)
                    self._tts.runAndWait()
                else:
                    _sapi_speak(msg)
                    time.sleep(max(0.5, len(msg) * 0.055))   # rough wait for SAPI
            except Exception as e:
                print(f"[TTS] speak error: {e}")
                try:
                    _sapi_speak(msg)
                    time.sleep(max(0.5, len(msg) * 0.055))
                except Exception:
                    pass
            finally:
                self._tts_queue.task_done()

    # ── Public speak — enqueues, never blocks caller ──────────────
    def speak(self, message):
        if not message:
            return
        # Clear any queued messages so urgent alerts jump the queue
        while not self._tts_queue.empty():
            try:
                self._tts_queue.get_nowait()
                self._tts_queue.task_done()
            except queue.Empty:
                break
        self._tts_queue.put(message)

    def speak_queued(self, message):
        """Like speak() but does NOT clear the queue — for sequential narration."""
        if message:
            self._tts_queue.put(message)

    # ── Voice assistant start/stop ────────────────────────────────
    def start(self):
        if self.running:
            return True, "Voice assistant already running"
        if not SR_AVAILABLE:
            self.last_result = "SpeechRecognition not installed - browser voice fallback can still work"
            return False, self.last_result
        try:
            import pyaudio  # noqa: F401
        except Exception:
            self.last_result = "PyAudio/microphone support missing - browser voice fallback can still work"
            return False, self.last_result
        self.status_message = "Starting voice assistant"
        self.running  = True
        self._thread  = threading.Thread(
            target=self._listen_loop, daemon=True, name="voice-listener"
        )
        self._thread.start()
        self.speak("Voice assistant started")
        return True, "Voice assistant started"

    def stop(self):
        self.running   = False
        self.listening = False
        self.status_message = "Voice assistant stopped"
        return True, "Voice assistant stopped"

    # ── Command handling ──────────────────────────────────────────
    def handle_text(self, text):
        cmd = (text or "").strip().lower()
        if not cmd:
            return {"ok": False, "command": "", "result": "empty command", "action": None}

        try:
            response = self.on_command(cmd)
        except Exception as exc:
            response = {"ok": False, "action": None, "result": f"error: {exc}"}

        result = response.get("result", "ok")
        action = response.get("action")
        self.last_command = cmd
        self.last_result  = result
        entry = {
            "time":    datetime.now().strftime("%H:%M:%S"),
            "command": cmd,
            "action":  action or "",
            "result":  result,
        }
        with self._lock:
            self.log = (self.log + [entry])[-50:]

        if response.get("say"):
            self.speak(response["say"])
        if action == "voice_stop":
            self.stop()

        return {"ok": response.get("ok", True), "command": cmd, "action": action, "result": result}

    def status(self):
        with self._lock:
            recent = list(self.log[-20:])
        return {
            "running":          self.running,
            "listening":        self.listening,
            "last_command":     self.last_command,
            "last_result":      self.last_result,
            "status_message":    self.status_message,
            "log":              recent,
            "speech_available": SR_AVAILABLE,
            "tts_available":    self._tts_ok or True,   # SAPI is always available on Windows
        }

    # ── Microphone listen loop ────────────────────────────────────
    def _listen_loop(self):
        try:
            mic = sr.Microphone()
            with mic as source:
                self.status_message = "Calibrating microphone"
                self.on_status(self.status_message)
                self._recognizer.adjust_for_ambient_noise(source, duration=1)
        except Exception as exc:
            self.running       = False
            self.listening     = False
            self.last_result   = f"microphone error: {exc}"
            self.status_message = self.last_result
            with self._lock:
                self.log = (self.log + [{
                    "time": datetime.now().strftime("%H:%M:%S"),
                    "command": "voice start",
                    "action": "",
                    "result": self.last_result,
                }])[-50:]
            self.on_status(self.last_result)
            return

        while self.running:
            try:
                with mic as source:
                    self.listening = True
                    self.status_message = "Listening"
                    audio = self._recognizer.listen(source, timeout=5, phrase_time_limit=6)
                self.listening = False
                self.status_message = "Recognizing speech"

                try:
                    text = self._recognizer.recognize_google(audio, language="en-US")
                except sr.UnknownValueError:
                    self.status_message = "Listening"
                    continue
                except sr.RequestError as exc:
                    self.last_result = f"speech service error: {exc}"
                    self.status_message = self.last_result
                    time.sleep(2)
                    continue

                self.handle_text(text)
                self.status_message = "Listening"

            except sr.WaitTimeoutError:
                self.listening = False
                self.status_message = "Listening"
            except Exception as exc:
                self.listening   = False
                self.last_result = f"listen error: {exc}"
                self.status_message = self.last_result
                self.on_status(self.last_result)
                time.sleep(1)
