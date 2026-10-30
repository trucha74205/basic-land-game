import webpush from "web-push";
import type { Action, Game, GameEvent, PlayerId } from "basic-land-engine";
import type { GameService, ServiceEvent } from "./games.js";
import type { Store } from "./store.js";

export interface PushPayload {
  title: string;
  body: string;
  gameId: string;
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushSender = (target: PushTarget, payload: PushPayload) => Promise<{ statusCode: number } | void>;

export function webPushSender(publicKey: string, privateKey: string, contactEmail: string): PushSender {
  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);
  return async (target, payload) => {
    try {
      const r = await webpush.sendNotification(target, JSON.stringify(payload), { TTL: 3600 });
      return { statusCode: r.statusCode };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status) return { statusCode: status };
      throw e;
    }
  };
}

export interface PushOptions {
  delayMs?: number;
  isVisible: (gameId: string, seat: PlayerId) => boolean;
  log?: (msg: string, err?: unknown) => void;
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Decides who should be notified (N-01, N-02) and sends public-only pushes after a delay (N-03 to N-07). */
export class PushService {
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private lastEvents = new Map<string, GameEvent[]>();

  constructor(
    private svc: GameService,
    private store: Store,
    private send: PushSender | null,
    private opts: PushOptions,
  ) {
    svc.on((e) => this.onService(e));
  }

  get enabled(): boolean {
    return this.send !== null;
  }

  /** Called when a socket reports visibility: a visible page cancels the pending push (N-04). */
  onVisibility = (gameId: string, seat: PlayerId): void => {
    if (this.opts.isVisible(gameId, seat)) this.cancel(gameId, seat);
  };

  private key = (gameId: string, seat: PlayerId) => `${gameId}:${seat}`;

  private cancel(gameId: string, seat: PlayerId): void {
    const k = this.key(gameId, seat);
    const t = this.pending.get(k);
    if (t) clearTimeout(t);
    this.pending.delete(k);
  }

  private onService(e: ServiceEvent): void {
    if (!this.send || (e.kind !== "update" && e.kind !== "started")) return;
    const peek = this.svc.peek(e.gameId);
    if (!peek) return;
    const fromVersion = e.kind === "update" ? e.fromVersion : -1; // -1: every event, including the first TurnStarted
    for (const seat of [0, 1] as const) {
      this.cancel(e.gameId, seat);
      const body = this.reason(e.gameId, seat, peek.game, fromVersion);
      if (!body) continue;
      const version = peek.version;
      this.pending.set(
        this.key(e.gameId, seat),
        setTimeout(() => {
          this.pending.delete(this.key(e.gameId, seat));
          const now = this.svc.peek(e.gameId);
          if (!now || now.version !== version || this.opts.isVisible(e.gameId, seat)) return;
          void this.deliver(e.gameId, seat, body);
        }, this.opts.delayMs ?? 5000),
      );
    }
  }

  /** Returns the push text for `seat` or null. Only public information is used (N-05). */
  private reason(gameId: string, seat: PlayerId, game: Game, fromVersion: number): { title: string; body: string } | null {
    const opp = this.svc.nicknameOf(gameId, other(seat));
    const events = this.svc.eventsPublic(gameId, fromVersion);
    const decision = this.decisionFor(gameId, seat, game);
    if (game.result) {
      if (game.result.kind === "cancelled" && events.some((x) => x.type === "GameCancelled")) return { title: "Game cancelled", body: `The game against ${opp} was cancelled` };
      return { title: "Game over", body: `The game against ${opp} is over` };
    }
    if (decision?.type === "CounterWindow") {
      const top = game.stack[game.stack.length - 1];
      const what = top?.kind === "landDrop" ? top.card.type : null;
      return { title: "Respond?", body: what ? `${opp} played ${what}: respond?` : `${opp} cast a counter: respond?` };
    }
    if (decision?.type === "ResolutionChoice") return { title: "Your choice", body: `Your choice is waiting in the game against ${opp}` };
    if (decision?.type === "MainPhase" && events.some((x) => x.type === "TurnStarted" && x.player === seat)) {
      return { title: "Your turn", body: `Your turn against ${opp}` };
    }
    return null;
  }

  private decisionFor(gameId: string, seat: PlayerId, game: Game) {
    const legal: Action[] = this.svc.legalForSeat(gameId, seat);
    const own = legal.filter((a) => a.type !== "Concede" && a.type !== "CancelGame");
    if (own.length === 0) return null;
    const p = game.pending;
    if (p.kind === "counterWindow") return own.some((a) => a.type === "Counter") ? { type: "CounterWindow" as const } : null;
    if (p.kind === "choice") return { type: "ResolutionChoice" as const };
    if (p.kind === "main") return { type: "MainPhase" as const };
    return null;
  }

  private async deliver(gameId: string, seat: PlayerId, text: { title: string; body: string }): Promise<void> {
    const payload: PushPayload = { ...text, gameId, tag: gameId };
    for (const sub of this.store.getPushSubs(gameId, seat)) {
      try {
        const r = await this.send!({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        if (r && (r.statusCode === 404 || r.statusCode === 410)) this.store.deletePushByEndpoint(sub.endpoint);
      } catch (err) {
        this.opts.log?.("push failed", err);
      }
    }
  }

  stop(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
