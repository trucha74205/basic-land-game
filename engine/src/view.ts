import { getDecision, other } from "./legal";
import type { Game, GameEvent, PlayerId, PlayerView } from "./types";

/** Hidden information: a drawn card is private to the drawer, a revealed hand is private to the revealer (R-42a). */
export function getEvents(game: Game, viewer: PlayerId): GameEvent[] {
  return game.log.map((e): GameEvent => {
    if (e.type === "CardDrawn" && e.player !== viewer) return { type: "CardDrawn", player: e.player };
    if (e.type === "HandRevealed" && e.by !== viewer) return { type: "HandRevealed", by: e.by, of: e.of };
    return e;
  });
}

export function getView(game: Game, viewer: PlayerId): PlayerView {
  const decision = getDecision(game);
  const hideOptions = decision?.type === "ResolutionChoice" && decision.player !== viewer;
  return {
    viewer,
    active: game.active,
    turn: game.turn,
    hand: game.players[viewer].hand,
    opponentHandCount: game.players[other(viewer)].hand.length,
    libraryCounts: [game.players[0].library.length, game.players[1].library.length],
    battlefields: [game.players[0].battlefield, game.players[1].battlefield],
    graveyards: [game.players[0].graveyard, game.players[1].graveyard],
    stack: game.stack,
    decision: decision && hideOptions && decision.type === "ResolutionChoice" ? { ...decision, options: [] } : decision,
    result: game.result,
  };
}
