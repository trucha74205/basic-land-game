import type { Config } from "./config.js";
import type { GameService } from "./games.js";
import type { ImageCache } from "./scryfall.js";

const DAY = 86_400_000;

/** Retention (11-architecture) and image cache cap (I-15). */
export async function runCleanup(svc: GameService, images: ImageCache, cfg: Pick<Config, "finishedRetentionDays" | "idleRetentionDays">, now = Date.now()): Promise<{ games: number; images: number }> {
  const ids = svc.store.deleteGamesOlderThan(now - cfg.finishedRetentionDays * DAY, now - cfg.idleRetentionDays * DAY);
  svc.forget(ids);
  return { games: ids.length, images: await images.evict() };
}
