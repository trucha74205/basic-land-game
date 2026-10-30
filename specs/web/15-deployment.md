# Web app: deployment on the Raspberry Pi

## Topology

```
Internet -> router (443, 80 forwarded) -> Pi: Nginx Proxy Manager (TLS, configured in its web UI)
                                              -> <pi LAN address>:1701 (Fastify: web app, API, WebSocket, images)
                                                    volume /data (SQLite, image cache)
```

## Decisions

- **D-01 [D]** Public access through router port forwarding, a Dynu hostname (`basic-land-game.giize.com`) and Let's Encrypt certificates requested in Nginx Proxy Manager (NPM). Docker Compose runs the app container.
- **D-02 [D]** One container serves the built web app, REST, WebSocket and the image proxy. NPM only terminates TLS and proxies.
- **D-03 [D]** The ISP provides a reachable public IPv4 address (confirmed, no CGNAT).
- **D-04 [D]** NPM already owns ports 80 and 443. The app listens on port 1701 and publishes it on the Pi; NPM forwards to the Pi's LAN address on 1701. The router does not forward 1701.
- **D-05 [D]** The certificate is issued by NPM with HTTP-01, so port 80 stays forwarded.
- **D-06 [D]** Storage is an SD card. SQLite uses WAL with `synchronous=NORMAL` and `wal_autocheckpoint` at the default; the image cache is capped (I-15). No backups: a lost database only loses running games.
- **D-07 [D]** Contact email is a placeholder (`you@example.com`) in the specs and `deploy/.env.example`. Real values are set only in the `.env` on the Pi.
- **D-08 [D]** The image is built on the Pi from the checked-out repo (`docker compose up -d --build`); there is no registry.

## Pi and OS

- 64-bit Raspberry Pi OS (arm64), Docker Engine with the compose plugin. `/data` is on the SD card; append-only actions keep database writes small.
- Images built for `linux/arm64`, either on the Pi or with `docker buildx build --platform linux/arm64` elsewhere, base `node:22-bookworm-slim` (prebuilt `better-sqlite3` binaries available, no compiler needed).

## Compose service

See `deploy/docker-compose.yml`: image `blg:${TAG}` built from the repo, `ports: ["1701:1701"]`, `PORT=1701`, volume `blg-data` at `/data`, read-only root, `/tmp` tmpfs, user 1000, 256 MB memory limit, healthcheck on `/healthz`, rotated JSON logs.

## NPM (web UI)

Proxy host `basic-land-game.giize.com` -> `http://<pi LAN address>:1701`, Websockets Support on, Force SSL and HTTP/2 on, Let's Encrypt certificate. `PUBLIC_URL=https://basic-land-game.giize.com` in `.env` (must equal the browser's origin).

## Network

- Forward TCP 443 and 80 (HTTP-01 renewals) from the router to the Pi (not 1701), give the Pi a fixed LAN address, enable a firewall on the Pi that allows only 22 (from the LAN), 80 and 443.
- Keep the Dynu record current with the Dynu updater (cron or container) if the public IP changes.

## Operations

- **O-01** Configuration only through environment variables, listed in `deploy/.env.example`. VAPID keys are generated once (`npx web-push generate-vapid-keys`) and kept; changing them invalidates all push subscriptions.
- **O-02** Update: `git pull`, then `docker compose up -d --build` (optionally with a new `TAG`). Rollback: start the previous tag; the schema is migrated forward only, so after an upgrade that migrated the schema, rolling back means deleting the data volume (acceptable: only running games are lost).
- **O-03** No backups (D-06). The image cache is rebuilt on demand.
- **O-04** Logs go to stdout as JSON (pino) and rotate through Docker. No IP addresses are stored in the database; nginx access logs follow your existing retention.
- **O-05** `GET /healthz` returns 200 with the version and rules version. A restart mid-game is safe: games are rebuilt by replay and timers re-created (A-03, P-08).
