import type { StackItem } from "basic-land-engine";
import { landOfId } from "./log";
import { t } from "./i18n";

export type MarkTone = "red" | "green" | "blue" | "grey";
/** A short label pinned to a card that is involved in what is on the stack or in the last resolution. */
export interface Mark {
  text: string;
  tone: MarkTone;
}

/** One line saying what a stack item does and to which card. */
export function stackDetail(s: StackItem): string {
  if (s.kind === "counter") return `${t("stack.counters")}\n${t("stack.cost", { land: s.other.type })}`;
  const land = s.target ? landOfId(s.target) : "";
  switch (s.card.type) {
    case "Mountain":
      return s.target ? t("stack.destroys", { land }) : t("stack.noTarget");
    case "Forest":
      return s.target ? t("stack.returns", { land }) : t("stack.noTarget");
    case "Plains":
      return s.target ? t("stack.copies", { land }) : t("stack.noTarget");
    case "Swamp":
      return t("stack.discards");
    case "Island":
      return t("stack.draws");
  }
}
