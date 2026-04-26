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
const eyeScoreList = getElement<HTMLDivElement>("#eye-score-list");
const root = document.documentElement;
const eyeBlendshapeNames = [
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight"
];
const maxHistoryLength = 140;
const gazeSensitivity = 3.2;

const maybeCanvasContext = canvas.getContext("2d");

if (!maybeCanvasContext) {
  throw new Error("Canvas rendering is not supported in this browser.");
}

const canvasContext = maybeCanvasContext;
const eyeScores = createEyeScoreRows();

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
  updateEyeScores(result);

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

function updateEyeScores(result: FaceLandmarkerResult) {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const scoreByName = new Map(categories.map((category) => [category.categoryName, category.score]));

  for (const score of eyeScores) {
    const value = scoreByName.get(score.name) ?? 0;

    score.history.push(value);

    if (score.history.length > maxHistoryLength) {
      score.history.shift();
    }

    score.value.textContent = value.toFixed(3);
    drawScoreChart(score);
  }

  updateBackgroundFromGaze(scoreByName);
}

function updateBackgroundFromGaze(scoreByName: Map<string, number>) {
  const lookLeft =
    (scoreByName.get("eyeLookOutLeft") ?? 0) + (scoreByName.get("eyeLookInRight") ?? 0);
  const lookRight =
    (scoreByName.get("eyeLookInLeft") ?? 0) + (scoreByName.get("eyeLookOutRight") ?? 0);
  const horizontalGaze = clamp((lookRight - lookLeft) * gazeSensitivity, -1, 1);

  root.style.setProperty("--gaze-mix", `${((horizontalGaze + 1) / 2).toFixed(3)}`);
}

function createEyeScoreRows() {
  return eyeBlendshapeNames.map((name) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const chart = document.createElement("canvas");
    const value = document.createElement("strong");
    const chartContext = chart.getContext("2d");

    if (!chartContext) {
      throw new Error("Chart canvas rendering is not supported in this browser.");
    }

    row.className = "score-row";
    label.textContent = name;
    chart.width = 220;
    chart.height = 34;
    value.textContent = "0.000";

    row.append(label, chart, value);
    eyeScoreList.append(row);

    return {
      name,
      chart,
      chartContext,
      value,
      history: [] as number[]
    };
  });
}

function drawScoreChart(score: (typeof eyeScores)[number]) {
  const { chart, chartContext, history } = score;
  const pixelRatio = window.devicePixelRatio || 1;
  const width = chart.clientWidth;
  const height = chart.clientHeight;

  if (!width || !height) {
    return;
  }

  const scaledWidth = Math.round(width * pixelRatio);
  const scaledHeight = Math.round(height * pixelRatio);

  if (chart.width !== scaledWidth || chart.height !== scaledHeight) {
    chart.width = scaledWidth;
    chart.height = scaledHeight;
  }

  chartContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  chartContext.clearRect(0, 0, width, height);

  chartContext.fillStyle = "rgba(255, 255, 255, 0.035)";
  chartContext.fillRect(0, 0, width, height);

  chartContext.strokeStyle = "rgba(255, 255, 255, 0.12)";
  chartContext.lineWidth = 1;
  chartContext.beginPath();
  chartContext.moveTo(0, height / 2);
  chartContext.lineTo(width, height / 2);
  chartContext.stroke();

  if (history.length < 2) {
    return;
  }

  chartContext.strokeStyle = "#74d7ff";
  chartContext.lineWidth = 2;
  chartContext.beginPath();

  history.forEach((value, index) => {
    const x = (index / (maxHistoryLength - 1)) * width;
    const y = height - value * height;

    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });

  chartContext.stroke();
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
