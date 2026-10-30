# Web app: protocol

All payloads are JSON validated with zod. Engine types (`Action`, `PlayerView`, `GameEvent`, `Card`) are reused as they are.

## REST

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/games` `{ nickname, options }` | none | Create a game. Returns `{ gameId, code, seat: 0, token }`. `options` = `{ deckSize, emptyLibrary, maxTurns, firstPlayer: "random" \| "me" \| "opponent" }`. |
| `GET /api/invites/:code` | none | Public info for the join screen: `{ gameId, creatorNickname, options, full }`. |
| `POST /api/invites/:code/join` `{ nickname }` | none | Take seat 1. Returns `{ gameId, seat: 1, token }`. 409 when full. |
| `POST /api/invites/:code/join` `{ nickname, request: true }` | none | Ask for seat 1 from the open-games list: the game stays `waiting` and the seat is `pending` until the host sends `accept` (game starts) or `kick` (seat removed, guest socket closed with `bad_token`). |
| `GET /api/games/open` | none | `{ games: [{ code, creatorNickname, options, createdAt }] }`: waiting games with no guest or request and an online host. |
| `GET /api/games/:id` | Bearer seat token | `{ status, opponent, pending }`; the start screen hides finished games with it. |
| `GET /api/printings/:landType` | none | Art gallery data for one land type, only used by the custom art picker (see `13-images.md`). `202 { status: "building" }` while the index is built, then `200 { status: "ready", printings: [{ id, set, setName, artist, year, collectorNumber }] }`; `502` when the index cannot be built. |
| `GET /img/:scryfallId/:version` | none | Cached image, `version` in `art_crop`, `normal`, `small`. |
| `PUT /api/games/:id/push` `{ subscription }` | Bearer seat token | Register this device for push (204). `DELETE` with the same body removes it. 404 when push is not configured. |
| `GET /api/push/key` | none | `{ key }`, the VAPID public key; 404 when push is not configured. |
| `GET /healthz` | none | Liveness. |

Errors use `{ error: { code, message } }` with HTTP status 400, 401, 404, 409 or 429.

## WebSocket `/ws`

One connection per device and game. The first client message must be `hello` within 5 s, otherwise the server closes the socket.

### Client to server

| Message | Meaning |
|---|---|
| `{ t: "hello", gameId, token, lastVersion? }` | Authenticate the seat and request state. |
| `{ t: "action", version, action }` | Apply `action` if the game is at `version`. |
| `{ t: "art", art }` | Set own custom art: `{ Plains?, Island?, Swamp?, Mountain?, Forest? }` as scryfall ids; `null` or a missing key means the bundled default. |
| `{ t: "rematch" }` | Vote for a rematch. |
| `{ t: "accept" }`, `{ t: "kick" }` | Host only, while a guest request is pending. |
| `{ t: "visibility", visible }` | The page became visible or hidden (for push decisions). |
| `{ t: "ping" }` | Keepalive every 25 s. |

### Server to client

| Message | Meaning |
|---|---|
| `{ t: "snapshot", gameId, seat, version, status, options, seats, view, legalActions, events, rematch }` | Full state for this seat. `events` are the redacted events since `lastVersion`, or all events when it is absent. `rematch` is `{ votes, nextGameId }`. While the game is `waiting` for a guest, `view` is null and there are no events. Sent after `hello`, after every reconnect, and to everyone in the room when the guest joins. |
| `{ t: "update", version, status, events, view, legalActions, seats }` | State after an applied action. |
| `{ t: "presence", seats }` | Seat connection and nickname changes. |
| `{ t: "rejected", reason, version }` | Action not applied. `reason`: `stale_version`, `illegal`, `not_your_turn`, `game_over`, `bad_art` (unknown printing id in an `art` message). A fresh `snapshot` follows for `stale_version`. |
| `{ t: "rematch", votes, nextGameId? }` | Rematch progress; `nextGameId` set when the new game exists. |
| `{ t: "error", code, message }` | Fatal for this connection (`bad_token`, `bad_message`, `rate_limited`, `game_not_found`). |
| `{ t: "pong" }` | Keepalive reply. |

`seats` is `[{ seat, nickname, connected, art }, ...]`.

### Rules

- **P-01** `legalActions` contains only the actions the receiving seat may take: the actions for its own pending decision, and `Concede` and `CancelGame`. The opponent's decision options are never sent.
- **P-02** `view` is `getView(game, seat)`. Events are `getEvents(game, seat)` restricted to the requested range.
- **P-03** The client sends the `version` it last saw with every action. A mismatch (for example a double tap, or a message after a reconnect) is rejected as `stale_version` and answered with a snapshot; actions are therefore applied at most once.
- **P-04** After an action, the server sends one `update` to every connected socket of both seats, each filtered for that seat.
- **P-05** A second connection for the same seat is allowed (phone and desktop). Both receive updates; whichever acts first wins.
- **P-06** Reconnect: the client reconnects automatically with exponential backoff (0.5 s to 15 s, jitter) and sends `hello` with its `lastVersion`. The game is never paused or altered by a disconnect.
- **P-07** The server closes sockets silent for 60 s. `presence.connected` for a seat is true while at least one socket of it is open.
- **P-08** Auto-pass: when the pending decision is a `CounterWindow` whose only legal action besides concede and cancel is `PassCounter`, the server applies `PassCounter` after a uniformly random delay between 1000 and 3000 ms (configurable). The timer is re-created after a server restart when a game is loaded in that state.
