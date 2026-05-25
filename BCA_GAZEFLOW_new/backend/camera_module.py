# ╔══════════════════════════════════════════╗
# ║  MODULE 1 — CAMERA  | GazeFlow Project     ║
# ╚══════════════════════════════════════════╝
import cv2

class CameraModule:
    def __init__(self, camera_id=0):
        print("📷 Starting Camera...")
        self.cap = cv2.VideoCapture(camera_id)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.width  = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if not self.cap.isOpened():
            print("❌ Camera not found! Try camera_id=1")
        else:
            print(f"✅ Camera ready! {self.width}x{self.height} @ 30fps")

    def get_frame(self):
        ret, frame = self.cap.read()
        if not ret: return None
        return cv2.flip(frame, 1)

    def is_opened(self): return self.cap.isOpened()
    def release(self):   self.cap.release()
