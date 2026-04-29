import {
  DrawingUtils,
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
  type Landmark,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";
import type { FaceFrame, Toy } from "../types";

const keyLandmarks = [
  { index: 0, name: "wrist" },
  { index: 4, name: "thumb tip" },
  { index: 8, name: "index tip" },
  { index: 12, name: "middle tip" },
  { index: 16, name: "ring tip" },
  { index: 20, name: "pinky tip" }
];
const maxHistoryLength = 120;

type SignalRow = {
  row: HTMLDivElement;
  chart: HTMLCanvasElement;
  chartContext: CanvasRenderingContext2D;
  value: HTMLElement;
  history: number[];
};

export function createHandDebugToy(video: HTMLVideoElement): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const drawingUtils = new DrawingUtils(context);
  const readout = document.createElement("div");
  const detailPanel = document.createElement("div");
  const signalRows = new Map<string, SignalRow>();

  let mounted = false;
  let gestureRecognizer: GestureRecognizer | null = null;
  let gestureRecognizerPromise: Promise<GestureRecognizer> | null = null;
  let latestResult: GestureRecognizerResult | null = null;

  return {
    id: "hand-debug",
    label: "Hand Debug",
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
      detailPanel.className = "hand-detail-list";
      title.textContent = "Hand Debug";
      count.textContent = "GestureRecognizer";
      readout.textContent = "Loading gesture recognizer...";
      heading.append(title, count);
      panel.append(heading, detailPanel);
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
        readout.textContent = "Show one or both hands to inspect gestures and landmarks.";
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
        color: "#b68cff",
        lineWidth: 4
      });
      drawingUtils.drawLandmarks(landmarks, {
        color: "#f7f3ea",
        lineWidth: 1,
        radius: 4
      });
    }

    context.restore();
    updateDetails(latestResult);
  }

  function drawEmpty() {
    const size = syncCanvasSize(canvas);

    if (!size) {
      return;
    }

    drawBackdrop(canvas.width, canvas.height);
  }

  function updateDetails(result: GestureRecognizerResult | null) {
    const hands = result?.landmarks ?? [];
    const scrollTop = detailPanel.scrollTop;

    readout.textContent = gestureRecognizer
      ? `Hands: ${hands.length}`
      : "Loading gesture recognizer...";
    detailPanel.replaceChildren(
      ...hands.map((landmarks, index) =>
        createHandDetails(
          index,
          landmarks,
          result?.worldLandmarks[index] ?? [],
          result?.handedness[index] ?? [],
          result?.gestures[index] ?? []
        )
      )
    );

    if (hands.length === 0) {
      const empty = document.createElement("div");

      empty.className = "hand-detail-card";
      empty.textContent = "No hands detected.";
      detailPanel.append(empty);
    }

    detailPanel.scrollTop = scrollTop;
  }

  function createHandDetails(
    handIndex: number,
    landmarks: NormalizedLandmark[],
    worldLandmarks: Landmark[],
    handedness: Array<{ categoryName: string; score: number }>,
    gestures: Array<{ categoryName: string; score: number }>
  ) {
    const card = document.createElement("div");
    const title = document.createElement("h3");
    const gesture = gestures[0];
    const hand = handedness[0];
    const pinch2d = distance2d(landmarks[4], landmarks[8]);
    const pinch3d = worldLandmarks[4] && worldLandmarks[8]
      ? distance3d(worldLandmarks[4], worldLandmarks[8])
      : 0;

    card.className = "hand-detail-card";
    title.textContent = `Hand ${handIndex + 1}`;
    card.append(title);
    card.append(
      createTextLine("handedness", hand?.categoryName ?? "unknown"),
      createTextLine("gesture", gesture?.categoryName ?? "None"),
      updateSignal(`${handIndex}:handednessConfidence`, "handedness confidence", hand?.score ?? 0),
      updateSignal(`${handIndex}:gestureConfidence`, "gesture confidence", gesture?.score ?? 0),
      updateSignal(`${handIndex}:pinch2d`, "pinch image distance", pinch2d),
      updateSignal(`${handIndex}:pinchWorld`, "pinch world distance", pinch3d)
    );

    for (const landmark of keyLandmarks) {
      const imagePoint = landmarks[landmark.index];
      const worldPoint = worldLandmarks[landmark.index];

      if (imagePoint) {
        card.append(
          updateSignal(`${handIndex}:image:${landmark.index}:x`, `image ${landmark.name} x`, imagePoint.x),
          updateSignal(`${handIndex}:image:${landmark.index}:y`, `image ${landmark.name} y`, imagePoint.y),
          updateSignal(`${handIndex}:image:${landmark.index}:z`, `image ${landmark.name} z`, imagePoint.z)
        );
      }

      if (worldPoint) {
        card.append(
          updateSignal(`${handIndex}:world:${landmark.index}:x`, `world ${landmark.name} x`, worldPoint.x),
          updateSignal(`${handIndex}:world:${landmark.index}:y`, `world ${landmark.name} y`, worldPoint.y),
          updateSignal(`${handIndex}:world:${landmark.index}:z`, `world ${landmark.name} z`, worldPoint.z)
        );
      }
    }

    return card;
  }

  function createTextLine(label: string, value: string) {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");

    row.className = "hand-detail-row";
    labelElement.textContent = label;
    valueElement.textContent = value;
    row.append(labelElement, valueElement);

    return row;
  }

  function updateSignal(key: string, label: string, nextValue: number) {
    let signal = signalRows.get(key);

    if (!signal) {
      signal = createSignalRow(label);
      signalRows.set(key, signal);
    }

    signal.history.push(nextValue);

    if (signal.history.length > maxHistoryLength) {
      signal.history.shift();
    }

    signal.value.textContent = nextValue.toFixed(3);
    drawSignalChart(signal);

    return signal.row;
  }

  function createSignalRow(label: string): SignalRow {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    const chart = document.createElement("canvas");
    const value = document.createElement("strong");
    const chartContext = getCanvasContext(chart);

    row.className = "hand-signal-row";
    labelElement.textContent = label;
    chart.width = 180;
    chart.height = 30;
    value.textContent = "0.000";
    row.append(labelElement, chart, value);

    return {
      row,
      chart,
      chartContext,
      value,
      history: []
    };
  }

  function drawSignalChart(signal: SignalRow) {
    const { chart, chartContext, history } = signal;
    const width = chart.clientWidth;
    const height = chart.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;

    if (!width || !height) {
      return;
    }

    const scaledWidth = Math.round(width * pixelRatio);
    const scaledHeight = Math.round(height * pixelRatio);

    if (chart.width !== scaledWidth || chart.height !== scaledHeight) {
      chart.width = scaledWidth;
      chart.height = scaledHeight;
    }

    const range = getChartRange(history);

    chartContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    chartContext.clearRect(0, 0, width, height);
    chartContext.fillStyle = "rgba(255, 255, 255, 0.035)";
    chartContext.fillRect(0, 0, width, height);
    chartContext.strokeStyle = "rgba(255, 255, 255, 0.12)";
    chartContext.lineWidth = 1;
    chartContext.beginPath();
    chartContext.moveTo(0, getYForValue(0, range.min, range.max, height));
    chartContext.lineTo(width, getYForValue(0, range.min, range.max, height));
    chartContext.stroke();

    if (history.length < 2) {
      return;
    }

    chartContext.strokeStyle = "#74d7ff";
    chartContext.lineWidth = 2;
    chartContext.beginPath();

    history.forEach((value, index) => {
      const x = (index / (maxHistoryLength - 1)) * width;
      const y = getYForValue(value, range.min, range.max, height);

      if (index === 0) {
        chartContext.moveTo(x, y);
      } else {
        chartContext.lineTo(x, y);
      }
    });

    chartContext.stroke();
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

function distance2d(a?: NormalizedLandmark, b?: NormalizedLandmark) {
  if (!a || !b) {
    return 0;
  }

  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3d(a?: Landmark, b?: Landmark) {
  if (!a || !b) {
    return 0;
  }

  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
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
