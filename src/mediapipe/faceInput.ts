import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { getTransformSignals } from "./signals";
import type { FaceFrame } from "../types";

type FaceInputCallbacks = {
  onFrame(frame: FaceFrame): void;
  onStatus?(message: string): void;
};

export function createFaceInput() {
  const video = document.createElement("video");

  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;

  let faceLandmarker: FaceLandmarker | null = null;
  let callbacks: FaceInputCallbacks | null = null;
  let lastVideoTime = -1;
  let animationFrameId = 0;

  async function start(nextCallbacks: FaceInputCallbacks) {
    callbacks = nextCallbacks;
    callbacks.onStatus?.("Loading MediaPipe model...");
    await setupFaceLandmarker();
    callbacks.onStatus?.("Opening camera...");
    await setupCamera();
    animationFrameId = requestAnimationFrame(renderLoop);
  }

  function stop() {
    cancelAnimationFrame(animationFrameId);
    const stream = video.srcObject;

    if (stream instanceof MediaStream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }

  async function setupFaceLandmarker() {
    if (faceLandmarker) {
      return;
    }

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    });
  }

  async function setupCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support webcam access.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
    });

    await video.play();
  }

  function renderLoop() {
    if (!faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animationFrameId = requestAnimationFrame(renderLoop);
      return;
    }

    if (video.currentTime !== lastVideoTime) {
      const timestamp = performance.now();
      const result = faceLandmarker.detectForVideo(video, timestamp);
      const categories = result.faceBlendshapes[0]?.categories ?? [];
      const blendshapes = new Map(
        categories.map((category) => [category.categoryName, category.score])
      );
      const { signals: transformSignals, pose } = getTransformSignals(
        result.facialTransformationMatrixes[0]
      );

      callbacks?.onFrame({
        result,
        hasFace: result.faceLandmarks.length > 0,
        landmarks: result.faceLandmarks[0] ?? [],
        blendshapes,
        transformSignals,
        pose,
        timestamp
      });
      lastVideoTime = video.currentTime;
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  }

  return {
    video,
    start,
    stop
  };
}
