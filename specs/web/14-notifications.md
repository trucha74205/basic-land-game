# Web app: notifications

Goal (W-03): a player learns that they can act, even when the app is closed. Two layers: Web Push for closed or hidden apps, and in-app cues (W-50, W-51) while the page is open.

## Platform support

- Android (Chrome, Firefox, Edge): Web Push works in the browser and in the installed PWA.
- iOS and iPadOS 16.4 or later: Web Push works **only for a PWA added to the Home Screen**. In a normal Safari tab the Push API is unavailable.
- Desktop browsers: Web Push works while the browser process runs.
- A WebSocket cannot replace push: browsers suspend background tabs and close their sockets, and a closed app has no socket. Push is delivered by the platform's push service, which wakes the service worker.

## Rules

- **N-01 [D]** A seat is notified when it has a human decision: a new turn for the active seat, a `CounterWindow` where the seat has a legal `Counter` action (never when only `PassCounter` is legal, since the server auto-passes, P-08), or a `ResolutionChoice` for the seat.
- **N-02** Game over, concede by the opponent and cancel also notify the other seat.
- **N-03 [D]** A push is sent only when the seat has no connected socket whose page reported itself visible (`visibility` message, P-protocol). The decision is made 5 s after the decision arises; if by then the decision is gone (answered) or a visible socket exists, nothing is sent.
- **N-04** A reconnecting socket that reports `visible` within the 5 s delay cancels the pending push (no duplicate push during a reconnect). A socket that connects without ever reporting visibility counts as hidden.
- **N-05 [D]** Push content is public information only: title, a short sentence, the game id for the click target. Never hand contents, the opponent's choices or private events.
  - Turn: "Your turn against {nickname}".
  - Counter window: "{nickname} played {Land}: respond?"
  - Resolution choice: "Your choice is waiting in the game against {nickname}".
  - Over: "The game against {nickname} is over".
- **N-06** Each notification carries a `tag` equal to the game id so a newer one replaces an older one; clicking it focuses an open client of the game or opens `/g/<gameId>`.
- **N-07** A subscription whose endpoint answers 404 or 410 is deleted. Other failures are logged and not retried.
- **N-08** Subscriptions are per game and seat (`PUT /api/games/:id/push`, Bearer seat token), per device, unique by endpoint. They are deleted with the game (retention) and on `DELETE`.
- **N-09** The VAPID public key is served at `GET /api/push/key`; the subject is `mailto:${CONTACT_EMAIL}`. Without VAPID keys configured push is disabled and the key endpoint answers 404; everything else works.
- **N-10** On iOS outside an installed PWA the "Enable notifications" button explains that the app must first be added to the Home Screen.
- **N-11** Notifications are opt-in per device; the permission prompt is only requested after the player taps "Enable notifications".
