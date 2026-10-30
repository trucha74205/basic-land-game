export const LAND_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"] as const;
export type LandType = (typeof LAND_TYPES)[number];

export type PlayerId = 0 | 1;
export type CardId = string;

export interface Card {
  id: CardId;
  type: LandType;
}

export interface GameConfig {
  seed: string | number;
  deckSize: "full" | "half"; // R-03
  emptyLibrary: "lose" | "reshuffle"; // R-70
  firstPlayer: PlayerId | "random"; // R-06
  maxTurns: number | null; // R-80
}

export interface PlayerState {
  library: Card[]; // index 0 is the top
  hand: Card[];
  graveyard: Card[];
  battlefield: Card[];
}

export type StackItem =
  | { kind: "landDrop"; player: PlayerId; card: Card; target?: CardId }
  | { kind: "counter"; player: PlayerId; island: Card; other: Card };

export type ChoiceKind = "swampDiscard" | "mountainTarget" | "forestTarget";

export type Pending =
  | { kind: "main" }
  | { kind: "counterWindow"; player: PlayerId }
  | { kind: "choice"; player: PlayerId; choice: ChoiceKind; options: Card[] }
  | { kind: "over" };

export type WinCondition = "Domain" | "Mono" | "Concede" | "EmptyLibrary";

export type GameResult =
  | { kind: "win"; player: PlayerId; condition: WinCondition }
  | { kind: "draw"; reason: "maxTurns" }
  | { kind: "cancelled" };

export type GameEvent =
  | { type: "GameStarted"; firstPlayer: PlayerId }
  | { type: "TurnStarted"; player: PlayerId; turn: number }
  | { type: "CardDrawn"; player: PlayerId; card?: Card }
  | { type: "LibraryReshuffled"; player: PlayerId }
  | { type: "LandPlayed"; player: PlayerId; card: Card }
  | { type: "TargetsDeclared"; player: PlayerId; source: CardId; target: CardId }
  | { type: "CounterCast"; player: PlayerId; island: Card; other: Card }
  | { type: "LandCountered"; player: PlayerId; card: Card }
  | { type: "LandEntered"; player: PlayerId; card: Card }
  | { type: "EffectResolved"; player: PlayerId; land: LandType }
  | { type: "EffectFizzled"; player: PlayerId; land: LandType }
  | { type: "LandDestroyed"; player: PlayerId; card: Card }
  | { type: "LandDiscarded"; player: PlayerId; card: Card; reason: "swamp" | "counterCost" }
  | { type: "LandReturned"; player: PlayerId; card: Card }
  | { type: "HandRevealed"; by: PlayerId; of: PlayerId; cards?: Card[] }
  | { type: "GameWon"; player: PlayerId; condition: WinCondition }
  | { type: "GameDrawn"; reason: "maxTurns" }
  | { type: "GameCancelled" };

export interface Game {
  config: GameConfig;
  players: [PlayerState, PlayerState];
  firstPlayer: PlayerId;
  active: PlayerId;
  turn: number; // 0 before the first turn starts
  landDropUsed: boolean;
  stack: StackItem[];
  pending: Pending;
  result: GameResult | null;
  rng: number;
  log: GameEvent[]; // unfiltered
}

export type Decision =
  | { type: "MainPhase"; player: PlayerId }
  | { type: "CounterWindow"; player: PlayerId }
  | { type: "ResolutionChoice"; player: PlayerId; choice: ChoiceKind; options: Card[] };

export type Action =
  | { type: "PlayLand"; card: CardId; target?: CardId }
  | { type: "EndTurn" }
  | { type: "Counter"; island: CardId; other: CardId }
  | { type: "PassCounter" }
  | { type: "ChooseTarget"; card: CardId }
  | { type: "Concede"; player: PlayerId }
  | { type: "CancelGame" };

export interface PlayerView {
  viewer: PlayerId;
  active: PlayerId;
  turn: number;
  hand: Card[];
  opponentHandCount: number;
  libraryCounts: [number, number];
  battlefields: [Card[], Card[]];
  graveyards: [Card[], Card[]];
  stack: StackItem[];
  decision: Decision | null;
  result: GameResult | null;
}

export class IllegalActionError extends Error {
  constructor(public readonly action: Action) {
    super(`Illegal action: ${JSON.stringify(action)}`);
    this.name = "IllegalActionError";
  }
}
