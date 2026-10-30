import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Action, GameConfig, LandType } from "basic-land-engine";

export type GameStatus = "waiting" | "active" | "finished" | "cancelled" | "abandoned";
export type ArtChoice = Partial<Record<LandType, string | null>>;

export interface GameRow {
  id: string;
  code: string;
  status: GameStatus;
  config: GameConfig;
  rulesVersion: number;
  version: number;
  nextGameId: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface SeatRow {
  gameId: string;
  seat: 0 | 1;
  tokenHash: string;
  nickname: string;
  art: ArtChoice;
  ownerId: string | null;
  lastSeenAt: number | null;
}

export interface PushSub {
  id: number;
  gameId: string;
  seat: 0 | 1;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PrintingRow {
  scryfallId: string;
  landType: LandType;
  setCode: string;
  setName: string;
  artist: string;
  collectorNumber: string;
  releasedAt: string;
  images: Record<string, string>;
  fetchedAt: number;
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE games (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
    config_json TEXT NOT NULL, rules_version INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 0,
    next_game_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, finished_at INTEGER
  );
  CREATE TABLE seats (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, seat INTEGER NOT NULL,
    token_hash TEXT NOT NULL, nickname TEXT NOT NULL, art_json TEXT NOT NULL DEFAULT '{}',
    owner_id TEXT, last_seen_at INTEGER, PRIMARY KEY (game_id, seat)
  );
  CREATE TABLE actions (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, idx INTEGER NOT NULL,
    action_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (game_id, idx)
  );
  CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    seat INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE rematch_votes (
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE, seat INTEGER NOT NULL,
    PRIMARY KEY (game_id, seat)
  );
  CREATE TABLE printings (
    scryfall_id TEXT PRIMARY KEY, land_type TEXT NOT NULL, set_code TEXT NOT NULL, set_name TEXT NOT NULL,
    artist TEXT NOT NULL, collector_number TEXT NOT NULL, released_at TEXT NOT NULL,
    image_json TEXT NOT NULL, fetched_at INTEGER NOT NULL
  );
  CREATE INDEX printings_land ON printings(land_type, released_at);
  CREATE TABLE image_access (
    path TEXT PRIMARY KEY, bytes INTEGER NOT NULL, accessed_at INTEGER NOT NULL
  );
  `,
];

export class Store {
  readonly db: Database.Database;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const current = this.db.pragma("user_version", { simple: true }) as number;
    for (let v = current; v < MIGRATIONS.length; v++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.pragma(`user_version = ${v + 1}`);
      })();
    }
  }

  close(): void {
    this.db.close();
  }

  // games

  insertGame(g: GameRow, seat0: SeatRow): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO games(id, code, status, config_json, rules_version, version, next_game_id, created_at, updated_at, finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(g.id, g.code, g.status, JSON.stringify(g.config), g.rulesVersion, g.version, g.nextGameId, g.createdAt, g.updatedAt, g.finishedAt);
      this.insertSeat(seat0);
    })();
  }

  private toGame(r: any): GameRow {
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      config: JSON.parse(r.config_json),
      rulesVersion: r.rules_version,
      version: r.version,
      nextGameId: r.next_game_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      finishedAt: r.finished_at,
    };
  }

  getGame(id: string): GameRow | null {
    const r = this.db.prepare("SELECT * FROM games WHERE id = ?").get(id);
    return r ? this.toGame(r) : null;
  }

  getGameByCode(code: string): GameRow | null {
    const r = this.db.prepare("SELECT * FROM games WHERE code = ?").get(code);
    return r ? this.toGame(r) : null;
  }

  listGamesByStatus(status: GameStatus): GameRow[] {
    return this.db.prepare("SELECT * FROM games WHERE status = ?").all(status).map((r) => this.toGame(r));
  }

  setStatus(id: string, status: GameStatus, now: number): void {
    const finished = status === "finished" || status === "cancelled" ? now : null;
    this.db.prepare("UPDATE games SET status = ?, updated_at = ?, finished_at = COALESCE(?, finished_at) WHERE id = ?").run(status, now, finished, id);
  }

  setNextGame(id: string, next: string): void {
    this.db.prepare("UPDATE games SET next_game_id = ? WHERE id = ?").run(next, id);
  }

  // seats

  insertSeat(s: SeatRow): void {
    this.db
      .prepare("INSERT INTO seats(game_id, seat, token_hash, nickname, art_json, owner_id, last_seen_at) VALUES (?,?,?,?,?,?,?)")
      .run(s.gameId, s.seat, s.tokenHash, s.nickname, JSON.stringify(s.art), s.ownerId, s.lastSeenAt);
  }

  getSeats(gameId: string): SeatRow[] {
    return this.db
      .prepare("SELECT * FROM seats WHERE game_id = ? ORDER BY seat")
      .all(gameId)
      .map((r: any) => ({
        gameId: r.game_id,
        seat: r.seat,
        tokenHash: r.token_hash,
        nickname: r.nickname,
        art: JSON.parse(r.art_json),
        ownerId: r.owner_id,
        lastSeenAt: r.last_seen_at,
      }));
  }

  setArt(gameId: string, seat: number, art: ArtChoice): void {
    this.db.prepare("UPDATE seats SET art_json = ? WHERE game_id = ? AND seat = ?").run(JSON.stringify(art), gameId, seat);
  }

  touchSeat(gameId: string, seat: number, now: number): void {
    this.db.prepare("UPDATE seats SET last_seen_at = ? WHERE game_id = ? AND seat = ?").run(now, gameId, seat);
  }

  // actions

  appendAction(gameId: string, idx: number, action: Action, status: GameStatus, now: number): void {
    this.db.transaction(() => {
      this.db.prepare("INSERT INTO actions(game_id, idx, action_json, created_at) VALUES (?,?,?,?)").run(gameId, idx, JSON.stringify(action), now);
      this.db.prepare("UPDATE games SET version = ?, updated_at = ? WHERE id = ?").run(idx + 1, now, gameId);
      if (status !== "active") this.setStatus(gameId, status, now);
    })();
  }

  getActions(gameId: string): Action[] {
    return this.db
      .prepare("SELECT action_json FROM actions WHERE game_id = ? ORDER BY idx")
      .all(gameId)
      .map((r: any) => JSON.parse(r.action_json));
  }

  // rematch

  addRematchVote(gameId: string, seat: number): number[] {
    this.db.prepare("INSERT OR IGNORE INTO rematch_votes(game_id, seat) VALUES (?,?)").run(gameId, seat);
    return this.getRematchVotes(gameId);
  }

  getRematchVotes(gameId: string): number[] {
    return this.db
      .prepare("SELECT seat FROM rematch_votes WHERE game_id = ? ORDER BY seat")
      .all(gameId)
      .map((r: any) => r.seat);
  }

  // push

  upsertPush(gameId: string, seat: number, sub: { endpoint: string; p256dh: string; auth: string }, now: number): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions(game_id, seat, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(endpoint) DO UPDATE SET game_id = excluded.game_id, seat = excluded.seat, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .run(gameId, seat, sub.endpoint, sub.p256dh, sub.auth, now);
  }

  deletePushByEndpoint(endpoint: string): void {
    this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  getPushSubs(gameId: string, seat: number): PushSub[] {
    return this.db
      .prepare("SELECT * FROM push_subscriptions WHERE game_id = ? AND seat = ?")
      .all(gameId, seat)
      .map((r: any) => ({ id: r.id, gameId: r.game_id, seat: r.seat, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
  }

  // printings

  replacePrintings(landType: LandType, rows: PrintingRow[]): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM printings WHERE land_type = ?").run(landType);
      const ins = this.db.prepare(
        `INSERT OR REPLACE INTO printings(scryfall_id, land_type, set_code, set_name, artist, collector_number, released_at, image_json, fetched_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      );
      for (const p of rows) ins.run(p.scryfallId, p.landType, p.setCode, p.setName, p.artist, p.collectorNumber, p.releasedAt, JSON.stringify(p.images), p.fetchedAt);
    })();
  }

  private toPrinting(r: any): PrintingRow {
    return {
      scryfallId: r.scryfall_id,
      landType: r.land_type,
      setCode: r.set_code,
      setName: r.set_name,
      artist: r.artist,
      collectorNumber: r.collector_number,
      releasedAt: r.released_at,
      images: JSON.parse(r.image_json),
      fetchedAt: r.fetched_at,
    };
  }

  getPrintings(landType: LandType): PrintingRow[] {
    return this.db
      .prepare("SELECT * FROM printings WHERE land_type = ? ORDER BY released_at DESC, collector_number")
      .all(landType)
      .map((r) => this.toPrinting(r));
  }

  getPrinting(id: string): PrintingRow | null {
    const r = this.db.prepare("SELECT * FROM printings WHERE scryfall_id = ?").get(id);
    return r ? this.toPrinting(r) : null;
  }

  printingsFetchedAt(landType: LandType): number | null {
    const r = this.db.prepare("SELECT MAX(fetched_at) AS t FROM printings WHERE land_type = ?").get(landType) as { t: number | null };
    return r.t;
  }

  // image access (I-15)

  recordImage(path: string, bytes: number, now: number): void {
    this.db
      .prepare("INSERT INTO image_access(path, bytes, accessed_at) VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET bytes = excluded.bytes, accessed_at = excluded.accessed_at")
      .run(path, bytes, now);
  }

  touchImages(entries: [string, number][]): void {
    const up = this.db.prepare("UPDATE image_access SET accessed_at = ? WHERE path = ?");
    this.db.transaction(() => {
      for (const [path, t] of entries) up.run(t, path);
    })();
  }

  listImages(): { path: string; bytes: number; accessedAt: number }[] {
    return this.db
      .prepare("SELECT path, bytes, accessed_at FROM image_access ORDER BY accessed_at")
      .all()
      .map((r: any) => ({ path: r.path, bytes: r.bytes, accessedAt: r.accessed_at }));
  }

  deleteImage(path: string): void {
    this.db.prepare("DELETE FROM image_access WHERE path = ?").run(path);
  }

  // retention

  deleteGamesOlderThan(finishedBefore: number, idleBefore: number): string[] {
    const ids = this.db
      .prepare(
        `SELECT id FROM games WHERE
           (status IN ('finished','cancelled','abandoned') AND COALESCE(finished_at, updated_at) < ?)
           OR (status IN ('waiting','active') AND updated_at < ?)`,
      )
      .all(finishedBefore, idleBefore)
      .map((r: any) => r.id as string);
    const del = this.db.prepare("DELETE FROM games WHERE id = ?");
    this.db.transaction(() => ids.forEach((id) => del.run(id)))();
    return ids;
  }
}
