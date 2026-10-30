import { useSyncExternalStore } from "react";

/** "pixel" is the retro look; "clean" drops every pixel effect: smooth fonts, rounded corners, soft shadows, smooth lines. */
export type Look = "pixel" | "clean";

const KEY = "blg.look";

export function getLook(): Look {
  try {
    return localStorage.getItem(KEY) === "clean" ? "clean" : "pixel";
  } catch {
    return "pixel";
  }
}

export function applyLook(look: Look = getLook()): void {
  document.documentElement.dataset.look = look;
}

export function setLook(look: Look): void {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* storage can be unavailable (private mode); the choice then lasts for this visit only */
  }
  applyLook(look);
  window.dispatchEvent(new Event("blg:look"));
}

const subscribe = (f: () => void) => (window.addEventListener("blg:look", f), () => window.removeEventListener("blg:look", f));
export const useLook = (): Look => useSyncExternalStore(subscribe, getLook, () => "pixel");
