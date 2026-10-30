import type { GameEvent, PlayerView, StackItem } from "basic-land-engine";
import type { AnimSpeed } from "./session";
import { t } from "./i18n";

export type LineKind = "counter" | "destroy" | "discard" | "return" | "copy" | "draw";
/** An animated line between two cards. `from`/`to` list element refs (`data-ref`), the first one on screen wins, so a card out of sight falls back to its zone. */
export interface Line {
  from: string[];
  to: string[];
  kind: LineKind;
  label: string;
}
export interface Step {
  lines: Line[];
}

/** How long one resolution step stays on screen. */
export const STEP_MS: Record<Exclude<AnimSpeed, "off">, number> = { fast: 1100, normal: 2000, slow: 3200 };

const ownerOf = (id: string): 0 | 1 => (id.startsWith("p1") ? 1 : 0);
const refOf = (s: StackItem): string => (s.kind === "landDrop" ? s.card.id : s.island.id);
const KIND: Partial<Record<string, { kind: LineKind; label: () => string }>> = {
  Mountain: { kind: "destroy", label: () => t("rel.destroys") },
  Forest: { kind: "return", label: () => t("rel.returns") },
  Plains: { kind: "copy", label: () => t("rel.copies") },
};

/** The lines that stay while cards are on the stack: a land to its declared target, a counter to the item it counters. */
export function stackLines(stack: StackItem[]): Line[] {
  const lines: Line[] = [];
  stack.forEach((s, i) => {
    if (s.kind === "landDrop") {
      const k = KIND[s.card.type];
      if (s.target && k) lines.push({ from: [s.card.id], to: [s.target, `yard-${ownerOf(s.target)}`], kind: k.kind, label: k.label() });
    } else if (i > 0) {
      lines.push({ from: [s.island.id], to: [refOf(stack[i - 1]!)], kind: "counter", label: t("rel.counters") });
    }
  });
  return lines;
}

/** The steps of a resolution, in order: each counter negates the item below it, then the land's effect hits its card. Computed from the board as it was before. */
export function resolutionSteps(before: PlayerView, log: GameEvent[], events: GameEvent[]): Step[] {
  const steps: Step[] = [];
  for (let i = before.stack.length - 1; i > 0; i--) {
    const s = before.stack[i]!;
    if (s.kind === "counter") steps.push({ lines: [{ from: [s.island.id], to: [refOf(before.stack[i - 1]!)], kind: "counter", label: t("rel.counters") }] });
  }
  let src: string | undefined;
  for (const e of log) if (e.type === "LandEntered") src = e.card.id;
  for (const e of events) {
    if (e.type === "LandEntered") src = e.card.id;
    else if (!src) continue;
    else if (e.type === "LandDestroyed") steps.push({ lines: [{ from: [src], to: [e.card.id, `yard-${e.player}`], kind: "destroy", label: t("rel.destroys") }] });
    else if (e.type === "LandDiscarded" && e.reason === "swamp") steps.push({ lines: [{ from: [src], to: [e.card.id, `hand-${e.player}`], kind: "discard", label: t("rel.discards") }] });
    else if (e.type === "LandReturned") steps.push({ lines: [{ from: [src], to: [e.card.id, `yard-${e.player}`], kind: "return", label: t("rel.returns") }] });
    else if (e.type === "EffectResolved" && e.land === "Island") steps.push({ lines: [{ from: [src], to: [`library-${e.player}`], kind: "draw", label: t("rel.draws") }] });
    else if (e.type === "EffectResolved" && e.land === "Plains") {
      const target = before.stack.find((s) => s.kind === "landDrop" && s.card.id === src && s.target);
      if (target?.kind === "landDrop") steps.push({ lines: [{ from: [src], to: [target.target!], kind: "copy", label: t("rel.copies") }] });
    }
  }
  return steps;
}
