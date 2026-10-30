import type { Game, PlayerId } from "basic-land-engine";
import { GameService } from "../src/games.js";
import type { Options } from "../src/protocol.js";
import { Store } from "../src/store.js";

export const OPTS: Options = { deckSize: "full", emptyLibrary: "lose", maxTurns: null, firstPlayer: "me" };

export function newService(store = new Store(":memory:"), over: Partial<ConstructorParameters<typeof GameService>[1]> = {}) {
  const svc = new GameService(store, { autoPassMs: [1000, 3000], random: () => 0.5, ...over });
  return { svc, store };
}

export interface Started {
  gameId: string;
  code: string;
  tokens: [string, string];
}

/** Creates and starts games until `pred` holds for the dealt game (the seed is server-generated). */
export function startGame(svc: GameService, options: Partial<Options> = {}, pred: (g: Game) => boolean = () => true): Started {
  for (let i = 0; i < 500; i++) {
    const c = svc.createGame("Anna", { ...OPTS, ...options });
    const j = svc.join(c.code, "Ben");
    if (pred(svc.peek(c.gameId)!.game)) return { gameId: c.gameId, code: c.code, tokens: [c.token, j.token] };
  }
  throw new Error("no matching game found");
}

export const connected = () => true;
export const handIds = (g: Game, p: PlayerId) => g.players[p].hand.map((c) => c.id);
