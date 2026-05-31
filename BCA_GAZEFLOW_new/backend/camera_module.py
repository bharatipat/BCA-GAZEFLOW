import os
import time

import cv2
import numpy as np


class CameraModule:
    def __init__(self, camera_id=None):
        print("Starting Camera...")
        self.cap = None
        self.camera_id = None
        self.backend_name = None
        self.error = ""
        self.width = 640
        self.height = 480
        self._last_retry = 0.0
        self._retry_delay = 30.0

        env_camera = os.environ.get("GAZEFLOW_CAMERA_ID")
        if camera_id is None and env_camera not in (None, ""):
            try:
                camera_id = int(env_camera)
            except ValueError:
                print(f"Ignoring invalid GAZEFLOW_CAMERA_ID={env_camera!r}")

        self._preferred_id = camera_id
        self.open()

    def _camera_ids(self):
        if self._preferred_id is not None:
            ids = [int(self._preferred_id)]
        else:
            ids = [0, 1, 2, 3]
        return ids

    def _backends(self):
        backends = []
        if os.name == "nt":
            backends.extend([
                ("DSHOW", cv2.CAP_DSHOW),
                ("MSMF", cv2.CAP_MSMF),
            ])
        backends.append(("ANY", cv2.CAP_ANY))
        return backends

    def _configure(self, cap):
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        cap.set(cv2.CAP_PROP_FPS, 30)

    def _try_open(self, camera_id, backend_name, backend):
        cap = cv2.VideoCapture(camera_id, backend)
        self._configure(cap)

        if not cap.isOpened():
            cap.release()
            return None

        ok, frame = cap.read()
        if not ok or frame is None:
            cap.release()
            return None

        self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or frame.shape[1]
        self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or frame.shape[0]
        self.cap = cap
        self.camera_id = camera_id
        self.backend_name = backend_name
        self.error = ""
        print(f"Camera ready! id={camera_id}, backend={backend_name}, {self.width}x{self.height} @ 30fps")
        return cap

    def open(self):
        self._last_retry = time.time()
        self.release()
        for camera_id in self._camera_ids():
            for backend_name, backend in self._backends():
                print(f"Trying camera id={camera_id}, backend={backend_name}...")
                if self._try_open(camera_id, backend_name, backend):
                    return True

        ids = ", ".join(str(i) for i in self._camera_ids())
        self.error = (
            f"Camera not found for id(s): {ids}. Close other camera apps, "
            "check Windows camera privacy settings, or set GAZEFLOW_CAMERA_ID=1."
        )
        print(self.error)
        return False

    def reconnect(self, force=False):
        now = time.time()
        if not force and now - self._last_retry < self._retry_delay:
            return False
        self._last_retry = now
        return self.open()

    def get_frame(self):
        if not self.is_opened():
            self.reconnect()
            return None

        ret, frame = self.cap.read()
        if not ret or frame is None:
            self.error = "Camera read failed; reconnecting..."
            print(self.error)
            self.release()
            self.reconnect(force=True)
            return None

        return cv2.flip(frame, 1)

    def placeholder_frame(self):
        frame = np.zeros((self.height, self.width, 3), dtype=np.uint8)
        frame[:] = (18, 24, 32)
        lines = [
            "GAZEFLOW CAMERA NOT READY",
            self.error or "No camera frame available.",
            "Close Zoom/Teams/Camera app, then wait or restart Flask.",
            "Optional: set GAZEFLOW_CAMERA_ID=1 before python app.py",
        ]
        y = 120
        for i, line in enumerate(lines):
            color = (0, 212, 255) if i == 0 else (220, 220, 220)
            scale = 0.7 if i == 0 else 0.48
            cv2.putText(frame, line, (32, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)
            y += 42
        return frame

    def is_opened(self):
        return self.cap is not None and self.cap.isOpened()

    def release(self):
        if self.cap is not None:
            self.cap.release()
            self.cap = None
