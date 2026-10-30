import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { GameEvent, LandType } from "basic-land-engine";
import { useGame } from "@/lib/store";
import { landOfId } from "@/lib/log";
import { t } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PixelButton } from "@pxlkit/ui-kit";
import { getSettings, saveSettings } from "@/lib/session";
import { dialogOpen, useKey } from "@/lib/shortcuts";
import { FRAME } from "./Tile";

/** Turns shown before the rest folds away behind a button. */
const SHOWN_TURNS = 2;

type Tone = "plain" | "muted" | "red" | "green" | "amber" | "purple";
const TONE: Record<Tone, string> = {
  plain: "",
  muted: "text-muted-foreground",
  red: "text-red-600/90 dark:text-red-400/90",
  green: "text-green-700/90 dark:text-green-400/90",
  amber: "text-amber-700/90 dark:text-amber-400/90",
  purple: "text-purple-700/90 dark:text-purple-400/90",
};

/** The card itself, small and a little faded so it does not shout. */
const Land = ({ type }: { type: string }) => (
  <span className={cn("mx-px inline-block rounded px-1 text-[10px] font-bold leading-4 opacity-80", FRAME[type as LandType] ?? "bg-muted")}>{type}</span>
);

interface Row {
  tone: Tone;
  body: ReactNode;
}
/** A land drop shown as its action ("destroyed [Forest]"), with what else happened as rows. */
interface Block {
  player?: number;
  head?: ReactNode;
  rows: Row[];
}
interface Turn {
  key: string;
  turn: number | null;
  player: number | null;
  blocks: Block[];
}

const act = (land: string, done: boolean) => t(`log.act.${land}.${done ? "done" : "try"}` as Key);

/** Who is looking, and who did the thing; sentences are worded for the viewer ("from you", "from Opponent's hand"). */
interface Ctx {
  seat: number | null;
  who: (p: number) => string;
  mover: number;
}
const ownerOf = (id: string): number => (id.startsWith("p1") ? 1 : 0);
const other = (p: number) => 1 - p;
/** "your" / "their" / "Opponent's": whose card it is, from the viewer's side. */
const poss = (owner: number, c: Ctx) => (owner === c.seat ? t("log.your") : owner === c.mover ? t("log.their") : t("log.oppPoss"));
const fromWho = (owner: number, c: Ctx) => t("log.fromPlayer", { who: owner === c.seat ? t("log.you") : t("log.opponent") });
const fromHand = (owner: number, c: Ctx) => t("log.fromHand", { who: poss(owner, c) });
const fromYard = (owner: number, c: Ctx) => t("log.fromYard", { who: poss(owner, c) });

/** The rows for events that are not the land drop's own action. */
function rowFor(e: GameEvent, c: Ctx): Row | null {
  const l = (type: string) => <Land type={type} />;
  switch (e.type) {
    case "CounterCast":
      return { tone: "purple", body: <>{c.who(e.player)} {t("log.counteredWith")} {l(e.island.type)}, {t("log.cost")} {l(e.other.type)}</> };
    case "LandCountered":
      return { tone: "purple", body: <>{e.player === c.seat ? t("log.yourCap") : t("log.oppPoss")} {l(e.card.type)} {t("log.wasCountered")}</> };
    case "EffectFizzled":
      return { tone: "muted", body: t("log.fizzled") };
    case "LandDestroyed":
      return { tone: "red", body: <>{t("log.act.Mountain.done")} {l(e.card.type)} {fromWho(e.player, c)}</> };
    case "LandDiscarded":
      return e.reason === "swamp" ? { tone: "amber", body: <>{t("log.act.Swamp.done")} {l(e.card.type)} {fromHand(e.player, c)}</> } : null;
    case "LandReturned":
      return { tone: "green", body: <>{t("log.act.Forest.done")} {l(e.card.type)} {fromYard(e.player, c)}</> };
    case "CardDrawn":
      return { tone: "muted", body: <>{t("log.act.Island.done")} {e.card ? l(e.card.type) : t("log.aCard")}</> };
    case "HandRevealed":
      return { tone: "muted", body: <>{t("log.looked")} {e.cards ? e.cards.map((x, i) => <Land key={i} type={x.type} />) : null}</> };
    case "LibraryReshuffled":
      return { tone: "muted", body: t("log.reshuffled") };
    case "GameWon":
      return { tone: "green", body: <>{c.who(e.player)} {t("log.won")} ({e.condition})</> };
    case "GameDrawn":
      return { tone: "muted", body: t("log.draw") };
    case "GameCancelled":
      return { tone: "muted", body: t("log.cancelled") };
    default:
      return null;
  }
}

/** Turns an opened land drop and its events into one block: the head is the land's action on the card it hit and whose it was, everything else is a row. */
function finish(player: number, land: string, events: GameEvent[], seat: number | null, who: (p: number) => string): Block {
  const c: Ctx = { seat, who, mover: player };
  const own = (e: GameEvent) =>
    (land === "Mountain" && e.type === "LandDestroyed") || (land === "Swamp" && e.type === "LandDiscarded" && e.reason === "swamp") || (land === "Forest" && e.type === "LandReturned") || (land === "Island" && e.type === "CardDrawn");
  const result = events.find(own);
  const declared = events.find((e): e is Extract<GameEvent, { type: "TargetsDeclared" }> => e.type === "TargetsDeclared");
  const card = result && "card" in result ? result.card : undefined;
  // a resolved land is told in the past tense on its real target; a countered or fizzled one is the attempt on its declared target
  const done = !!result || (land === "Plains" && !!declared && !events.some((e) => e.type === "LandCountered"));
  const chip = (type?: string) => (type ? <Land type={type} /> : null);
  let object: ReactNode = null;
  if (land === "Mountain") {
    const owner = result && "player" in result ? result.player : declared ? ownerOf(declared.target) : other(player);
    object = <>{chip(card?.type ?? (declared ? landOfId(declared.target) : undefined))} {fromWho(owner, c)}</>;
  } else if (land === "Swamp") {
    const owner = result && "player" in result ? result.player : other(player);
    object = <>{chip(card?.type)} {fromHand(owner, c)}</>;
  } else if (land === "Forest") {
    object = <>{chip(card?.type ?? (declared ? landOfId(declared.target) : undefined))} {fromYard(player, c)}</>;
  } else if (land === "Plains") {
    object = declared ? <>{poss(ownerOf(declared.target), c)} {chip(landOfId(declared.target))}</> : null;
  } else {
    object = card ? chip(card.type) : t("log.aCard");
  }
  const rows = events.filter((e) => e !== result).map((e) => rowFor(e, c)).filter((r): r is Row => r !== null);
  return { player, head: <>{act(land, done)} {object}</>, rows };
}

/** Events grouped by turn, and within a turn by land drop. */
function group(log: GameEvent[], seat: number | null, who: (p: number) => string): Turn[] {
  const turns: Turn[] = [{ key: "start", turn: null, player: null, blocks: [{ rows: [] }] }];
  let open: { turn: Turn; player: number; land: string; events: GameEvent[] } | null = null;
  const close = () => {
    if (open) open.turn.blocks.push(finish(open.player, open.land, open.events, seat, who));
    open = null;
  };
  for (const e of log) {
    if (e.type === "TurnStarted") {
      close();
      turns.push({ key: `t${e.turn}`, turn: e.turn, player: e.player, blocks: [{ rows: [] }] });
    } else if (e.type === "LandPlayed") {
      close();
      open = { turn: turns[turns.length - 1]!, player: e.player, land: e.card.type, events: [] };
    } else if (open) open.events.push(e);
    else {
      const r = rowFor(e, { seat, who, mover: -1 });
      if (r) turns[turns.length - 1]!.blocks[0]!.rows.push(r);
    }
  }
  close();
  return turns.filter((tn) => tn.blocks.some((b) => b.head || b.rows.length > 0));
}

/** Whether the log panel is shown (a setting, so the table can give the space back when it is hidden). */
export function useLogOpen(): boolean {
  const [open, setOpen] = useState(getSettings().log);
  useEffect(() => {
    const f = () => setOpen(getSettings().log);
    window.addEventListener("blg:settings", f);
    return () => window.removeEventListener("blg:settings", f);
  }, []);
  return open;
}
const toggleLog = () => saveSettings({ ...getSettings(), log: !getSettings().log });

/** The always-visible game log (desktop): newest turn first, the last two turns open, a divider between turns. Kept quiet: small, faded until hovered. */
export function GameLog() {
  const { log, hold, seat } = useGame();
  const [all, setAll] = useState(false);
  const open = useLogOpen();
  useKey((e) => (e.key.toLowerCase() === "l" && !dialogOpen() ? (toggleLog(), true) : false));
  const shown = hold ? log.slice(0, hold.logLen) : log; // do not spoil what the board is still playing out
  const who = (p: number) => (p === seat ? t("common.you") : t("common.opponent"));
  const turns = useMemo(() => group(shown, seat, who).reverse(), [shown, seat]);
  const visible = all ? turns : turns.slice(0, SHOWN_TURNS);
  const hidden = turns.length - visible.length;
  const dot = (p: number) => (p === seat ? "text-sky-600 dark:text-sky-400" : "text-orange-600 dark:text-orange-400");

  if (!open)
    return (
      <div className="fixed right-[max(1rem,calc((100vw-1340px)/2+1rem))] top-16 z-20 max-lg:hidden">
        <PixelButton tone="neutral" variant="outline" size="sm" onClick={toggleLog}>{t("log.show")}</PixelButton>
      </div>
    );

  return (
    <aside aria-label={t("log.panel")} className="flex min-h-0 flex-col gap-2 rounded-2xl border border-border/50 bg-card/40 p-3 opacity-75 transition-opacity hover:opacity-100 focus-within:opacity-100 max-lg:hidden xl:sticky xl:top-16 xl:max-h-[calc(100dvh-5rem)]">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("log.panel")}</h2>
        <PixelButton tone="neutral" variant="ghost" size="sm" onClick={toggleLog}>{t("log.hide")}</PixelButton>
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto pr-1 max-xl:max-h-72">
        {turns.length === 0 && <p className="text-xs text-muted-foreground">{t("log.empty")}</p>}
        {visible.map((tn, i) => (
          <section key={tn.key} className={cn("flex flex-col gap-1 py-2", i > 0 && "border-t border-border/60")}>
            <h3 className="flex items-center gap-2 text-xs font-semibold">
              {tn.turn === null ? t("log.start") : t("log.turn", { n: tn.turn })}
              {tn.player !== null && <span className={cn("font-medium", dot(tn.player))}>{who(tn.player)}</span>}
            </h3>
            {tn.blocks.map((b, bi) => (
              <div key={bi} className="flex flex-col">
                {b.head && (
                  <p className="text-xs leading-5">
                    <span className={cn("font-semibold", dot(b.player!))}>{who(b.player!)}</span> {b.head}
                  </p>
                )}
                {b.rows.map((r, ri) => (
                  <p key={ri} className={cn("text-xs leading-5", b.head && "ml-2 border-l border-border/60 pl-2", TONE[r.tone])}>{r.body}</p>
                ))}
              </div>
            ))}
          </section>
        ))}
        {turns.length > SHOWN_TURNS && (
          <PixelButton tone="neutral" variant="ghost" size="sm" onClick={() => setAll(!all)}>{all ? t("log.newer") : t("log.older", { n: hidden })}</PixelButton>
        )}
      </div>
    </aside>
  );
}
