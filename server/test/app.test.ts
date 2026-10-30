import { afterEach, describe, expect, it } from "vitest";
import { Client, connect, post, startHarness } from "./harness.js";
import type { Harness } from "./harness.js";
import { startGame } from "./helpers.js";

let h: Harness;
afterEach(async () => h?.close());

async function twoPlayers(opts: Parameters<typeof startHarness>[0] = {}) {
  h = await startHarness(opts);
  const c = (await post(h, "/api/games", { nickname: "Anna", options: { firstPlayer: "me" } })).json();
  const j = (await post(h, `/api/invites/${c.code}/join`, { nickname: "Ben" })).json();
  return { gameId: c.gameId as string, anna: c.token as string, ben: j.token as string, code: c.code as string };
}

describe("REST", () => {
  it("W-11 creates a game and lets a guest join by invite code", async () => {
    h = await startHarness();
    const res = await post(h, "/api/games", { nickname: "  Anna ", options: { deckSize: "half", maxTurns: 30 } });
    expect(res.statusCode).toBe(200);
    const c = res.json();
    expect(c).toMatchObject({ seat: 0 });
    const info = (await h.app.inject({ url: `/api/invites/${c.code}` })).json();
    expect(info).toMatchObject({ creatorNickname: "Anna", full: false, options: { deckSize: "half", emptyLibrary: "lose", maxTurns: 30 } });
    const join = await post(h, `/api/invites/${c.code}/join`, { nickname: "Ben" });
    expect(join.json()).toMatchObject({ seat: 1, gameId: c.gameId });
  });

  it("W-14 answers 409 for a full game and 404 for an unknown code", async () => {
    const { code } = await twoPlayers();
    const full = await post(h, `/api/invites/${code}/join`, { nickname: "Cleo" });
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe("game_full");
    expect((await h.app.inject({ url: "/api/invites/ZZZZZZZZ" })).statusCode).toBe(404);
  });

  it("validates nicknames and options", async () => {
    h = await startHarness();
    for (const body of [{ nickname: "" }, { nickname: "x".repeat(21) }, { nickname: "a\u0007b" }, { nickname: "A", options: { deckSize: "tiny" } }, { nickname: "A", extra: 1 }]) {
      const r = await post(h, "/api/games", body);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe("bad_request");
    }
  });

  it("S-06 sets security headers, healthz reports the rules version", async () => {
    h = await startHarness();
    const r = await h.app.inject({ url: "/healthz" });
    expect(r.json()).toMatchObject({ ok: true, rulesVersion: 1 });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["referrer-policy"]).toBe("no-referrer");
    expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'none'");
    expect(String(r.headers["content-security-policy"])).toContain("script-src 'self';");
    expect((await h.app.inject({ url: "/nothing" })).statusCode).toBe(404);
  });
});

describe("WebSocket", () => {
  it("W-12 W-13 authenticates seats and sends a snapshot; the same token works on a second device", async () => {
    const { gameId, anna, ben } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    const snap = await a.waitFor((m) => m.t === "snapshot");
    expect(snap).toMatchObject({ seat: 0, version: 0, status: "active", view: { viewer: 0 } });
    expect(snap.legalActions.some((x: any) => x.type === "EndTurn")).toBe(true);
    const b = await connect(h, gameId, ben);
    const bs = await b.waitFor((m) => m.t === "snapshot");
    expect(bs.legalActions.map((x: any) => x.type).sort()).toEqual(["CancelGame", "Concede"]);
    const a2 = await connect(h, gameId, anna);
    expect((await a2.waitFor((m) => m.t === "snapshot")).seat).toBe(0);
    [a, b, a2].forEach((c) => c.close());
  });

  it("rejects bad tokens, unknown games and silent sockets", async () => {
    const { gameId } = await twoPlayers({ hub: { helloTimeoutMs: 80 } });
    const bad = await connect(h, gameId, "wrong");
    expect((await bad.waitFor((m) => m.t === "error")).code).toBe("bad_token");
    const missing = await connect(h, "nope", "x");
    expect((await missing.waitFor((m) => m.t === "error")).code).toBe("game_not_found");
    const silent = await new Client(h.url).opened();
    expect(await silent.waitClosed()).toBe(4001);
  });

  it("closes sockets on malformed or oversized messages", async () => {
    const { gameId, anna } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    await a.waitFor((m) => m.t === "snapshot");
    a.ws.send("{not json");
    expect((await a.waitFor((m) => m.t === "error")).code).toBe("bad_message");
    const b = await connect(h, gameId, anna);
    await b.waitFor((m) => m.t === "snapshot");
    b.ws.send(JSON.stringify({ t: "ping", pad: "x".repeat(5000) }));
    expect(await b.waitClosed()).toBeGreaterThan(0);
  });

  it("P-03 P-04 applies an action once, broadcasts to both seats, rejects the repeat as stale", async () => {
    const { gameId, anna, ben } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    const b = await connect(h, gameId, ben);
    await a.waitFor((m) => m.t === "snapshot");
    await b.waitFor((m) => m.t === "snapshot");
    a.send({ t: "action", version: 0, action: { type: "EndTurn" } }).send({ t: "action", version: 0, action: { type: "EndTurn" } });
    const ua = await a.waitFor((m) => m.t === "update");
    const ub = await b.waitFor((m) => m.t === "update");
    expect(ua.version).toBe(1);
    expect(ub.view.viewer).toBe(1);
    expect(ub.legalActions.some((x: any) => x.type === "EndTurn")).toBe(true);
    expect(ua.legalActions.map((x: any) => x.type).sort()).toEqual(["CancelGame", "Concede"]);
    const rej = await a.waitFor((m) => m.t === "rejected");
    expect(rej).toMatchObject({ reason: "stale_version", version: 1 });
    await a.waitFor((m) => m.t === "snapshot" && m.version === 1);
    expect(a.msgs.filter((m) => m.t === "update")).toHaveLength(1);
  });

  it("P-05 both devices of a seat receive updates", async () => {
    const { gameId, anna } = await twoPlayers();
    const a1 = await connect(h, gameId, anna);
    const a2 = await connect(h, gameId, anna);
    await a1.waitFor((m) => m.t === "snapshot");
    await a2.waitFor((m) => m.t === "snapshot");
    a1.send({ t: "action", version: 0, action: { type: "EndTurn" } });
    await a1.waitFor((m) => m.t === "update");
    await a2.waitFor((m) => m.t === "update");
  });

  it("P-01 A-02 nothing sent to Ben contains Anna's hand, library or the seed", async () => {
    const { gameId, anna, ben } = await twoPlayers();
    const g = h.svc.peek(gameId)!.game;
    const seed = String(h.store.getGame(gameId)!.config.seed);
    const a = await connect(h, gameId, anna);
    const b = await connect(h, gameId, ben);
    await b.waitFor((m) => m.t === "snapshot");
    a.send({ t: "action", version: 0, action: { type: "EndTurn" } });
    await b.waitFor((m) => m.t === "update");
    const text = JSON.stringify(b.msgs);
    for (const c of [...g.players[0].hand, ...g.players[0].library]) expect(text).not.toContain(`"${c.id}"`);
    expect(text).not.toContain(seed);
    expect(text).not.toContain('"log"');
  });

  it("P-06 W-05 presence shows a disconnect and the reconnect delivers only missed events", async () => {
    const { gameId, anna, ben } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    let b = await connect(h, gameId, ben);
    const first = await b.waitFor((m) => m.t === "snapshot");
    await a.waitFor((m) => m.t === "presence" && m.seats.every((s: any) => s.connected));
    b.close();
    const gone = await a.waitFor((m) => m.t === "presence" && m.seats.some((s: any) => s.seat === 1 && !s.connected));
    expect(gone.seats.find((s: any) => s.seat === 1).nickname).toBe("Ben");
    a.send({ t: "action", version: 0, action: { type: "EndTurn" } });
    await a.waitFor((m) => m.t === "update");
    b = await connect(h, gameId, ben, first.version);
    const back = await b.waitFor((m) => m.t === "snapshot");
    expect(back.version).toBe(1);
    expect(back.events.map((e: any) => e.type)).toContain("TurnStarted");
    expect(back.events.length).toBeLessThan(5);
    await a.waitFor((m) => m.t === "presence" && m.seats.every((s: any) => s.connected));
  });

  it("W-05 A-03 a restarted server serves the same state", async () => {
    const { gameId, anna } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    const s0 = await a.waitFor((m) => m.t === "snapshot");
    a.send({ t: "action", version: 0, action: { type: "EndTurn" } });
    await a.waitFor((m) => m.t === "update");
    a.close();
    const store = h.store;
    h.svc.stop();
    await h.app.close();
    h.hub.close();
    h = await startHarness({ store });
    const a2 = await connect(h, gameId, anna);
    const s1 = await a2.waitFor((m) => m.t === "snapshot");
    expect(s1.version).toBe(1);
    expect(s1.view.hand).toEqual(s0.view.hand);
  });

  it("P-08 W-35 a window without a possible counter resolves by itself after a short delay", async () => {
    h = await startHarness();
    const s = startGame(h.svc, { firstPlayer: "me" }, (g) => g.players[0].hand.some((x) => x.type === "Swamp") && g.players[1].hand.every((x) => x.type !== "Island"));
    const [gameId, anna, ben] = [s.gameId, s.tokens[0], s.tokens[1]];
    const swamp = h.svc.peek(gameId)!.game.players[0].hand.find((x) => x.type === "Swamp")!.id;
    const a = await connect(h, gameId, anna);
    const b = await connect(h, gameId, ben);
    await a.waitFor((m) => m.t === "snapshot");
    a.send({ t: "action", version: 0, action: { type: "PlayLand", card: swamp } });
    const first = await b.waitFor((m) => m.t === "update" && m.view.decision?.type === "CounterWindow");
    expect(first.legalActions.some((x: any) => x.type === "Counter")).toBe(false);
    const later = await b.waitFor((m) => m.t === "update" && m.version > first.version);
    expect(later.events.map((e: any) => e.type)).toContain("LandEntered");
  });

  it("S-02 refuses a foreign Origin when PUBLIC_URL is set", async () => {
    h = await startHarness({ config: { publicUrl: "https://blg.example.org" } });
    const bad = await new Client(h.url, { Origin: "https://evil.example" }).opened();
    expect(await bad.waitClosed()).toBe(4003);
    const ok = await new Client(h.url, { Origin: "https://blg.example.org" }).opened();
    ok.send({ t: "ping" });
    await ok.waitFor((m) => m.t === "pong");
  });

  it("I-31 rejects art ids that are not in the printing index", async () => {
    const { gameId, anna } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    await a.waitFor((m) => m.t === "snapshot");
    a.send({ t: "art", art: { Mountain: "11111111-1111-4111-8111-111111111111" } });
    expect((await a.waitFor((m) => m.t === "rejected")).reason).toBe("bad_art");
    expect(h.scryfallCalls).toHaveLength(0);
  });

  it("W-39 W-40 cancel then rematch over the socket", async () => {
    const { gameId, anna, ben } = await twoPlayers();
    const a = await connect(h, gameId, anna);
    const b = await connect(h, gameId, ben);
    await a.waitFor((m) => m.t === "snapshot");
    b.send({ t: "action", version: 0, action: { type: "CancelGame" } });
    expect((await a.waitFor((m) => m.t === "update")).status).toBe("cancelled");
    a.send({ t: "rematch" });
    await b.waitFor((m) => m.t === "rematch" && m.votes.length === 1);
    b.send({ t: "rematch" });
    const done = await a.waitFor((m) => m.t === "rematch" && m.nextGameId);
    const next = await connect(h, done.nextGameId, anna);
    expect((await next.waitFor((m) => m.t === "snapshot")).status).toBe("active");
  });
});
