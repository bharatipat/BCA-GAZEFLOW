# ╔══════════════════════════════════════════╗
# ║  MODULE 2 — FACE DETECTION | GazeFlow Project   ║
# ╚══════════════════════════════════════════╝
import cv2, mediapipe as mp


class FaceModule:
    def __init__(self):
        print("🧑 Loading FaceMesh...")
        self.mp_face = mp.solutions.face_mesh
        self.face_mesh = self.mp_face.FaceMesh(
            refine_landmarks=True, max_num_faces=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7)
        print("✅ FaceMesh ready! 468 landmarks + iris")

    def get_landmarks(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        result = self.face_mesh.process(rgb)
        rgb.flags.writeable = True
        if result.multi_face_landmarks:
            return result.multi_face_landmarks[0]
        return None

    def draw_landmarks(self, frame, landmarks):
        if not landmarks: return frame
        h, w = frame.shape[:2]
        for i in [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]:
            lm=landmarks.landmark[i]
            cv2.circle(frame,(int(lm.x*w),int(lm.y*h)),1,(0,212,255),-1)
        for i in [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398]:
            lm=landmarks.landmark[i]
            cv2.circle(frame,(int(lm.x*w),int(lm.y*h)),1,(255,107,53),-1)
        for i in range(468,478):
            lm=landmarks.landmark[i]
            cv2.circle(frame,(int(lm.x*w),int(lm.y*h)),2,(0,255,157),-1)
        return frame
