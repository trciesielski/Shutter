# Shutter

Responsive music player UI prototype (visual-first).

## Run

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

## Web (public catalog) vs mobile

- `npm run build` – public web player (default, read-only). Streams the central catalog from the Cloudflare R2 bucket `music` through the Pages Function `/music/*` (binding `MUSIC_BUCKET`). No import, upload or delete.
- `npm run build:mobile` / `npm run dev:mobile` – mobile variant (`VITE_PLATFORM=mobile`) with local file import and IndexedDB library.
- `npm test` – unit tests; `npm run test:e2e` – Playwright against `wrangler pages dev` with a local R2 bucket (needs `ffmpeg`).

Setup, environment variables and the catalog JSON schema: [docs/PUBLIC_WEB_R2.md](docs/PUBLIC_WEB_R2.md).
Android phone, Android Auto projection and AAOS setup: [docs/ANDROID.md](docs/ANDROID.md).

## Scope

- Responsive music dashboard, library, playlists and player
- Automatic light/dark theme with manual override
- Car-style **visual preview only** (`Car Preview` tab)
- Real audio engine (two decks, crossfade, EQ, visualizers), playlists, favourites and listening history

**Not yet implemented:** account sync, macOS desktop packaging, Android app, Android Auto integration. Android Auto requires a separate compliant native media integration (Android Media3 / MediaLibraryService and platform-controlled car templates); a responsive web view does not itself provide Android Auto compatibility.

## Next steps

Lock visual design, then add shared data/player architecture and Android and desktop shells. Test Android Auto using Desktop Head Unit and automotive emulator before claiming compatibility.
