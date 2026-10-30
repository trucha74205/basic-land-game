export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export type ConnStatus = "connecting" | "open" | "reconnecting" | "denied" | "stopped";

export interface ConnectionOptions {
  url: string;
  gameId: string;
  token: string;
  getLastVersion: () => number | undefined;
  onMessage: (m: any) => void;
  onStatus: (s: ConnStatus) => void;
  isVisible?: () => boolean;
  create?: (url: string) => SocketLike;
  random?: () => number;
  timers?: { set: typeof setTimeout; clear: typeof clearTimeout };
}

/** Delay before reconnect attempt `n` (0-based): 0.5 s doubling to 15 s, with jitter (P-06). */
export const backoff = (n: number, random: () => number): number => Math.min(15_000, 500 * 2 ** n) * (0.75 + random() * 0.5);

export class GameConnection {
  private sock: SocketLike | null = null;
  private attempts = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private random: () => number;
  private timers: NonNullable<ConnectionOptions["timers"]>;

  constructor(private o: ConnectionOptions) {
    this.random = o.random ?? Math.random;
    this.timers = o.timers ?? { set: setTimeout, clear: clearTimeout };
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) this.timers.clear(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.sock?.close();
    this.sock = null;
    this.o.onStatus("stopped");
  }

  /** Reconnect right away, for example when the browser comes back online. */
  nudge(): void {
    if (this.stopped || this.sock) return;
    if (this.retryTimer) this.timers.clear(this.retryTimer);
    this.open();
  }

  send(msg: unknown): boolean {
    if (!this.sock) return false;
    this.sock.send(JSON.stringify(msg));
    return true;
  }

  sendVisibility(visible: boolean): void {
    this.send({ t: "visibility", visible });
  }

  private open(): void {
    this.o.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    const sock = (this.o.create ?? ((u) => new WebSocket(u) as unknown as SocketLike))(this.o.url);
    this.sock = sock;
    sock.onopen = () => {
      const last = this.o.getLastVersion();
      sock.send(JSON.stringify({ t: "hello", gameId: this.o.gameId, token: this.o.token, ...(last !== undefined ? { lastVersion: last } : {}) }));
      sock.send(JSON.stringify({ t: "visibility", visible: this.o.isVisible?.() ?? true }));
      this.pingTimer = setInterval(() => this.send({ t: "ping" }), 25_000);
    };
    sock.onmessage = (e) => {
      let m: any;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === "snapshot") {
        this.attempts = 0;
        this.o.onStatus("open");
      }
      if (m.t === "error" && (m.code === "bad_token" || m.code === "game_not_found")) {
        this.stopped = true;
        this.o.onStatus("denied");
      }
      this.o.onMessage(m);
    };
    const lost = () => {
      if (this.sock !== sock) return;
      this.sock = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.stopped) return;
      this.o.onStatus("reconnecting");
      this.retryTimer = this.timers.set(() => this.open(), backoff(this.attempts++, this.random));
    };
    sock.onclose = lost;
    sock.onerror = () => sock.close();
  }
}
