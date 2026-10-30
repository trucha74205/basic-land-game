import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Action, Card } from "basic-land-engine";
import { useGame, useShown } from "@/lib/store";
import { t } from "@/lib/i18n";
import { PixelButton } from "@pxlkit/ui-kit";
import { Fade, FadeModal } from "./Fade";
import { StackTile, Tile } from "./Tile";
import { useGameApi } from "./GameContext";
import { CTA } from "@/lib/ui";
import type { ArtChoice } from "@/lib/art";
import { stackDetail } from "@/lib/stack";
import { useKey } from "@/lib/shortcuts";

/** Lets the player peek at the board behind a popup: a hidden popup leaves a bar to bring it back. Resets whenever `key` changes (a new decision). */
function useHideable(key: string, active: boolean) {
  const [hidden, setHidden] = useState(false);
  useKey((e) => (active && e.key.toLowerCase() === "h" ? (setHidden((h) => !h), true) : false));
  useEffect(() => setHidden(false), [key]);
  const hideButton = (
    <PixelButton tone="neutral" variant="outline" onClick={() => setHidden(true)}>{t("popup.hide")}</PixelButton>
  );
  const showBar = hidden && (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <PixelButton tone="purple" className={CTA} onClick={() => setHidden(false)}>{t("popup.show")}</PixelButton>
    </div>
  );
  return { hidden, hideButton, showBar };
}

type CounterAction = Extract<Action, { type: "Counter" }>;

/** W-34: shown only when a counter is possible; when only Pass exists the server passes by itself (W-35). A single possible choice is preselected; the player still confirms. */
export function CounterDialog() {
  const { modal, bar } = useCounterDialog();
  return (
    <>
      {bar}
      <Fade>{modal}</Fade>
    </>
  );
}

function useCounterDialog(): { modal: ReactNode; bar: ReactNode } {
  const { seat, seats } = useGame();
  const { view, legal } = useShown();
  const api = useGameApi();
  const [island, setIsland] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const d = view?.decision;
  const counters = legal.filter((a): a is CounterAction => a.type === "Counter");
  const open = d?.type === "CounterWindow" && d.player === seat && counters.length > 0;
  useEffect(() => (setIsland(null), setOther(null)), [open, view?.stack.length]);
  const peek = useHideable(`${open}-${view?.stack.length}`, open);
  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false);
  useKey((e) => keys.current(e));
  keys.current = () => false;
  if (!view || !open) return { modal: null, bar: null };

  const top = view.stack[view.stack.length - 1]!;
  const name = (p: number) => (p === seat ? t("common.you") : t("common.opponent"));
  const art = (p: number) => seats.find((s) => s.seat === p)?.art;
  const byId = (id: string): Card | undefined => view.hand.find((c) => c.id === id);
  const islands = [...new Set(counters.map((c) => c.island))];
  const others = island ? counters.filter((c) => c.island === island) : [];
  const chooseIsland = (id: string) => {
    const options = counters.filter((c) => c.island === id);
    setIsland(id);
    setOther(options.length === 1 ? options[0]!.other : null);
  };
  const chosen = island && other ? counters.find((c) => c.island === island && c.other === other) : undefined;

  keys.current = (e) => {
    if (peek.hidden) return false;
    const k = e.key.toLowerCase();
    const digit = /^[1-9]$/.test(k) ? +k - 1 : -1;
    if (island) {
      if (k === " " && chosen) return (api.send(chosen), true);
      if (e.key === "Escape") return (setIsland(null), setOther(null), true);
      if (others[digit]) return (setOther(others[digit]!.other), true);
    } else {
      if (k === "p") return (api.send({ type: "PassCounter" }), true);
      if (k === "c" || k === " ") return (chooseIsland(islands[0]!), true);
      if (islands[digit]) return (chooseIsland(islands[digit]!), true);
    }
    return false;
  };

  const title = top.kind === "landDrop" ? t("bar.played", { name: name(top.player), land: top.card.type }) : t("bar.respondCounter", { name: name(top.player) });
  const description = stackDetail(top).replace("\n", ", ");
  const footer = island ? (
    <>
      {peek.hideButton}
      <PixelButton tone="neutral" variant="outline" onClick={() => (setIsland(null), setOther(null))}>{t("action.cancel")}</PixelButton>
      <PixelButton tone="purple" className={CTA} disabled={!chosen} onClick={() => chosen && api.send(chosen)}>{t("action.confirm")}</PixelButton>
    </>
  ) : (
    <>
      {peek.hideButton}
      <PixelButton tone="neutral" variant="outline" onClick={() => api.send({ type: "PassCounter" })}>{t("action.pass")}</PixelButton>
      <PixelButton tone="purple" className={CTA} onClick={() => chooseIsland(islands[0]!)}>{t("action.counter")}</PixelButton>
    </>
  );

  if (peek.hidden) return { modal: null, bar: peek.showBar };
  const modal = (
    <FadeModal open title={title} description={description} closeLabel="no-close" onClose={() => undefined} footer={footer}>
      <div className="grid justify-items-center gap-4">
        <StackTile item={top} art={art(top.player)} size="md" />
        {island ? (
          <>
            <p>{t("counter.pickOther")}</p>
            <div className="flex flex-wrap justify-center gap-3 p-2 pt-6">
              {others.map((a) => {
                const c = byId(a.other)!;
                return <Tile key={a.other} land={c.type} art={art(view.viewer)} where="hand" size="sm" hot={other !== a.other} selected={other === a.other} onPress={() => setOther(a.other)} />;
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap justify-center gap-3 p-2">
            {islands.map((id) => (
              <Tile key={id} land="Island" art={art(view.viewer)} where="hand" size="sm" hot onPress={() => chooseIsland(id)} />
            ))}
          </div>
        )}
      </div>
    </FadeModal>
  );
  return { modal, bar: null };
}

/** W-36: Swamp discard and copied Mountain/Forest/Plains targets. Options only reach the chooser (P-01). A single option is preselected; the player still confirms. */
export function ChoiceDialog() {
  const { modal, bar } = useChoiceDialog();
  return (
    <>
      {bar}
      <Fade>{modal}</Fade>
    </>
  );
}

function useChoiceDialog(): { modal: ReactNode; bar: ReactNode } {
  const { seat, seats } = useGame();
  const { view } = useShown();
  const api = useGameApi();
  const [sel, setSel] = useState<string | null>(null);
  const d = view?.decision;
  const mine = d?.type === "ResolutionChoice" && d.player === seat;
  const key = mine ? `${d.choice}-${d.options.map((c) => c.id).join()}` : "";
  const peek = useHideable(key, mine);
  useEffect(() => setSel(null), [key]);
  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false);
  useKey((e) => keys.current(e));
  keys.current = () => false;
  if (!view || d?.type !== "ResolutionChoice" || !mine) return { modal: null, bar: null };
  const art = (p: number) => seats.find((s) => s.seat === p)?.art;
  const owner = (c: Card) => (c.id.startsWith("p0") ? 0 : c.id.startsWith("p1") ? 1 : view.viewer);
  const title = d.choice === "swampDiscard" ? t("choice.swampDiscard") : d.choice === "mountainTarget" ? t("choice.mountainTarget") : t("choice.forestTarget");
  const picked = sel ?? (d.options.length === 1 ? d.options[0]!.id : null);
  keys.current = (e) => {
    if (peek.hidden) return false;
    if (e.key === " " && picked) return (api.send({ type: "ChooseTarget", card: picked }), true);
    const o = /^[1-9]$/.test(e.key) ? d.options[+e.key - 1] : undefined;
    return o ? (setSel(o.id), true) : false;
  };
  if (peek.hidden) return { modal: null, bar: peek.showBar };
  const modal = (
    <FadeModal
      open
      title={title}
      description={t("bar.choose")}
      closeLabel="no-close"
      onClose={() => undefined}
      footer={
        <>
          {peek.hideButton}
          <PixelButton tone="purple" className={CTA} disabled={!picked} onClick={() => picked && api.send({ type: "ChooseTarget", card: picked })}>{t("action.confirm")}</PixelButton>
        </>
      }
    >
      <div className="flex flex-wrap justify-center gap-3 p-2 pt-8">
        {d.options.map((c) => (
          <Tile key={c.id} land={c.type} art={art(owner(c))} where="hand" size="sm" hot={picked !== c.id} selected={picked === c.id} onPress={() => setSel(c.id)} />
        ))}
      </div>
    </FadeModal>
  );
  return { modal, bar: null };
}

/** Every card of one graveyard in a popup; cards that are legal targets can be picked here (W-36). */
export function GraveyardDialog({ owner, cards, art, targets, onPick, onClose }: { owner: string; cards: Card[]; art?: ArtChoice; targets: Set<string>; onPick: (id: string) => void; onClose: () => void }) {
  const picking = cards.some((c) => targets.has(c.id));
  return (
    <FadeModal open title={`${t("table.graveyard")} - ${owner}`} description={picking ? t("table.graveyardPick") : `x${cards.length}`} closeLabel={t("common.close")} onClose={onClose} footer={<PixelButton tone="neutral" variant="outline" onClick={onClose}>{t("action.cancel")}</PixelButton>}>
      <div className="flex max-h-[60dvh] flex-wrap justify-center gap-3 overflow-y-auto px-2 pb-2 pt-8">
        {[...cards].reverse().map((c) => (
          <Tile key={c.id} land={c.type} art={art} where="graveyard" size="sm" hot={targets.has(c.id)} onPress={targets.has(c.id) ? () => onPick(c.id) : undefined} />
        ))}
      </div>
    </FadeModal>
  );
}
