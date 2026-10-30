import { useEffect, useRef } from "react";
import type { Key } from "./i18n";

/** Shown in the shortcuts dialog; `keys` are the caps, `label` the explanation. */
export const SHORTCUTS: { keys: string[]; label: Key }[] = [
  { keys: ["Space"], label: "keys.confirm" },
  { keys: ["Esc"], label: "keys.cancel" },
  { keys: ["1", "-", "5"], label: "keys.land" },
  { keys: ["T"], label: "keys.target" },
  { keys: ["E"], label: "keys.endTurn" },
  { keys: ["C"], label: "keys.counter" },
  { keys: ["P"], label: "keys.pass" },
  { keys: ["1", "-", "9"], label: "keys.option" },
  { keys: ["G"], label: "keys.yardOwn" },
  { keys: ["Shift", "G"], label: "keys.yardOpp" },
  { keys: ["H"], label: "keys.hide" },
  { keys: ["L"], label: "keys.log" },
  { keys: ["Z"], label: "keys.zoom" },
  { keys: ["?"], label: "keys.help" },
  { keys: ["R"], label: "keys.rules" },
];

export const HELP_EVENT = "blg:help";
export const openHelp = (which: "keys" | "rules") => window.dispatchEvent(new CustomEvent(HELP_EVENT, { detail: which }));

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Global key handler. Return true from `handler` when the key was used: it is then kept from the focused button (Space would otherwise click it). */
export function useKey(handler: (e: KeyboardEvent) => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      if (!ref.current(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === " ") window.addEventListener("keyup", (u) => u.preventDefault(), { capture: true, once: true });
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, []);
}

/** True while any modal or drawer is open; the board shortcuts stay quiet then. */
export const dialogOpen = () => !!document.querySelector('[role="dialog"], [role="alertdialog"]');
