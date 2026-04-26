import type { FaceFrame, Toy } from "../types";

type Gate = {
  x: number;
  gapCenter: number;
  scored: boolean;
};

export function createSmileFlightToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const readout = document.createElement("div");
  const gates: Gate[] = [];

  let mounted = false;
  let latestFrame: FaceFrame | null = null;
  let animationFrameId = 0;
  let lastFrameTime = performance.now();
  let latestSmileScore = 0;
  let score = 0;
  let collisionUntil = 0;

  return {
    id: "smile-flight",
    label: "Smile Flight",
    mount(container) {
      const shell = document.createElement("section");

      mounted = true;
      latestSmileScore = 0;
      score = 0;
      collisionUntil = 0;
      gates.length = 0;
      lastFrameTime = performance.now();
      shell.className = "toy-stage";
      canvas.className = "toy-canvas";
      readout.className = "toy-readout";
      readout.textContent = "Enable camera, then smile to move the ball upward.";
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

    const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
    const scaledWidth = Math.round(width * pixelRatio);
    const scaledHeight = Math.round(height * pixelRatio);

    lastFrameTime = now;

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
      resetGates(width);
    }

    const smileProgress = clamp(latestSmileScore / 0.85, 0, 1);
    const ball = {
      x: width * 0.22,
      y: lerp(height * 0.82, height * 0.18, smileProgress),
      radius: 24
    };

    updateGates(width, deltaSeconds);

    const collided = hasCollision(ball.x, ball.y, ball.radius, height);

    if (collided) {
      collisionUntil = now + 180;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawBackground(width, height, now < collisionUntil);
    drawGates(height);
    drawBall(ball.x, ball.y, ball.radius);

    readout.textContent = latestFrame?.hasFace
      ? `score ${score} | smile ${latestSmileScore.toFixed(3)} | left ${(latestFrame.blendshapes.get("mouthSmileLeft") ?? 0).toFixed(3)} | right ${(latestFrame.blendshapes.get("mouthSmileRight") ?? 0).toFixed(3)}`
      : "No face yet.";
    animationFrameId = requestAnimationFrame(draw);
  }

  function resetGates(width: number) {
    const spacing = getGateSpacing();

    gates.length = 0;

    for (let i = 0; i < 4; i += 1) {
      gates.push({
        x: width + i * spacing + 140,
        gapCenter: getGapCenter(i),
        scored: false
      });
    }
  }

  function updateGates(width: number, deltaSeconds: number) {
    const speed = 140;
    const spacing = getGateSpacing();
    const gateWidth = getGateWidth();

    if (gates.length === 0) {
      resetGates(width);
      return;
    }

    for (const gate of gates) {
      gate.x -= speed * deltaSeconds;

      if (!gate.scored && gate.x + gateWidth < width * 0.22) {
        gate.scored = true;
        score += 1;
      }

      if (gate.x + gateWidth < 0) {
        const rightmostX = Math.max(...gates.map((currentGate) => currentGate.x));

        gate.x = rightmostX + spacing;
        gate.gapCenter = getGapCenter(score + gates.indexOf(gate));
        gate.scored = false;
      }
    }
  }

  function drawBackground(width: number, height: number, collided: boolean) {
    context.fillStyle = collided ? "#411717" : "#121819";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;

    for (let x = 0; x <= width; x += 56) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  function drawGates(height: number) {
    const gateWidth = getGateWidth();
    const gapHeight = getGapHeight(height);

    context.fillStyle = "#3fbf82";
    context.strokeStyle = "rgba(0, 0, 0, 0.32)";
    context.lineWidth = 3;

    for (const gate of gates) {
      const gapCenterY = height * gate.gapCenter;
      const topHeight = gapCenterY - gapHeight / 2;
      const bottomY = gapCenterY + gapHeight / 2;

      drawGatePart(gate.x, 0, gateWidth, topHeight);
      drawGatePart(gate.x, bottomY, gateWidth, height - bottomY);
    }
  }

  function drawGatePart(x: number, y: number, width: number, height: number) {
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
  }

  function drawBall(x: number, y: number, radius: number) {
    context.fillStyle = "#f7d154";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function hasCollision(ballX: number, ballY: number, ballRadius: number, height: number) {
    const gateWidth = getGateWidth();
    const gapHeight = getGapHeight(height);

    for (const gate of gates) {
      const overlapsX = ballX + ballRadius > gate.x && ballX - ballRadius < gate.x + gateWidth;

      if (!overlapsX) {
        continue;
      }

      const gapCenterY = height * gate.gapCenter;
      const gapTop = gapCenterY - gapHeight / 2;
      const gapBottom = gapCenterY + gapHeight / 2;

      if (ballY - ballRadius < gapTop || ballY + ballRadius > gapBottom) {
        return true;
      }
    }

    return false;
  }

  function getGapCenter(index: number) {
    const centers = [0.42, 0.62, 0.36, 0.56, 0.70, 0.48];

    return centers[index % centers.length];
  }
}

function getSmileScore(frame: FaceFrame) {
  const left = frame.blendshapes.get("mouthSmileLeft") ?? 0;
  const right = frame.blendshapes.get("mouthSmileRight") ?? 0;

  return (left + right) / 2;
}

function getGateSpacing() {
  return 360;
}

function getGateWidth() {
  return 64;
}

function getGapHeight(canvasHeight: number) {
  return Math.max(220, canvasHeight * 0.36);
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
