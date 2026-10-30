import type { GameEvent } from "basic-land-engine";

/** Card ids look like `p0-Mountain-3`; the type is public once the card is public (W-37). */
export const landOfId = (id: string): string => /^[^-]+-([A-Za-z]+)-\d+$/.exec(id)?.[1] ?? "a land";

/** One readable sentence per public event; private details stay redacted exactly as the server sent them. */
export function describeEvent(e: GameEvent, name: (p: number) => string): string | null {
  switch (e.type) {
    case "GameStarted":
      return `Game started. ${name(e.firstPlayer)} goes first.`;
    case "TurnStarted":
      return `Turn ${e.turn}: ${name(e.player)}`;
    case "CardDrawn":
      return e.card ? `${name(e.player)} drew ${e.card.type}` : `${name(e.player)} drew a card`;
    case "LibraryReshuffled":
      return `${name(e.player)} shuffled their graveyard into their library`;
    case "LandPlayed":
      return `${name(e.player)} played ${e.card.type}`;
    case "TargetsDeclared":
      return `${landOfId(e.source)} targets ${landOfId(e.target)}`;
    case "CounterCast":
      return `${name(e.player)} countered with ${e.island.type} and discarded ${e.other.type}`;
    case "LandCountered":
      return `${e.card.type} was countered`;
    case "LandEntered":
      return `${e.card.type} entered the battlefield for ${name(e.player)}`;
    case "EffectResolved":
      return `${e.land} effect resolved`;
    case "EffectFizzled":
      return `${e.land} effect fizzled: no legal target`;
    case "LandDestroyed":
      return `${e.card.type} of ${name(e.player)} was destroyed`;
    case "LandDiscarded":
      return `${name(e.player)} discarded ${e.card.type}`;
    case "LandReturned":
      return `${e.card.type} returned to ${name(e.player)}'s battlefield`;
    case "HandRevealed":
      return e.cards ? `${name(e.by)} saw ${name(e.of)}'s hand: ${e.cards.map((c) => c.type).join(", ") || "empty"}` : `${name(e.by)} looked at ${name(e.of)}'s hand`;
    case "GameWon":
      return `${name(e.player)} won (${e.condition})`;
    case "GameDrawn":
      return "The game is a draw: turn limit reached";
    case "GameCancelled":
      return "The game was cancelled";
  }
}
