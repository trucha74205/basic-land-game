import { applyAction, createGame, getDecision, getLegalActions } from "../src";
import type { Action, Card, CardId, Game, GameConfig, GameEvent, LandType, PlayerId } from "../src";

type Zone = "hand" | "battlefield" | "graveyard" | "library";
type Lands = LandType[];

export interface Setup {
  hands?: [Lands?, Lands?];
  battlefields?: [Lands?, Lands?];
  graveyards?: [Lands?, Lands?];
  libraries?: [Lands?, Lands?];
  active?: PlayerId;
  config?: Partial<GameConfig>;
}

/** Builds a game in player `active`'s main phase with exactly the given zones (default library: 10 Plains). */
export function setup(s: Setup = {}): Sim {
  const g = createGame({ firstPlayer: 0, ...s.config });
  const zones: Zone[] = ["hand", "battlefield", "graveyard", "library"];
  const given: Record<Zone, [Lands?, Lands?] | undefined> = {
    hand: s.hands,
    battlefield: s.battlefields,
    graveyard: s.graveyards,
    library: s.libraries,
  };
  for (const p of [0, 1] as const) {
    for (const z of zones) {
      const lands = given[z]?.[p] ?? (z === "library" ? Array<LandType>(10).fill("Plains") : []);
      g.players[p][z] = lands.map((type, i) => ({ id: `t${p}-${z}-${i}-${type}`, type }));
    }
  }
  g.turn = 3;
  g.active = s.active ?? 0;
  g.landDropUsed = false;
  g.pending = { kind: "main" };
  g.log = [];
  return new Sim(g);
}

export class Sim {
  events: GameEvent[] = [];
  constructor(public g: Game) {}

  /** Applies an action, then auto-passes counter windows where passing is the only option (R-34). */
  act(a: Action): this {
    this.raw(a);
    for (;;) {
      const d = getDecision(this.g);
      if (d?.type !== "CounterWindow") break;
      const legal = getLegalActions(this.g).filter((x) => x.type !== "Concede" && x.type !== "CancelGame");
      if (legal.length !== 1) break;
      this.raw({ type: "PassCounter" });
    }
    return this;
  }

  /** Applies an action without auto-passing. */
  raw(a: Action): this {
    const r = applyAction(this.g, a);
    this.g = r.game;
    this.events.push(...r.events);
    return this;
  }

  card(p: PlayerId, zone: Zone, type: LandType, nth = 0): Card {
    const c = this.g.players[p][zone].filter((x) => x.type === type)[nth];
    if (!c) throw new Error(`no ${type} #${nth} in p${p} ${zone}`);
    return c;
  }
  id(p: PlayerId, zone: Zone, type: LandType, nth = 0): CardId {
    return this.card(p, zone, type, nth).id;
  }
  count(p: PlayerId, zone: Zone, type?: LandType): number {
    return this.g.players[p][zone].filter((x) => !type || x.type === type).length;
  }
  has(p: PlayerId, zone: Zone, type: LandType): boolean {
    return this.count(p, zone, type) > 0;
  }

  play(type: LandType, target?: { p: PlayerId; zone: Zone; type: LandType }): this {
    const me = this.g.active;
    return this.act({
      type: "PlayLand",
      card: this.id(me, "hand", type),
      ...(target ? { target: this.id(target.p, target.zone, target.type) } : {}),
    });
  }
  /** Counter with the first Island plus the first other card in hand. */
  counter(p: PlayerId, other?: LandType): this {
    const hand = this.g.players[p].hand;
    const island = hand.find((c) => c.type === "Island");
    const o = hand.find((c) => c.id !== island?.id && (!other || c.type === other));
    if (!island || !o) throw new Error("cannot counter");
    return this.act({ type: "Counter", island: island.id, other: o.id });
  }
  pass(): this {
    return this.act({ type: "PassCounter" });
  }
  choose(p: PlayerId, zone: Zone, type: LandType): this {
    return this.act({ type: "ChooseTarget", card: this.id(p, zone, type) });
  }
  endTurn(): this {
    return this.act({ type: "EndTurn" });
  }
  eventTypes(): string[] {
    return this.events.map((e) => e.type);
  }
  fizzled(): boolean {
    return this.events.some((e) => e.type === "EffectFizzled");
  }
}

export const L = (type: LandType, n: number): Lands => Array<LandType>(n).fill(type);
