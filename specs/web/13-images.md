# Web app: Scryfall images

Scryfall is used in two places only: once at development time to fetch the bundled default art (I-40), and at runtime on the server when a player opens the custom art picker (I-01 onwards). Nothing else contacts Scryfall (W-63).

Rules summary from Scryfall's API documentation, to be re-checked against the current text before release: send a descriptive `User-Agent` and an `Accept` header on every request, keep API calls to at most about 10 per second (wait 50 to 100 ms between requests), cache what is downloaded, and do not alter card images. Art is © Wizards of the Coast and the app must say that it is unofficial fan content (About screen).

## Printing index

- **I-01** For each land type, the server queries `GET https://api.scryfall.com/cards/search?q=!"<Name>" game:paper unique:prints&order=released` and follows `next_page` until done, with at least 100 ms between requests. Snow-covered lands are excluded by the exact-name match.
- **I-02** For each card it stores `id`, set code and name, artist, collector number, release date and the `image_uris` (`small`, `normal`, `art_crop`) in `printings`.
- **I-03 [D]** The index is built lazily: only when the first client requests `GET /api/printings/:landType` and no (fresh) index for that land type exists. It is refreshed when older than 30 days and requested again. The first request returns `202 Accepted` with `{ status: "building" }`; the picker shows a loading state and polls. A failed refresh keeps the old data and retries after 1 hour.
- **I-04** `GET /api/printings/:landType` returns the stored list (id, set, artist, release year) with `Cache-Control: public, max-age=3600`.

## Image cache

- **I-10** `GET /img/:scryfallId/:version` checks the id (UUID format) against `printings` and the version against the allowed list, otherwise 404.
- **I-11** On a cache miss the server downloads the file once from the stored `cards.scryfall.io` URL through a single serial queue with a 100 ms gap, writes it to `DATA_DIR/images/<id>/<version>.jpg` (temporary file, then rename), and serves it. Concurrent requests for the same file share one download.
- **I-12** Responses carry `Cache-Control: public, max-age=31536000, immutable` and an `ETag`.
- **I-13** If Scryfall is unreachable and the file is not cached, the server returns 502 and the client shows the bundled default art for that land type (W-61).
- **I-15 [D]** The image cache is capped at `IMAGE_CACHE_MAX_MB` (default 1024). A nightly job and each download check the size and delete the least recently accessed files first (access time tracked in memory and flushed to a small SQLite table `image_access`), to limit SD card use.
- **I-14** Which version is used where: `art_crop` for tiles, `normal` for the zoom view, `small` for the picker grid.

## Client caching

- **I-20** The service worker serves `/img/*` cache-first with a limit of 400 entries and 60 days.
- **I-21** The app shell, fonts and the default art (I-41) are precached so the app starts offline.
- **I-22** The art picker loads images lazily as they scroll into view.

## Default art and storage of choices

- **I-30 [D]** There is no random default. A seat without a custom choice for a land type uses the bundled default (W-62). The choice is `art: { [landType]: scryfallId | null }` where a missing key or `null` means the default.
- **I-31** A custom choice is kept in `localStorage`, sent with `art` after `hello`, and stored in `seats.art_json`. The server accepts only ids present in `printings` for the matching land type, or `null` to reset.
- **I-32** When a custom printing equals a default id, it is treated as the default and the bundled file is used.

## Bundled default art

- **I-40** `scripts/fetch-default-art.mjs` downloads the five defaults from Scryfall's API (`image_uris.art_crop` and `normal`) once, with the same User-Agent, Accept header and rate limiting as the server, writes the files and `default-art.json` into `web/public/art/default/`, and is run by a developer, never at build or runtime. The files are committed.
- **I-41** The service worker precaches the default art with the app shell (I-21). Its total size stays below 2 MB.
- **I-42** The defaults are redistributed inside a private, non-commercial project (W-95). Replacing them with other images only requires changing the manifest and the files.
