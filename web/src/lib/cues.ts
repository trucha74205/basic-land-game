import type { Action, GameEvent, PlayerView } from "basic-land-engine";
import { t } from "./i18n";
import type { Settings } from "./session";

export type Cue = "turn" | "respond" | "choice" | "over";

/** Which cue (if any) a new state deserves for this seat (W-50). */
export function cueFor(view: PlayerView | null, legal: Action[], fresh: GameEvent[], seat: number): Cue | null {
  if (!view) return null;
  if (view.result) return fresh.some((e) => e.type === "GameWon" || e.type === "GameDrawn" || e.type === "GameCancelled") ? "over" : null;
  const d = view.decision;
  if (!d || d.player !== seat) return null;
  if (d.type === "CounterWindow") return legal.some((a) => a.type === "Counter") ? "respond" : null;
  if (d.type === "ResolutionChoice") return "choice";
  return fresh.some((e) => e.type === "TurnStarted" && e.player === seat) ? "turn" : null;
}

/** What needs the player right now, regardless of what just arrived; drives the hidden-tab title (W-51). */
export function pendingCue(view: PlayerView | null, legal: Action[], seat: number): Cue | null {
  const d = view?.decision;
  if (!view || view.result || !d || d.player !== seat) return null;
  if (d.type === "CounterWindow") return legal.some((a) => a.type === "Counter") ? "respond" : null;
  return d.type === "ResolutionChoice" ? "choice" : "turn";
}

let ctx: AudioContext | null = null;
function beep(freqs: number[]): void {
  try {
    ctx ??= new AudioContext();
    let at = ctx.currentTime;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.06, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.12);
      at += 0.13;
    }
  } catch {
    /* audio can be blocked until the first tap */
  }
}

const SOUNDS: Record<Cue, number[]> = { turn: [660, 880], respond: [880, 660, 880], choice: [740], over: [520, 390, 260] };
const VIBRATION: Record<Cue, number[]> = { turn: [120], respond: [80, 60, 80], choice: [100], over: [200, 80, 200] };

export function playCue(cue: Cue, settings: Settings): void {
  if (settings.sound) beep(SOUNDS[cue]);
  if (settings.vibration && "vibrate" in navigator) navigator.vibrate(VIBRATION[cue]);
}

/** W-51: prefix the tab title while the page is hidden and something needs the player. */
export function titleFor(cue: Cue | null, base: string): string {
  if (cue === "turn") return `${t("title.yourTurn")} - ${base}`;
  if (cue === "respond") return `${t("title.respond")} - ${base}`;
  if (cue === "choice") return `${t("title.choose")} - ${base}`;
  return base;
}
