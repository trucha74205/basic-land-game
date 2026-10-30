import { create } from "zustand";
import type { Action, GameEvent, PlayerView } from "basic-land-engine";
import { resolutionSteps } from "./relations";
import type { Step } from "./relations";
import { getSettings } from "./session";
import type { ArtChoice } from "./art";
import type { Options } from "./api";
import type { ConnStatus } from "./socket";

export type GameStatus = "waiting" | "active" | "finished" | "cancelled" | "abandoned";
export interface SeatSummary {
  seat: 0 | 1;
  nickname: string;
  connected: boolean;
  art: ArtChoice;
  /** A guest asked to join and waits for the host. */
  pending?: boolean;
}
export interface Rematch {
  votes: number[];
  nextGameId: string | null;
}

/** While a stack resolves the table keeps showing the board as it was and narrates the steps; input is off until it is done. */
export interface Hold {
  view: PlayerView;
  /** How much of the log the player may see while the board is held. */
  logLen: number;
  steps: Step[];
}

export interface GameState {
  gameId: string | null;
  seat: 0 | 1 | null;
  status: GameStatus | null;
  version: number | undefined;
  options: Options | null;
  seats: SeatSummary[];
  view: PlayerView | null;
  legal: Action[];
  log: GameEvent[];
  /** Events that arrived with the last message, for cues. */
  fresh: GameEvent[];
  hold: Hold | null;
  rematch: Rematch;
  conn: ConnStatus;
  notice: string | null;
}

export const emptyGame: GameState = {
  gameId: null,
  seat: null,
  status: null,
  version: undefined,
  options: null,
  seats: [],
  view: null,
  legal: [],
  log: [],
  fresh: [],
  hold: null,
  rematch: { votes: [], nextGameId: null },
  conn: "connecting",
  notice: null,
};

/** Starts or extends a hold when this message resolved something: the table keeps the board as it was and plays the steps. */
function holdFor(s: GameState, m: any): Hold | null {
  const before = s.hold?.view ?? s.view;
  if (!before || getSettings().anim === "off") return s.hold;
  const steps = resolutionSteps(before, s.log, m.events);
  if (steps.length === 0) return s.hold;
  return { view: before, logLen: s.hold?.logLen ?? s.log.length, steps: [...(s.hold?.steps ?? []), ...steps] };
}

/** Pure reducer for server messages (protocol in specs/web/12-protocol.md). */
export function reduceMessage(s: GameState, m: any): Partial<GameState> {
  switch (m.t) {
    case "snapshot": {
      const sameGame = s.gameId === m.gameId && s.version !== undefined;
      return {
        gameId: m.gameId,
        seat: m.seat,
        status: m.status,
        version: m.version,
        options: m.options,
        seats: m.seats,
        view: m.view,
        legal: m.legalActions,
        log: sameGame ? [...s.log, ...m.events] : m.events,
        fresh: sameGame ? m.events : [],
        hold: sameGame ? holdFor(s, m) : null,
        rematch: m.rematch,
        notice: null,
      };
    }
    case "update":
      if (s.version !== undefined && m.version <= s.version) return {};
      return { version: m.version, status: m.status, view: m.view, legal: m.legalActions, seats: m.seats, log: [...s.log, ...m.events], fresh: m.events, hold: holdFor(s, m), notice: null };
    case "presence":
      return { seats: m.seats };
    case "rematch":
      return { rematch: { votes: m.votes, nextGameId: m.nextGameId } };
    case "rejected":
      return { notice: m.reason };
    default:
      return {};
  }
}

export const useGame = create<GameState & { apply(m: any): void; setConn(c: ConnStatus): void; reset(): void }>((set, get) => ({
  ...emptyGame,
  apply: (m) => set(reduceMessage(get(), m)),
  setConn: (conn) => set({ conn }),
  reset: () => set({ ...emptyGame }),
}));

/** The view and legal actions the table should show: frozen while a resolution is narrated. */
export function useShown(): { view: PlayerView | null; legal: Action[] } {
  const view = useGame((s) => s.view);
  const legal = useGame((s) => s.legal);
  const hold = useGame((s) => s.hold);
  return hold ? { view: hold.view, legal: [] } : { view, legal };
}
