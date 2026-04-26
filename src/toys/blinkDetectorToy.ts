import type { FaceFrame, Toy } from "../types";

type Phase = "open" | "blink" | "live";

const openCalibrationMs = 2000;
const requiredBlinkSamples = 5;
const maxHistoryLength = 160;

export function createBlinkDetectorToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const title = document.createElement("h2");
  const status = document.createElement("div");
  const readout = document.createElement("div");
  const controls = document.createElement("div");
  const openSamples: number[] = [];
  const blinkPeaks: number[] = [];
  const history: number[] = [];

  let mounted = false;
  let phase: Phase = "open";
  let phaseStartedAt = 0;
  let openBaseline = 0;
  let blinkBaseline = 0;
  let threshold = 0.5;
  let blinkCount = 0;
  let armed = true;

  return {
    id: "blink-detector",
    label: "Blink Detector",
    mount(container) {
      const shell = document.createElement("section");
      const panel = document.createElement("div");

      mounted = true;
      shell.className = "toy-stage";
      panel.className = "toy-panel";
      canvas.className = "toy-canvas blink-canvas";
      controls.className = "toy-controls";
      status.className = "toy-readout";
      readout.className = "toy-readout";
      title.textContent = "Blink Detector";
      controls.replaceChildren(
        createButton("Restart calibration", startOpenCalibration),
        createButton("Skip to live", () => {
          phase = "live";
          threshold = 0.5;
          status.textContent = "Live mode with default threshold.";
        })
      );
      panel.append(title, status, controls, readout);
      shell.append(panel, canvas);
      container.replaceChildren(shell);
      startOpenCalibration();
      draw(0);
    },
    update(frame) {
      if (!mounted) {
        return;
      }

      updateWithScore(getBlinkScore(frame), performance.now());
    },
    unmount() {
      mounted = false;
    }
  };

  function startOpenCalibration() {
    phase = "open";
    phaseStartedAt = performance.now();
    openSamples.length = 0;
    blinkPeaks.length = 0;
    history.length = 0;
    openBaseline = 0;
    blinkBaseline = 0;
    threshold = 0.5;
    blinkCount = 0;
    armed = true;
    status.textContent = "Keep your eyes open.";
  }

  function updateWithScore(score: number, now: number) {
    history.push(score);

    if (history.length > maxHistoryLength) {
      history.shift();
    }

    if (phase === "open") {
      openSamples.push(score);

      const elapsed = now - phaseStartedAt;

      if (elapsed >= openCalibrationMs) {
        openBaseline = median(openSamples);
        phase = "blink";
        status.textContent = `Open baseline set to ${openBaseline.toFixed(3)}. Blink ${requiredBlinkSamples} times.`;
      } else {
        status.textContent = `Keep eyes open: ${Math.ceil((openCalibrationMs - elapsed) / 1000)}s`;
      }
    } else if (phase === "blink") {
      if (score > openBaseline + 0.08 && armed) {
        blinkPeaks.push(score);
        armed = false;
      }

      if (score <= openBaseline + 0.04) {
        armed = true;
      }

      status.textContent = `Blink calibration: ${blinkPeaks.length}/${requiredBlinkSamples}`;

      if (blinkPeaks.length >= requiredBlinkSamples) {
        blinkBaseline = median(blinkPeaks);
        threshold = openBaseline + (blinkBaseline - openBaseline) * 0.5;
        phase = "live";
        blinkCount = 0;
        armed = true;
        status.textContent = "Live blink detection.";
      }
    } else if (phase === "live") {
      if (score > threshold && armed) {
        blinkCount += 1;
        armed = false;
      }

      if (score <= threshold) {
        armed = true;
      }
    }

    readout.textContent = `score ${score.toFixed(3)} | open ${openBaseline.toFixed(3)} | blink ${blinkBaseline.toFixed(3)} | threshold ${threshold.toFixed(3)} | count ${blinkCount}`;
    draw(score);
  }

  function draw(score: number) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;

    if (!width || !height) {
      return;
    }

    const scaledWidth = Math.round(width * pixelRatio);
    const scaledHeight = Math.round(height * pixelRatio);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = phase === "live" && score > threshold ? "#3d1717" : "#121819";
    context.fillRect(0, 0, width, height);

    drawHorizontalLine(width, height, openBaseline, "rgba(247, 243, 234, 0.35)");
    drawHorizontalLine(width, height, threshold, "#f7d154");
    drawHistory(width, height);

    context.fillStyle = "#f7d154";
    context.font = "700 28px system-ui, sans-serif";
    context.fillText(phase === "live" && score > threshold ? "BLINK" : phase.toUpperCase(), 24, 44);
  }

  function drawHistory(width: number, height: number) {
    if (history.length < 2) {
      return;
    }

    context.strokeStyle = "#74d7ff";
    context.lineWidth = 3;
    context.beginPath();

    history.forEach((value, index) => {
      const x = (index / (maxHistoryLength - 1)) * width;
      const y = getY(value, height);

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();
  }

  function drawHorizontalLine(width: number, height: number, value: number, color: string) {
    const y = getY(value, height);

    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  function createButton(label: string, onClick: () => void) {
    const button = document.createElement("button");

    button.className = "toy-button";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);

    return button;
  }
}

function getBlinkScore(frame: FaceFrame) {
  const left = frame.blendshapes.get("eyeBlinkLeft") ?? 0;
  const right = frame.blendshapes.get("eyeBlinkRight") ?? 0;

  return (left + right) / 2;
}

function getY(value: number, height: number) {
  return height - clamp(value, 0, 1) * height;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not supported in this browser.");
  }

  return context;
}
