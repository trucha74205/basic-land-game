# Deploying Basic Land Game on a Raspberry Pi

This guide takes you from a Pi to the game running at `https://basic-land-game.giize.com`. One Docker container runs the app and listens on port 1701. Your existing Nginx Proxy Manager (NPM) terminates TLS on 443 and forwards to it. The hostname comes from Dynu, the certificate from Let's Encrypt via NPM. Everything runs on the Pi itself: you check out the repo there and build the image there.

Placeholders:

| Placeholder | Meaning |
|---|---|
| `<pi>` | the Pi's fixed LAN address, e.g. `192.168.178.30` |
| `<lan-cidr>` | your home network, e.g. `192.168.178.0/24` |
| `<email>` | your email for the app's push contact and Scryfall's User-Agent |

---

## 0. What you need

- Raspberry Pi 3B+ or newer, preferably 2 GB RAM or more (the app is limited to 256 MB, but `vite build` needs memory, see step 2).
- **64-bit** Raspberry Pi OS (Bookworm or newer). Check: `uname -m` must print `aarch64`.
- A router with port forwarding and a public IPv4 address, not CGNAT. Quick check: compare the "WAN IP" in your router with what <https://ifconfig.me> shows. If they differ, or the WAN IP starts with `100.64`-`100.127`, you are behind CGNAT and this will not work.
- Docker with the compose plugin on the Pi (`docker compose version`), and NPM already running with ports 80 and 443 forwarded to the Pi.
- The Dynu hostname `basic-land-game.giize.com`, pointing at your public IP (the Dynu IP update client you already use keeps it current). Check from any machine: `dig +short basic-land-game.giize.com` returns your public IP.

---

## 1. Check out the repo

```sh
git clone git@github.com:trucha74205/basic-land-game.git
cd basic-land-game/deploy
```

All following commands run in `basic-land-game/deploy` on the Pi.

---

## 2. Configure

Generate the Web Push keys once and keep them. Changing them later drops every push subscription:

```sh
npx web-push generate-vapid-keys
```

Create the environment file:

```sh
cp .env.example .env
chmod 600 .env
nano .env
```

Fill it in:

```ini
TAG=1
COMPOSE_PROJECT_NAME=blg
PUBLIC_URL=https://basic-land-game.giize.com
CONTACT_EMAIL=<email>
VAPID_PUBLIC_KEY=<public key from the command above>
VAPID_PRIVATE_KEY=<private key from the command above>
TRUST_PROXY=true
IMAGE_CACHE_MAX_MB=1024
```

Notes:

- `PUBLIC_URL` must be exactly `https://basic-land-game.giize.com`: no path, no trailing slash, no port. The server rejects WebSocket connections whose `Origin` differs from it, and uses it for the content security policy.
- `CONTACT_EMAIL` is the Web Push contact and the Scryfall User-Agent. It is unrelated to the email you give Let's Encrypt in NPM.
- `TAG` is the tag of the image you build in step 3.
- `COMPOSE_PROJECT_NAME=blg` fixes the name of the data volume (`blg_blg-data`) so it does not depend on the folder name.
- Leave `TRUST_PROXY=true`: NPM passes the real client address in `X-Forwarded-For`, and rate limiting depends on it.
- Without VAPID keys the game works but push notifications are off.

---

## 3. Build and start

```sh
docker compose up -d --build
docker compose ps          # blg should become "healthy" after ~30 s
docker compose logs -f blg # Ctrl+C to leave
```

This builds the image `blg:${TAG}` from the checked-out repo (first build takes several minutes) and starts it. The default card images are already in the repo, so the build needs no internet access beyond npm. On a 1 GB Pi `vite build` can run out of memory: add swap (`sudo dphys-swapfile swapoff`, set `CONF_SWAPSIZE=2048` in `/etc/dphys-swapfile`, `sudo dphys-swapfile setup && sudo dphys-swapfile swapon`) and retry.

The app listens on port 1701 and publishes it on the Pi. Check it from the Pi:

```sh
curl -i http://localhost:1701/healthz
# HTTP/1.1 200 and {"ok":true,"version":"0.1.0","rulesVersion":...}
```

The data lives in the named volume `blg_blg-data` mounted at `/data` (SQLite database plus the Scryfall image cache). The container runs as user 1000, read-only, with `/tmp` as tmpfs and a 256 MB memory limit.

---

## 4. Firewall

Give the Pi a fixed LAN address (DHCP reservation in your router, by the Pi's MAC address). NPM and the router rely on it.

Docker publishes port 1701 itself and bypasses ufw rules. That is fine as long as the router does **not** forward 1701: the port is then reachable only from your LAN, and the world reaches the game only through NPM. ufw protects everything else:

```sh
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <lan-cidr> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

If NPM runs in Docker on the same Pi, its published ports 80 and 443 bypass ufw as well, so these two rules only document intent. Make sure you can still SSH in from your LAN before closing your current session.

---

## 5. NPM (web UI)

NPM already owns ports 80 and 443 and may already hold a host for another service. The game gets its own host name, so nothing existing changes.

**Proxy host.** Hosts → Proxy Hosts → Add Proxy Host:

| Field | Value |
|---|---|
| Domain Names | `basic-land-game.giize.com` |
| Scheme | `http` |
| Forward Hostname / IP | `<pi>` (the Pi's LAN address) |
| Forward Port | `1701` |
| Cache Assets | off |
| Block Common Exploits | on |
| **Websockets Support** | **on** (the game needs it) |

Use the Pi's LAN address, not `localhost` or `127.0.0.1`: if NPM runs in a container, those point to the NPM container itself.

**SSL tab:**

1. SSL Certificate: Request a new SSL Certificate.
2. Force SSL: on. HTTP/2 Support: on.
3. Email Address for Let's Encrypt: your email. Agree to the Let's Encrypt terms.
4. Save. NPM validates through HTTP-01 on port 80, so the hostname must already resolve to your public IP and router port 80 must be forwarded to NPM.

The proxy host's defaults are enough. The game works with "Websockets Support" on; no Advanced tab configuration is needed.

---

## 6. Router

Forward these TCP ports to the machine running NPM (normally the Pi), if they are not forwarded already for your other hosts:

| External | Internal | Why |
|---|---|---|
| 443 | `<pi>`:443 | the game (HTTPS and WebSocket) |
| 80 | `<pi>`:80 | certificate issue and renewal (HTTP-01) and the redirect to HTTPS |

Do not forward 22 or 1701. If your router blocks "NAT loopback", testing the public hostname from inside your LAN may fail even though it works from outside (use your phone on mobile data to test).

---

## 7. Verify

From outside your LAN (phone on mobile data):

```sh
curl -i https://basic-land-game.giize.com/healthz
# HTTP/2 200 and {"ok":true,"version":"0.1.0","rulesVersion":...}
curl -I http://basic-land-game.giize.com
# 301 to https
```

Then open `https://basic-land-game.giize.com` in two browsers, create a game, join with the invite link, play a land. If the game page loads but the table says it is reconnecting, the WebSocket is blocked: check that "Websockets Support" is on in the NPM proxy host and that `PUBLIC_URL` matches the browser's address exactly.

For push notifications on iPhone/iPad the site must be added to the Home Screen first (Share, Add to Home Screen).

---

## 8. Operations

**Logs**

```sh
cd ~/basic-land-game/deploy && docker compose logs --tail 100 -f blg
```

Logs are JSON on stdout and rotate through Docker (10 MB, 3 files).

**Update to a new version**

```sh
cd ~/basic-land-game
git pull
cd deploy
# optional: bump TAG in .env, e.g. TAG=2
docker compose up -d --build
```

Running games survive a restart: they are rebuilt from the database and timers are recreated.

**Roll back**: `git checkout <old commit>`, set `TAG` back, `docker compose up -d --build`. The database schema only migrates forward, so after an upgrade that changed the schema a rollback needs a fresh volume (`docker compose down -v`), which loses running games and nothing else (no backups, decision D-06).

**Restart / stop**: `docker compose restart blg`, `docker compose down` (keeps data), `docker compose down -v` (deletes data).

**Clean up old images** after updates: `docker image prune -a` (keeps images in use).

**Disk and SD card**: the Scryfall image cache is capped by `IMAGE_CACHE_MAX_MB` (1024 MB); finished games are deleted after 30 days and idle ones after 14 (`FINISHED_RETENTION_DAYS`, `IDLE_RETENTION_DAYS`). Check usage with `docker system df` and `df -h /`.

**Optional tuning** in `.env`: `AUTO_PASS_MIN_MS` and `AUTO_PASS_MAX_MS` (delay before a counter window with no possible counter passes by itself, default 1000 to 3000).

**Certificate renewal** is handled by NPM automatically. Check Hosts → SSL Certificates now and then.

**Start on boot**: Docker starts at boot and the Compose service uses `restart: unless-stopped`, so nothing more is needed. Reboot once and check `docker ps`.

---

## 9. Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose up --build` is killed or `vite build` fails with out-of-memory | add swap (step 3) or build with fewer apps running |
| `port is already allocated` on 1701 | something else uses 1701: `sudo ss -ltnp \| grep 1701` |
| NPM shows 502 Bad Gateway | app not healthy (`docker compose ps`, `docker compose logs blg`), or Forward Hostname is `localhost` instead of the Pi's LAN address |
| NPM cannot issue the certificate | hostname does not resolve to your public IP, router port 80 not forwarded, or "Force SSL" was set before the certificate existed |
| Page loads, table keeps "reconnecting" | "Websockets Support" off in NPM, or `PUBLIC_URL` differs from the browser's address (scheme, host, no port) |
| Card art missing for custom printings | the Pi cannot reach `api.scryfall.com` / `cards.scryfall.io`; default art is bundled and still works |
| Every visitor gets rate limited together | `TRUST_PROXY` is not `true`, or NPM does not send `X-Forwarded-For` (it does by default) |
| Container restarts with a permission error on `/data` | the volume must be writable by uid 1000; recreate it: `docker compose down -v && docker compose up -d` |
| Cannot reach the site from home but can on mobile data | router lacks NAT loopback; use the phone, or add a local DNS override for `basic-land-game.giize.com` to the Pi's LAN address |
