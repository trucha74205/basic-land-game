# Web app: product spec

Status key as in `../01-rules.md`: **[D]** decided with the product owner, **[A]** assumption.

## Goals

- **W-01 [D]** Two people play the Basic Land Game online against each other, each on their own phone or desktop browser.
- **W-02 [D]** Installable PWA, usable on mobile and desktop, English UI with all strings behind an i18n layer (German can be added later).
- **W-03 [D]** Players are notified when they can take an action, even when the app is closed or in the background.
- **W-04 [D]** Land art comes from Scryfall, and each player picks the art for each of the five land types.
- **W-05 [D]** Sessions survive connection loss, tab reloads and server restarts. A player can rejoin at any time.
- **W-06 [D]** Hosted on the owner's Raspberry Pi behind the existing nginx (see `15-deployment.md`).

Non-goals for the first release: accounts (designed for, see W-70), bots, custom decks, spectators, chat, public lobby, turn timers.

## Identity and joining

- **W-10 [D]** No accounts. A player enters a nickname (1-20 characters, trimmed, no control characters).
- **W-11 [D]** Creating a game returns an invite link `/j/<code>` and a seat token. The creator is seat 0. The first person to open the link and choose a nickname takes seat 1. A game has exactly two seats.
- **W-12 [D]** The seat token is a secret 128-bit random value kept in the browser (`localStorage`). It authenticates the player for that seat. Only its SHA-256 hash is stored on the server.
- **W-13 [A]** A "rejoin link" `/g/<gameId>#t=<token>` can be copied from the menu to continue on another device. The token is in the URL fragment, so it never reaches server or proxy logs.
- **W-14** An invite code can be used once. After seat 1 is taken, further visitors see "This game is full".

## Create game

- **W-20 [D]** The creator chooses all engine options: deck size (`full`/`half`), empty library rule (`lose`/`reshuffle`), max turns (empty = unlimited), first player (`random`/`me`/`opponent`). Defaults equal the engine defaults.
- **W-21** The creator may choose custom land art before or while waiting in the lobby; otherwise the defaults are used.
- **W-22** The game starts as soon as seat 1 has joined. Game options cannot change after the game exists.

## Table (game screen)

- **W-30 [D]** Lands are shown as art-crop tiles with a land-type frame colour and mana symbol. Tap or long-press zooms to the full card image with the artist credit.
- **W-31** Layout (portrait phone): opponent area on top (nickname, hand count, library count, battlefield, graveyard pile), the stack in the middle, own battlefield below, own hand at the bottom, a contextual action bar, and a menu button. Landscape and desktop use the same blocks with more space.
- **W-32** The action bar always states what is happening in plain words ("Your turn: play a land or end the turn", "Waiting for Ben to respond").
- **W-33** Playing a land: tap a card in hand. If targets exist, valid targets are highlighted and one must be tapped, then confirmed. If no targets exist, the play is confirmed directly. Illegal choices are never selectable (the UI offers only the legal actions the server sent).
- **W-34** Counter window: a dialog shows the pending land and its declared target, then offers "Pass" and, when a counter is possible, "Counter" with a picker for Island plus the second land. When only Pass is possible, the dialog is not shown to the player (see W-35).
- **W-35 [D]** Because the window always opens (R-34), the server auto-passes windows where only Pass is legal after a random delay of 1-3 s. Both players see an identical "waiting for opponent to respond" state either way.
- **W-36** Resolution choices (Swamp discard, copied Mountain/Forest target) show the options as tiles. For Swamp, the revealed opponent hand is shown only to the Swamp player.
- **W-37 [D]** A game log drawer lists all public events as sentences ("Anna played Mountain targeting Ben's Forest"). Private events are redacted per viewer as in `getEvents`.
- **W-38** Win, loss, draw, concede and cancel show a result screen with the reason (R-60, R-70, R-80 to R-82) and the Rematch button.
- **W-39** Concede asks for confirmation. "Cancel game" is available to either player and ends the game for both with no result; it also asks for confirmation.

## Rematch

- **W-40 [D]** After a game ends either player can tap Rematch. When both have tapped, a new game with the same options and a new seed starts in the same room.
- **W-41 [D]** First player in a rematch: the player who lost goes first. After a draw or cancel, it is random.

## Cues

- **W-50 [D]** Sound and vibration cues for: your turn, counter window with a possible counter, a resolution choice, game over. Both can be muted in settings. Vibration is best-effort (not available on iOS).
- **W-51** While the page is open but hidden, the tab title is prefixed ("● Your turn") and restored when the player returns.

## Art selection

- **W-60 [D]** Every land type has a default illustration set by the app (W-62). A player may choose to use custom art: then, and only then, the app uses Scryfall to list other printings, and the player picks one printing per land type in a gallery that can be filtered by set and artist. Each land type can be reset to the default. Choices are saved on the device and sent to the game, so the opponent sees your custom art on your lands.
- **W-61** If a custom image is unavailable (offline, Scryfall unreachable), the tile falls back to the default art for that land type, and the game remains playable. The default art is bundled, so it is always available.
- **W-62 [D]** Default art: one fixed Scryfall printing per land type, downloaded once at development time and shipped as static files in the web app (`web/public/art/default/`, both `art_crop` and `normal`). The defaults are Rebecca Guay's Foundations (FDN) printings, so the five lands look like a set:

  | Land | Scryfall id | Collector no. |
  |---|---|---|
  | Plains | `4ef17ed4-a9b5-4b8e-b4cb-2ecb7e5898c3` | 272 |
  | Island | `23635e40-d040-40b7-8b98-90ed362aa028` | 275 |
  | Swamp | `13505c15-14e0-4200-82bd-fb9bce949e68` | 277 |
  | Mountain | `1edc5050-69bd-416d-b04c-7f82de2a1901` | 279 |
  | Forest | `d232fcc2-12f6-401a-b1aa-ddff11cb9378` | 280 |

  The art is not pixelated or recoloured (W-91). The manifest `default-art.json` records id, set, collector number and artist for the credit line in the zoom view.
- **W-63 [D]** Without a custom choice nothing contacts Scryfall: not the client, and not the server. Defaults need no network, no printing index and no image proxy.

## Accounts later

- **W-70 [D]** The seat model has an optional `owner` reference (null for now) so that user accounts can later own seats, art preferences and game history without changing the game or protocol. Nothing else about accounts is built now.

## Visual design

- **W-90 [D]** The look follows the 8-bit style of 8bitcn/ui (https://www.8bitcn.com, MIT licence): pixel borders, chunky buttons, retro progress and status elements. UI chrome (buttons, dialogs, drawers, inputs, tabs, toasts, badges, menus) uses the 8bitcn components, copied into `web/src/components/ui/8bit` through the shadcn CLI.
- **W-91** Land tiles, the stack display, hand fan and counter picker are custom components in the same style: pixel frame in the land-type colour, 2-3 px stepped corners, mana symbol badge. The Scryfall image inside the frame is shown unmodified (no pixelation filter, no recolouring, no cropping beyond Scryfall's own `art_crop`), and the artist credit stays visible in the zoom view.
- **W-92 [D]** The pixel font is Pixelify Sans (SIL Open Font License, self-hosted in `web/public/fonts`). It is used for headings, buttons, labels and numbers only. Running text (game log, nicknames, errors, settings help) uses a readable system sans-serif at 16 px or larger, so legibility and the accessibility goals in W-81 hold.
- **W-94** Two looks, switchable by the player on every screen and stored on the device: "pixel" (default; pixel font, square corners, hard shadows, stepped lines and animations) and "clean" (no pixel effects: system font, rounded corners, soft shadows, smooth lines). It is independent of light/dark.
- **W-93** Light and dark themes both use 8bitcn theme tokens (CSS variables); the five land colours are defined once as tokens with sufficient contrast (4.5:1 for text on them). Animations are step-based and are disabled under `prefers-reduced-motion`.
- **W-94** The 8-bit components are accessible wrappers over the shadcn primitives; they are verified with axe in the Playwright run and fixed locally if needed, since the files live in our repo.
- **W-95 [D]** The app is private and non-commercial, for the owner and friends, and is not advertised. The About screen lists the licences (8bitcn/ui MIT, Pixelify Sans OFL) and carries this notice: "Unofficial fan project, not affiliated with or endorsed by Wizards of the Coast. Magic: The Gathering and its card art are property of Wizards of the Coast. Card images and data provided by Scryfall." Any change to public or commercial use requires re-checking the Fan Content Policy and replacing the card art.

## Quality attributes

- **W-80** Mobile first: all controls at least 44x44 px, no horizontal scrolling at 320 px width, works in portrait and landscape.
- **W-81** Accessibility: every action reachable by keyboard, visible focus, ARIA labels on tiles ("Mountain, on battlefield"), colour never the only signal, `prefers-reduced-motion` respected, dark and light themes.
- **W-82** Cold start of the installed PWA on a mid-range phone shows the lobby or table within 2 s on a warm cache.
- **W-83** Fits in 256 MB RAM on the Pi for at least 20 concurrent games.
