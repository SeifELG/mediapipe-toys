import {
  DrawingUtils,
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
  type Landmark,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";
import type { Toy } from "../types";

const maxHistoryLength = 140;
const depthLandmarks = [
  { index: 0, name: "wrist z" },
  { index: 4, name: "thumb tip z" },
  { index: 8, name: "index tip z" },
  { index: 12, name: "middle tip z" },
  { index: 16, name: "ring tip z" },
  { index: 20, name: "pinky tip z" }
];
const palmIndexes = [0, 5, 9, 13, 17];
const fingertipIndexes = [4, 8, 12, 16, 20];

type SignalRow = {
  name: string;
  chart: HTMLCanvasElement;
  chartContext: CanvasRenderingContext2D;
  value: HTMLElement;
  history: number[];
};

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export function createHandPoseDebugToy(video: HTMLVideoElement): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const drawingUtils = new DrawingUtils(context);
  const readout = document.createElement("div");
  const signalList = document.createElement("div");
  const signalRows = createSignalRows(signalList);

  let mounted = false;
  let gestureRecognizer: GestureRecognizer | null = null;
  let gestureRecognizerPromise: Promise<GestureRecognizer> | null = null;
  let latestResult: GestureRecognizerResult | null = null;

  return {
    id: "hand-pose-debug",
    label: "Hand Pose Debug",
    mount(container) {
      const shell = document.createElement("section");
      const workspace = document.createElement("div");
      const canvasColumn = document.createElement("div");
      const panel = document.createElement("section");
      const heading = document.createElement("div");
      const title = document.createElement("h2");
      const count = document.createElement("span");

      mounted = true;
      shell.className = "toy-stage";
      workspace.className = "workspace";
      canvasColumn.className = "camera-column";
      canvas.className = "toy-canvas mask-canvas";
      readout.className = "toy-readout";
      panel.className = "blendshape-panel";
      heading.className = "panel-heading";
      signalList.className = "score-list";
      title.textContent = "Hand Pose Signals";
      count.textContent = "raw landmark z + derived palm pose";
      readout.textContent = "Loading gesture recognizer...";

      heading.append(title, count);
      panel.append(heading, signalList);
      canvasColumn.append(canvas, readout);
      workspace.append(canvasColumn, panel);
      shell.append(workspace);
      container.replaceChildren(shell);
      setupGestureRecognizer();
      drawEmpty();
    },
    update(frame) {
      if (!mounted) {
        return;
      }

      draw(frame.timestamp);
    },
    unmount() {
      mounted = false;
    }
  };

  async function setupGestureRecognizer() {
    if (gestureRecognizer) {
      return gestureRecognizer;
    }

    if (!gestureRecognizerPromise) {
      gestureRecognizerPromise = createGestureRecognizer();
    }

    try {
      gestureRecognizer = await gestureRecognizerPromise;

      if (mounted) {
        readout.textContent = "Show one hand to inspect raw z depth and palm rotation.";
      }
    } catch (error) {
      console.error(error);

      if (mounted) {
        readout.textContent = "Gesture recognizer failed to load.";
      }
    }

    return gestureRecognizer;
  }

  function draw(timestamp: number) {
    const size = syncCanvasSize(canvas);

    if (!size) {
      return;
    }

    if (gestureRecognizer && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      latestResult = gestureRecognizer.recognizeForVideo(video, timestamp);
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    drawBackdrop(canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    for (const landmarks of latestResult?.landmarks ?? []) {
      drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
        color: "#74d7ff",
        lineWidth: 4
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#f7f3ea",
        lineWidth: 1,
        radius: 4
      });
    }

    context.restore();
    updateSignals(latestResult);
  }

  function drawEmpty() {
    const size = syncCanvasSize(canvas);

    if (!size) {
      return;
    }

    drawBackdrop(canvas.width, canvas.height);
  }

  function updateSignals(result: GestureRecognizerResult | null) {
    const landmarks = result?.landmarks[0] ?? [];
    const worldLandmarks = result?.worldLandmarks[0] ?? [];
    const hand = result?.handedness[0]?.[0];
    const pose = getPalmPose(worldLandmarks.length ? worldLandmarks : landmarks);
    const palmZ = averageLandmarkZ(landmarks, palmIndexes);
    const fingertipZ = averageLandmarkZ(landmarks, fingertipIndexes);
    const fingertipSpreadZ = getLandmarkZSpread(landmarks, fingertipIndexes);

    readout.textContent = gestureRecognizer
      ? `Hands: ${result?.landmarks.length ?? 0} | primary: ${hand?.categoryName ?? "unknown"}`
      : "Loading gesture recognizer...";

    setSignal("handednessConfidence", hand?.score ?? 0);
    setSignal("palmZ", palmZ);
    setSignal("fingertipAverageZ", fingertipZ);
    setSignal("fingertipSpreadZ", fingertipSpreadZ);
    setSignal("palmYawDegrees", pose?.yawDegrees ?? 0);
    setSignal("palmPitchDegrees", pose?.pitchDegrees ?? 0);
    setSignal("palmRollDegrees", pose?.rollDegrees ?? 0);

    for (const landmark of depthLandmarks) {
      setSignal(landmark.name, landmarks[landmark.index]?.z ?? 0);
    }
  }

  function setSignal(name: string, nextValue: number) {
    const signal = signalRows.get(name);

    if (!signal) {
      return;
    }

    signal.history.push(nextValue);

    if (signal.history.length > maxHistoryLength) {
      signal.history.shift();
    }

    signal.value.textContent = nextValue.toFixed(3);
    drawSignalChart(signal);
  }

  function drawBackdrop(width: number, height: number) {
    context.fillStyle = "#070b0d";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = 0; x <= width; x += 56) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y <= height; y += 56) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }
}

function createSignalRows(signalList: HTMLDivElement) {
  const names = [
    "handednessConfidence",
    "palmZ",
    "fingertipAverageZ",
    "fingertipSpreadZ",
    "palmYawDegrees",
    "palmPitchDegrees",
    "palmRollDegrees",
    ...depthLandmarks.map((landmark) => landmark.name)
  ];
  const signals = new Map<string, SignalRow>();

  for (const name of names) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const chart = document.createElement("canvas");
    const value = document.createElement("strong");
    const chartContext = getCanvasContext(chart);
    const signal = {
      name,
      chart,
      chartContext,
      value,
      history: [] as number[]
    };

    row.className = "score-row";
    label.textContent = name;
    chart.width = 220;
    chart.height = 34;
    value.textContent = "0.000";
    row.append(label, chart, value);
    signalList.append(row);
    signals.set(name, signal);
  }

  return signals;
}

async function createGestureRecognizer() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  return GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });
}

function getPalmPose(landmarks: Array<Vec3 | Landmark | NormalizedLandmark>) {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  if (!wrist || !indexMcp || !middleMcp || !pinkyMcp) {
    return null;
  }

  const right = normalize(subtract(pinkyMcp, indexMcp));
  const upSeed = normalize(subtract(middleMcp, wrist));

  if (!right || !upSeed) {
    return null;
  }

  const normal = normalize(cross(right, upSeed));

  if (!normal) {
    return null;
  }

  const up = normalize(cross(normal, right));

  if (!up) {
    return null;
  }

  return {
    yawDegrees: radiansToDegrees(Math.atan2(normal.x, normal.z)),
    pitchDegrees: radiansToDegrees(Math.atan2(-normal.y, Math.hypot(normal.x, normal.z))),
    rollDegrees: radiansToDegrees(Math.atan2(right.y, right.x))
  };
}

function averageLandmarkZ(landmarks: NormalizedLandmark[], indexes: number[]) {
  const values = indexes
    .map((index) => landmarks[index]?.z)
    .filter((value): value is number => typeof value === "number");

  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLandmarkZSpread(landmarks: NormalizedLandmark[], indexes: number[]) {
  const values = indexes
    .map((index) => landmarks[index]?.z)
    .filter((value): value is number => typeof value === "number");

  if (!values.length) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
}

function drawSignalChart(signal: SignalRow) {
  const { chart, chartContext, history } = signal;
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

function getChartRange(history: number[]) {
  const min = Math.min(0, ...history);
  const max = Math.max(0, ...history);

  if (max - min < 0.001) {
    return { min: min - 0.5, max: max + 0.5 };
  }

  const padding = (max - min) * 0.12;

  return { min: min - padding, max: max + padding };
}

function getYForValue(value: number, min: number, max: number, height: number) {
  return height - ((value - min) / (max - min)) * height;
}

function subtract(a: Vec3, b: Vec3) {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
}

function cross(a: Vec3, b: Vec3) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(vector: Vec3) {
  const length = Math.hypot(vector.x, vector.y, vector.z);

  if (length < 0.000001) {
    return null;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function syncCanvasSize(canvas: HTMLCanvasElement) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = window.devicePixelRatio || 1;

  if (!width || !height) {
    return null;
  }

  const scaledWidth = Math.round(width * pixelRatio);
  const scaledHeight = Math.round(height * pixelRatio);

  if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
  }

  return { width, height };
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not supported in this browser.");
  }

  return context;
}
