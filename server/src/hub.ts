import type { WebSocket } from "ws";
import type { PlayerId } from "basic-land-engine";
import type { GameService, ServiceEvent } from "./games.js";
import { clientMessage } from "./protocol.js";
import type { ServerMessage } from "./protocol.js";
import type { LandType } from "basic-land-engine";

interface Conn {
  ws: WebSocket;
  gameId: string | null;
  seat: PlayerId | null;
  visible: boolean;
  lastHeard: number;
  msgTimes: number[];
}

export interface HubOptions {
  helloTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxMessagesPerSecond?: number;
  knownPrinting: (land: LandType, id: string) => boolean;
  now?: () => number;
}

export interface PresenceListener {
  (gameId: string, seat: PlayerId): void;
}

/** WebSocket connections, seat authentication, presence and filtered fan-out (P-01 to P-07). */
export class Hub {
  private conns = new Set<Conn>();
  private sweep: ReturnType<typeof setInterval>;
  private visibilityListeners = new Set<PresenceListener>();
  private now: () => number;

  constructor(
    private svc: GameService,
    private opts: HubOptions,
  ) {
    this.now = opts.now ?? Date.now;
    svc.on((e) => this.onService(e));
    this.sweep = setInterval(() => this.closeIdle(), 10_000);
    this.sweep.unref();
  }

  close(): void {
    clearInterval(this.sweep);
    for (const c of this.conns) c.ws.close(1001, "server shutting down");
  }

  onVisibility(fn: PresenceListener): void {
    this.visibilityListeners.add(fn);
  }

  isConnected = (gameId: string) => (seat: number): boolean => this.seatConns(gameId, seat as PlayerId).length > 0;

  /** True while at least one socket of the seat reports a visible page (N-03). */
  isVisible(gameId: string, seat: PlayerId): boolean {
    return this.seatConns(gameId, seat).some((c) => c.visible);
  }

  private seatConns(gameId: string, seat: PlayerId): Conn[] {
    return [...this.conns].filter((c) => c.gameId === gameId && c.seat === seat && c.ws.readyState === 1);
  }

  private send(c: Conn, msg: ServerMessage): void {
    if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  }

  private broadcastPresence(gameId: string): void {
    const seats = this.svc.seatList(gameId).map((s) => ({ ...s, connected: this.isConnected(gameId)(s.seat) }));
    for (const c of this.conns) if (c.gameId === gameId) this.send(c, { t: "presence", seats });
  }

  private onService(e: ServiceEvent): void {
    const conns = [...this.conns].filter((c) => c.gameId === e.gameId && c.seat !== null);
    const connected = this.isConnected(e.gameId);
    for (const c of conns) {
      if (e.kind === "started") {
        const m = this.svc.snapshot(e.gameId, c.seat!, undefined, connected);
        if (m) this.send(c, m);
      } else if (e.kind === "update") {
        const m = this.svc.update(e.gameId, c.seat!, e.fromVersion, connected);
        if (m) this.send(c, m);
      } else if (e.kind === "seats") {
        this.send(c, { t: "presence", seats: this.svc.seatList(e.gameId).map((s) => ({ ...s, connected: connected(s.seat) })) });
      } else {
        this.send(c, { t: "rematch", ...this.svc.rematchState(e.gameId) });
      }
    }
  }

  private closeIdle(): void {
    const limit = this.opts.idleTimeoutMs ?? 60_000;
    const t = this.now();
    for (const c of this.conns) if (t - c.lastHeard > limit) c.ws.close(4000, "idle");
  }

  attach(ws: WebSocket): void {
    const c: Conn = { ws, gameId: null, seat: null, visible: false, lastHeard: this.now(), msgTimes: [] };
    this.conns.add(c);
    const helloTimer = setTimeout(() => {
      if (!c.gameId) ws.close(4001, "hello required");
    }, this.opts.helloTimeoutMs ?? 5000);
    ws.on("message", (data, isBinary) => this.onMessage(c, data.toString(), isBinary));
    ws.on("close", () => {
      clearTimeout(helloTimer);
      this.conns.delete(c);
      if (c.gameId) this.broadcastPresence(c.gameId);
    });
    ws.on("error", () => ws.close());
  }

  private fail(c: Conn, code: Extract<ServerMessage, { t: "error" }>["code"], message: string): void {
    this.send(c, { t: "error", code, message });
    c.ws.close(4002, code);
  }

  private onMessage(c: Conn, raw: string, isBinary: boolean): void {
    const t = this.now();
    c.lastHeard = t;
    c.msgTimes = c.msgTimes.filter((x) => t - x < 1000);
    c.msgTimes.push(t);
    if (c.msgTimes.length > (this.opts.maxMessagesPerSecond ?? 20)) return this.fail(c, "rate_limited", "Too many messages");
    if (isBinary || raw.length > 4096) return this.fail(c, "bad_message", "Message too large");
    let msg;
    try {
      msg = clientMessage.parse(JSON.parse(raw));
    } catch {
      return this.fail(c, "bad_message", "Invalid message");
    }

    if (msg.t === "ping") return this.send(c, { t: "pong" });

    if (msg.t === "hello") {
      const seat = this.svc.authenticate(msg.gameId, msg.token);
      if (seat === null) return this.fail(c, this.svc.statusOf(msg.gameId) === null ? "game_not_found" : "bad_token", "Cannot join this game");
      c.gameId = msg.gameId;
      c.seat = seat;
      const snap = this.svc.snapshot(msg.gameId, seat, msg.lastVersion, this.isConnected(msg.gameId));
      if (snap) this.send(c, snap);
      this.broadcastPresence(msg.gameId);
      return;
    }

    if (c.gameId === null || c.seat === null) return this.fail(c, "bad_message", "hello first");
    const { gameId, seat } = c;

    switch (msg.t) {
      case "action": {
        const r = this.svc.apply(gameId, seat, msg.version, msg.action);
        if (!r.ok) {
          this.send(c, { t: "rejected", reason: r.reason, version: r.version });
          if (r.reason === "stale_version") {
            const snap = this.svc.snapshot(gameId, seat, msg.version, this.isConnected(gameId));
            if (snap) this.send(c, snap);
          }
        }
        return;
      }
      case "art": {
        if (!this.svc.setArt(gameId, seat, msg.art, this.opts.knownPrinting)) {
          this.send(c, { t: "rejected", reason: "bad_art", version: this.svc.peek(gameId)?.version ?? 0 });
        }
        return;
      }
      case "rematch":
        this.svc.rematchVote(gameId, seat);
        return;
      case "visibility":
        c.visible = msg.visible;
        for (const fn of this.visibilityListeners) fn(gameId, seat);
        return;
    }
  }
}
