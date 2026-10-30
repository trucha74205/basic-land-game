# Web app: deployment on the Raspberry Pi

## Topology

```
Internet -> router (443, 80 forwarded) -> Pi: nginx container (TLS, rate limits)
                                              -> blg:3000 over a shared Docker network (Fastify: web app, API, WebSocket, images)
                                                    volume /data (SQLite, image cache)
```

## Decisions

- **D-01 [D]** Public access through router port forwarding, a DuckDNS hostname and Let's Encrypt certificates, handled by the existing nginx. Docker Compose runs the app container.
- **D-02 [D]** One container serves the built web app, REST, WebSocket and the image proxy. nginx only terminates TLS and proxies.
- **D-03 [D]** The ISP provides a reachable public IPv4 address (confirmed, no CGNAT).
- **D-04 [D]** nginx runs in Docker on the same Pi. The app publishes no host port; nginx reaches it as `blg:3000` over a shared external Docker network (`proxy`).
- **D-05 [D]** Certificates for the DuckDNS hostname are issued with HTTP-01 by the existing setup, so port 80 stays forwarded and the port-80 server block serves the ACME challenge.
- **D-06 [D]** Storage is an SD card. SQLite uses WAL with `synchronous=NORMAL` and `wal_autocheckpoint` at the default; the image cache is capped (I-15). No backups: a lost database only loses running games.
- **D-07 [D]** Hostname and contact email are placeholders (`<name>.duckdns.org`, `you@example.com`) in the specs and `deploy/.env.example`. Real values are set only in the `.env` on the Pi.

## Pi and OS

- 64-bit Raspberry Pi OS (arm64), Docker Engine with the compose plugin. `/data` is on the SD card; append-only actions keep database writes small.
- Images built for `linux/arm64`, either on the Pi or with `docker buildx build --platform linux/arm64` elsewhere, base `node:22-bookworm-slim` (prebuilt `better-sqlite3` binaries available, no compiler needed).

## Compose service (sketch)

```yaml
services:
  blg:
    image: blg:${TAG:-latest}
    restart: unless-stopped
    expose: ["3000"]
    networks: [proxy]
    environment:
      PUBLIC_URL: https://<name>.duckdns.org
      DATA_DIR: /data
      VAPID_PUBLIC_KEY: ...
      VAPID_PRIVATE_KEY: ...
      CONTACT_EMAIL: you@example.com        # VAPID subject and Scryfall User-Agent
      TRUST_PROXY: "true"
    volumes: ["blg-data:/data"]
    read_only: true
    tmpfs: ["/tmp"]
    user: "1000:1000"
    mem_limit: 256m
    healthcheck: { test: ["CMD", "node", "healthcheck.js"], interval: 30s }
    logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }
volumes: { blg-data: {} }
networks: { proxy: { external: true } }   # the network your nginx container is attached to
```

## nginx (sketch)

```nginx
limit_req_zone $binary_remote_addr zone=blg_api:10m rate=10r/s;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {
  listen 443 ssl http2;
  server_name <name>.duckdns.org;
  # ssl_certificate lines: managed by your existing certificate handling
  client_max_body_size 16k;

  location /ws {
    proxy_pass http://blg:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
  }
  location /api/ {
    limit_req zone=blg_api burst=20 nodelay;
    proxy_pass http://blg:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
    proxy_pass http://blg:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server { listen 80; server_name <name>.duckdns.org; return 301 https://$host$request_uri; }
```

(HTTP-01: keep your existing `/.well-known/acme-challenge/` location in the port-80 block, before the redirect.)

## Network

- Forward TCP 443 and 80 (HTTP-01 renewals) from the router to the Pi, give the Pi a fixed LAN address, enable a firewall on the Pi that allows only 22 (from the LAN), 80 and 443.
- Keep the DuckDNS record current with the DuckDNS updater (cron or container) if the public IP changes.

## Operations

- **O-01** Configuration only through environment variables, listed in `deploy/.env.example`. VAPID keys are generated once (`npx web-push generate-vapid-keys`) and kept; changing them invalidates all push subscriptions.
- **O-02** Update: `docker compose pull && docker compose up -d`, or rebuild with a new `TAG`. Rollback: start the previous tag; the schema is migrated forward only, so after an upgrade that migrated the schema, rolling back means deleting the data volume (acceptable: only running games are lost).
- **O-03** No backups (D-06). The image cache is rebuilt on demand.
- **O-04** Logs go to stdout as JSON (pino) and rotate through Docker. No IP addresses are stored in the database; nginx access logs follow your existing retention.
- **O-05** `GET /healthz` returns 200 with the version and rules version. A restart mid-game is safe: games are rebuilt by replay and timers re-created (A-03, P-08).
