import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { LAND_TYPES } from "basic-land-engine";
import type { LandType } from "basic-land-engine";
import type { PrintingRow, Store } from "./store.js";

export const IMAGE_VERSIONS = ["art_crop", "normal", "small"] as const;
export type ImageVersion = (typeof IMAGE_VERSIONS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ScryfallUnavailable extends Error {}

export interface ClientOptions {
  fetch?: typeof fetch;
  contactEmail: string;
  gapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** The only code that talks to Scryfall: identified, serial and at least `gapMs` between requests (I-01, I-11). */
export class ScryfallClient {
  private tail: Promise<unknown> = Promise.resolve();
  private last = -Infinity;
  private f: typeof fetch;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private gap: number;
  readonly userAgent: string;

  constructor(opts: ClientOptions) {
    this.f = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.gap = opts.gapMs ?? 100;
    this.userAgent = `BasicLandGame/0.1 (${opts.contactEmail})`;
  }

  request(url: string, kind: "json" | "image"): Promise<Response> {
    const run = async (): Promise<Response> => {
      const wait = this.last + this.gap - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      try {
        const res = await this.f(url, {
          headers: { "User-Agent": this.userAgent, Accept: kind === "json" ? "application/json;q=0.9,*/*;q=0.8" : "image/jpeg,image/*;q=0.9,*/*;q=0.8" },
        });
        if (!res.ok) throw new ScryfallUnavailable(`Scryfall answered ${res.status}`);
        return res;
      } catch (e) {
        if (e instanceof ScryfallUnavailable) throw e;
        throw new ScryfallUnavailable(`Scryfall unreachable: ${(e as Error).message}`);
      }
    };
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => undefined);
    return p;
  }
}

// ---- printing index (I-01 to I-04)

export interface IndexOptions {
  ttlMs?: number;
  retryMs?: number;
  noDataRetryMs?: number;
  now?: () => number;
  log?: (msg: string, err?: unknown) => void;
}

export type IndexStatus = { state: "ready"; printings: PrintingRow[] } | { state: "building" } | { state: "failed" };

export class PrintingIndex {
  private building = new Map<LandType, Promise<void>>();
  private failedAt = new Map<LandType, number>();
  private now: () => number;
  private ttl: number;
  private retry: number;
  private noDataRetry: number;

  constructor(
    private store: Store,
    private client: ScryfallClient,
    private opts: IndexOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.ttl = opts.ttlMs ?? 30 * 86_400_000;
    this.retry = opts.retryMs ?? 3_600_000;
    this.noDataRetry = opts.noDataRetryMs ?? 60_000;
  }

  /** Lazy: nothing happens until a client asks (I-03). */
  request(land: LandType): IndexStatus {
    const fetchedAt = this.store.printingsFetchedAt(land);
    const have = fetchedAt !== null;
    const stale = !have || this.now() - fetchedAt > this.ttl;
    if (stale && !this.building.has(land)) {
      const failed = this.failedAt.get(land);
      const wait = have ? this.retry : this.noDataRetry;
      if (failed === undefined || this.now() - failed >= wait) this.start(land);
      else if (!have) return { state: "failed" };
    }
    if (have) return { state: "ready", printings: this.store.getPrintings(land) };
    return this.building.has(land) ? { state: "building" } : { state: "failed" };
  }

  /** Resolves when a running build ends (used by tests). */
  idle(): Promise<void> {
    return Promise.allSettled([...this.building.values()]).then(() => undefined);
  }

  isKnown = (land: LandType, id: string): boolean => this.store.getPrinting(id)?.landType === land;

  private start(land: LandType): void {
    const p = this.build(land)
      .then(() => void this.failedAt.delete(land))
      .catch((e) => {
        this.failedAt.set(land, this.now());
        this.opts.log?.(`printing index for ${land} failed`, e);
      })
      .finally(() => void this.building.delete(land));
    this.building.set(land, p);
  }

  private async build(land: LandType): Promise<void> {
    const q = encodeURIComponent(`!"${land}" game:paper unique:prints`);
    let url: string | null = `https://api.scryfall.com/cards/search?q=${q}&order=released`;
    const rows: PrintingRow[] = [];
    const fetchedAt = this.now();
    while (url) {
      const body = (await (await this.client.request(url, "json")).json()) as { data: ScryfallCard[]; has_more: boolean; next_page?: string };
      for (const c of body.data) {
        const images = c.image_uris;
        if (!images?.normal || !images.art_crop || !images.small) continue;
        rows.push({
          scryfallId: c.id,
          landType: land,
          setCode: c.set,
          setName: c.set_name,
          artist: c.artist ?? "",
          collectorNumber: c.collector_number,
          releasedAt: c.released_at,
          images: { small: images.small, normal: images.normal, art_crop: images.art_crop },
          fetchedAt,
        });
      }
      url = body.has_more && body.next_page ? body.next_page : null;
    }
    if (rows.length === 0) throw new ScryfallUnavailable("no printings returned");
    this.store.replacePrintings(land, rows);
  }
}

interface ScryfallCard {
  id: string;
  set: string;
  set_name: string;
  artist?: string;
  collector_number: string;
  released_at: string;
  image_uris?: Record<string, string>;
}

export const printingListItem = (p: PrintingRow) => ({
  id: p.scryfallId,
  set: p.setCode,
  setName: p.setName,
  artist: p.artist,
  year: Number(p.releasedAt.slice(0, 4)),
  collectorNumber: p.collectorNumber,
});

// ---- image cache (I-10 to I-15)

export interface CacheOptions {
  dir: string;
  maxBytes: number;
  now?: () => number;
}

export class ImageCache {
  private inflight = new Map<string, Promise<string>>();
  private accessed = new Map<string, number>();
  private now: () => number;

  constructor(
    private store: Store,
    private client: ScryfallClient,
    private opts: CacheOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** null means 404 (unknown id or version); throws ScryfallUnavailable for 502 (I-13). */
  async get(id: string, version: string): Promise<{ path: string; etag: string } | null> {
    if (!UUID.test(id) || !(IMAGE_VERSIONS as readonly string[]).includes(version)) return null;
    const printing = this.store.getPrinting(id);
    const source = printing?.images[version];
    if (!printing || !source) return null;
    const url = new URL(source);
    if (url.protocol !== "https:" || url.hostname !== "cards.scryfall.io") return null;

    const path = join(this.opts.dir, id, `${version}.jpg`);
    const st = await stat(path).catch(() => null);
    if (st) {
      this.accessed.set(path, this.now());
      return { path, etag: etagOf(st.size, st.mtimeMs) };
    }
    let job = this.inflight.get(path);
    if (!job) {
      job = this.download(url.toString(), path).finally(() => void this.inflight.delete(path));
      this.inflight.set(path, job);
    }
    await job;
    const done = await stat(path);
    return { path, etag: etagOf(done.size, done.mtimeMs) };
  }

  private async download(url: string, path: string): Promise<string> {
    const res = await this.client.request(url, "image");
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(join(path, ".."), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, path);
    this.store.recordImage(path, buf.length, this.now());
    await this.evict();
    return path;
  }

  /** Writes in-memory access times to SQLite (I-15). */
  flush(): void {
    if (this.accessed.size) this.store.touchImages([...this.accessed]);
    this.accessed.clear();
  }

  /** Deletes the least recently accessed files until the cache fits (I-15). */
  async evict(): Promise<number> {
    this.flush();
    const files = this.store.listImages();
    let total = files.reduce((n, f) => n + f.bytes, 0);
    let removed = 0;
    for (const f of files) {
      if (total <= this.opts.maxBytes) break;
      await rm(f.path, { force: true });
      this.store.deleteImage(f.path);
      total -= f.bytes;
      removed++;
    }
    return removed;
  }
}

const etagOf = (size: number, mtimeMs: number): string => `"${createHash("sha1").update(`${size}:${Math.floor(mtimeMs)}`).digest("hex").slice(0, 20)}"`;

export const isLandType = (s: string): s is LandType => (LAND_TYPES as readonly string[]).includes(s);
