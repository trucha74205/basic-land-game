import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import { GameService } from "../src/games.js";
import { Hub } from "../src/hub.js";
import type { HubOptions } from "../src/hub.js";
import { PushService } from "../src/push.js";
import type { PushSender } from "../src/push.js";
import { ImageCache, PrintingIndex, ScryfallClient } from "../src/scryfall.js";
import { Store } from "../src/store.js";

export interface Harness {
  app: Awaited<ReturnType<typeof buildApp>>;
  svc: GameService;
  hub: Hub;
  push: PushService;
  index: PrintingIndex;
  images: ImageCache;
  store: Store;
  dir: string;
  url: string;
  scryfallCalls: { url: string; headers: Record<string, string>; at: number }[];
  close(): Promise<void>;
}

export interface HarnessOptions {
  config?: Partial<Config>;
  hub?: Partial<HubOptions>;
  fetch?: (url: string) => Promise<Response>;
  sender?: PushSender | null;
  pushDelayMs?: number;
  store?: Store;
  gapMs?: number;
}

export async function startHarness(o: HarnessOptions = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "blg-test-"));
  const config: Config = {
    port: 0,
    host: "127.0.0.1",
    publicUrl: null,
    dataDir: dir,
    staticDir: null,
    vapid: o.sender ? { publicKey: "pub", privateKey: "priv" } : null,
    contactEmail: "test@example.com",
    trustProxy: false,
    imageCacheMaxMb: 1,
    autoPassMs: [20, 40],
    finishedRetentionDays: 30,
    idleRetentionDays: 14,
    ...o.config,
  };
  const store = o.store ?? new Store(":memory:");
  const svc = new GameService(store, { autoPassMs: config.autoPassMs });
  const scryfallCalls: Harness["scryfallCalls"] = [];
  const fakeFetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    scryfallCalls.push({ url: String(url), headers: init?.headers ?? {}, at: Date.now() });
    if (!o.fetch) throw new Error("network disabled in tests");
    return o.fetch(String(url));
  }) as unknown as typeof fetch;
  const client = new ScryfallClient({ contactEmail: config.contactEmail, fetch: fakeFetch, gapMs: o.gapMs ?? 100 });
  const index = new PrintingIndex(store, client);
  const images = new ImageCache(store, client, { dir: join(dir, "images"), maxBytes: config.imageCacheMaxMb * 1024 * 1024 });
  const hub: Hub = new Hub(svc, { knownPrinting: index.isKnown, ...o.hub });
  const push = new PushService(svc, store, o.sender ?? null, { isVisible: (g, s) => hub.isVisible(g, s), delayMs: o.pushDelayMs });
  hub.onVisibility(push.onVisibility);
  const app = await buildApp({ config, svc, hub, push, index, images });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  return {
    app, svc, hub, push, index, images, store, dir, scryfallCalls,
    url: `127.0.0.1:${port}`,
    async close() {
      hub.close();
      push.stop();
      svc.stop();
      await app.close();
    },
  };
}

export class Client {
  ws: WebSocket;
  msgs: any[] = [];
  closed: { code: number } | null = null;
  private waiters: (() => void)[] = [];

  constructor(url: string, headers: Record<string, string> = {}) {
    this.ws = new WebSocket(`ws://${url}/ws`, { headers });
    this.ws.on("message", (d) => {
      this.msgs.push(JSON.parse(d.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
    this.ws.on("close", (code) => {
      this.closed = { code };
      this.waiters.splice(0).forEach((w) => w());
    });
    this.ws.on("error", () => undefined);
  }

  opened(): Promise<this> {
    return new Promise((res, rej) => {
      this.ws.once("open", () => res(this));
      this.ws.once("close", () => rej(new Error("closed before open")));
    });
  }

  send(m: unknown): this {
    this.ws.send(JSON.stringify(m));
    return this;
  }

  async waitFor<T = any>(pred: (m: any) => boolean, ms = 2000): Promise<T> {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      if (this.closed) throw new Error(`socket closed (${this.closed.code}) while waiting; got ${JSON.stringify(this.msgs.map((m) => m.t))}`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timeout; got ${JSON.stringify(this.msgs.map((m) => m.t))}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }

  waitClosed(ms = 2000): Promise<number> {
    return new Promise((res, rej) => {
      if (this.closed) return res(this.closed.code);
      const t = setTimeout(() => rej(new Error("not closed")), ms);
      this.ws.once("close", (c) => {
        clearTimeout(t);
        res(c);
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

export async function connect(h: Harness, gameId: string, token: string, lastVersion?: number, headers?: Record<string, string>) {
  const c = await new Client(h.url, headers).opened();
  c.send({ t: "hello", gameId, token, ...(lastVersion !== undefined ? { lastVersion } : {}) });
  return c;
}

export async function post(h: Harness, path: string, body: unknown, headers: Record<string, string> = {}) {
  return h.app.inject({ method: "POST", url: path, payload: body as object, headers });
}
