import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCleanup } from "../src/cleanup.js";
import { ImageCache, PrintingIndex, ScryfallClient } from "../src/scryfall.js";
import { Store } from "../src/store.js";
import { newService, startGame } from "./helpers.js";
import { startHarness } from "./harness.js";
import type { Harness } from "./harness.js";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const card = (id: string, artist: string, year: number) => ({
  id,
  set: "tst",
  set_name: "Test Set",
  artist,
  collector_number: "1",
  released_at: `${year}-01-01`,
  image_uris: {
    small: `https://cards.scryfall.io/small/${id}.jpg`,
    normal: `https://cards.scryfall.io/normal/${id}.jpg`,
    art_crop: `https://cards.scryfall.io/art_crop/${id}.jpg`,
  },
});

/** Two result pages for any land search, JPEG-ish bytes for images. */
function fakeScryfall(opts: { fail?: () => boolean } = {}) {
  return async (url: string): Promise<Response> => {
    if (opts.fail?.()) return new Response("no", { status: 503 });
    if (url.startsWith("https://api.scryfall.com/cards/search")) {
      if (url.includes("page=2")) return Response.json({ has_more: false, data: [card(ID_C, "Anna Podedworna", 2020)] });
      return Response.json({
        has_more: true,
        next_page: `${url}&page=2`,
        data: [card(ID_A, "Rebecca Guay", 2024), card(ID_B, "Jesper Ejsing", 2022), { ...card("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "x", 2000), image_uris: undefined }],
      });
    }
    if (url.startsWith("https://cards.scryfall.io/")) return new Response(Buffer.alloc(600, 7), { headers: { "content-type": "image/jpeg" } });
    return new Response("?", { status: 404 });
  };
}

let h: Harness;
afterEach(async () => h?.close());

describe("custom art (W-63, I-03)", () => {
  it("contacts Scryfall only when the picker asks, answering 202 while it builds", async () => {
    h = await startHarness({ fetch: fakeScryfall(), gapMs: 5 });
    await startGame(h.svc);
    expect(h.scryfallCalls).toHaveLength(0);

    const first = await h.app.inject({ url: "/api/printings/Forest" });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ status: "building" });
    await h.index.idle();
    const ready = await h.app.inject({ url: "/api/printings/Forest" });
    expect(ready.statusCode).toBe(200);
    expect(ready.headers["cache-control"]).toBe("public, max-age=3600");
    expect(ready.json().printings.map((p: any) => [p.id, p.artist, p.year])).toEqual([
      [ID_A, "Rebecca Guay", 2024],
      [ID_B, "Jesper Ejsing", 2022],
      [ID_C, "Anna Podedworna", 2020],
    ]);
    expect(h.scryfallCalls).toHaveLength(2); // two pages, cards without images are skipped
    expect(h.scryfallCalls.some((c) => c.url.includes("Plains"))).toBe(false);
    expect((await h.app.inject({ url: "/api/printings/Wastes" })).statusCode).toBe(404);
  });

  it("I-01 identifies itself and keeps 100 ms between requests", async () => {
    h = await startHarness({ fetch: fakeScryfall() });
    await h.app.inject({ url: "/api/printings/Mountain" });
    await h.index.idle();
    await h.app.inject({ url: `/img/${ID_A}/art_crop` });
    await h.app.inject({ url: `/img/${ID_B}/small` });
    const calls = h.scryfallCalls;
    expect(calls.length).toBe(4);
    for (const c of calls) {
      expect(c.headers["User-Agent"]).toMatch(/BasicLandGame\/.*test@example\.com/);
      expect(c.headers["Accept"]).toBeTruthy();
    }
    for (let i = 1; i < calls.length; i++) expect(calls[i]!.at - calls[i - 1]!.at).toBeGreaterThanOrEqual(95);
  });

  it("I-31 accepts a known printing for the matching land type only", async () => {
    h = await startHarness({ fetch: fakeScryfall(), gapMs: 1 });
    await h.app.inject({ url: "/api/printings/Mountain" });
    await h.index.idle();
    expect(h.index.isKnown("Mountain", ID_A)).toBe(true);
    expect(h.index.isKnown("Forest", ID_A)).toBe(false);
  });

  it("I-03 keeps the old index and retries after an hour when a refresh fails", async () => {
    const store = new Store(":memory:");
    let t = Date.UTC(2026, 0, 1);
    let failing = false;
    let calls = 0;
    const client = new ScryfallClient({ contactEmail: "t@example.com", gapMs: 0, fetch: (async (u: string) => (calls++, fakeScryfall({ fail: () => failing })(u))) as never });
    const index = new PrintingIndex(store, client, { now: () => t });
    expect(index.request("Plains").state).toBe("building");
    await index.idle();
    expect(index.request("Plains").state).toBe("ready");
    const callsAfterBuild = calls;

    t += 31 * 86_400_000;
    failing = true;
    const stale = index.request("Plains"); // serves old data and starts a refresh
    expect(stale.state).toBe("ready");
    await index.idle();
    expect(calls).toBeGreaterThan(callsAfterBuild);
    const afterFail = calls;
    expect(index.request("Plains").state).toBe("ready");
    await index.idle();
    expect(calls).toBe(afterFail); // no retry within the hour

    t += 3_600_001;
    failing = false;
    index.request("Plains");
    await index.idle();
    expect(calls).toBeGreaterThan(afterFail);
    expect(store.printingsFetchedAt("Plains")).toBe(t);
  });
});

describe("image proxy (I-10 to I-15)", () => {
  it("I-10 S-05 answers 404 without any outbound request for unknown ids and versions", async () => {
    h = await startHarness({ fetch: fakeScryfall(), gapMs: 1 });
    expect((await h.app.inject({ url: `/img/${ID_A}/art_crop` })).statusCode).toBe(404);
    expect((await h.app.inject({ url: "/img/not-a-uuid/art_crop" })).statusCode).toBe(404);
    expect((await h.app.inject({ url: `/img/${ID_A}/../../etc` })).statusCode).toBe(404);
    await h.app.inject({ url: "/api/printings/Forest" });
    await h.index.idle();
    const calls = h.scryfallCalls.length;
    expect((await h.app.inject({ url: `/img/${ID_A}/huge` })).statusCode).toBe(404);
    expect((await h.app.inject({ url: `/img/${ID_A}.png/normal` })).statusCode).toBe(404);
    expect(h.scryfallCalls.length).toBe(calls);
  });

  it("S-05 never fetches from another host even if the index row says so", async () => {
    h = await startHarness({ fetch: fakeScryfall(), gapMs: 1 });
    h.store.replacePrintings("Forest", [
      { scryfallId: ID_A, landType: "Forest", setCode: "x", setName: "x", artist: "x", collectorNumber: "1", releasedAt: "2020-01-01", images: { normal: "https://evil.example/x.jpg" }, fetchedAt: Date.now() },
    ]);
    expect((await h.app.inject({ url: `/img/${ID_A}/normal` })).statusCode).toBe(404);
    expect(h.scryfallCalls).toHaveLength(0);
  });

  it("I-11 I-12 downloads once for concurrent requests and serves with long-lived cache headers", async () => {
    h = await startHarness({ fetch: fakeScryfall(), gapMs: 1 });
    await h.app.inject({ url: "/api/printings/Forest" });
    await h.index.idle();
    const before = h.scryfallCalls.length;
    const rs = await Promise.all([1, 2, 3].map(() => h.app.inject({ url: `/img/${ID_A}/art_crop` })));
    expect(rs.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(h.scryfallCalls.length - before).toBe(1);
    expect(rs[0]!.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(rs[0]!.headers["content-type"]).toBe("image/jpeg");
    expect(rs[0]!.rawPayload.length).toBe(600);
    const etag = String(rs[0]!.headers.etag);
    expect(etag).toMatch(/^"/);
    const again = await h.app.inject({ url: `/img/${ID_A}/art_crop`, headers: { "if-none-match": etag } });
    expect(again.statusCode).toBe(304);
    expect(h.scryfallCalls.length - before).toBe(1);
    expect(existsSync(join(h.dir, "images", ID_A, "art_crop.jpg"))).toBe(true);
  });

  it("I-13 answers 502 when Scryfall is unreachable and the image is not cached", async () => {
    let down = false;
    h = await startHarness({ fetch: fakeScryfall({ fail: () => down }), gapMs: 1 });
    await h.app.inject({ url: "/api/printings/Forest" });
    await h.index.idle();
    down = true;
    const r = await h.app.inject({ url: `/img/${ID_B}/normal` });
    expect(r.statusCode).toBe(502);
    expect(r.json().error.code).toBe("scryfall_unavailable");
    down = false;
    expect((await h.app.inject({ url: `/img/${ID_B}/normal` })).statusCode).toBe(200);
  });

  it("I-15 evicts the least recently accessed files when the cache is over its cap", async () => {
    const store = new Store(":memory:");
    store.replacePrintings("Forest", [ID_A, ID_B, ID_C].map((id) => ({ scryfallId: id, landType: "Forest" as const, setCode: "t", setName: "t", artist: "t", collectorNumber: "1", releasedAt: "2020-01-01", images: card(id, "t", 2020).image_uris, fetchedAt: 0 })));
    const dir = mkdtempSync(join(tmpdir(), "blg-img-"));
    let t = 1000;
    const client = new ScryfallClient({ contactEmail: "t@example.com", gapMs: 0, fetch: fakeScryfall() as never });
    const cache = new ImageCache(store, client, { dir, maxBytes: 1500, now: () => t++ });
    await cache.get(ID_A, "normal");
    await cache.get(ID_B, "normal");
    await cache.get(ID_A, "normal"); // A is now more recent than B
    await cache.get(ID_C, "normal"); // 1800 bytes > 1500: B goes
    expect(existsSync(join(dir, ID_B, "normal.jpg"))).toBe(false);
    expect(existsSync(join(dir, ID_A, "normal.jpg"))).toBe(true);
    expect(existsSync(join(dir, ID_C, "normal.jpg"))).toBe(true);
  });
});

describe("retention", () => {
  const DAY = 86_400_000;
  it("deletes finished games after 30 days and idle games after 14", async () => {
    vi.useFakeTimers();
    try {
      const { svc, store } = newService();
      const finished = startGame(svc);
      svc.apply(finished.gameId, 0, 0, { type: "Concede", player: 0 });
      const idle = startGame(svc);
      const fresh = startGame(svc);
      const t0 = Date.now();
      store.db.prepare("UPDATE games SET updated_at = ?, finished_at = ? WHERE id = ?").run(t0 - 31 * DAY, t0 - 31 * DAY, finished.gameId);
      store.db.prepare("UPDATE games SET updated_at = ? WHERE id = ?").run(t0 - 15 * DAY, idle.gameId);
      const images = new ImageCache(store, new ScryfallClient({ contactEmail: "t@example.com" }), { dir: mkdtempSync(join(tmpdir(), "blg-r-")), maxBytes: 1 });
      const r = await runCleanup(svc, images, { finishedRetentionDays: 30, idleRetentionDays: 14 }, t0);
      expect(r.games).toBe(2);
      expect(store.getGame(finished.gameId)).toBeNull();
      expect(store.getGame(idle.gameId)).toBeNull();
      expect(store.getSeats(idle.gameId)).toHaveLength(0);
      expect(store.getGame(fresh.gameId)).not.toBeNull();
      expect(svc.statusOf(finished.gameId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
