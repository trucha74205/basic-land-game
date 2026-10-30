import { timingSafeEqual } from "node:crypto";
import {
  actionKey,
  applyAction,
  createGame,
  getDecision,
  getEvents,
  getLegalActions,
  getView,
  IllegalActionError,
  RULES_VERSION,
} from "basic-land-engine";
import type { Action, Game, GameConfig, GameEvent, LandType, PlayerId, PlayerView } from "basic-land-engine";
import { DEFAULT_ART_IDS } from "./default-art.js";
import { hashToken, newGameId, newInviteCode, newSeed, newToken, normalizeInviteCode } from "./ids.js";
import type { Options, RejectReason, RematchState, SeatSummary, ServerMessage } from "./protocol.js";
import type { ArtChoice, GameRow, GameStatus, SeatRow, Store } from "./store.js";

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ServiceEvent =
  | { kind: "started"; gameId: string }
  | { kind: "update"; gameId: string; fromVersion: number }
  | { kind: "seats"; gameId: string }
  | { kind: "kicked"; gameId: string; seat: 1 }
  | { kind: "rematch"; gameId: string };

export interface ServiceOptions {
  autoPassMs: [number, number];
  now?: () => number;
  random?: () => number;
}

interface Live {
  row: GameRow;
  seats: SeatRow[];
  game: Game | null;
  /** offsets[v] = length of the engine log after v actions (events of action v+1 start there). */
  offsets: number[];
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export type ApplyResult = { ok: true } | { ok: false; reason: RejectReason; version: number };

export class GameService {
  private live = new Map<string, Live>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(e: ServiceEvent) => void>();
  private now: () => number;
  private random: () => number;

  constructor(
    readonly store: Store,
    private opts: ServiceOptions,
  ) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  on(fn: (e: ServiceEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: ServiceEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---- create, join, authenticate

  createGame(nick: string, options: Options): { gameId: string; code: string; seat: 0; token: string } {
    const config: GameConfig = {
      seed: newSeed(),
      deckSize: options.deckSize,
      emptyLibrary: options.emptyLibrary,
      maxTurns: options.maxTurns,
      firstPlayer: options.firstPlayer === "me" ? 0 : options.firstPlayer === "opponent" ? 1 : "random",
    };
    const token = newToken();
    const now = this.now();
    const row: GameRow = {
      id: newGameId(),
      code: newInviteCode(),
      status: "waiting",
      config,
      rulesVersion: RULES_VERSION,
      version: 0,
      nextGameId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    this.store.insertGame(row, { gameId: row.id, seat: 0, tokenHash: hashToken(token), nickname: nick, art: {}, ownerId: null, lastSeenAt: now, accepted: true });
    return { gameId: row.id, code: row.code, seat: 0, token };
  }

  private optionsOf(config: GameConfig): Options {
    return {
      deckSize: config.deckSize,
      emptyLibrary: config.emptyLibrary,
      maxTurns: config.maxTurns,
      firstPlayer: config.firstPlayer === 0 ? "me" : config.firstPlayer === 1 ? "opponent" : "random",
    };
  }

  inviteInfo(rawCode: string) {
    const row = this.rowByCode(rawCode);
    const seats = this.store.getSeats(row.id);
    return { gameId: row.id, creatorNickname: seats[0]?.nickname ?? "", options: this.optionsOf(row.config), full: row.status !== "waiting" || seats.length > 1 };
  }

  /** Games waiting for a guest, for the list on the start screen. */
  openGames(isHostOnline: (gameId: string) => boolean) {
    return this.store
      .listOpenGames(50)
      .filter((row) => isHostOnline(row.id))
      .map((row) => ({ code: row.code, creatorNickname: this.store.getSeats(row.id)[0]?.nickname ?? "", options: this.optionsOf(row.config), createdAt: row.createdAt }));
  }

  /** What the start screen needs to know about one of the caller's games. */
  summary(gameId: string, seat: PlayerId) {
    const live = this.load(gameId);
    if (!live) return null;
    const opp = live.seats.find((s) => s.seat !== seat);
    return { status: live.row.status, opponent: opp?.nickname ?? null, pending: live.seats.some((s) => !s.accepted) };
  }

  private rowByCode(rawCode: string): GameRow {
    const code = normalizeInviteCode(rawCode);
    const row = code ? this.store.getGameByCode(code) : null;
    if (!row) throw new HttpError(404, "invite_not_found", "No game for this invite code");
    return row;
  }

  /** With `request` the guest only asks for the seat and the host decides (accept or kick); otherwise the game starts at once. */
  join(rawCode: string, nick: string, request = false): { gameId: string; seat: 1; token: string } {
    const row = this.rowByCode(rawCode);
    if (row.status !== "waiting" || this.store.getSeats(row.id).length > 1) throw new HttpError(409, "game_full", "This game is full");
    const token = newToken();
    const now = this.now();
    this.store.insertSeat({ gameId: row.id, seat: 1, tokenHash: hashToken(token), nickname: nick, art: {}, ownerId: null, lastSeenAt: now, accepted: !request });
    this.live.delete(row.id);
    if (request) {
      this.load(row.id);
      this.emit({ kind: "seats", gameId: row.id });
    } else {
      this.start(row.id, now);
    }
    return { gameId: row.id, seat: 1, token };
  }

  private start(gameId: string, now: number): void {
    this.store.setStatus(gameId, "active", now);
    this.live.delete(gameId);
    this.load(gameId);
    this.emit({ kind: "started", gameId });
  }

  /** The host lets a waiting guest in and the game starts. */
  accept(gameId: string, seat: PlayerId): boolean {
    const live = this.load(gameId);
    if (!live || seat !== 0 || live.row.status !== "waiting" || !live.seats.some((s) => s.seat === 1 && !s.accepted)) return false;
    this.store.acceptSeat(gameId, 1);
    this.start(gameId, this.now());
    return true;
  }

  /** The host removes the waiting guest; the game is open for others again. */
  kick(gameId: string, seat: PlayerId): boolean {
    const live = this.load(gameId);
    if (!live || seat !== 0 || live.row.status !== "waiting" || !live.seats.some((s) => s.seat === 1)) return false;
    this.store.deleteSeat(gameId, 1);
    this.live.delete(gameId);
    this.load(gameId);
    this.emit({ kind: "kicked", gameId, seat: 1 });
    this.emit({ kind: "seats", gameId });
    return true;
  }

  authenticate(gameId: string, token: string): 0 | 1 | null {
    const seats = this.store.getSeats(gameId);
    const h = Buffer.from(hashToken(token));
    for (const s of seats) {
      const e = Buffer.from(s.tokenHash);
      if (e.length === h.length && timingSafeEqual(e, h)) {
        this.store.touchSeat(gameId, s.seat, this.now());
        return s.seat;
      }
    }
    return null;
  }

  // ---- loading and replay (A-03)

  private load(gameId: string): Live | null {
    const cached = this.live.get(gameId);
    if (cached) return cached;
    let row = this.store.getGame(gameId);
    if (!row) return null;
    const seats = this.store.getSeats(gameId);
    const live: Live = { row, seats, game: null, offsets: [] };
    if (row.status === "waiting") {
      this.live.set(gameId, live);
      return live;
    }
    if (row.rulesVersion !== RULES_VERSION && row.status !== "abandoned") {
      this.store.setStatus(gameId, "abandoned", this.now());
      row = this.store.getGame(gameId)!;
      live.row = row;
    }
    if (row.status === "abandoned") {
      this.live.set(gameId, live);
      return live;
    }
    let game = createGame(row.config);
    live.offsets.push(game.log.length);
    for (const a of this.store.getActions(gameId)) {
      game = applyAction(game, a).game;
      live.offsets.push(game.log.length);
    }
    live.game = game;
    this.live.set(gameId, live);
    this.scheduleAutoPass(live);
    return live;
  }

  /** Loads every active game so that auto-pass timers survive a restart (P-08). */
  resumeActive(): void {
    for (const g of this.store.listGamesByStatus("active")) this.load(g.id);
  }

  /** Drops cached games after retention deleted them. */
  forget(ids: string[]): void {
    for (const id of ids) {
      this.live.delete(id);
      const t = this.timers.get(id);
      if (t) clearTimeout(t);
      this.timers.delete(id);
    }
  }

  stop(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // ---- views

  private legalFor(game: Game, seat: PlayerId): Action[] {
    const decision = getDecision(game);
    return getLegalActions(game).filter((a) => {
      if (a.type === "Concede") return a.player === seat;
      if (a.type === "CancelGame") return true;
      return decision?.player === seat;
    });
  }

  private seatSummaries(live: Live): Omit<SeatSummary, "connected">[] {
    return live.seats.map((s) => ({ seat: s.seat, nickname: s.nickname, art: s.art, ...(s.accepted ? {} : { pending: true }) }));
  }

  /** Seat list without presence; the hub adds `connected`. */
  seatList(gameId: string): Omit<SeatSummary, "connected">[] {
    const live = this.load(gameId);
    return live ? this.seatSummaries(live) : [];
  }

  nicknameOf(gameId: string, seat: number): string {
    return this.load(gameId)?.seats.find((s) => s.seat === seat)?.nickname ?? "";
  }

  statusOf(gameId: string): GameStatus | null {
    return this.load(gameId)?.row.status ?? null;
  }

  rematchState(gameId: string): RematchState {
    const live = this.load(gameId);
    return { votes: this.store.getRematchVotes(gameId), nextGameId: live?.row.nextGameId ?? null };
  }

  /** Public view data for one seat; `connected` is merged in by the caller. */
  private state(live: Live, seat: PlayerId): { view: PlayerView | null; legalActions: Action[] } {
    if (!live.game) return { view: null, legalActions: [] };
    return { view: getView(live.game, seat), legalActions: this.legalFor(live.game, seat) };
  }

  snapshot(gameId: string, seat: PlayerId, lastVersion: number | undefined, connected: (seat: number) => boolean): ServerMessage | null {
    const live = this.load(gameId);
    if (!live) return null;
    const { view, legalActions } = this.state(live, seat);
    return {
      t: "snapshot",
      gameId,
      seat,
      version: live.row.version,
      status: live.row.status,
      options: this.optionsOf(live.row.config),
      seats: this.seatSummaries(live).map((s) => ({ ...s, connected: connected(s.seat) })),
      view,
      legalActions,
      events: live.game ? this.eventsSince(live, seat, lastVersion) : [],
      rematch: this.rematchState(gameId),
    };
  }

  private eventsSince(live: Live, seat: PlayerId, v: number | undefined): GameEvent[] {
    const all = getEvents(live.game!, seat);
    return all.slice(v === undefined ? 0 : (live.offsets[v] ?? 0));
  }

  update(gameId: string, seat: PlayerId, fromVersion: number, connected: (seat: number) => boolean): ServerMessage | null {
    const live = this.load(gameId);
    if (!live?.game) return null;
    const { view, legalActions } = this.state(live, seat);
    return {
      t: "update",
      version: live.row.version,
      status: live.row.status,
      events: this.eventsSince(live, seat, fromVersion),
      view: view!,
      legalActions,
      seats: this.seatSummaries(live).map((s) => ({ ...s, connected: connected(s.seat) })),
    };
  }

  /** Events since `fromVersion` as seen by a spectator; used for notification decisions only (never sent). */
  eventsPublic(gameId: string, fromVersion: number): GameEvent[] {
    const live = this.load(gameId);
    if (!live?.game) return [];
    return live.game.log.slice(live.offsets[fromVersion] ?? 0);
  }

  /** Raw game for notification decisions. Never sent to clients. */
  peek(gameId: string): { game: Game; version: number } | null {
    const live = this.load(gameId);
    return live?.game ? { game: live.game, version: live.row.version } : null;
  }

  legalForSeat(gameId: string, seat: PlayerId): Action[] {
    const live = this.load(gameId);
    return live?.game ? this.legalFor(live.game, seat) : [];
  }

  // ---- actions (A-04, A-05, P-03)

  apply(gameId: string, seat: PlayerId, version: number, action: Action): ApplyResult {
    const live = this.load(gameId);
    if (!live?.game || live.row.status !== "active") return { ok: false, reason: "game_over", version: live?.row.version ?? 0 };
    const v = live.row.version;
    if (version !== v) return { ok: false, reason: "stale_version", version: v };
    const legal = new Set(this.legalFor(live.game, seat).map(actionKey));
    if (!legal.has(actionKey(action))) {
      const own = action.type === "Concede" || action.type === "CancelGame" || getDecision(live.game)?.player === seat;
      return { ok: false, reason: own ? "illegal" : "not_your_turn", version: v };
    }
    return this.commit(live, action) ? { ok: true } : { ok: false, reason: "illegal", version: v };
  }

  private commit(live: Live, action: Action): boolean {
    const from = live.row.version;
    let next: Game;
    try {
      next = applyAction(live.game!, action).game;
    } catch (e) {
      if (e instanceof IllegalActionError) return false;
      throw e;
    }
    const status: GameStatus = !next.result ? "active" : next.result.kind === "cancelled" ? "cancelled" : "finished";
    const now = this.now();
    this.store.appendAction(live.row.id, from, action, status, now);
    live.game = next;
    live.offsets.push(next.log.length);
    live.row = { ...live.row, version: from + 1, status, updatedAt: now, finishedAt: status === "active" ? null : now };
    this.scheduleAutoPass(live);
    this.emit({ kind: "update", gameId: live.row.id, fromVersion: from });
    return true;
  }

  // ---- auto-pass (P-08)

  private scheduleAutoPass(live: Live): void {
    const id = live.row.id;
    const old = this.timers.get(id);
    if (old) clearTimeout(old);
    this.timers.delete(id);
    const game = live.game;
    if (!game || live.row.status !== "active") return;
    if (getDecision(game)?.type !== "CounterWindow") return;
    const own = this.legalFor(game, (game.pending as { player: PlayerId }).player).filter((a) => a.type !== "Concede" && a.type !== "CancelGame");
    if (own.length !== 1 || own[0]!.type !== "PassCounter") return;
    const [lo, hi] = this.opts.autoPassMs;
    const delay = lo + this.random() * (hi - lo);
    const at = live.row.version;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        if (live.row.version === at && live.row.status === "active") this.commit(live, { type: "PassCounter" });
      }, delay),
    );
  }

  // ---- art (I-31, I-32)

  setArt(gameId: string, seat: PlayerId, art: ArtChoice, known: (land: LandType, id: string) => boolean): boolean {
    const live = this.load(gameId);
    if (!live) return false;
    const normalized: ArtChoice = { ...live.seats.find((s) => s.seat === seat)!.art };
    for (const [land, id] of Object.entries(art) as [LandType, string | null | undefined][]) {
      if (id === undefined) continue;
      if (id === null || id === DEFAULT_ART_IDS[land]) normalized[land] = null;
      else if (known(land, id)) normalized[land] = id;
      else return false;
    }
    this.store.setArt(gameId, seat, normalized);
    live.seats = this.store.getSeats(gameId);
    this.emit({ kind: "seats", gameId });
    return true;
  }

  // ---- rematch (W-40, W-41)

  rematchVote(gameId: string, seat: PlayerId): RematchState | null {
    const live = this.load(gameId);
    if (!live || (live.row.status !== "finished" && live.row.status !== "cancelled")) return null;
    if (!live.row.nextGameId) {
      const votes = this.store.addRematchVote(gameId, seat);
      if (votes.length === 2) this.startRematch(live);
    }
    this.emit({ kind: "rematch", gameId });
    return this.rematchState(gameId);
  }

  private startRematch(live: Live): void {
    const r = live.game!.result!;
    const loser: PlayerId | "random" = r.kind === "win" ? other(r.player) : "random";
    const now = this.now();
    const row: GameRow = {
      ...live.row,
      id: newGameId(),
      code: newInviteCode(),
      status: "active",
      config: { ...live.row.config, seed: newSeed(), firstPlayer: loser },
      version: 0,
      nextGameId: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    const [s0, s1] = live.seats as [SeatRow, SeatRow];
    this.store.insertGame(row, { ...s0, gameId: row.id });
    this.store.insertSeat({ ...s1, gameId: row.id });
    this.store.setNextGame(live.row.id, row.id);
    live.row = { ...live.row, nextGameId: row.id };
    this.load(row.id);
  }
}
