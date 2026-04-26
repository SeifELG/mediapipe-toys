import { DrawingUtils, FaceLandmarker } from "@mediapipe/tasks-vision";
import type { FaceFrame, Toy } from "../types";

export function createMaskOnlyToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const drawingUtils = new DrawingUtils(context);
  const readout = document.createElement("div");

  let mounted = false;

  return {
    id: "mask-only",
    label: "Mask Only",
    mount(container) {
      const shell = document.createElement("section");

      mounted = true;
      shell.className = "toy-stage";
      canvas.className = "toy-canvas mask-canvas";
      readout.className = "toy-readout";
      readout.textContent = "Enable camera to draw the face mesh without the video image.";
      shell.append(canvas, readout);
      container.replaceChildren(shell);
      drawEmpty();
    },
    update(frame) {
      if (!mounted) {
        return;
      }

      draw(frame);
    },
    unmount() {
      mounted = false;
    }
  };

  function draw(frame: FaceFrame) {
    const size = syncCanvasSize(canvas);

    if (!size) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackdrop(canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    for (const landmarks of frame.result.faceLandmarks) {
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
        color: "rgba(73, 212, 255, 0.34)",
        lineWidth: 1
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
        color: "#f7d154",
        lineWidth: 2
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
        color: "#f7d154",
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
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LIPS, {
        color: "#7dffb2",
        lineWidth: 2
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
        color: "rgba(247, 243, 234, 0.82)",
        lineWidth: 2
      });
    }

    context.restore();
    readout.textContent = frame.hasFace
      ? `Faces: ${frame.result.faceLandmarks.length}`
      : "No face detected.";
  }

  function drawEmpty() {
    const size = syncCanvasSize(canvas);

    if (!size) {
      return;
    }

    drawBackdrop(canvas.width, canvas.height);
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
