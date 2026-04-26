import type { FaceFrame, Toy } from "../types";

export function createHeadPoseBallToy(): Toy {
  const canvas = document.createElement("canvas");
  const context = getCanvasContext(canvas);
  const readout = document.createElement("div");
  const calibrationReadout = document.createElement("div");
  const calibration = {
    centerYaw: 0,
    centerPitch: 0,
    leftYaw: -30,
    rightYaw: 30,
    upPitch: 25,
    downPitch: -25
  };

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
      calibrationReadout.className = "toy-readout";
      readout.textContent = "Enable camera, then turn or nod your head.";
      shell.append(createCalibrationControls(), canvas, readout, calibrationReadout);
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
    const xProgress = getEndpointProgress(
      pose?.yawDegrees ?? calibration.centerYaw,
      calibration.leftYaw,
      calibration.rightYaw
    );
    const yProgress = getEndpointProgress(
      pose?.pitchDegrees ?? calibration.centerPitch,
      calibration.upPitch,
      calibration.downPitch
    );
    const x = lerp(width * 0.12, width * 0.88, xProgress);
    const y = lerp(height * 0.12, height * 0.88, yProgress);

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
    calibrationReadout.textContent = `limits: left ${calibration.leftYaw.toFixed(1)} | center ${calibration.centerYaw.toFixed(1)}, ${calibration.centerPitch.toFixed(1)} | right ${calibration.rightYaw.toFixed(1)} | up ${calibration.upPitch.toFixed(1)} | down ${calibration.downPitch.toFixed(1)}`;
  }

  function createCalibrationControls() {
    const controls = document.createElement("div");

    controls.className = "toy-controls";
    controls.append(
      createCalibrationButton("Set center", () => {
        const pose = latestFrame?.pose;

        if (!pose) {
          return;
        }

        calibration.centerYaw = pose.yawDegrees;
        calibration.centerPitch = pose.pitchDegrees;
        draw();
      }),
      createCalibrationButton("Set left", () => {
        const pose = latestFrame?.pose;

        if (!pose) {
          return;
        }

        calibration.leftYaw = pose.yawDegrees;
        draw();
      }),
      createCalibrationButton("Set right", () => {
        const pose = latestFrame?.pose;

        if (!pose) {
          return;
        }

        calibration.rightYaw = pose.yawDegrees;
        draw();
      }),
      createCalibrationButton("Set up", () => {
        const pose = latestFrame?.pose;

        if (!pose) {
          return;
        }

        calibration.upPitch = pose.pitchDegrees;
        draw();
      }),
      createCalibrationButton("Set down", () => {
        const pose = latestFrame?.pose;

        if (!pose) {
          return;
        }

        calibration.downPitch = pose.pitchDegrees;
        draw();
      }),
      createCalibrationButton("Reset", () => {
        calibration.centerYaw = 0;
        calibration.centerPitch = 0;
        calibration.leftYaw = -30;
        calibration.rightYaw = 30;
        calibration.upPitch = 25;
        calibration.downPitch = -25;
        draw();
      })
    );

    return controls;
  }

  function createCalibrationButton(label: string, onClick: () => void) {
    const button = document.createElement("button");

    button.className = "toy-button";
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);

    return button;
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

function getEndpointProgress(value: number, start: number, end: number) {
  if (Math.abs(end - start) < 0.001) {
    return 0.5;
  }

  return clamp((value - start) / (end - start), 0, 1);
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
