# Basic Land Game: Engine Specs

Source of rules: Skura's article "Basic Land Game" (ultimateguard.com). It is a summary, not an official rulebook. Gaps are resolved in `01-rules.md` and listed in `05-open-questions.md`.

## Process (spec-driven)

1. Specs in this folder are the source of truth. Change the spec first, then the tests, then the code.
2. Every rule has an ID (`R-xx`). Every Gherkin scenario in `features/` is tagged with the rule IDs it covers (`@R-12`).
3. Every scenario becomes one test (TypeScript, Vitest). A rule with no scenario is not done.
4. The engine is a pure library with no UI or IO. The web app comes later and consumes the engine API (`03-engine-api.md`).

## Files

| File | Purpose |
|---|---|
| `01-rules.md` | Normative rules with IDs, config options, assumptions |
| `02-glossary.md` | Ubiquitous language used in specs, code, and tests |
| `03-engine-api.md` | Public API: config, state, decisions, actions, events |
| `04-architecture.md` | Stack, module layout, testing approach |
| `05-open-questions.md` | Unresolved rules and decisions |
| `features/*.feature` | Gherkin scenarios (engine: `setup-and-turns`, `land-effects`, `counter-and-winning`; web: `web-*`) |
| `web/10-product.md` | Web app requirements (W-xx) |
| `web/11-architecture.md` | Packages, stack, persistence, security (A-xx, S-xx) |
| `web/12-protocol.md` | REST and WebSocket protocol (P-xx) |
| `web/13-images.md` | Scryfall index and image cache (I-xx) |
| `web/14-notifications.md` | Web Push and in-app cues (N-xx) |
| `web/15-deployment.md` | Raspberry Pi, Docker, nginx (D-xx, O-xx) |

## Running it

```
npm install
npm test                                 # engine, server, web unit and component tests
npm run build -w basic-land-web          # web/dist
npm run dev -w basic-land-server         # API on :3000
npm run dev -w basic-land-web            # Vite on :5173, proxies /api /img /ws to :3000
cd web && npx playwright test            # end-to-end (builds the web app and starts the server itself)
docker compose -f deploy/docker-compose.yml build   # image for the Pi (see web/15-deployment.md)
```

`node scripts/fetch-default-art.mjs` re-downloads the default art (developers only, W-62); `node scripts/make-icons.mjs` redraws the PWA icons.
