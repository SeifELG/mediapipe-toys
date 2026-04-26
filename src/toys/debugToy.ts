import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import { blendshapeNames, transformSignalNames } from "../mediapipe/signals";
import type { FaceFrame, Toy } from "../types";

const maxHistoryLength = 140;

type ScoreRow = {
  name: string;
  chart: HTMLCanvasElement;
  chartContext: CanvasRenderingContext2D;
  value: HTMLElement;
  history: number[];
};

export function createDebugToy(video: HTMLVideoElement): Toy {
  const canvas = document.createElement("canvas");
  const canvasContext = getCanvasContext(canvas);
  const drawingUtils = new DrawingUtils(canvasContext);
  const emptyState = document.createElement("div");
  const faceCount = document.createElement("span");
  const scoreList = document.createElement("div");
  const scoreRows = createScoreRows(scoreList);

  let mounted = false;

  return {
    id: "debug",
    label: "Debug",
    mount(container) {
      mounted = true;
      container.replaceChildren(createDebugLayout(video, canvas, emptyState, faceCount, scoreList));
      syncCanvasToVideo(video, canvas);
    },
    update(frame) {
      if (!mounted) {
        return;
      }

      syncCanvasToVideo(video, canvas);
      drawFaceMesh(frame, canvas, canvasContext, drawingUtils);
      updateScores(frame, scoreRows);
      emptyState.hidden = frame.hasFace || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      faceCount.textContent = `Faces: ${frame.result.faceLandmarks.length}`;
    },
    unmount() {
      mounted = false;
    }
  };
}

function createDebugLayout(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  emptyState: HTMLDivElement,
  faceCount: HTMLSpanElement,
  scoreList: HTMLDivElement
) {
  const workspace = document.createElement("div");
  const cameraColumn = document.createElement("div");
  const stage = document.createElement("div");
  const statusbar = document.createElement("footer");
  const panel = document.createElement("section");
  const panelHeading = document.createElement("div");
  const title = document.createElement("h2");
  const count = document.createElement("span");

  workspace.className = "workspace";
  cameraColumn.className = "camera-column";
  stage.className = "stage";
  statusbar.className = "statusbar";
  panel.className = "blendshape-panel";
  panelHeading.className = "panel-heading";
  scoreList.className = "score-list";
  emptyState.className = "empty-state";
  panel.setAttribute("aria-label", "Face blendshape and transform scores");

  emptyState.textContent = "Camera preview will appear here";
  faceCount.textContent = "Faces: 0";
  title.textContent = "Face Signals";
  count.textContent = "77 live signals";

  stage.append(video, canvas, emptyState);
  statusbar.append(document.createElement("span"), faceCount);
  cameraColumn.append(stage, statusbar);
  panelHeading.append(title, count);
  panel.append(panelHeading, scoreList);
  workspace.append(cameraColumn, panel);

  return workspace;
}

function drawFaceMesh(
  frame: FaceFrame,
  canvas: HTMLCanvasElement,
  canvasContext: CanvasRenderingContext2D,
  drawingUtils: DrawingUtils
) {
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  for (const landmarks of frame.result.faceLandmarks) {
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      color: "rgba(73, 212, 255, 0.28)",
      lineWidth: 1
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
      color: "#ffcc4d",
      lineWidth: 2
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
      color: "#ffcc4d",
      lineWidth: 2
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, {
      color: "#ff6b7a",
      lineWidth: 3
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, {
      color: "#ff6b7a",
      lineWidth: 3
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
      color: "rgba(255, 255, 255, 0.7)",
      lineWidth: 1
    });
  }
}

function updateScores(frame: FaceFrame, scoreRows: ScoreRow[]) {
  for (const score of scoreRows) {
    const value = frame.blendshapes.get(score.name) ?? frame.transformSignals.get(score.name) ?? 0;

    score.history.push(value);

    if (score.history.length > maxHistoryLength) {
      score.history.shift();
    }

    score.value.textContent = value.toFixed(3);
    drawScoreChart(score);
  }
}

function createScoreRows(scoreList: HTMLDivElement) {
  return [...transformSignalNames, ...blendshapeNames].map((name) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const chart = document.createElement("canvas");
    const value = document.createElement("strong");
    const chartContext = getCanvasContext(chart);

    row.className = "score-row";
    label.textContent = name;
    chart.width = 220;
    chart.height = 34;
    value.textContent = "0.000";

    row.append(label, chart, value);
    scoreList.append(row);

    return {
      name,
      chart,
      chartContext,
      value,
      history: [] as number[]
    };
  });
}

function drawScoreChart(score: ScoreRow) {
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

function syncCanvasToVideo(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
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

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not supported in this browser.");
  }

  return context;
}
