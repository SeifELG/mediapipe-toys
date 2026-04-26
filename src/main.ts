import "./styles.css";
import { createFaceInput } from "./mediapipe/faceInput";
import { createBlinkDetectorToy } from "./toys/blinkDetectorToy";
import { createDebugToy } from "./toys/debugToy";
import { createEyeTrackingLabToy } from "./toys/eyeTrackingLabToy";
import { createHeadPoseBallToy } from "./toys/headPoseBallToy";
import { createSmileFlightToy } from "./toys/smileFlightToy";
import type { FaceFrame, Toy } from "./types";

const enableButton = getElement<HTMLButtonElement>("#enable-camera");
const statusLabel = getElement<HTMLSpanElement>("#status");
const tabs = getElement<HTMLDivElement>("#tabs");
const toyRoot = getElement<HTMLDivElement>("#toy-root");
const hiddenVideoHost = getElement<HTMLDivElement>("#hidden-video-host");
const faceInput = createFaceInput();
const toys: Toy[] = [
  createDebugToy(faceInput.video),
  createHeadPoseBallToy(),
  createSmileFlightToy(),
  createBlinkDetectorToy(),
  createEyeTrackingLabToy()
];

let activeToy = toys[0];
let latestFrame: FaceFrame | null = null;

hiddenVideoHost.append(faceInput.video);
renderTabs();
mountToy(activeToy);

enableButton.addEventListener("click", async () => {
  enableButton.disabled = true;
  setStatus("Loading MediaPipe model...");

  try {
    await faceInput.start({
      onFrame(frame) {
        latestFrame = frame;
        activeToy.update(frame);
      },
      onStatus: setStatus
    });

    enableButton.textContent = "Camera enabled";
    setStatus("Tracking face");
  } catch (error) {
    console.error(error);
    enableButton.disabled = false;
    enableButton.textContent = "Try again";
    setStatus(error instanceof Error ? error.message : "Something went wrong.");
  }
});

function renderTabs() {
  tabs.replaceChildren(
    ...toys.map((toy) => {
      const button = document.createElement("button");

      button.className = "tab-button";
      button.type = "button";
      button.textContent = toy.label;
      button.setAttribute("aria-selected", String(toy.id === activeToy.id));
      button.addEventListener("click", () => {
        if (toy.id === activeToy.id) {
          return;
        }

        mountToy(toy);
        renderTabs();
      });

      return button;
    })
  );
}

function mountToy(toy: Toy) {
  activeToy.unmount?.();
  activeToy = toy;
  toyRoot.replaceChildren();
  hiddenVideoHost.append(faceInput.video);
  activeToy.mount(toyRoot);

  if (latestFrame) {
    activeToy.update(latestFrame);
  }
}

function setStatus(message: string) {
  statusLabel.textContent = message;
}

window.addEventListener("beforeunload", () => {
  faceInput.stop();
});

function getElement<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}
