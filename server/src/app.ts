import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { RULES_VERSION } from "basic-land-engine";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { GameService, HttpError } from "./games.js";
import type { Hub } from "./hub.js";
import type { PushService } from "./push.js";
import { createBody, joinBody, pushBody } from "./protocol.js";
import { isLandType, printingListItem, ScryfallUnavailable } from "./scryfall.js";
import type { ImageCache, PrintingIndex } from "./scryfall.js";

export interface Deps {
  config: Config;
  svc: GameService;
  hub: Hub;
  push: PushService;
  index: PrintingIndex;
  images: ImageCache;
  logger?: boolean;
}

const err = (status: number, code: string, message: string) => ({ status, body: { error: { code, message } } });

export async function buildApp(d: Deps): Promise<FastifyInstance> {
  const { config: cfg, svc, hub, push, index, images } = d;
  const app = Fastify({ logger: d.logger ?? false, trustProxy: cfg.trustProxy, bodyLimit: 16 * 1024 });

  await app.register(rateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: 4096 } });

  const limited = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  app.addHook("onSend", async (_req, reply) => {
    const ws = cfg.publicUrl ? ` ${cfg.publicUrl.replace(/^http/, "ws")}` : "";
    reply.header("Content-Security-Policy", `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'${ws}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
  });

  app.setErrorHandler((e, _req, reply) => {
    if (e instanceof HttpError) return reply.code(e.status).send({ error: { code: e.code, message: e.message } });
    if (e instanceof ZodError) return reply.code(400).send({ error: { code: "bad_request", message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: { code: "rate_limited", message: "Too many requests" } });
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: { code: "bad_request", message: (e as Error).message } });
    app.log.error(e);
    return reply.code(500).send({ error: { code: "internal", message: "Internal error" } });
  });

  // ---- games

  app.post("/api/games", limited(10), async (req) => {
    const body = createBody.parse(req.body);
    return svc.createGame(body.nickname, body.options);
  });
  app.get<{ Params: { code: string } }>("/api/invites/:code", limited(30), async (req) => svc.inviteInfo(req.params.code));
  app.post<{ Params: { code: string } }>("/api/invites/:code/join", limited(10), async (req) => svc.join(req.params.code, joinBody.parse(req.body).nickname));

  // ---- art

  app.get<{ Params: { landType: string } }>("/api/printings/:landType", async (req, reply) => {
    if (!isLandType(req.params.landType)) return reply.code(404).send(err(404, "not_found", "Unknown land type").body);
    const r = index.request(req.params.landType);
    if (r.state === "building") return reply.code(202).send({ status: "building" });
    if (r.state === "failed") return reply.code(502).send(err(502, "scryfall_unavailable", "Printings are not available right now").body);
    return reply.header("Cache-Control", "public, max-age=3600").send({ status: "ready", printings: r.printings.map(printingListItem) });
  });

  app.get<{ Params: { id: string; version: string } }>("/img/:id/:version", async (req, reply) => {
    try {
      const f = await images.get(req.params.id, req.params.version);
      if (!f) return reply.code(404).send(err(404, "not_found", "Unknown image").body);
      reply.header("Cache-Control", "public, max-age=31536000, immutable").header("ETag", f.etag);
      if (req.headers["if-none-match"] === f.etag) return reply.code(304).send();
      return reply.type("image/jpeg").send(createReadStream(f.path));
    } catch (e) {
      if (e instanceof ScryfallUnavailable) return reply.code(502).send(err(502, "scryfall_unavailable", "Image is not available right now").body);
      throw e;
    }
  });

  // ---- push

  app.get("/api/push/key", async (_req, reply) => {
    if (!cfg.vapid) return reply.code(404).send(err(404, "push_disabled", "Push is not configured").body);
    return { key: cfg.vapid.publicKey };
  });

  const seatOf = (req: FastifyRequest, gameId: string): 0 | 1 => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    const seat = m ? svc.authenticate(gameId, m[1]!) : null;
    if (seat === null) throw new HttpError(401, "bad_token", "Invalid seat token");
    return seat;
  };

  app.put<{ Params: { id: string } }>("/api/games/:id/push", limited(30), async (req, reply: FastifyReply) => {
    const seat = seatOf(req, req.params.id);
    if (!push.enabled) return reply.code(404).send(err(404, "push_disabled", "Push is not configured").body);
    const { subscription: s } = pushBody.parse(req.body);
    svc.store.upsertPush(req.params.id, seat, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth }, Date.now());
    return reply.code(204).send();
  });
  app.delete<{ Params: { id: string } }>("/api/games/:id/push", limited(30), async (req, reply) => {
    seatOf(req, req.params.id);
    svc.store.deletePushByEndpoint(pushBody.parse(req.body).subscription.endpoint);
    return reply.code(204).send();
  });

  app.get("/healthz", async () => ({ ok: true, version: "0.1.0", rulesVersion: RULES_VERSION }));

  // ---- websocket (S-02)

  app.get("/ws", { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    if (cfg.publicUrl && origin && origin !== cfg.publicUrl) {
      socket.close(4003, "bad origin");
      return;
    }
    hub.attach(socket);
  });

  // ---- static web app (SPA fallback)

  if (cfg.staticDir && existsSync(join(cfg.staticDir, "index.html"))) {
    await app.register(fastifyStatic, { root: cfg.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      const p = req.url;
      if (req.method !== "GET" || p.startsWith("/api/") || p.startsWith("/img/") || p === "/ws") return reply.code(404).send(err(404, "not_found", "Not found").body);
      return reply.sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send(err(404, "not_found", "Not found").body));
  }

  return app;
}
