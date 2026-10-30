# Engine API

The engine is a deterministic, pure state machine. Given the same config (including seed) and the same sequence of actions, it produces the same game.

## Config

```ts
interface GameConfig {
  seed: string | number;
  deckSize: "full" | "half";            // R-03, default "full"
  emptyLibrary: "lose" | "reshuffle";   // R-70, default "lose"
  firstPlayer: 0 | 1 | "random";        // R-06, default "random"
  maxTurns: number | null;              // R-80, default null
}
```

## Core functions

```ts
createGame(config?: Partial<GameConfig>): Game
getDecision(game: Game): Decision | null        // null when the game is over
getLegalActions(game: Game): Action[]           // for the player in getDecision(game).player
applyAction(game: Game, action: Action): { game: Game; events: GameEvent[] }
getView(game: Game, player: 0 | 1): PlayerView   // hides the opponent's hand and both libraries
getEvents(game: Game, viewer: 0 | 1): GameEvent[] // log with hidden info redacted for the viewer
```

`applyAction` does not mutate its input and rejects illegal actions with a typed error.

## Decisions (who must act and what they can do)

| Decision | Player | Legal actions |
|---|---|---|
| `MainPhase` | active | `PlayLand { card, target? }`, `EndTurn` |
| `CounterWindow` | the player who may respond to the top stack item | `Counter { island, other }`, `PassCounter` |
| `ResolutionChoice` | the land's controller | `ChooseTarget { card }` (copied Mountain or Forest, Swamp discard) |

In every decision, `Concede { player }` (either player) and `CancelGame` are also legal (R-81, R-82, R-83).

`PlayLand.target` is required whenever a legal target exists, for Plains (own non-Plains land to copy), Mountain (opposing land), and Forest (graveyard land). It is public once declared (R-21). When no legal target exists it must be omitted and the effect fizzles.

Draw and turn advancement are automatic; they are not decisions.

## Events

`GameStarted`, `TurnStarted`, `CardDrawn`, `LibraryReshuffled`, `LandPlayed`, `TargetsDeclared`, `LandCountered`, `LandEntered`, `EffectResolved`, `EffectFizzled`, `LandDestroyed`, `LandDiscarded`, `LandReturned`, `HandRevealed` (only to the Swamp player), `GameWon { player, condition }` (condition: `Domain | Mono | Concede | EmptyLibrary`), `GameDrawn { reason: "maxTurns" }`, `GameCancelled`.

## Event visibility

Each event has a visibility: `public` or `private(player)`. `HandRevealed` is `private(swampPlayer)` and carries the cards; the opponent receives a public `HandRevealed` without cards. `getEvents(game, viewer)` filters accordingly. The unfiltered log is available for replays after the game ends.

## Player view

Own hand in full, opponent hand count only, library counts only, both battlefields and graveyards in full, pending decision, and the full stack (land drop and counters) with declared targets.
