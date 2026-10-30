# Open questions and assumptions to confirm

1. ~~Stalemates under `reshuffle`~~ **Resolved:** `maxTurns` (default none) ends the game as a draw (R-80). Concede and cancel are always possible (R-81 to R-83).
2. ~~**R-13** hand size~~ **Resolved:** no maximum hand size (R-13 confirmed).
3. ~~**R-14** countered drop~~ **Resolved:** a countered land drop uses up the land drop (R-14 confirmed).
4. ~~**R-32** counter war~~ **Resolved:** counters can be countered in an unlimited chain (R-32, R-33). R-31 "once per land drop" is removed.
5. ~~**R-61** simultaneous win~~ **Resolved:** the active player wins (R-61 confirmed).
6. ~~Hidden Swamp info~~ **Resolved:** see R-42a and the event visibility rule in `03-engine-api.md`.
7. ~~Custom decks~~ **Resolved:** out of scope for v1. Keep `GameConfig` extensible so a `deck` option can be added without breaking changes.
8. ~~Bots/AI~~ **Resolved:** out of scope for v1. `getLegalActions` lets a bot be added later as a separate package.

All questions resolved.

## Web app

All questions are resolved (see below).

18. ~~**8bitcn setup details (W-90)**~~ **Resolved:** Tailwind 4 with `@tailwindcss/vite`, `components.json` written by hand, components added with `npx shadcn@latest add --yes https://www.8bitcn.com/r/<name>.json` (button, dialog, input, badge, sheet, card, select, label). The registry components use React 19 (ref as prop), so the client uses React 19. Their `retro.css` imported Press Start 2P from Google Fonts; it is changed to the self-hosted Pixelify Sans (W-92, CSP). `Dialog` content props were widened so Radix props such as `onInteractOutside` pass through.

## Resolved with the web app planning

- ISP: public IPv4, no CGNAT (D-03). nginx in Docker on the same host (D-04). HTTP-01 certificates (D-05).
- Storage: SD card, capped image cache, no backups (D-06, I-15).
- Hostname and contact email stay placeholders until deployment (D-07).
- Rematch: loser goes first (W-41). Rejoin: link with the token in the URL fragment (W-13).
- Font: Pixelify Sans (W-92). Audience: private, with the fan-project notice (W-95).
- `RULES_VERSION` added to the engine (A-06).
- Default art: five fixed Foundations printings bundled with the app, Scryfall only for custom art (W-60 to W-63, I-30 to I-42).
- Visual design: 8bitcn/ui for chrome, custom 8-bit tiles, readable font for running text (W-90 to W-95).
- R-34 changed: the counter window always opens (no timing leak). Engine and tests updated.

## Server implementation notes

- Server done (`server/`, 54 tests, each named after the requirement IDs it covers). `14-notifications.md` was empty after the earlier session and has been rewritten from `web-notifications.feature` and the decisions in this log; check N-01 to N-11 once.
- Node 26 on the dev machine needs `better-sqlite3` 12.x; the Pi image uses Node 22 (also supported by 12.x).

## Web client and deployment notes

- Web client done (`web/`): 19 unit and component tests, 2 Playwright end-to-end tests (two browsers, phone viewport, tab death and rejoin, rejoin link, concede, rematch, no Scryfall traffic with default art).
- Chromium's emulated offline mode does not close open WebSockets, so the end-to-end test simulates a dead tab by closing the page; reconnect with backoff is covered by `web/test/lib.test.ts`.
- Not done: axe accessibility scan (W-94), German strings, a real push test on a phone (needs HTTPS and VAPID keys on the Pi), the service worker's offline start is built and precaches the default art but is not exercised by a browser test.
- `deploy/` has the Dockerfile (repo root), compose file and `.env.example`; the image was built and run locally read-only as UID 1000 (arm64).
