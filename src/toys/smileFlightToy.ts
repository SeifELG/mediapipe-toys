import type { FaceFrame, Toy } from "../types";

export function createSmileFlightToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const readout = document.createElement("div");

  let mounted = false;
  let latestFrame: FaceFrame | null = null;
  let animationFrameId = 0;
  let startTime = performance.now();
  let latestSmileScore = 0;

  return {
    id: "smile-flight",
    label: "Smile Flight",
    mount(container) {
      const shell = document.createElement("section");

      mounted = true;
      startTime = performance.now();
      shell.className = "toy-stage";
      canvas.className = "toy-canvas";
      readout.className = "toy-readout";
      readout.textContent = "Enable camera, then smile to fly upward.";
      shell.append(canvas, readout);
      container.replaceChildren(shell);
      animationFrameId = requestAnimationFrame(draw);
    },
    update(frame) {
      latestFrame = frame;
      latestSmileScore = getSmileScore(frame);
    },
    unmount() {
      mounted = false;
      cancelAnimationFrame(animationFrameId);
    }
  };

  function draw(now = performance.now()) {
    if (!mounted) {
      return;
    }

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = window.devicePixelRatio || 1;

    if (!width || !height) {
      animationFrameId = requestAnimationFrame(draw);
      return;
    }

    const scaledWidth = Math.round(width * pixelRatio);
    const scaledHeight = Math.round(height * pixelRatio);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    const smileProgress = clamp(latestSmileScore / 0.85, 0, 1);
    const playerX = width * 0.24;
    const playerY = lerp(height * 0.82, height * 0.18, smileProgress);
    const elapsed = (now - startTime) / 1000;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawBackground(width, height);
    drawPipes(width, height, elapsed);
    drawPlayer(playerX, playerY, smileProgress);

    readout.textContent = latestFrame?.hasFace
      ? `smile ${latestSmileScore.toFixed(3)} | mouthSmileLeft ${(latestFrame.blendshapes.get("mouthSmileLeft") ?? 0).toFixed(3)} | mouthSmileRight ${(latestFrame.blendshapes.get("mouthSmileRight") ?? 0).toFixed(3)}`
      : "No face yet.";
    animationFrameId = requestAnimationFrame(draw);
  }

  function drawBackground(width: number, height: number) {
    const gradient = context.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, "#123047");
    gradient.addColorStop(1, "#182116");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.fillStyle = "rgba(247, 243, 234, 0.08)";

    for (let i = 0; i < 7; i += 1) {
      const x = ((i * 173 + performance.now() * 0.018) % (width + 120)) - 80;
      const y = 42 + (i % 3) * 56;

      context.beginPath();
      context.ellipse(x, y, 42, 12, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPipes(width: number, height: number, elapsed: number) {
    const spacing = 260;
    const speed = 120;
    const pipeWidth = 58;
    const gapHeight = 180;
    const pipeCount = Math.ceil(width / spacing) + 4;
    const totalSpan = spacing * pipeCount;
    const offset = (elapsed * speed) % totalSpan;

    context.fillStyle = "#3fbf82";
    context.strokeStyle = "rgba(0, 0, 0, 0.28)";
    context.lineWidth = 3;

    for (let i = 0; i < pipeCount; i += 1) {
      const x = width + i * spacing - offset;
      const gapCenter = height * getPipeGapCenter(i);
      const topHeight = gapCenter - gapHeight / 2;
      const bottomY = gapCenter + gapHeight / 2;

      drawPipe(x, 0, pipeWidth, topHeight);
      drawPipe(x, bottomY, pipeWidth, height - bottomY);
    }
  }

  function getPipeGapCenter(index: number) {
    const centers = [0.42, 0.62, 0.36, 0.54, 0.72, 0.48, 0.30];

    return centers[index % centers.length];
  }

  function drawPipe(x: number, y: number, width: number, height: number) {
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
  }

  function drawPlayer(x: number, y: number, smileProgress: number) {
    context.save();
    context.translate(x, y);
    context.rotate((smileProgress - 0.5) * -0.32);

    context.fillStyle = "#f7d154";
    context.beginPath();
    context.arc(0, 0, 26, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#121819";
    context.beginPath();
    context.arc(9, -8, 4, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "#121819";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(2, 4, 10, 0.1, Math.PI - 0.1);
    context.stroke();

    context.fillStyle = "rgba(247, 243, 234, 0.55)";
    context.beginPath();
    context.ellipse(-18, 4, 14, 7, -0.45, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function getSmileScore(frame: FaceFrame) {
  const left = frame.blendshapes.get("mouthSmileLeft") ?? 0;
  const right = frame.blendshapes.get("mouthSmileRight") ?? 0;

  return (left + right) / 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function getCanvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas rendering is not supported in this browser.");
  }

  return context;
}
