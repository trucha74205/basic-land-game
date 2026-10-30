import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RULES_VERSION } from "basic-land-engine";
import { HttpError } from "../src/games.js";
import { DEFAULT_ART_IDS } from "../src/default-art.js";
import { connected, handIds, newService, OPTS, startGame } from "./helpers.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("creating and joining", () => {
  it("W-11 W-12 creates a game, seats the guest and starts it", () => {
    const { svc, store } = newService();
    const c = svc.createGame("Anna", OPTS);
    expect(c.seat).toBe(0);
    expect(c.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(svc.inviteInfo(c.code)).toMatchObject({ creatorNickname: "Anna", full: false });
    const events: string[] = [];
    svc.on((e) => events.push(e.kind));
    const j = svc.join(c.code.toLowerCase(), "Ben");
    expect(j.seat).toBe(1);
    expect(events).toEqual(["started"]);
    expect(store.getGame(c.gameId)!.status).toBe("active");
    expect(svc.authenticate(c.gameId, c.token)).toBe(0);
    expect(svc.authenticate(c.gameId, j.token)).toBe(1);
    expect(svc.authenticate(c.gameId, "nope")).toBeNull();
  });

  it("W-14 rejects a third visitor", () => {
    const { svc } = newService();
    const c = svc.createGame("Anna", OPTS);
    svc.join(c.code, "Ben");
    expect(svc.inviteInfo(c.code).full).toBe(true);
    expect(() => svc.join(c.code, "Cleo")).toThrow(HttpError);
    try {
      svc.join(c.code, "Cleo");
    } catch (e) {
      expect((e as HttpError).status).toBe(409);
    }
  });

  it("answers 404 for an unknown or malformed code", () => {
    const { svc } = newService();
    expect(() => svc.inviteInfo("ZZZZZZZZ")).toThrow(/No game/);
    expect(() => svc.inviteInfo("short")).toThrow(/No game/);
  });

  it("W-20 passes engine options to the game and never exposes the seed in options", () => {
    const { svc, store } = newService();
    const c = svc.createGame("Anna", { deckSize: "half", emptyLibrary: "reshuffle", maxTurns: 30, firstPlayer: "opponent" });
    const cfg = store.getGame(c.gameId)!.config;
    expect(cfg).toMatchObject({ deckSize: "half", emptyLibrary: "reshuffle", maxTurns: 30, firstPlayer: 1 });
    expect(JSON.stringify(svc.inviteInfo(c.code))).not.toContain(String(cfg.seed));
  });
});

describe("actions", () => {
  it("P-03 applies a stale action at most once", () => {
    const { svc } = newService();
    const s = startGame(svc);
    expect(svc.apply(s.gameId, 0, 0, { type: "EndTurn" })).toEqual({ ok: true });
    const again = svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    expect(again).toMatchObject({ ok: false, reason: "stale_version", version: 1 });
  });

  it("rejects actions out of turn, illegal actions and impersonated concedes", () => {
    const { svc } = newService();
    const s = startGame(svc);
    expect(svc.apply(s.gameId, 1, 0, { type: "EndTurn" })).toMatchObject({ ok: false, reason: "not_your_turn" });
    expect(svc.apply(s.gameId, 0, 0, { type: "PlayLand", card: "does-not-exist" })).toMatchObject({ ok: false, reason: "illegal" });
    expect(svc.apply(s.gameId, 1, 0, { type: "Concede", player: 0 })).toMatchObject({ ok: false });
    expect(svc.peek(s.gameId)!.version).toBe(0);
  });

  it("persists every action and survives a restart with identical state (W-05, A-03)", () => {
    const { svc, store } = newService();
    const s = startGame(svc);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    svc.apply(s.gameId, 1, 1, { type: "EndTurn" });
    const before = JSON.stringify([svc.snapshot(s.gameId, 0, undefined, connected), svc.snapshot(s.gameId, 1, undefined, connected)]);
    svc.stop();
    const { svc: restarted } = newService(store);
    expect(restarted.snapshot(s.gameId, 0, undefined, connected)).toMatchObject({ version: 2 });
    expect(JSON.stringify([restarted.snapshot(s.gameId, 0, undefined, connected), restarted.snapshot(s.gameId, 1, undefined, connected)])).toBe(before);
  });

  it("A-06 abandons games with another rules version", () => {
    const { svc, store } = newService();
    const s = startGame(svc);
    svc.stop();
    store.db.prepare("UPDATE games SET rules_version = ? WHERE id = ?").run(RULES_VERSION + 1, s.gameId);
    const { svc: restarted } = newService(store);
    expect(restarted.statusOf(s.gameId)).toBe("abandoned");
    expect(restarted.apply(s.gameId, 0, 0, { type: "EndTurn" })).toMatchObject({ ok: false, reason: "game_over" });
  });

  it("P-06 sends only the missed events after a reconnect", () => {
    const { svc } = newService();
    const s = startGame(svc);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    svc.apply(s.gameId, 1, 1, { type: "EndTurn" });
    const all = svc.snapshot(s.gameId, 1, undefined, connected);
    const since1 = svc.snapshot(s.gameId, 1, 1, connected);
    const since2 = svc.snapshot(s.gameId, 1, 2, connected);
    if (all?.t !== "snapshot" || since1?.t !== "snapshot" || since2?.t !== "snapshot") throw new Error("snapshot expected");
    expect(since2.events).toEqual([]);
    expect(since1.events.length).toBeGreaterThan(0);
    expect(all.events.slice(all.events.length - since1.events.length)).toEqual(since1.events);
    expect(all.events.length).toBeGreaterThan(since1.events.length);
  });
});

describe("hidden information", () => {
  it("P-01 A-02 never sends the opponent's hand, library order, seed or options", () => {
    const { svc, store } = newService();
    const s = startGame(svc);
    const g = svc.peek(s.gameId)!.game;
    const forBen: string[] = [];
    forBen.push(JSON.stringify(svc.snapshot(s.gameId, 1, undefined, connected)));
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    forBen.push(JSON.stringify(svc.update(s.gameId, 1, 0, connected)));
    const text = forBen.join("\n");
    for (const id of handIds(g, 0)) expect(text).not.toContain(`"${id}"`);
    const after = svc.peek(s.gameId)!.game;
    for (const p of [0, 1] as const) for (const c of after.players[p].library) expect(text).not.toContain(`"${c.id}"`);
    expect(text).not.toContain(String(store.getGame(s.gameId)!.config.seed));
  });

  it("P-01 gives each seat only its own decision's actions plus concede and cancel", () => {
    const { svc } = newService();
    const s = startGame(svc);
    const mine = svc.legalForSeat(s.gameId, 0);
    const theirs = svc.legalForSeat(s.gameId, 1);
    expect(mine.some((a) => a.type === "EndTurn")).toBe(true);
    expect(theirs.map((a) => a.type).sort()).toEqual(["CancelGame", "Concede"]);
    expect(theirs.find((a) => a.type === "Concede")).toEqual({ type: "Concede", player: 1 });
  });
});

describe("auto-pass (P-08, W-35)", () => {
  it("passes a window without a possible counter after 1 to 3 seconds", () => {
    const { svc } = newService();
    const s = startGame(svc, {}, (g) => g.players[1].hand.every((c) => c.type !== "Island") && g.players[0].hand.some((c) => c.type === "Swamp"));
    const g = svc.peek(s.gameId)!.game;
    const swamp = g.players[0].hand.find((c) => c.type === "Swamp")!;
    // Swamp needs no target
    expect(svc.apply(s.gameId, 0, 0, { type: "PlayLand", card: swamp.id })).toEqual({ ok: true });
    const window = svc.peek(s.gameId)!;
    expect(window.game.pending.kind).toBe("counterWindow");
    expect(svc.legalForSeat(s.gameId, 1).some((a) => a.type === "PassCounter")).toBe(true);
    vi.advanceTimersByTime(999);
    expect(svc.peek(s.gameId)!.version).toBe(1);
    vi.advanceTimersByTime(1100); // random() = 0.5 -> 2000 ms
    expect(svc.peek(s.gameId)!.version).toBeGreaterThan(1);
    expect(svc.peek(s.gameId)!.game.pending.kind).not.toBe("counterWindow");
  });

  it("does not auto-pass when the defender can counter, and re-creates the timer after a restart", () => {
    const { svc, store } = newService();
    const s = startGame(
      svc,
      {},
      (g) => g.players[1].hand.filter((c) => c.type === "Island").length >= 1 && g.players[1].hand.length >= 2 && g.players[0].hand.some((c) => c.type === "Swamp"),
    );
    const g = svc.peek(s.gameId)!.game;
    svc.apply(s.gameId, 0, 0, { type: "PlayLand", card: g.players[0].hand.find((c) => c.type === "Swamp")!.id });
    vi.advanceTimersByTime(10_000);
    expect(svc.peek(s.gameId)!.game.pending.kind).toBe("counterWindow");
    svc.stop();
    const noIsland = startGame(svc, {}, (x) => x.players[1].hand.every((c) => c.type !== "Island") && x.players[0].hand.some((c) => c.type === "Swamp"));
    svc.apply(noIsland.gameId, 0, 0, { type: "PlayLand", card: svc.peek(noIsland.gameId)!.game.players[0].hand.find((c) => c.type === "Swamp")!.id });
    svc.stop();
    const { svc: restarted } = newService(store);
    restarted.resumeActive();
    vi.advanceTimersByTime(3100);
    expect(restarted.peek(noIsland.gameId)!.game.pending.kind).not.toBe("counterWindow");
  });
});

describe("cancel, concede, rematch", () => {
  it("W-39 cancel ends the game for both with no result", () => {
    const { svc, store } = newService();
    const s = startGame(svc);
    expect(svc.apply(s.gameId, 1, 0, { type: "CancelGame" })).toEqual({ ok: true });
    expect(store.getGame(s.gameId)!.status).toBe("cancelled");
    expect(svc.peek(s.gameId)!.game.result).toEqual({ kind: "cancelled" });
  });

  it("W-40 W-41 rematch starts after both votes with the loser first, keeping tokens", () => {
    const { svc } = newService();
    const s = startGame(svc);
    svc.apply(s.gameId, 0, 0, { type: "Concede", player: 0 }); // Anna (seat 0) loses
    expect(svc.statusOf(s.gameId)).toBe("finished");
    expect(svc.rematchVote(s.gameId, 0)).toEqual({ votes: [0], nextGameId: null });
    const r = svc.rematchVote(s.gameId, 1)!;
    expect(r.votes).toEqual([0, 1]);
    const next = r.nextGameId!;
    expect(svc.statusOf(next)).toBe("active");
    expect(svc.peek(next)!.game.firstPlayer).toBe(0);
    expect(svc.authenticate(next, s.tokens[0])).toBe(0);
    expect(svc.authenticate(next, s.tokens[1])).toBe(1);
    expect(svc.rematchVote(s.gameId, 0)!.nextGameId).toBe(next);
  });

  it("the other player goes first after seat 1 loses", () => {
    const { svc } = newService();
    const s = startGame(svc);
    svc.apply(s.gameId, 1, 0, { type: "Concede", player: 1 });
    svc.rematchVote(s.gameId, 0);
    const next = svc.rematchVote(s.gameId, 1)!.nextGameId!;
    expect(svc.peek(next)!.game.firstPlayer).toBe(1);
  });

  it("refuses rematch votes while the game runs", () => {
    const { svc } = newService();
    const s = startGame(svc);
    expect(svc.rematchVote(s.gameId, 0)).toBeNull();
  });
});

describe("art (I-31, I-32)", () => {
  it("stores known printings, treats defaults and null as default, rejects unknown ids", () => {
    const { svc } = newService();
    const s = startGame(svc);
    const custom = "11111111-1111-4111-8111-111111111111";
    const known = (l: string, id: string) => l === "Mountain" && id === custom;
    expect(svc.setArt(s.gameId, 0, { Mountain: custom }, known)).toBe(true);
    expect(svc.seatList(s.gameId)[0]!.art).toEqual({ Mountain: custom });
    expect(svc.setArt(s.gameId, 0, { Forest: "22222222-2222-4222-8222-222222222222" }, known)).toBe(false);
    expect(svc.setArt(s.gameId, 0, { Mountain: DEFAULT_ART_IDS.Mountain }, known)).toBe(true);
    expect(svc.seatList(s.gameId)[0]!.art).toEqual({ Mountain: null });
  });
});
