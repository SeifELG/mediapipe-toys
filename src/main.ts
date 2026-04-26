import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type Matrix
} from "@mediapipe/tasks-vision";
import "./styles.css";

const enableButton = getElement<HTMLButtonElement>("#enable-camera");
const video = getElement<HTMLVideoElement>("#webcam");
const canvas = getElement<HTMLCanvasElement>("#overlay");
const statusLabel = getElement<HTMLSpanElement>("#status");
const faceCountLabel = getElement<HTMLSpanElement>("#face-count");
const emptyState = getElement<HTMLDivElement>("#empty-state");
const blendshapeScoreList = getElement<HTMLDivElement>("#blendshape-score-list");
const blendshapeNames = [
  "_neutral",
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
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
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight"
];
const transformSignalNames = [
  "poseYawDegrees",
  "posePitchDegrees",
  "poseRollDegrees",
  "translationX",
  "translationY",
  "translationZ",
  "scaleX",
  "scaleY",
  "scaleZ",
  "matrix00",
  "matrix01",
  "matrix02",
  "matrix03",
  "matrix10",
  "matrix11",
  "matrix12",
  "matrix13",
  "matrix20",
  "matrix21",
  "matrix22",
  "matrix23",
  "matrix30",
  "matrix31",
  "matrix32",
  "matrix33"
];
const maxHistoryLength = 140;

const maybeCanvasContext = canvas.getContext("2d");

if (!maybeCanvasContext) {
  throw new Error("Canvas rendering is not supported in this browser.");
}

const canvasContext = maybeCanvasContext;
const scoreRows = createScoreRows();

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
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
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
  updateScores(result);

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

function updateScores(result: FaceLandmarkerResult) {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const scoreByName = new Map(categories.map((category) => [category.categoryName, category.score]));
  const transformByName = getTransformSignals(result.facialTransformationMatrixes[0]);

  for (const score of scoreRows) {
    const value = scoreByName.get(score.name) ?? transformByName.get(score.name) ?? 0;

    score.history.push(value);

    if (score.history.length > maxHistoryLength) {
      score.history.shift();
    }

    score.value.textContent = value.toFixed(3);
    drawScoreChart(score);
  }
}

function createScoreRows() {
  return [...transformSignalNames, ...blendshapeNames].map((name) => {
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
    blendshapeScoreList.append(row);

    return {
      name,
      chart,
      chartContext,
      value,
      history: [] as number[]
    };
  });
}

function drawScoreChart(score: (typeof scoreRows)[number]) {
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

  const chartRange = getChartRange(history);
  const zeroY = getYForValue(0, chartRange.min, chartRange.max, height);

  chartContext.strokeStyle = "rgba(255, 255, 255, 0.12)";
  chartContext.lineWidth = 1;
  chartContext.beginPath();
  chartContext.moveTo(0, zeroY);
  chartContext.lineTo(width, zeroY);
  chartContext.stroke();

  if (history.length < 2) {
    return;
  }

  chartContext.strokeStyle = "#74d7ff";
  chartContext.lineWidth = 2;
  chartContext.beginPath();

  history.forEach((value, index) => {
    const x = (index / (maxHistoryLength - 1)) * width;
    const y = getYForValue(value, chartRange.min, chartRange.max, height);

    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });

  chartContext.stroke();
}

function getTransformSignals(matrix?: Matrix) {
  const signals = new Map<string, number>();

  if (!matrix || matrix.data.length < 16) {
    return signals;
  }

  const m = matrix.data;
  const scaleX = Math.hypot(m[0], m[1], m[2]);
  const scaleY = Math.hypot(m[4], m[5], m[6]);
  const scaleZ = Math.hypot(m[8], m[9], m[10]);
  const r00 = m[0] / scaleX;
  const r01 = m[4] / scaleY;
  const r02 = m[8] / scaleZ;
  const r10 = m[1] / scaleX;
  const r11 = m[5] / scaleY;
  const r12 = m[9] / scaleZ;
  const r20 = m[2] / scaleX;
  const r21 = m[6] / scaleY;
  const r22 = m[10] / scaleZ;
  const pitch = Math.atan2(-r21, Math.hypot(r20, r22));
  const yaw = Math.atan2(r20, r22);
  const roll = Math.atan2(r01, r11);

  signals.set("poseYawDegrees", radiansToDegrees(yaw));
  signals.set("posePitchDegrees", radiansToDegrees(pitch));
  signals.set("poseRollDegrees", radiansToDegrees(roll));
  signals.set("translationX", m[12]);
  signals.set("translationY", m[13]);
  signals.set("translationZ", m[14]);
  signals.set("scaleX", scaleX);
  signals.set("scaleY", scaleY);
  signals.set("scaleZ", scaleZ);

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      signals.set(`matrix${row}${column}`, m[row * 4 + column]);
    }
  }

  return signals;
}

function getChartRange(history: number[]) {
  const min = Math.min(0, ...history);
  const max = Math.max(1, ...history);

  if (max - min < 0.001) {
    return { min: min - 0.5, max: max + 0.5 };
  }

  return { min, max };
}

function getYForValue(value: number, min: number, max: number, height: number) {
  return height - ((value - min) / (max - min)) * height;
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
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
