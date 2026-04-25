import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult
} from "@mediapipe/tasks-vision";
import "./styles.css";

const enableButton = getElement<HTMLButtonElement>("#enable-camera");
const video = getElement<HTMLVideoElement>("#webcam");
const canvas = getElement<HTMLCanvasElement>("#overlay");
const statusLabel = getElement<HTMLSpanElement>("#status");
const faceCountLabel = getElement<HTMLSpanElement>("#face-count");
const emptyState = getElement<HTMLDivElement>("#empty-state");

const maybeCanvasContext = canvas.getContext("2d");

if (!maybeCanvasContext) {
  throw new Error("Canvas rendering is not supported in this browser.");
}

const canvasContext = maybeCanvasContext;

let faceLandmarker: FaceLandmarker | null = null;
let drawingUtils: DrawingUtils | null = null;
let lastVideoTime = -1;
let animationFrameId = 0;

enableButton.addEventListener("click", async () => {
  enableButton.disabled = true;
  setStatus("Loading MediaPipe model...");

  try {
    await setupFaceLandmarker();
    await setupCamera();

    emptyState.hidden = true;
    enableButton.textContent = "Camera enabled";
    setStatus("Tracking face mesh");
    animationFrameId = requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
    enableButton.disabled = false;
    enableButton.textContent = "Try again";
    setStatus(error instanceof Error ? error.message : "Something went wrong.");
  }
});

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
    outputFaceBlendshapes: true
  });

  drawingUtils = new DrawingUtils(canvasContext);
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
  syncCanvasToVideo();
}

function renderLoop() {
  if (!faceLandmarker || !drawingUtils || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    animationFrameId = requestAnimationFrame(renderLoop);
    return;
  }

  syncCanvasToVideo();

  if (video.currentTime !== lastVideoTime) {
    const result = faceLandmarker.detectForVideo(video, performance.now());
    drawResult(result);
    lastVideoTime = video.currentTime;
  }

  animationFrameId = requestAnimationFrame(renderLoop);
}

function drawResult(result: FaceLandmarkerResult) {
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);
  faceCountLabel.textContent = `Faces: ${result.faceLandmarks.length}`;

  for (const landmarks of result.faceLandmarks) {
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      color: "rgba(73, 212, 255, 0.28)",
      lineWidth: 1
    });
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
      color: "#ffcc4d",
      lineWidth: 2
    });
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
      color: "#ffcc4d",
      lineWidth: 2
    });
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, {
      color: "#ff6b7a",
      lineWidth: 3
    });
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, {
      color: "#ff6b7a",
      lineWidth: 3
    });
    drawingUtils?.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
      color: "rgba(255, 255, 255, 0.7)",
      lineWidth: 1
    });
  }
}

function syncCanvasToVideo() {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return;
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function setStatus(message: string) {
  statusLabel.textContent = message;
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrameId);
});

function getElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}
