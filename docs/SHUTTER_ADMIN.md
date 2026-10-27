# SHUTTER ADMIN

Private catalog management for SHUTTER WEB at `/admin`, served by the existing Cloudflare Pages
project `shutter-web` with the existing R2 binding `MUSIC_BUCKET` → `music`. Public visitors stay
read-only: `/music/*` accepts only `GET`/`HEAD`, and every write goes through `/api/admin/*`, which
verifies the Cloudflare Access JWT on **every** request.

## Surfaces

| Surface | Path | Capabilities |
| --- | --- | --- |
| WEB (public) | `/`, `/music/*` | Stream the published catalog. No import, upload, edit or delete. |
| ADMIN | `/admin`, `/api/admin/*` | Upload, metadata, artwork, catalog editor, history/rollback, safe deletion. |
| MOBILE build | `npm run build:mobile` | Local import/playback/deletion on the device. Never contains the admin panel. |

The GitHub Pages preview build sets `SHUTTER_BUILD_ADMIN=0` (no Pages Functions there), so it never
contains `/admin`.

## Required Cloudflare configuration (dashboard, by the account owner)

Nothing below is changed by the code or by CI. Until it is done, `/admin` and `/api/admin/*` return
**503 `admin_not_configured`** (fail closed) — they never fall back to an open panel.

1. **Zero Trust → Access → Applications → Add → Self-hosted**
   - Name: `SHUTTER ADMIN`
   - Session duration: e.g. 24 h
   - Application domains (add each host the site is served on):
     - `shutter-web-6p2.pages.dev` path `admin`
     - `shutter-web-6p2.pages.dev` path `admin/*`
     - `shutter-web-6p2.pages.dev` path `api/admin/*`
     - the same three paths on `music.madebyform.work` once that domain serves the site
     - (optional) `*.shutter-web-6p2.pages.dev` with the same paths for preview deployments
   - Identity provider: One-time PIN or your IdP.
   - Policy: **Allow**, Include → **Emails** → the administrator address(es) only. No "Everyone",
     no email domain rules.
   - Copy the **Application Audience (AUD) Tag** from the application overview.
2. **Workers & Pages → `shutter-web` → Settings → Variables and Secrets** (Production, and Preview
   if previews should work):
   - `ACCESS_TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com` (Zero Trust → Settings → Custom Pages / team domain)
   - `ACCESS_AUD` = the AUD tag (comma-separated if several applications are allowed)
   - `ADMIN_EMAILS` = the same administrator e-mail(s), comma-separated
   These are not secrets (the JWKS is public), but they must match exactly.
3. Keep the existing binding `MUSIC_BUCKET` → `music`. Do not create a bucket, do not enable public
   R2 access, do not change DNS.
4. Deploy with Functions (`npx wrangler pages deploy dist --project-name shutter-web` from the repo
   root after `npm run build`, or Git integration). Uploading only `dist` through the dashboard does
   not include `functions/`.

Access blocks unauthenticated requests at the edge. The Functions independently verify the
`Cf-Access-Jwt-Assertion` header (or `CF_Authorization` cookie): RS256 signature against
`<team>/cdn-cgi/access/certs`, exact issuer, audience allowlist, `exp`/`nbf`/`iat`, and the e-mail
allowlist. Missing/invalid token → 401, wrong identity → 403, missing config or unreachable JWKS → 503.
State-changing requests also require same `Origin` and `X-Shutter-Admin: 1` (CSRF).

## Upload architecture

The browser never holds R2 credentials. Uploads are R2 multipart uploads driven by the admin API:

1. `POST /api/admin/uploads` `{kind, name, size, type, fingerprint}` → server checks extension,
   MIME and size, generates the key (`tracks/<year>/<random>.<ext>` or `covers/<year>/<random>.<ext>`),
   opens the multipart upload, stores a session in `admin/uploads/<id>.json` (24 h).
2. `PUT /api/admin/uploads/<id>/parts/<n>` — 8 MiB parts (below the Pages request-body limit).
   Part 1 is signature-checked (MP3/FLAC/WAV/M4A, JPEG/PNG/WebP); a mismatch aborts the session.
   Failed parts are retried by the client (3 attempts); the session can be resumed.
3. `POST /api/admin/uploads/<id>/complete` — completes, re-reads the stored head, verifies size and
   signature; an invalid object is deleted.

Limits: audio 1 GiB, cover 25 MiB. Client keys, prefixes and paths are ignored. Duplicates are
detected by a SHA-256 fingerprint (size + first/last 2 MiB) against the catalog (409, can be
overridden explicitly).

## Catalog publishing, backup and rollback

- `GET /api/admin/catalog` returns the catalog and its R2 ETag.
- `PUT /api/admin/catalog` `{catalog, etag}` validates strictly (stable IDs, safe keys under
  `tracks/`/`covers/`, NFC text, field limits), checks every referenced object exists, copies the
  current version to `admin/catalog-history/<timestamp>-<random>.json`, then writes with
  `onlyIf: {etagMatches}`. A concurrent change returns **412 `catalog_conflict`** and nothing is
  overwritten. History keeps the last 100 versions.
- `POST /api/admin/catalog/rollback` publishes a stored version through the same path (so the
  rollback itself is backed up and reversible).
- The public catalog is served with `Cache-Control: no-cache` (ETag revalidation) and the player
  refreshes it when the tab regains focus, without interrupting playback.

## Deletion

1. **Remove from public catalog** — catalog editor, then *Opublikuj*. The file stays in R2.
2. **Delete permanently** — *Magazyn*, only for objects not referenced by the published catalog or the
   current draft; requires typing `USUŃ`; the API requires `confirm` equal to the exact key and
   refuses keys outside `tracks/` and `covers/` or referenced (including shared covers) with 409.

## Local testing

`npm test` (unit, incl. Miniflare R2) and `npm run test:e2e` (Playwright against `wrangler pages dev`
with local R2 and a loopback Access stub `e2e/access-stub.mjs` that signs test tokens). The stub is
test-only; production verification always uses the real Access JWKS.

## Known limitations

- Only one administrator role; no per-user audit beyond `publishedBy` metadata and history entries.
- Abandoned multipart uploads are aborted on cancel/failure; sessions left by a closed browser expire
  logically after 24 h but their parts are cleaned up only by R2's own multipart expiry.
- Thumbnails are generated in the browser (WebP, longest side 512 px); originals are kept unchanged.
