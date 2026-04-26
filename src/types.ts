import type { FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";

export type PoseSignals = {
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  translationX: number;
  translationY: number;
  translationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type FaceFrame = {
  result: FaceLandmarkerResult;
  hasFace: boolean;
  landmarks: NormalizedLandmark[];
  blendshapes: Map<string, number>;
  transformSignals: Map<string, number>;
  pose?: PoseSignals;
  timestamp: number;
};

export type Toy = {
  id: string;
  label: string;
  mount(container: HTMLElement): void;
  update(frame: FaceFrame): void;
  unmount?(): void;
};
