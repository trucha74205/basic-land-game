import { useEffect, useMemo, useRef, useState } from "react";
import type { Action, Card, LandType, StackItem } from "basic-land-engine";
import { useGame, useShown } from "@/lib/store";
import type { SeatSummary } from "@/lib/store";
import { t } from "@/lib/i18n";
import type { Key } from "@/lib/i18n";
import { PixelBadge, PixelButton } from "@pxlkit/ui-kit";
import { StackTile, Tile, tileHeight } from "./Tile";
import { Relations } from "./Relations";
import { Fade } from "./Fade";
import { GameLog, useLogOpen } from "./GameLog";
import { Zoom } from "./Zoom";
import { useGameApi } from "./GameContext";
import { CounterDialog, ChoiceDialog, GraveyardDialog } from "./Dialogs";
import type { ArtChoice } from "@/lib/art";
import { cn } from "@/lib/utils";
import { CTA } from "@/lib/ui";
import { stackDetail } from "@/lib/stack";
import { dialogOpen, useKey } from "@/lib/shortcuts";

/** Height of a small tile; the graveyard pile overlaps cards by this minus its step. */
const TILE_H = tileHeight("sm");
/** The graveyard on the board shows only its newest cards; the popup shows all. */
const YARD_SHOWN = 3;
const TILE_W = 80;
/** Sideways shift per stacked card, shrinking for big piles; returns the offset of card i and the pile's total width. */
const shiftFor = (n: number) => (n > 1 ? Math.min(6, Math.floor(24 / (n - 1))) : 0);
const LAND_ORDER: LandType[] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

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
  const message = (() => {
    if (hold) return t("bar.resolving");
    if (view.result) return t("bar.over");
    if (!decision) return t("bar.waiting");
    if (picked) return needsTarget && !target ? t("bar.pickTarget", { land: picked.type }) : t("bar.confirmPlay", { land: picked.type });
    if (decision.type === "MainPhase") return myMove ? t("bar.yourTurn") : t("bar.opponentTurn", { name: who(decision.player) });
    if (decision.type === "CounterWindow") {
      if (!myMove) return t("bar.waitingRespond", { name: who(decision.player) });
      const by = top ? who(top.player) : "";
      return top?.kind === "landDrop" ? t("bar.played", { name: by, land: top.card.type }) : t("bar.respondCounter", { name: by });
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
      const step = cards.length > 6 ? Math.max(10, Math.floor(160 / (cards.length - 1))) : 24;
      return (
        <div className="flex flex-col items-center gap-1" style={{ minWidth: TILE_W }}>
          <span className="pixel text-xs">{label ?? `x${cards.length}`}</span>
          <div className="flex flex-col" style={{ width: TILE_W + shiftFor(cards.length) * (cards.length - 1) }}>
            {cards.map((c, i) => (
              <div key={c.id} style={{ marginTop: i === 0 ? 0 : step - TILE_H, marginLeft: i * shiftFor(cards.length) }} className="relative">
                <Tile land={c.type} art={artOf(p)} where={where} size="sm" hot={targetable(c) && target !== c.id} dim={dim(c)} selected={target === c.id} cardId={c.id} onPress={targetable(c) ? () => setTarget(c.id) : undefined} onZoom={zoomIn} />
              </div>
            ))}
          </div>
        </div>
      );
    };
    const yard = view.graveyards[p];
    return (
      <section aria-label={name(p)} className={cn("flex flex-col gap-3 rounded-2xl border p-2 shadow-sm transition-colors sm:p-4", needsTarget ? "bg-muted" : "playmat", mine && !needsTarget && "ring-1 ring-primary/30")}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="pixel text-lg">{mine ? t("common.you") : name(p)}</h2>
          {!mine && <span data-ref={`hand-${p}`}><PixelBadge tone="neutral" size="sm">{t("table.hand", { n: view.opponentHandCount })}</PixelBadge></span>}
          <span data-ref={`library-${p}`}><PixelBadge tone="neutral" size="sm">{t("table.library", { n: view.libraryCounts[p] })}</PixelBadge></span>
          {!mine && !seatOf(p)?.connected && <PixelBadge tone="red" variant="solid" size="sm">offline</PixelBadge>}
        </div>
        <div className="flex items-start gap-3 max-sm:flex-col max-sm:[zoom:0.62]">
          {/* one fixed column per land type, so both players' lands line up */}
          <div className="grid w-full min-w-0 flex-1 grid-cols-5 gap-2 p-1" style={{ minHeight: TILE_H + 32 }} aria-label={t("table.battlefield")}>
            {LAND_ORDER.map((type) => {
              const cards = view.battlefields[p].filter((c) => c.type === type);
              return (
                <div key={type} className="flex justify-center">
                  {cards.length > 0 ? (
                    pile(cards, "battlefield")
                  ) : (
                    <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border opacity-30" style={{ width: TILE_W, height: TILE_H, marginTop: 20 }} aria-hidden="true">
                      <img src={`/icons/mana-${type.toLowerCase()}.png`} alt="" draggable={false} className="size-6 opacity-60 grayscale" style={{ imageRendering: "pixelated" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div data-ref={`yard-${p}`} className="box-content flex w-[92px] shrink-0 flex-col items-center gap-1 border-l border-dashed border-border pl-3 max-sm:w-full max-sm:border-l-0 max-sm:border-t max-sm:pl-0 max-sm:pt-3" aria-label={t("table.graveyard")}>
            {yard.length === 0 ? (
              <>
                <span className="pixel text-xs text-muted-foreground">{t("table.graveyard")}</span>
                <div className="w-full rounded-xl border-2 border-dashed border-border opacity-30" style={{ height: TILE_H }} aria-hidden="true" />
              </>
            ) : (
              <div className="relative flex w-full flex-col items-center gap-1">
                <span className="pixel text-xs">{t("table.graveyard")} x{yard.length}</span>
                {yard.length > YARD_SHOWN && (
                  <span className="pixel -mb-0.5 text-sm leading-none tracking-widest text-muted-foreground" aria-hidden="true">
                    ... +{yard.length - YARD_SHOWN}
                  </span>
                )}
                <div className="flex flex-col" style={{ width: TILE_W + shiftFor(Math.min(yard.length, YARD_SHOWN)) * (Math.min(yard.length, YARD_SHOWN) - 1) }}>
                  {yard.slice(-YARD_SHOWN).map((c, i, shown) => (
                    <div key={c.id} style={{ marginTop: i === 0 ? 0 : 24 - TILE_H, marginLeft: i * shiftFor(shown.length) }} className="relative">
                      <Tile land={c.type} art={artOf(p)} where="graveyard" size="sm" hot={targetable(c) && target !== c.id} selected={target === c.id} cardId={c.id} />
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
    <div className={cn("mx-auto w-full max-w-[960px] px-2 pb-10 pt-3 sm:px-4", logOpen && "xl:grid xl:max-w-[1340px] xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-4")}>
      <div className="flex min-w-0 flex-col gap-4">
      <div className="grid gap-3 sm:[grid-template-columns:minmax(0,1fr)_112px]">
        <div className="flex min-w-0 flex-col gap-3">
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

      <section aria-label="Hand" data-ref={`hand-${me}`} className="flex flex-col gap-4 rounded-2xl border bg-card/90 p-4 shadow-lg backdrop-blur">
        {/* on phones cards of one land type overlap into a group so the hand stays compact */}
        <div className="flex min-h-[173px] flex-wrap items-end justify-center gap-3 pt-4 max-sm:gap-x-5">
          {hand.length === 0 && <p className="pixel flex h-[157px] w-full items-center justify-center rounded-xl border-2 border-dashed border-border text-muted-foreground">{t("hand.empty")}</p>}
          {LAND_ORDER.map((type) => {
            const group = hand.filter((c) => c.type === type);
            return (
              group.length > 0 && (
                <div key={type} className="flex gap-3 max-sm:gap-0">
                  {group.map((c, i) => {
                    const playable = playsFor(c.id).length > 0;
                    return (
                      <div key={c.id} className={cn("relative", i > 0 && "max-sm:-ml-[60px]")} style={{ zIndex: picked?.id === c.id ? 20 : i }}>
                        <Tile land={c.type} art={artOf(me)} where="hand" hot={playable && !picked} selected={picked?.id === c.id} dim={needsTarget && picked?.id !== c.id} disabled={!playable} cardId={c.id} onPress={playable ? () => pick(c) : undefined} onZoom={zoomIn} />
                      </div>
                    );
                  })}
                </div>
              )
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t pt-3">
          {picked && (
            <div className="flex flex-col gap-1 rounded-xl border-2 border-[var(--highlight)] bg-background p-3 shadow">
              <p className="pixel text-lg">{picked.type}</p>
              <p>{t(`effect.${picked.type}` as Key)}</p>
              {needsTarget && <p className="font-medium">{targetCard ? t("confirm.target", { land: targetCard.type, owner: targetOwner }) : t("confirm.noTarget")}</p>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" aria-live="polite" className="min-w-0 flex-1 text-base font-medium">
              {conn !== "open" ? t("conn.reconnecting") : message}
            </p>
            {view.stack.length > 0 && <PixelBadge tone="neutral" size="sm" className="sm:hidden">{t("table.stack")}: {view.stack.length}</PixelBadge>}
            {picked ? (
              <>
                <PixelButton tone="neutral" variant="outline" onClick={() => (setPicked(null), setTarget(null))}>{t("action.cancel")}</PixelButton>
                <PixelButton tone="purple" className={CTA} disabled={!ready} onClick={confirm}>{t("action.confirm")}</PixelButton>
              </>
            ) : (
              endTurn && myMove && decision?.type === "MainPhase" && <PixelButton tone="purple" className={CTA} onClick={() => api.send(endTurn)}>{t("action.endTurn")}</PixelButton>
            )}
          </div>
        </div>
      </section>

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
      <span hidden>{rematch.votes.length}</span>
    </div>
  );
}
