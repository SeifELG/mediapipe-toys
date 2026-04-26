import type { Matrix } from "@mediapipe/tasks-vision";
import type { PoseSignals } from "../types";

export const blendshapeNames = [
  "_neutral",
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight"
];

export const transformSignalNames = [
  "poseYawDegrees",
  "posePitchDegrees",
  "poseRollDegrees",
  "translationX",
  "translationY",
  "translationZ",
  "scaleX",
  "scaleY",
  "scaleZ",
  "matrix00",
  "matrix01",
  "matrix02",
  "matrix03",
  "matrix10",
  "matrix11",
  "matrix12",
  "matrix13",
  "matrix20",
  "matrix21",
  "matrix22",
  "matrix23",
  "matrix30",
  "matrix31",
  "matrix32",
  "matrix33"
];

export function getTransformSignals(matrix?: Matrix) {
  const signals = new Map<string, number>();

  if (!matrix || matrix.data.length < 16) {
    return { signals, pose: undefined };
  }

  const m = matrix.data;
  const scaleX = Math.hypot(m[0], m[1], m[2]);
  const scaleY = Math.hypot(m[4], m[5], m[6]);
  const scaleZ = Math.hypot(m[8], m[9], m[10]);
  const r01 = m[4] / scaleY;
  const r11 = m[5] / scaleY;
  const r20 = m[2] / scaleX;
  const r21 = m[6] / scaleY;
  const r22 = m[10] / scaleZ;
  const pitchDegrees = radiansToDegrees(Math.atan2(-r21, Math.hypot(r20, r22)));
  const yawDegrees = radiansToDegrees(Math.atan2(r20, r22));
  const rollDegrees = radiansToDegrees(Math.atan2(r01, r11));
  const pose: PoseSignals = {
    yawDegrees,
    pitchDegrees,
    rollDegrees,
    translationX: m[12],
    translationY: m[13],
    translationZ: m[14],
    scaleX,
    scaleY,
    scaleZ
  };

  signals.set("poseYawDegrees", pose.yawDegrees);
  signals.set("posePitchDegrees", pose.pitchDegrees);
  signals.set("poseRollDegrees", pose.rollDegrees);
  signals.set("translationX", pose.translationX);
  signals.set("translationY", pose.translationY);
  signals.set("translationZ", pose.translationZ);
  signals.set("scaleX", pose.scaleX);
  signals.set("scaleY", pose.scaleY);
  signals.set("scaleZ", pose.scaleZ);

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      signals.set(`matrix${row}${column}`, m[row * 4 + column]);
    }
  }

  return { signals, pose };
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
