import { createContext, useContext } from "react";
import type { Action } from "basic-land-engine";
import type { ArtChoice } from "@/lib/art";

export interface GameApi {
  send(action: Action): void;
  setArt(art: ArtChoice): void;
  rematch(): void;
  accept(): void;
  kick(): void;
  gameId: string;
  token: string;
}

export const GameCtx = createContext<GameApi | null>(null);
export const useGameApi = (): GameApi => {
  const c = useContext(GameCtx);
  if (!c) throw new Error("GameCtx missing");
  return c;
};
