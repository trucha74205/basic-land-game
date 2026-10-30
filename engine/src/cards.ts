import { LAND_TYPES, type Card, type GameConfig, type PlayerId } from "./types";

export function copiesPerType(deckSize: GameConfig["deckSize"]): number {
  return deckSize === "full" ? 10 : 5;
}

export function buildDeck(player: PlayerId, deckSize: GameConfig["deckSize"]): Card[] {
  const cards: Card[] = [];
  for (const type of LAND_TYPES) {
    for (let i = 0; i < copiesPerType(deckSize); i++) {
      cards.push({ id: `p${player}-${type}-${i}`, type });
    }
  }
  return cards;
}
