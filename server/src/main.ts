import { join } from "node:path";
import { buildApp } from "./app.js";
import { runCleanup } from "./cleanup.js";
import { loadConfig } from "./config.js";
import { GameService } from "./games.js";
import { Hub } from "./hub.js";
import { PushService, webPushSender } from "./push.js";
import { ImageCache, PrintingIndex, ScryfallClient } from "./scryfall.js";
import { Store } from "./store.js";

const cfg = loadConfig();
const store = new Store(join(cfg.dataDir, "blg.sqlite"));
const svc = new GameService(store, { autoPassMs: cfg.autoPassMs });
const client = new ScryfallClient({ contactEmail: cfg.contactEmail });
const log = (msg: string, e?: unknown) => console.error(JSON.stringify({ level: "warn", msg, err: e instanceof Error ? e.message : e }));
const index = new PrintingIndex(store, client, { log });
const images = new ImageCache(store, client, { dir: join(cfg.dataDir, "images"), maxBytes: cfg.imageCacheMaxMb * 1024 * 1024 });
const hub: Hub = new Hub(svc, { knownPrinting: index.isKnown });
const push = new PushService(svc, store, cfg.vapid ? webPushSender(cfg.vapid.publicKey, cfg.vapid.privateKey, cfg.contactEmail) : null, {
  isVisible: (g, s) => hub.isVisible(g, s),
  log,
});
hub.onVisibility(push.onVisibility);

const app = await buildApp({ config: cfg, svc, hub, push, index, images, logger: true });
svc.resumeActive();

const nightly = setInterval(() => void runCleanup(svc, images, cfg).catch((e) => log("cleanup failed", e)), 6 * 3600_000);
nightly.unref();
void runCleanup(svc, images, cfg).catch((e) => log("cleanup failed", e));

const shutdown = async () => {
  clearInterval(nightly);
  hub.close();
  push.stop();
  svc.stop();
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port: cfg.port, host: cfg.host });
