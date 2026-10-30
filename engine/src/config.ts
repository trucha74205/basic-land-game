import type { GameConfig } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  seed: 0,
  deckSize: "full",
  emptyLibrary: "lose",
  firstPlayer: "random",
  maxTurns: null,
};

export function resolveConfig(partial: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}

export const OPENING_HAND_SIZE = 5;
