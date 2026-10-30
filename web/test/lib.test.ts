import { describe, expect, it, vi } from "vitest";
import { artUrl, DEFAULT_ART_IDS } from "../src/lib/art";
import { cueFor } from "../src/lib/cues";
import { describeEvent, landOfId } from "../src/lib/log";
import { takeTokenFromHash } from "../src/lib/session";
import { backoff, GameConnection } from "../src/lib/socket";
import type { SocketLike } from "../src/lib/socket";
import { emptyGame, reduceMessage } from "../src/lib/store";
import { t } from "../src/lib/i18n";

describe("art (W-60 to W-63, I-30 to I-32)", () => {
  it("uses the bundled default without a choice, for null and for the default id", () => {
    expect(artUrl("Forest", undefined, "art_crop")).toBe("/art/default/Forest.art_crop.jpg");
    expect(artUrl("Forest", { Forest: null }, "normal")).toBe("/art/default/Forest.normal.jpg");
    expect(artUrl("Forest", { Forest: DEFAULT_ART_IDS.Forest }, "art_crop")).toBe("/art/default/Forest.art_crop.jpg");
  });
  it("uses the image proxy for a custom printing", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(artUrl("Mountain", { Mountain: id }, "art_crop")).toBe(`/img/${id}/art_crop`);
    expect(artUrl("Mountain", { Mountain: id }, "small")).toBe(`/img/${id}/small`);
    expect(artUrl("Plains", { Mountain: id }, "art_crop")).toBe("/art/default/Plains.art_crop.jpg");
  });
});

describe("session helpers (W-13)", () => {
  it("reads the token from the URL fragment", () => {
    expect(takeTokenFromHash("#t=abc_DEF-1")).toBe("abc_DEF-1");
    expect(takeTokenFromHash("#x=1&t=zz")).toBe("zz");
    expect(takeTokenFromHash("")).toBeNull();
  });
});

describe("game log (W-37)", () => {
  const name = (p: number) => (p === 0 ? "Anna" : "Ben");
  it("describes public events and keeps redaction", () => {
    expect(describeEvent({ type: "LandPlayed", player: 0, card: { id: "p0-Mountain-3", type: "Mountain" } }, name)).toBe("Anna played Mountain");
    expect(describeEvent({ type: "TargetsDeclared", player: 0, source: "p0-Mountain-3", target: "p1-Forest-2" }, name)).toBe("Mountain targets Forest");
    expect(describeEvent({ type: "CardDrawn", player: 1 }, name)).toBe("Ben drew a card");
    expect(describeEvent({ type: "HandRevealed", by: 1, of: 0 }, name)).toBe("Ben looked at Anna's hand");
    expect(landOfId("weird")).toBe("a land");
  });
});

describe("reducer (P-02, P-06)", () => {
  const snap = (version: number, events: any[]) => ({ t: "snapshot", gameId: "g", seat: 1, version, status: "active", options: {}, seats: [], view: null, legalActions: [], events, rematch: { votes: [], nextGameId: null } });
  it("replaces the log on a first snapshot and appends missed events after a reconnect", () => {
    const a = { ...emptyGame, ...reduceMessage(emptyGame, snap(1, [{ type: "GameStarted", firstPlayer: 0 }])) };
    expect(a.log).toHaveLength(1);
    const b = { ...a, ...reduceMessage(a, snap(3, [{ type: "GameCancelled" }])) };
    expect(b.log).toHaveLength(2);
    expect(b.version).toBe(3);
    const other = { ...b, ...reduceMessage(b, { ...snap(0, []), gameId: "h" }) };
    expect(other.log).toHaveLength(0);
  });
  it("ignores updates that are not newer and records rejections", () => {
    const a = { ...emptyGame, version: 5 };
    expect(reduceMessage(a, { t: "update", version: 5 })).toEqual({});
    expect(reduceMessage(a, { t: "rejected", reason: "stale_version" })).toEqual({ notice: "stale_version" });
  });
});

describe("cues (W-50)", () => {
  const view = (decision: any, result: any = null) => ({ decision, result }) as any;
  it("cues the right moments for the right seat", () => {
    const turn = [{ type: "TurnStarted", player: 1, turn: 2 }] as any;
    expect(cueFor(view({ type: "MainPhase", player: 1 }), [], turn, 1)).toBe("turn");
    expect(cueFor(view({ type: "MainPhase", player: 1 }), [], [], 1)).toBeNull();
    expect(cueFor(view({ type: "MainPhase", player: 1 }), [], turn, 0)).toBeNull();
    expect(cueFor(view({ type: "CounterWindow", player: 1 }), [{ type: "PassCounter" }], [], 1)).toBeNull();
    expect(cueFor(view({ type: "CounterWindow", player: 1 }), [{ type: "Counter", island: "a", other: "b" }], [], 1)).toBe("respond");
    expect(cueFor(view({ type: "ResolutionChoice", player: 0 }), [], [], 0)).toBe("choice");
    expect(cueFor(view(null, { kind: "win" }), [], [{ type: "GameWon", player: 0, condition: "Mono" }], 0)).toBe("over");
  });
});

describe("connection (P-06)", () => {
  class Fake implements SocketLike {
    sent: any[] = [];
    onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
    send(d: string) { this.sent.push(JSON.parse(d)); }
    close() { this.onclose?.(); }
  }
  it("backs off between 0.5 s and 15 s with jitter", () => {
    expect(backoff(0, () => 0.5)).toBe(500);
    expect(backoff(3, () => 0.5)).toBe(4000);
    expect(backoff(10, () => 1)).toBe(15_000 * 1.25);
    expect(backoff(0, () => 0)).toBe(375);
  });
  it("says hello with the last version, reconnects after a drop and gives up on bad tokens", () => {
    vi.useFakeTimers();
    const socks: Fake[] = [];
    const statuses: string[] = [];
    let version: number | undefined;
    const c = new GameConnection({
      url: "ws://x", gameId: "g", token: "tok", getLastVersion: () => version, onMessage: () => {}, onStatus: (s) => statuses.push(s), isVisible: () => false,
      create: () => { const f = new Fake(); socks.push(f); return f; }, random: () => 0.5,
    });
    c.start();
    socks[0]!.onopen();
    expect(socks[0]!.sent[0]).toEqual({ t: "hello", gameId: "g", token: "tok" });
    expect(socks[0]!.sent[1]).toEqual({ t: "visibility", visible: false });
    socks[0]!.onmessage({ data: JSON.stringify({ t: "snapshot" }) });
    version = 7;
    socks[0]!.onclose();
    expect(statuses.at(-1)).toBe("reconnecting");
    vi.advanceTimersByTime(499);
    expect(socks).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(socks).toHaveLength(2);
    socks[1]!.onopen();
    expect(socks[1]!.sent[0]).toMatchObject({ lastVersion: 7 });
    socks[1]!.onmessage({ data: JSON.stringify({ t: "error", code: "bad_token" }) });
    expect(statuses.at(-1)).toBe("denied");
    socks[1]!.onclose();
    vi.advanceTimersByTime(60_000);
    expect(socks).toHaveLength(2);
    c.stop();
    vi.useRealTimers();
  });
});

describe("i18n (W-02)", () => {
  it("fills parameters", () => {
    expect(t("bar.waitingRespond", { name: "Ben" })).toBe("Waiting for Ben to respond");
  });
});
