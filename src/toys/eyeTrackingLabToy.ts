import type { FaceFrame, Toy } from "../types";

type CalibrationSample = {
  features: number[];
  targetX: number;
  targetY: number;
};

type Model = {
  xWeights: number[];
  yWeights: number[];
};

type Phase = "idle" | "calibrating" | "live";

const calibrationMsPerTarget = 2400;
const settleMsPerTarget = 450;
const targets = [
  { x: 0.16, y: 0.18 },
  { x: 0.5, y: 0.18 },
  { x: 0.84, y: 0.18 },
  { x: 0.16, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.84, y: 0.5 },
  { x: 0.16, y: 0.82 },
  { x: 0.5, y: 0.82 },
  { x: 0.84, y: 0.82 }
];

export function createEyeTrackingLabToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const title = document.createElement("h2");
  const status = document.createElement("div");
  const readout = document.createElement("div");
  const controls = document.createElement("div");
  const samples: CalibrationSample[] = [];

  let mounted = false;
  let phase: Phase = "idle";
  let targetIndex = 0;
  let targetStartedAt = 0;
  let model: Model | null = null;
  let prediction = { x: 0.5, y: 0.5 };
  let latestFrame: FaceFrame | null = null;

  return {
    id: "eye-tracking-lab",
    label: "Eye Tracking Lab",
    mount(container) {
      const shell = document.createElement("section");
      const panel = document.createElement("div");

      mounted = true;
      shell.className = "toy-stage";
      panel.className = "toy-panel";
      canvas.className = "toy-canvas";
      controls.className = "toy-controls";
      status.className = "toy-readout";
      readout.className = "toy-readout";
      title.textContent = "Eye Tracking Lab";
      controls.replaceChildren(
        createButton("Start 9-point calibration", startCalibration),
        createButton("Reset", reset)
      );
      panel.append(title, status, controls, readout);
      shell.append(panel, canvas);
      container.replaceChildren(shell);
      reset();
      draw();
    },
    update(frame) {
      if (!mounted) {
        return;
      }

      latestFrame = frame;
      updateFromFrame(frame, performance.now());
      draw();
    },
    unmount() {
      mounted = false;
    }
  };

  function reset() {
    phase = "idle";
    targetIndex = 0;
    samples.length = 0;
    model = null;
    prediction = { x: 0.5, y: 0.5 };
    status.textContent = "Start calibration, then keep looking at each dot while gently moving your head.";
    readout.textContent = "No calibration yet.";
  }

  function startCalibration() {
    phase = "calibrating";
    targetIndex = 0;
    targetStartedAt = performance.now();
    samples.length = 0;
    model = null;
    status.textContent = "Look at the dot. Move your head gently while keeping your eyes on it.";
  }

  function updateFromFrame(frame: FaceFrame, now: number) {
    const features = getFeatures(frame);

    if (!features) {
      readout.textContent = "No face signal yet.";
      return;
    }

    if (phase === "calibrating") {
      const target = targets[targetIndex];
      const elapsed = now - targetStartedAt;

      if (elapsed > settleMsPerTarget) {
        samples.push({
          features,
          targetX: target.x,
          targetY: target.y
        });
      }

      if (elapsed >= calibrationMsPerTarget) {
        targetIndex += 1;
        targetStartedAt = now;

        if (targetIndex >= targets.length) {
          model = fitModel(samples);
          phase = "live";
          status.textContent = "Live prediction. Move your head while looking at points on the screen.";
        }
      }
    }

    if (model) {
      prediction = {
        x: clamp(dot(model.xWeights, features), 0, 1),
        y: clamp(dot(model.yWeights, features), 0, 1)
      };
    }

    readout.textContent = `phase ${phase} | samples ${samples.length} | predicted ${prediction.x.toFixed(3)}, ${prediction.y.toFixed(3)} | eye ${features[1].toFixed(3)}, ${features[2].toFixed(3)} | yaw ${features[3].toFixed(3)} pitch ${features[4].toFixed(3)}`;
  }

  function draw() {
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
    context.fillStyle = "#121819";
    context.fillRect(0, 0, width, height);
    drawGrid(width, height);

    if (phase === "calibrating") {
      const target = targets[targetIndex];
      const elapsed = performance.now() - targetStartedAt;
      const progress = clamp(elapsed / calibrationMsPerTarget, 0, 1);

      drawTarget(target.x * width, target.y * height, progress);
      drawLabel(
        `target ${targetIndex + 1}/${targets.length}`,
        target.x * width + 24,
        target.y * height - 24
      );
    }

    if (model) {
      drawPrediction(prediction.x * width, prediction.y * height);
    }

    if (phase === "idle" && latestFrame?.hasFace) {
      drawPrediction(prediction.x * width, prediction.y * height);
    }
  }

  function drawGrid(width: number, height: number) {
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (const target of targets) {
      context.beginPath();
      context.arc(target.x * width, target.y * height, 4, 0, Math.PI * 2);
      context.stroke();
    }

    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width / 2, height);
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
  }

  function drawTarget(x: number, y: number, progress: number) {
    context.strokeStyle = "rgba(247, 209, 84, 0.38)";
    context.lineWidth = 8;
    context.beginPath();
    context.arc(x, y, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    context.stroke();

    context.fillStyle = "#f7d154";
    context.beginPath();
    context.arc(x, y, 14, 0, Math.PI * 2);
    context.fill();
  }

  function drawPrediction(x: number, y: number) {
    context.strokeStyle = "#74d7ff";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(x, y, 22, 0, Math.PI * 2);
    context.stroke();

    context.fillStyle = "rgba(116, 215, 255, 0.24)";
    context.beginPath();
    context.arc(x, y, 9, 0, Math.PI * 2);
    context.fill();
  }

  function drawLabel(text: string, x: number, y: number) {
    context.fillStyle = "rgba(247, 243, 234, 0.82)";
    context.font = "700 18px system-ui, sans-serif";
    context.fillText(text, x, y);
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

function getFeatures(frame: FaceFrame) {
  if (!frame.hasFace || !frame.pose) {
    return null;
  }

  const eyeLookLeft =
    (frame.blendshapes.get("eyeLookOutLeft") ?? 0) +
    (frame.blendshapes.get("eyeLookInRight") ?? 0);
  const eyeLookRight =
    (frame.blendshapes.get("eyeLookInLeft") ?? 0) +
    (frame.blendshapes.get("eyeLookOutRight") ?? 0);
  const eyeLookUp =
    (frame.blendshapes.get("eyeLookUpLeft") ?? 0) +
    (frame.blendshapes.get("eyeLookUpRight") ?? 0);
  const eyeLookDown =
    (frame.blendshapes.get("eyeLookDownLeft") ?? 0) +
    (frame.blendshapes.get("eyeLookDownRight") ?? 0);
  const eyeX = eyeLookRight - eyeLookLeft;
  const eyeY = eyeLookDown - eyeLookUp;
  const faceCenter = getFaceCenter(frame);

  return [
    1,
    eyeX,
    eyeY,
    frame.pose.yawDegrees / 35,
    frame.pose.pitchDegrees / 35,
    frame.pose.rollDegrees / 35,
    faceCenter.x - 0.5,
    faceCenter.y - 0.5,
    frame.pose.translationX / 100,
    frame.pose.translationY / 100,
    frame.pose.translationZ / 100,
    frame.pose.scaleX / 10,
    frame.pose.scaleY / 10
  ];
}

function getFaceCenter(frame: FaceFrame) {
  if (frame.landmarks.length === 0) {
    return { x: 0.5, y: 0.5 };
  }

  const sum = frame.landmarks.reduce(
    (total, landmark) => ({
      x: total.x + landmark.x,
      y: total.y + landmark.y
    }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / frame.landmarks.length,
    y: sum.y / frame.landmarks.length
  };
}

function fitModel(samples: CalibrationSample[]): Model {
  const features = samples.map((sample) => sample.features);
  const targetX = samples.map((sample) => sample.targetX);
  const targetY = samples.map((sample) => sample.targetY);

  return {
    xWeights: fitRidgeRegression(features, targetX),
    yWeights: fitRidgeRegression(features, targetY)
  };
}

function fitRidgeRegression(features: number[][], target: number[]) {
  const featureCount = features[0]?.length ?? 0;
  const normalMatrix = Array.from({ length: featureCount }, () => Array(featureCount).fill(0));
  const normalTarget = Array(featureCount).fill(0);
  const ridge = 0.015;

  for (let row = 0; row < features.length; row += 1) {
    const vector = features[row];

    for (let i = 0; i < featureCount; i += 1) {
      normalTarget[i] += vector[i] * target[row];

      for (let j = 0; j < featureCount; j += 1) {
        normalMatrix[i][j] += vector[i] * vector[j];
      }
    }
  }

  for (let i = 1; i < featureCount; i += 1) {
    normalMatrix[i][i] += ridge;
  }

  return solveLinearSystem(normalMatrix, normalTarget);
}

function solveLinearSystem(matrix: number[][], target: number[]) {
  const size = target.length;
  const augmented = matrix.map((row, index) => [...row, target[index]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;

    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[bestRow][pivot])) {
        bestRow = row;
      }
    }

    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow], augmented[pivot]];

    const pivotValue = augmented[pivot][pivot] || 1e-8;

    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }

      const factor = augmented[row][pivot];

      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function dot(weights: number[], features: number[]) {
  return weights.reduce((total, weight, index) => total + weight * features[index], 0);
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
