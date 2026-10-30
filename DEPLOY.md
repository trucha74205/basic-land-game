# Deploying Basic Land Game on a Raspberry Pi

This guide takes you from a fresh Pi to the game running at `https://pauli.mywire.org:1701`. It follows the decisions in `specs/web/15-deployment.md` (D-01 to D-07): one Docker container for the app (listening on port 1701), your existing nginx in Docker in front of it for TLS, a Dyno hostname (`pauli.mywire.org`), Let's Encrypt with HTTP-01.

Replace these placeholders everywhere:

| Placeholder | Meaning |
|---|---|
| `<email>` | your email for Let's Encrypt and Scryfall's User-Agent |
| `<pi>` | the Pi's LAN address or hostname, e.g. `192.168.1.50` or `raspberrypi.local` |
| `<user>` | your login on the Pi (default `pi`, or what you chose in the imager) |
| `<lan-cidr>` | your home network, e.g. `192.168.1.0/24` |

Commands marked **[Mac]** run on your computer, **[Pi]** on the Raspberry Pi (over SSH).

The plan, in short: build the image on your Mac for arm64, copy it to the Pi, start it with Docker Compose, put nginx in front of it, forward port 1701 (and 80 for certificate renewal) on your router. The common ports 80 and 443 are already used on the Pi, so the game uses 1701 end to end.

---

## 0. What you need

- Raspberry Pi 3B+ or newer with at least 1 GB RAM (the app is limited to 256 MB), an SD card, and a wired or reliable Wi-Fi connection.
- **64-bit** Raspberry Pi OS (Bookworm or newer). Check on the Pi: `uname -m` must print `aarch64`. If it prints `armv7l`, reflash with the 64-bit image: the Dockerfile and the prebuilt `better-sqlite3` binary target arm64.
- A router you can configure (port forwarding) and a public IPv4 address, not CGNAT (decision D-03). Quick check: compare the "WAN IP" in your router with what <https://ifconfig.me> shows. If they differ, or the WAN IP starts with `100.64`-`100.127`, you are behind CGNAT and this setup will not work.
- Docker on your Mac (Docker Desktop or Colima) with `buildx`. Your Mac is `arm64`, so building for the Pi is native and fast.

---

## 1. Prepare the Pi

**[Pi]** Update and install Docker (the official convenience script; read it first if you prefer: <https://get.docker.com>):

```sh
sudo apt update && sudo apt full-upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and in again so the group applies, then check:

```sh
docker version
docker compose version     # must work; if not: sudo apt install -y docker-compose-plugin
```

Give the Pi a fixed LAN address: either a DHCP reservation in your router (preferred, by the Pi's MAC address) or a static address in NetworkManager. Port forwarding in step 6 relies on it.

Firewall. Docker publishes port 1701 itself (bypassing ufw rules), which is what we want. ufw protects everything else:

```sh
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <lan-cidr> to any port 22 proto tcp
sudo ufw allow 1701/tcp
sudo ufw enable
sudo ufw status
```

Make sure you can still SSH in from your LAN before closing your current session.

---

## 2. Dyno hostname

The hostname is `pauli.mywire.org`, kept current by your Dyno dynamic DNS client (as you already do). Check from your Mac: `dig +short pauli.mywire.org` returns your public IP.

---

## 3. Build the image and copy it to the Pi

**[Mac]** In the project root (the folder with `Dockerfile`):

```sh
docker buildx build --platform linux/arm64 -f Dockerfile -t blg:1 --load .
```

The first build installs all dependencies and runs the web and server builds; it takes a few minutes. The five default card images are already in `web/public/art/default`, so the build needs no internet access beyond npm.

Copy the image to the Pi (no registry needed):

```sh
docker save blg:1 | gzip | ssh <user>@<pi> 'gunzip | docker load'
```

Copy the Compose file to the Pi:

```sh
ssh <user>@<pi> 'mkdir -p ~/blg'
scp deploy/docker-compose.yml deploy/.env.example <user>@<pi>:~/blg/
```

(Alternative: build on the Pi itself. Copy the whole project with `rsync -a --exclude node_modules --exclude dist --exclude data ./ <user>@<pi>:~/blg-src/`, then on the Pi run `docker build -t blg:1 ~/blg-src`. It works but is slow, and `vite build` can run out of memory on a 1 GB Pi.)

---

## 4. Configure and start the app

**[Mac]** Generate the Web Push keys once and keep them. Changing them later drops every push subscription:

```sh
npx web-push generate-vapid-keys
```

**[Pi]**

```sh
cd ~/blg
cp .env.example .env
chmod 600 .env
nano .env
```

Fill it in:

```ini
TAG=1
COMPOSE_PROJECT_NAME=blg
PUBLIC_URL=https://pauli.mywire.org:1701
CONTACT_EMAIL=<email>
VAPID_PUBLIC_KEY=<public key from the command above>
VAPID_PRIVATE_KEY=<private key from the command above>
TRUST_PROXY=true
IMAGE_CACHE_MAX_MB=1024
```

Notes:

- `TAG` must match the image tag you built (`blg:1`).
- `PUBLIC_URL` must be exactly `https://pauli.mywire.org:1701`: no path, with the port (the browser's `Origin` includes it). The server rejects WebSocket connections whose `Origin` differs from it, and uses it for the content security policy.
- `COMPOSE_PROJECT_NAME=blg` fixes the names of the data volume (`blg_blg-data`) so they do not depend on the folder name.
- Leave `TRUST_PROXY=true`: nginx passes the real client address in `X-Forwarded-For`, and rate limiting depends on it.
- Without VAPID keys the game works but push notifications are off.

The Compose file expects an existing Docker network named `proxy` (the network nginx is attached to). Create it once:

```sh
docker network create proxy
```

Start the app:

```sh
docker compose up -d
docker compose ps          # blg should become "healthy" after ~30 s
docker compose logs -f blg # Ctrl+C to leave
```

Test it from inside the Pi (the app container publishes no host port, so go through Docker):

```sh
docker compose exec blg node healthcheck.js && echo healthy
```

The data lives in the named volume `blg_blg-data` mounted at `/data` (SQLite database plus the Scryfall image cache). The container runs as user 1000, read-only, with `/tmp` as tmpfs and a 256 MB memory limit.

---

## 5. nginx and certificates

Ports 80 and 443 are taken on the Pi, so this guide assumes your existing nginx container (with its certificate handling) fronts the app, and gets one more listening port, 1701.

Attach your nginx container to the `proxy` network (add `proxy` under its `networks:` with `external: true`) and publish port 1701 on it (`ports:` add `"1701:1701"`), then `docker compose up -d` there. Put `deploy/nginx.example.conf` into its `conf.d` as `blg.conf`. It listens on `1701 ssl` for `pauli.mywire.org` and proxies to `blg:1701`. Add your `ssl_certificate` and `ssl_certificate_key` lines inside that server block (a certificate for `pauli.mywire.org`, issued by your existing setup with HTTP-01 through the port-80 server, which is why router port 80 stays forwarded). Keep your ACME challenge location in the port-80 block above the redirect, then:

```sh
docker exec <nginx-container> nginx -t && docker exec <nginx-container> nginx -s reload
```

nginx resolves `blg` when it starts, so the app container must be running on the `proxy` network (step 4) before you reload.

---

## 6. Router

Forward these TCP ports to the Pi's fixed LAN address:

| External | Internal | Why |
|---|---|---|
| 1701 | `<pi>`:1701 | the game (HTTPS and WebSocket) |
| 80 | `<pi>`:80 | certificate issue and renewal (HTTP-01), and the redirect to HTTPS |

Do not forward 22. If your router blocks "NAT loopback", testing the public hostname from inside your LAN may fail even though it works from outside (use your phone on mobile data to test).

---

## 7. Verify

From outside your LAN:

```sh
curl -i https://pauli.mywire.org:1701/healthz
# HTTP/2 200 and {"ok":true,"version":"0.1.0","rulesVersion":...}
curl -I http://pauli.mywire.org
# 301 to https
```

Then open `https://pauli.mywire.org:1701` in two browsers, create a game, join with the invite link, play a land. If the game page loads but the table says it is reconnecting, the WebSocket is blocked: re-check the `/ws` block in nginx and that `PUBLIC_URL` matches exactly.

For push notifications on iPhone/iPad the site must be added to the Home Screen first (Share, Add to Home Screen).

---

## 8. Operations

**Logs**

```sh
cd ~/blg && docker compose logs --tail 100 -f blg
```

Logs are JSON on stdout and rotate through Docker (10 MB, 3 files).

**Update to a new version**

1. **[Mac]** `docker buildx build --platform linux/arm64 -t blg:2 --load .` then `docker save blg:2 | gzip | ssh <user>@<pi> 'gunzip | docker load'`.
2. **[Pi]** Set `TAG=2` in `~/blg/.env`, then `cd ~/blg && docker compose up -d`.

Running games survive a restart: they are rebuilt from the database and timers are recreated.

**Roll back**: set `TAG` back and `docker compose up -d`. The database schema only migrates forward, so after an upgrade that changed the schema a rollback needs a fresh volume (`docker compose down -v`), which loses running games and nothing else (no backups, decision D-06).

**Restart / stop**: `docker compose restart blg`, `docker compose down` (keeps data), `docker compose down -v` (deletes data).

**Clean up old images** after updates: `docker image prune -a` (keeps images in use).

**Disk and SD card**: the Scryfall image cache is capped by `IMAGE_CACHE_MAX_MB` (1024 MB); finished games are deleted after 30 days and idle ones after 14 (`FINISHED_RETENTION_DAYS`, `IDLE_RETENTION_DAYS`). Check usage with `docker system df` and `df -h /`.

**Optional tuning** in `.env`: `AUTO_PASS_MIN_MS` and `AUTO_PASS_MAX_MS` (delay before a counter window with no possible counter passes by itself, default 1000 to 3000).

**Start on boot**: Docker starts at boot and both stacks use `restart: unless-stopped`, so nothing more is needed. Reboot once and check `docker ps`.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up` says network `proxy` not found | `docker network create proxy` (step 4) |
| nginx exits with `host not found in upstream "blg"` | start the app first; both containers must be on the `proxy` network (`docker network inspect proxy`) |
| certificate issue/renewal fails with a timeout or 404 | port 80 not forwarded, Dyno record points elsewhere, or the ACME location is missing in the port-80 block |
| 502 Bad Gateway | app container not healthy: `docker compose ps`, `docker compose logs blg` |
| Page loads, table keeps "reconnecting" | WebSocket blocked or origin mismatch: `PUBLIC_URL` must equal the browser's address exactly; the `/ws` block needs the Upgrade headers |
| Card art missing for custom printings | the Pi cannot reach `api.scryfall.com` / `cards.scryfall.io`; default art is bundled and still works |
| Every visitor gets rate limited together | `TRUST_PROXY` is not `true`, or nginx does not send `X-Forwarded-For` |
| Container restarts with a permission error on `/data` | the volume must be writable by uid 1000; recreate it: `docker compose down -v && docker compose up -d` |
| Cannot reach the site from home but can on mobile data | router lacks NAT loopback; use the phone, or add a local DNS override for `pauli.mywire.org` to the Pi's LAN address |
