import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Action, Card, LandType, StackItem } from "basic-land-engine";
import { useGame, useShown } from "@/lib/store";
import type { SeatSummary } from "@/lib/store";
import { t } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { PixelBadge, PixelButton } from "@pxlkit/ui-kit";
import { StackTile, Tile, tileHeight } from "./Tile";
import { Relations } from "./Relations";
import { Fade, FadeModal } from "./Fade";
import { GameLog, Land, MobileLog, useLogOpen } from "./GameLog";
import { Zoom } from "./Zoom";
import { useLook } from "@/lib/theme";
import { Rich } from "./Rich";
import { useGameApi } from "./GameContext";
import { CounterDialog, ChoiceDialog, GraveyardDialog } from "./Dialogs";
import type { ArtChoice } from "@/lib/art";
import { cn } from "@/lib/utils";
import { CTA } from "@/lib/ui";
import { stackDetail } from "@/lib/stack";
import { dialogOpen, useKey } from "@/lib/shortcuts";

/** Height and width of a small tile. */
const TILE_H = tileHeight("sm");
const TILE_W = 80;
/** Cards of one land type shown in a pile (hand on desktop, battlefield); the rest is told by a count. */
const STACK_SHOWN = 3;
/** Pixels of each card that stay visible under the next one in a battlefield pile (the hand uses the same fan, larger). */
const FAN_X = 12;

/** The cards a pile shows, highest `rank` last: that one lies in front and is the only one highlighted. Same-type cards play alike, so which ones are shown does not matter for the rules. */
function fan<T>(cards: T[], rank: (c: T) => number, max = STACK_SHOWN): { shown: T[]; lead: T } {
  const best = cards
    .map((c, i) => ({ c, i, r: rank(c) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.c)
    .reverse();
  return { shown: best, lead: best[best.length - 1]! };
}
const LAND_ORDER: LandType[] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/** Hand layout in unscaled pixels: a card, the part of a card that shows under the next one in a pile, the space between piles and the room kept for highlight borders. */
const HAND_CARD = 112;
const HAND_FAN = 16;
const HAND_GAP = 24;
const HAND_SIDE = 12;

/** Squeezing the hand into one row: first the piles shrink one card at a time down to a single card per type, only then do the cards themselves get smaller. */
export function fitHand(counts: number[], avail: number): { stack: number; scale: number } {
  const width = (stack: number) => counts.reduce((w, n) => w + HAND_CARD + (Math.min(n, stack) - 1) * HAND_FAN, 0) + Math.max(0, counts.length - 1) * HAND_GAP;
  for (let stack = STACK_SHOWN; stack >= 2; stack--) if (width(stack) <= avail) return { stack, scale: 1 };
  return { stack: 1, scale: Math.min(1, Math.max(0.3, avail / width(1))) };
}

function useHandFit(hand: Card[] | undefined) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ stack: STACK_SHOWN, scale: 1 });
  const key = LAND_ORDER.map((type) => hand?.filter((c) => c.type === type).length ?? 0).filter((n) => n > 0).join(",");
  const has = !!hand;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const counts = key ? key.split(",").map(Number) : [];
    const run = () => {
      if (el.clientWidth === 0) return; // not laid out (hidden, or no layout engine)
      const f = fitHand(counts, el.clientWidth - 2 * HAND_SIDE);
      setFit((o) => (o.stack === f.stack && Math.abs(o.scale - f.scale) < 0.005 ? o : f));
    };
    run();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [key, has]);
  return { box, ...fit };
}

type PlayAction = Extract<Action, { type: "PlayLand" }>;

/** The table for an active game: the board (both sides with their graveyards), the separate stack, the hand and the action bar (W-31 to W-36). */
export function Table() {
  const { seat, seats, rematch, conn, hold } = useGame();
  const { view, legal } = useShown();
  const api = useGameApi();
  const [picked, setPicked] = useState<Card | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [zoom, setZoom] = useState<{ land: LandType; art?: ArtChoice } | null>(null);
  const [yardOf, setYardOf] = useState<0 | 1 | null>(null);
  const [info, setInfo] = useState<LandType | null>(null);
  const look = useLook();

  const me = seat as 0 | 1;
  const opp = (me === 0 ? 1 : 0) as 0 | 1;
  const seatOf = (p: number): SeatSummary | undefined => seats.find((s) => s.seat === p);
  const name = (p: number) => seatOf(p)?.nickname ?? "?";
  /** Whose move it is is told as "You" / "Opponent", not by nickname. */
  const who = (p: number) => (p === me ? t("common.you") : t("common.opponent"));
  const artOf = (p: number) => seatOf(p)?.art;

  const decisionKey = view ? JSON.stringify(view.decision) + view.stack.length : "";
  useEffect(() => setYardOf(null), [decisionKey]);

  const plays = useMemo(() => legal.filter((a): a is PlayAction => a.type === "PlayLand"), [legal]);
  const playsFor = (id: string) => plays.filter((a) => a.card === id);
  const targets = useMemo(() => new Set(picked ? playsFor(picked.id).flatMap((a) => (a.target ? [a.target] : [])) : []), [picked, plays]);
  const endTurn = legal.find((a) => a.type === "EndTurn");

  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false);
  useKey((e) => keys.current(e));
  keys.current = () => false;
  const logOpen = useLogOpen();
  const handFit = useHandFit(view?.hand);

  // a click anywhere that is not a button (card, Cancel, Confirm, ...) or a dialog drops the selection
  useEffect(() => {
    if (!picked) return;
    const off = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, a, input, select, [role='dialog']")) return;
      setPicked(null);
      setTarget(null);
    };
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [picked?.id]);

  // the effect text sits under the hand with a pointer to the selected card
  const hintRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const [chip, setChip] = useState<{ left: number; caret: number } | null>(null);
  useLayoutEffect(() => {
    const slot = hintRef.current;
    const box = chipRef.current;
    if (!slot || !box || !picked) return setChip(null);
    const run = () => {
      const card = document.querySelector(`[data-ref="${CSS.escape(picked.id)}"]`);
      if (!card) return setChip(null);
      const r = card.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      const mid = r.left + r.width / 2 - s.left;
      const w = box.offsetWidth;
      const left = Math.max(0, Math.min(mid - w / 2, s.width - w)); // under the card, kept on screen
      setChip({ left, caret: Math.max(10, Math.min(mid - left, w - 10)) });
    };
    run();
    window.addEventListener("resize", run);
    return () => window.removeEventListener("resize", run);
  }, [picked?.id, target, handFit.stack, handFit.scale, view?.hand.length]);

  if (!view) return null;
  const decision = view.decision;
  const myMove = decision?.player === me;
  const top = view.stack[view.stack.length - 1];

  const confirm = () => {
    if (!picked) return;
    const a = playsFor(picked.id).find((x) => (target ? x.target === target : !x.target));
    if (a) api.send(a);
    setPicked(null);
    setTarget(null);
  };
  const pick = (c: Card) => {
    const options = playsFor(c.id);
    if (options.length === 0) return;
    if (picked?.id === c.id) {
      setPicked(null);
      setTarget(null);
    } else {
      const only = [...new Set(options.flatMap((a) => (a.target ? [a.target] : [])))];
      setPicked(c);
      setTarget(only.length === 1 ? only[0]! : null); // a single legal target is preselected, the player still confirms
    }
  };
  const needsTarget = !!picked && targets.size > 0;
  const ready = !!picked && (!needsTarget || !!target);
  const hand = [...view.hand].sort((a, b) => LAND_ORDER.indexOf(a.type) - LAND_ORDER.indexOf(b.type));
  const targetCard = target ? [...view.battlefields.flat(), ...view.graveyards.flat()].find((c) => c.id === target) : undefined;
  const targetOwner = target ? (view.battlefields[me].some((c) => c.id === target) || view.graveyards[me].some((c) => c.id === target) ? t("common.you") : name(opp)) : "";

  const stackLand = (s: StackItem) => (s.kind === "landDrop" ? s.card.type : "Island");
  /** A sentence with the land as a coloured chip, and optionally the info button that opens the card's details. */
  const withChip = (key: Key, land: LandType, withInfo: boolean, params: Record<string, string> = {}) => {
    const [before, after] = t(key, { ...params, land: "\u0001" }).split("\u0001");
    return (
      <>
        {before}
        <Land type={land} big />
        {after}
        {withInfo && (
          <button type="button" aria-label={t("card.info")} onClick={() => setInfo(land)} className="ml-1 inline-flex !min-h-0 items-center align-middle text-base leading-none">
            {look === "pixel" ? (
              <span aria-hidden="true" className="brand inline-flex size-5 items-center justify-center border-2 border-current text-sm font-bold leading-none">i</span>
            ) : (
              "ℹ️"
            )}
          </button>
        )}
      </>
    );
  };
  const message = ((): React.ReactNode => {
    if (hold) return t("bar.resolving");
    if (view.result) return t("bar.over");
    if (!decision) return t("bar.waiting");
    if (picked) return needsTarget && !target ? withChip("bar.pickTarget", picked.type, true) : withChip("bar.confirmPlay", picked.type, true);
    if (decision.type === "MainPhase") return myMove ? t("bar.yourTurn") : t("bar.opponentTurn", { name: who(decision.player) });
    if (decision.type === "CounterWindow") {
      if (!myMove) return t("bar.waitingRespond", { name: who(decision.player) });
      const by = top ? who(top.player) : "";
      return top?.kind === "landDrop" ? withChip("bar.played", top.card.type, false, { name: by }) : t("bar.respondCounter", { name: by });
    }
    return myMove ? t("bar.choose") : t("bar.waitingChoice", { name: who(decision.player) });
  })();

  keys.current = (e) => {
    if (dialogOpen() || hold) return false;
    const k = e.key.toLowerCase();
    if (e.key === "Escape" && picked) return (setPicked(null), setTarget(null), true);
    if (e.key === " " && picked && ready) return (confirm(), true);
    if (k === "e" && !picked && endTurn && myMove && decision?.type === "MainPhase") return (api.send(endTurn), true);
    if (/^[1-5]$/.test(k)) {
      const c = hand.find((x) => x.type === LAND_ORDER[+k - 1] && x.id !== picked?.id && playsFor(x.id).length > 0);
      return c ? (pick(c), true) : false;
    }
    if (k === "t" && needsTarget) {
      const list = [...targets];
      return (setTarget(list[(target ? list.indexOf(target) + 1 : 0) % list.length]!), true);
    }
    if (k === "g") {
      const p = e.shiftKey ? opp : me;
      return view.graveyards[p].length > 0 ? (setYardOf(p), true) : false;
    }
    return false;
  };

  const zoomIn = (l: LandType, a?: ArtChoice) => setZoom({ land: l, art: a });

  const side = (p: 0 | 1, mine: boolean) => {
    const targetable = (c: Card) => targets.has(c.id);
    const dim = (c: Card) => needsTarget && !targetable(c);
    // piles overlap vertically; the offset shrinks as a pile grows so it keeps a bounded height
    const pile = (cards: Card[], where: "battlefield" | "graveyard", label?: string) => {
      // cards the stack points at stay in view so its lines have somewhere to land
      const pinned = new Set(view.stack.flatMap((x) => (x.kind === "landDrop" && x.target ? [x.target] : [])));
      const { shown, lead } = fan(cards, (c) => (target === c.id ? 3 : pinned.has(c.id) ? 2 : targetable(c) ? 1 : 0));
      return (
        <div className="flex flex-col items-center gap-1" style={{ minWidth: TILE_W }}>
          <span className="pixel text-xs">{label ?? `x${cards.length}`}</span>
          <div className="flex flex-row-reverse pt-[6px]">
            {shown.map((c, i) => (
              <div key={c.id} style={{ zIndex: i, top: -i * 3, marginRight: i > 0 ? FAN_X - TILE_W : 0 }} className="relative">
                <Tile land={c.type} art={artOf(p)} where={where} size="sm" hot={c === lead && targetable(c) && target !== c.id} dim={dim(c)} selected={target === c.id} cardId={c.id} onPress={targetable(c) ? () => setTarget(c.id) : undefined} onZoom={zoomIn} />
              </div>
            ))}
          </div>
        </div>
      );
    };
    const yard = view.graveyards[p];
    const yardFan = fan([...yard].reverse(), (c) => (target === c.id ? 2 : targetable(c) ? 1 : 0));
    return (
      <section aria-label={name(p)} className={cn("flex flex-col gap-3 rounded-2xl border p-2 shadow-sm transition-colors max-sm:gap-1 max-sm:p-1.5 sm:p-4", needsTarget ? "bg-muted" : "playmat", mine && !needsTarget && "ring-1 ring-primary/30")}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="pixel text-lg">{mine ? t("common.you") : name(p)}</h2>
          {!mine && <span data-ref={`hand-${p}`}><PixelBadge tone="neutral" size="sm">{t("table.hand", { n: view.opponentHandCount })}</PixelBadge></span>}
          <span data-ref={`library-${p}`}><PixelBadge tone="neutral" size="sm">{t("table.library", { n: view.libraryCounts[p] })}</PixelBadge></span>
          {!mine && !seatOf(p)?.connected && <PixelBadge tone="red" variant="solid" size="sm">offline</PixelBadge>}
        </div>
        <div className="flex items-start gap-3 max-sm:gap-2 max-sm:[zoom:0.6] max-[380px]:[zoom:0.54]">
          {/* one fixed column per land type, so both players' lands line up */}
          <div className="grid w-full min-w-0 flex-1 grid-cols-5 gap-2 p-1" style={{ minHeight: TILE_H + 32 }} aria-label={t("table.battlefield")}>
            {LAND_ORDER.map((type) => {
              const cards = view.battlefields[p].filter((c) => c.type === type);
              return (
                <div key={type} className="flex justify-center">
                  {cards.length > 0 ? (
                    pile(cards, "battlefield")
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border opacity-30" style={{ width: TILE_W, height: TILE_H, marginTop: 26 }} aria-hidden="true">
                      <img src={`/icons/mana-${type.toLowerCase()}.png`} alt="" draggable={false} className="size-6 opacity-60 grayscale" style={{ imageRendering: "pixelated" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div data-ref={`yard-${p}`} className="box-content flex w-[108px] shrink-0 flex-col items-center gap-1 border-l border-dashed border-border pl-3 max-sm:pl-2" aria-label={t("table.graveyard")}>
            {yard.length === 0 ? (
              <>
                <span className="pixel text-xs text-muted-foreground">{t("table.graveyard")}</span>
                <div className="w-full rounded-xl border-2 border-dashed border-border opacity-30" style={{ height: TILE_H }} aria-hidden="true" />
              </>
            ) : (
              <div className="relative flex w-full flex-col items-center gap-1">
                <span className="pixel text-xs">{t("table.graveyard")} x{yard.length}</span>
                {/* the newest cards lie in front, fanned like every other pile */}
                <div className="flex flex-row-reverse pt-[6px]">
                  {yardFan.shown.map((c, i) => (
                    <div key={c.id} style={{ zIndex: i, top: -i * 3, marginRight: i > 0 ? FAN_X - TILE_W : 0 }} className="relative">
                      <Tile land={c.type} art={artOf(p)} where="graveyard" size="sm" hot={c === yardFan.lead && targetable(c) && target !== c.id} selected={target === c.id} cardId={c.id} />
                    </div>
                  ))}
                </div>
                <button type="button" aria-label={t("table.graveyardOpen", { name: mine ? t("common.you") : name(p), n: yard.length })} onClick={() => setYardOf(p)} className="absolute inset-0 !min-h-0 rounded-xl hover:bg-white/10" />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className={cn("mx-auto w-full max-w-[960px] px-2 pb-10 pt-3 max-sm:pb-0 max-sm:pt-2 sm:px-4", logOpen && "xl:grid xl:max-w-[1340px] xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4")}>
      <div className="flex min-w-0 flex-col gap-4 max-sm:gap-2">
      <div className="grid gap-3 max-sm:gap-2 sm:[grid-template-columns:minmax(0,1fr)_112px]">
        <div className="flex min-w-0 flex-col gap-3 max-sm:gap-2">
          {side(opp, false)}
          {side(me, true)}
        </div>

        {/* the stack is its own column to the right, as tall as both boards together */}
        <section aria-label={t("table.stack")} className={cn("flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border p-2 max-sm:hidden", needsTarget ? "bg-muted opacity-60 grayscale" : "bg-accent/60 backdrop-blur", hold && "ring-2 ring-[var(--highlight)]")}>
          <h2 className="pixel text-lg">{t("table.stack")}</h2>
          {view.stack.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t("table.stackEmpty")}</p>
          ) : (
            <ol className="flex flex-1 flex-col items-center justify-center gap-3">
              {[...view.stack].reverse().map((s, i) => (
                <li key={i} className="flex flex-col items-center gap-1">
                  <StackTile item={s} art={artOf(s.player)} size="sm" onZoom={zoomIn} anchored />
                  <span className="text-xs font-medium">{who(s.player)}</span>
                  <span className="whitespace-pre-line text-center text-[11px] leading-tight text-muted-foreground">{stackDetail(s)}</span>
                  {i < view.stack.length - 1 && <span aria-hidden="true" className="text-lg leading-none text-muted-foreground">▼</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-label="Hand" data-ref={`hand-${me}`} className="flex flex-col gap-4 rounded-2xl border bg-card/90 p-4 shadow-lg backdrop-blur max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:gap-2 max-sm:bg-card max-sm:p-1.5 max-sm:pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        {/* one row: piles shrink first, then the cards (useHandFit) */}
        <div ref={handFit.box} className="min-h-[173px] w-full pt-10 max-sm:min-h-0 max-sm:pt-6">
          <div className="flex items-end justify-center" style={{ zoom: handFit.scale, gap: HAND_GAP }}>
            {hand.length === 0 && <p className="pixel flex h-[157px] w-full items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground max-sm:h-[80px]">{t("hand.empty")}</p>}
            {LAND_ORDER.map((type) => {
              const group = hand.filter((c) => c.type === type);
              const { shown: pile, lead } = fan(group, (c) => (c.id === picked?.id ? 2 : playsFor(c.id).length > 0 ? 1 : 0), handFit.stack);
              return (
                group.length > 0 && (
                  <div key={type} className={cn("relative flex flex-row-reverse", !picked && group.some((c) => playsFor(c.id).length > 0) && "tile-hot")}>
                    {group.length > pile.length && (
                      <span aria-label={t("hand.count", { n: group.length, land: type })} className="pixel absolute -right-1.5 -top-2.5 z-30 rounded-full border-2 border-border bg-background px-2 text-base font-bold leading-6 shadow">x{group.length}</span>
                    )}
                    {pile.map((c, i) => {
                      const playable = playsFor(c.id).length > 0;
                      return (
                        <div key={c.id} className="relative" style={{ zIndex: picked?.id === c.id ? 20 : i, top: -Math.min(i, 3) * 3, marginRight: i > 0 ? HAND_FAN - HAND_CARD : 0 }}>
                          <Tile land={c.type} art={artOf(me)} where="hand" hot={playable && !picked && c === lead} still selected={picked?.id === c.id} disabled={!playable} cardId={c.id} onPress={playable ? () => pick(c) : undefined} onZoom={zoomIn} />
                        </div>
                      );
                    })}
                  </div>
                )
              );
            })}
          </div>
        </div>

        {/* a reserved line, so selecting a card moves nothing: a small note under the selected card */}
        <div ref={hintRef} className="relative h-7 max-sm:h-6" aria-hidden={!picked}>
          <span
            ref={chipRef}
            className={cn("absolute top-0 whitespace-nowrap rounded-md border border-[var(--highlight)] bg-background/90 px-2 text-xs font-medium leading-5 shadow-sm transition-opacity", picked ? "opacity-100" : "opacity-0")}
            style={{ left: chip?.left ?? 0 }}
          >
            {chip && <span aria-hidden="true" className="absolute -top-[5px] size-2 rotate-45 border-l border-t border-[var(--highlight)] bg-background" style={{ left: chip.caret - 4 }} />}
            {picked ? t(`hint.${picked.type}` as Key) : t("hand.hint")}
            {picked && needsTarget && targetCard && ` > ${targetCard.type} (${targetOwner})`}
          </span>
        </div>

        <div className="flex flex-col gap-3 border-t pt-3 max-sm:gap-2 max-sm:pt-2">
          <div className="flex flex-wrap items-center gap-3 max-sm:gap-2">
            <p role="status" aria-live="polite" className="min-w-0 flex-1 text-base font-medium">
              {conn !== "open" ? t("conn.reconnecting") : message}
            </p>
            {view.stack.length > 0 && <PixelBadge tone="neutral" size="sm" className="sm:hidden">{t("table.stack")}: {view.stack.length}</PixelBadge>}
            {picked ? (
              <>
                <PixelButton tone="neutral" variant="outline" onClick={() => (setPicked(null), setTarget(null))}>{t("action.deselect")}</PixelButton>
                <PixelButton tone="purple" className={CTA} disabled={!ready} onClick={confirm}>{t("action.confirm")}</PixelButton>
              </>
            ) : (
              endTurn && myMove && decision?.type === "MainPhase" && <PixelButton tone="purple" className={CTA} onClick={() => api.send(endTurn)}>{t("action.endTurn")}</PixelButton>
            )}
          </div>
        </div>
      </section>

      </div>
      <div className="mt-2 lg:hidden">
        <MobileLog />
      </div>
      <div className={cn("max-lg:hidden", logOpen && "mt-4 xl:mt-0 xl:self-stretch")}>
        <GameLog />
      </div>

      <Relations stack={view.stack} />
      <CounterDialog />
      <ChoiceDialog />
      <Fade>
        {yardOf !== null ? (
        <GraveyardDialog owner={yardOf === me ? t("common.you") : name(yardOf)} cards={view.graveyards[yardOf]} art={artOf(yardOf)} targets={targets} onPick={(id) => (setTarget(id), setYardOf(null))} onClose={() => setYardOf(null)} />
        ) : null}
      </Fade>
      <Zoom zoom={zoom} onClose={() => setZoom(null)} />
      <Fade>
        {info ? (
          <FadeModal open land={info} title={info} description={<span className="text-base"><Rich text={t(`effect.${info}` as Key)} /></span>} closeLabel={t("common.close")} onClose={() => setInfo(null)} footer={<PixelButton tone="neutral" variant="outline" onClick={() => setInfo(null)}>{t("common.close")}</PixelButton>}>
            <p className="leading-7"><Rich text={t(`detail.${info}` as Key)} /></p>
          </FadeModal>
        ) : null}
      </Fade>
      <span hidden>{rematch.votes.length}</span>
    </div>
  );
}
