import type { FaceFrame, Toy } from "../types";

export function createHeadPoseBallToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const readout = document.createElement("div");

  let mounted = false;
  let latestFrame: FaceFrame | null = null;

  return {
    id: "head-pose-ball",
    label: "Head Pose Ball",
    mount(container) {
      const shell = document.createElement("section");

      mounted = true;
      shell.className = "toy-stage";
      canvas.className = "toy-canvas";
      readout.className = "toy-readout";
      readout.textContent = "Enable camera, then turn or nod your head.";
      shell.append(canvas, readout);
      container.replaceChildren(shell);
      draw();
    },
    update(frame) {
      latestFrame = frame;
      draw();
    },
    unmount() {
      mounted = false;
    }
  };

  function draw() {
    if (!mounted) {
      return;
    }

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

    const pose = latestFrame?.pose;
    const yaw = clamp(pose?.yawDegrees ?? 0, -30, 30);
    const pitch = clamp(pose?.pitchDegrees ?? 0, -25, 25);
    const x = width / 2 + (yaw / 30) * (width * 0.38);
    const y = height / 2 + (pitch / 25) * (height * 0.34);

    context.fillStyle = "#f7d154";
    context.beginPath();
    context.arc(x, y, 28, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(247, 243, 234, 0.5)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width / 2, 0);
    context.lineTo(width / 2, height);
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();

    readout.textContent = pose
      ? `yaw ${pose.yawDegrees.toFixed(1)} deg | pitch ${pose.pitchDegrees.toFixed(1)} deg | roll ${pose.rollDegrees.toFixed(1)} deg`
      : "No face pose yet.";
  }

  function drawGrid(width: number, height: number) {
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = 0; x <= width; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y <= height; y += 48) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }
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
