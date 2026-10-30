import { buildDeck } from "./cards";
import { OPENING_HAND_SIZE, resolveConfig } from "./config";
import { actionKey, getLegalActions, other } from "./legal";
import { nextRandom, seedToState, shuffle } from "./rng";
import {
  IllegalActionError,
  LAND_TYPES,
  type Action,
  type Card,
  type CardId,
  type Game,
  type GameConfig,
  type GameEvent,
  type GameResult,
  type LandType,
  type PlayerId,
  type PlayerState,
} from "./types";

interface Ctx {
  g: Game;
  events: GameEvent[];
}

const emit = (c: Ctx, e: GameEvent) => void c.events.push(e);

function endGame(c: Ctx, result: GameResult): void {
  c.g.result = result;
  c.g.pending = { kind: "over" };
  c.g.stack = [];
  if (result.kind === "win") emit(c, { type: "GameWon", player: result.player, condition: result.condition });
  else if (result.kind === "draw") emit(c, { type: "GameDrawn", reason: result.reason });
  else emit(c, { type: "GameCancelled" });
}

function removeCard(zone: Card[], id: CardId): Card {
  const i = zone.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`card ${id} not in zone`);
  return zone.splice(i, 1)[0] as Card;
}

/** R-11, R-70 */
function drawCard(c: Ctx, p: PlayerId): void {
  const ps = c.g.players[p];
  if (ps.library.length === 0) {
    if (c.g.config.emptyLibrary === "lose") {
      endGame(c, { kind: "win", player: other(p), condition: "EmptyLibrary" });
      return;
    }
    if (ps.graveyard.length === 0) return;
    ps.library = shuffle(c.g, ps.graveyard);
    ps.graveyard = [];
    emit(c, { type: "LibraryReshuffled", player: p });
  }
  const card = ps.library.shift() as Card;
  ps.hand.push(card);
  emit(c, { type: "CardDrawn", player: p, card });
}

function hasDomain(bf: readonly Card[]): boolean {
  return LAND_TYPES.every((t) => bf.some((c) => c.type === t));
}

function hasMono(bf: readonly Card[]): boolean {
  return LAND_TYPES.some((t) => bf.filter((c) => c.type === t).length >= 5);
}

/** R-24, R-60, R-61: active player is checked first. Returns true if the game ended. */
function checkWin(c: Ctx): boolean {
  if (c.g.result) return true;
  for (const p of [c.g.active, other(c.g.active)]) {
    const bf = c.g.players[p].battlefield;
    if (hasDomain(bf)) {
      endGame(c, { kind: "win", player: p, condition: "Domain" });
      return true;
    }
    if (hasMono(bf)) {
      endGame(c, { kind: "win", player: p, condition: "Mono" });
      return true;
    }
  }
  return false;
}

function startTurn(c: Ctx): void {
  const g = c.g;
  if (g.config.maxTurns !== null && g.turn + 1 > g.config.maxTurns) {
    endGame(c, { kind: "draw", reason: "maxTurns" });
    return;
  }
  const next = g.turn === 0 ? g.firstPlayer : other(g.active);
  g.turn += 1;
  g.active = next;
  g.landDropUsed = false;
  emit(c, { type: "TurnStarted", player: next, turn: g.turn });
  if (g.turn > 1) {
    drawCard(c, next);
    if (g.result) return;
  }
  g.pending = { kind: "main" };
}

export function createGame(partial: Partial<GameConfig> = {}): Game {
  const config = resolveConfig(partial);
  const g: Game = {
    config,
    players: [emptyPlayer(), emptyPlayer()],
    firstPlayer: 0,
    active: 0,
    turn: 0,
    landDropUsed: false,
    stack: [],
    pending: { kind: "main" },
    result: null,
    rng: seedToState(config.seed),
    log: [],
  };
  g.firstPlayer = config.firstPlayer === "random" ? (nextRandom(g) < 0.5 ? 0 : 1) : config.firstPlayer;
  g.active = g.firstPlayer;
  for (const p of [0, 1] as const) g.players[p].library = shuffle(g, buildDeck(p, config.deckSize));
  const c: Ctx = { g, events: [] };
  emit(c, { type: "GameStarted", firstPlayer: g.firstPlayer });
  for (const p of [0, 1] as const) for (let i = 0; i < OPENING_HAND_SIZE; i++) drawCard(c, p);
  startTurn(c);
  g.log.push(...c.events);
  return g;
}

function emptyPlayer(): PlayerState {
  return { library: [], hand: [], graveyard: [], battlefield: [] };
}

/** R-34: the window always opens, so timing never reveals whether the responder can counter. */
function openCounterWindow(c: Ctx, responder: PlayerId): void {
  c.g.pending = { kind: "counterWindow", player: responder };
}

/** R-33 */
function resolveStack(c: Ctx): void {
  const g = c.g;
  const drop = g.stack[0];
  if (!drop || drop.kind !== "landDrop") throw new Error("stack has no land drop");
  const counters = g.stack.filter((s) => s.kind === "counter").length;
  g.stack = [];
  g.pending = { kind: "main" };
  if (counters % 2 === 1) {
    g.players[drop.player].graveyard.push(drop.card);
    emit(c, { type: "LandCountered", player: drop.player, card: drop.card });
    return;
  }
  g.players[drop.player].battlefield.push(drop.card);
  emit(c, { type: "LandEntered", player: drop.player, card: drop.card });
  if (checkWin(c)) return;
  entryEffect(c, drop.card.type, drop.player, drop.target, false);
}

const fizzle = (c: Ctx, player: PlayerId, land: LandType) => emit(c, { type: "EffectFizzled", player, land });
const resolved = (c: Ctx, player: PlayerId, land: LandType) => emit(c, { type: "EffectResolved", player, land });

/**
 * Section 4. `copied` is true when Plains repeats the effect (R-40b): targets are then chosen at resolution.
 */
function entryEffect(c: Ctx, type: LandType, me: PlayerId, declared: CardId | undefined, copied: boolean): void {
  const g = c.g;
  const opp = other(me);
  switch (type) {
    case "Island":
      drawCard(c, me);
      resolved(c, me, type);
      return;
    case "Swamp": {
      const hand = g.players[opp].hand;
      if (hand.length === 0) return fizzle(c, me, type);
      emit(c, { type: "HandRevealed", by: me, of: opp, cards: [...hand] });
      g.pending = { kind: "choice", player: me, choice: "swampDiscard", options: [...hand] };
      return;
    }
    case "Mountain": {
      const bf = g.players[opp].battlefield;
      if (copied) return offerChoice(c, me, type, "mountainTarget", bf);
      const target = bf.find((x) => x.id === declared);
      if (!target) return fizzle(c, me, type);
      return finishChoice(c, me, "mountainTarget", target.id);
    }
    case "Forest": {
      const gy = g.players[me].graveyard;
      if (copied) return offerChoice(c, me, type, "forestTarget", gy);
      const target = gy.find((x) => x.id === declared);
      if (!target) return fizzle(c, me, type);
      return finishChoice(c, me, "forestTarget", target.id);
    }
    case "Plains": {
      const target = g.players[me].battlefield.find((x) => x.id === declared && x.type !== "Plains");
      if (!target) return fizzle(c, me, type);
      entryEffect(c, target.type, me, undefined, true);
      return;
    }
  }
}

function offerChoice(c: Ctx, me: PlayerId, land: LandType, choice: "mountainTarget" | "forestTarget", options: Card[]): void {
  if (options.length === 0) return fizzle(c, me, land);
  c.g.pending = { kind: "choice", player: me, choice, options: [...options] };
}

function finishChoice(c: Ctx, me: PlayerId, choice: "swampDiscard" | "mountainTarget" | "forestTarget", id: CardId): void {
  const g = c.g;
  const opp = other(me);
  if (choice === "swampDiscard") {
    const card = removeCard(g.players[opp].hand, id);
    g.players[opp].graveyard.push(card);
    emit(c, { type: "LandDiscarded", player: opp, card, reason: "swamp" });
    resolved(c, me, "Swamp");
  } else if (choice === "mountainTarget") {
    const card = removeCard(g.players[opp].battlefield, id);
    g.players[opp].graveyard.push(card);
    emit(c, { type: "LandDestroyed", player: opp, card });
    resolved(c, me, "Mountain");
  } else {
    const card = removeCard(g.players[me].graveyard, id);
    g.players[me].hand.push(card);
    emit(c, { type: "LandReturned", player: me, card });
    resolved(c, me, "Forest");
  }
  g.pending = { kind: "main" };
}

export function applyAction(game: Game, action: Action): { game: Game; events: GameEvent[] } {
  if (!getLegalActions(game).some((a) => actionKey(a) === actionKey(action))) {
    throw new IllegalActionError(action);
  }
  const g = structuredClone(game);
  const c: Ctx = { g, events: [] };

  switch (action.type) {
    case "Concede":
      endGame(c, { kind: "win", player: other(action.player), condition: "Concede" });
      break;
    case "CancelGame":
      endGame(c, { kind: "cancelled" });
      break;
    case "EndTurn":
      startTurn(c);
      break;
    case "PlayLand": {
      const me = g.active;
      const card = removeCard(g.players[me].hand, action.card);
      g.landDropUsed = true;
      g.stack.push({ kind: "landDrop", player: me, card, ...(action.target ? { target: action.target } : {}) });
      emit(c, { type: "LandPlayed", player: me, card });
      if (action.target) emit(c, { type: "TargetsDeclared", player: me, source: card.id, target: action.target });
      openCounterWindow(c, other(me));
      break;
    }
    case "Counter": {
      const p = (g.pending as { kind: "counterWindow"; player: PlayerId }).player;
      const hand = g.players[p].hand;
      const island = removeCard(hand, action.island);
      const o = removeCard(hand, action.other);
      g.players[p].graveyard.push(island, o);
      emit(c, { type: "LandDiscarded", player: p, card: island, reason: "counterCost" });
      emit(c, { type: "LandDiscarded", player: p, card: o, reason: "counterCost" });
      g.stack.push({ kind: "counter", player: p, island, other: o });
      emit(c, { type: "CounterCast", player: p, island, other: o });
      openCounterWindow(c, other(p));
      break;
    }
    case "PassCounter":
      resolveStack(c);
      break;
    case "ChooseTarget": {
      const pend = g.pending as { kind: "choice"; player: PlayerId; choice: "swampDiscard" | "mountainTarget" | "forestTarget" };
      finishChoice(c, pend.player, pend.choice, action.card);
      break;
    }
  }

  checkWin(c);
  g.log.push(...c.events);
  return { game: g, events: c.events };
}
