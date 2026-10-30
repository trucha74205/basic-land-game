import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushPayload, PushSender, PushTarget } from "../src/push.js";
import { PushService } from "../src/push.js";
import { newService, startGame } from "./helpers.js";
import { connect, startHarness } from "./harness.js";
import type { Harness } from "./harness.js";

describe("push decisions (unit, fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(visible: (g: string, s: number) => boolean = () => false, status = 201) {
    const { svc, store } = newService();
    const sent: { target: PushTarget; payload: PushPayload }[] = [];
    const sender: PushSender = async (target, payload) => {
      sent.push({ target, payload });
      return { statusCode: status };
    };
    const push = new PushService(svc, store, sender, { isVisible: (g, s) => visible(g, s), delayMs: 5000 });
    const s = startGame(svc);
    for (const seat of [0, 1] as const) store.upsertPush(s.gameId, seat, { endpoint: `https://push.example/${seat}`, p256dh: "k", auth: "a" }, 0);
    return { svc, store, push, sent, s };
  }

  it("N-01 N-03 pushes 'Your turn' after 5 seconds to a seat with no visible page", async () => {
    const { svc, sent, s } = setup();
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(4999);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.target.endpoint).toBe("https://push.example/1");
    expect(sent[0]!.payload).toMatchObject({ title: "Your turn", body: "Your turn against Anna", gameId: s.gameId, tag: s.gameId });
  });

  it("N-03 sends nothing while the page is visible", async () => {
    const { svc, sent, s } = setup((_g, seat) => seat === 1);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent).toHaveLength(0);
  });

  it("N-04 a page that becomes visible within the delay cancels the push", async () => {
    let visible = false;
    const { svc, push, sent, s } = setup(() => visible);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(2000);
    visible = true;
    push.onVisibility(s.gameId, 1);
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent).toHaveLength(0);
  });

  it("N-01 notifies a counter window only when a counter is possible, naming the land", async () => {
    const { svc, store, sent } = setup();
    const sub = (id: string) => store.upsertPush(id, 1, { endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" }, 0);
    const swampOf = (id: string) => svc.peek(id)!.game.players[0].hand.find((c) => c.type === "Swamp")!.id;

    const can = startGame(svc, {}, (g) => g.players[1].hand.some((c) => c.type === "Island") && g.players[0].hand.some((c) => c.type === "Swamp"));
    sub(can.gameId);
    svc.apply(can.gameId, 0, 0, { type: "PlayLand", card: swampOf(can.gameId) });
    await vi.advanceTimersByTimeAsync(5100);
    expect(sent.filter((x) => x.payload.gameId === can.gameId).at(-1)!.payload).toMatchObject({ title: "Respond?", body: "Anna played Swamp: respond?" });

    const none = startGame(svc, {}, (g) => g.players[1].hand.every((c) => c.type !== "Island") && g.players[0].hand.some((c) => c.type === "Swamp"));
    sub(none.gameId);
    svc.apply(none.gameId, 0, 0, { type: "PlayLand", card: swampOf(none.gameId) });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent.filter((x) => x.payload.gameId === none.gameId)).toHaveLength(0);
  });

  it("N-05 payloads carry public information only", async () => {
    const { svc, sent, s } = setup();
    const g = svc.peek(s.gameId)!.game;
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(6000);
    const text = JSON.stringify(sent.map((x) => x.payload));
    for (const c of [...g.players[0].hand, ...g.players[1].hand]) expect(text).not.toContain(c.id);
    expect(Object.keys(sent[0]!.payload).sort()).toEqual(["body", "gameId", "tag", "title"]);
  });

  it("N-02 notifies the other seat when the game ends", async () => {
    const { svc, sent, s } = setup((_g, seat) => seat === 0);
    svc.apply(s.gameId, 0, 0, { type: "Concede", player: 0 });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent.map((x) => x.payload.title)).toEqual(["Game over"]);
    expect(sent[0]!.target.endpoint).toBe("https://push.example/1");
  });

  it("N-07 deletes subscriptions whose endpoint answers 410", async () => {
    const { svc, store, s } = setup(() => false, 410);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(store.getPushSubs(s.gameId, 1)).toHaveLength(0);
    expect(store.getPushSubs(s.gameId, 0).length).toBeGreaterThanOrEqual(0);
  });

  it("is silent without a sender (push disabled, N-09)", async () => {
    const { svc, store } = newService();
    const push = new PushService(svc, store, null, { isVisible: () => false, delayMs: 10 });
    const s = startGame(svc);
    svc.apply(s.gameId, 0, 0, { type: "EndTurn" });
    await vi.advanceTimersByTimeAsync(100);
    expect(push.enabled).toBe(false);
  });
});

describe("push over HTTP and WebSocket", () => {
  let h: Harness;
  afterEach(async () => h?.close());

  it("N-08 N-09 registers and removes subscriptions with the seat token only", async () => {
    const sent: PushPayload[] = [];
    h = await startHarness({ sender: async (_t, p) => void sent.push(p), pushDelayMs: 30 });
    const c = (await h.app.inject({ method: "POST", url: "/api/games", payload: { nickname: "Anna", options: { firstPlayer: "me" } } })).json();
    const j = (await h.app.inject({ method: "POST", url: `/api/invites/${c.code}/join`, payload: { nickname: "Ben" } })).json();
    const sub = { subscription: { endpoint: "https://push.example/ben", keys: { p256dh: "pk", auth: "ak" } } };
    const url = `/api/games/${c.gameId}/push`;
    expect((await h.app.inject({ method: "PUT", url, payload: sub })).statusCode).toBe(401);
    expect((await h.app.inject({ method: "PUT", url, payload: sub, headers: { authorization: "Bearer nope" } })).statusCode).toBe(401);
    expect((await h.app.inject({ method: "PUT", url, payload: sub, headers: { authorization: `Bearer ${j.token}` } })).statusCode).toBe(204);
    expect(h.store.getPushSubs(c.gameId, 1)).toHaveLength(1);
    expect((await h.app.inject({ url: "/api/push/key" })).json()).toEqual({ key: "pub" });

    // Ben's page is hidden, so he gets a push; once visible he does not
    const a = await connect(h, c.gameId, c.token);
    const b = await connect(h, c.gameId, j.token);
    await b.waitFor((m) => m.t === "snapshot");
    a.send({ t: "action", version: 0, action: { type: "EndTurn" } });
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 1000 });
    expect(sent[0]!.body).toBe("Your turn against Anna");
    b.send({ t: "action", version: 1, action: { type: "EndTurn" } });
    await a.waitFor((m) => m.t === "update" && m.version === 2);
    b.send({ t: "visibility", visible: true });
    a.send({ t: "action", version: 2, action: { type: "EndTurn" } });
    await b.waitFor((m) => m.t === "update" && m.version === 3);
    await new Promise((r) => setTimeout(r, 120));
    expect(sent).toHaveLength(1);

    expect((await h.app.inject({ method: "DELETE", url, payload: sub, headers: { authorization: `Bearer ${j.token}` } })).statusCode).toBe(204);
    expect(h.store.getPushSubs(c.gameId, 1)).toHaveLength(0);
  });

  it("answers 404 for the key when VAPID is not configured", async () => {
    h = await startHarness();
    expect((await h.app.inject({ url: "/api/push/key" })).statusCode).toBe(404);
  });
});

