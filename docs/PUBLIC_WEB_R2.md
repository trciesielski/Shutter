# SHUTTER WEB – publiczny katalog z Cloudflare R2

## Platformy

`src/platform.js` jest jedynym źródłem decyzji o funkcjach zależnych od platformy.

| `VITE_PLATFORM` | Tryb | Katalog R2 | Import lokalny | Usuwanie | IndexedDB |
|---|---|---|---|---|---|
| brak / `web` / dowolna inna wartość | publiczny web (read-only) | tak | nie | nie | nie |
| `mobile` | przyszłe warianty mobilne | nie | tak | tak | tak |

Brak zmiennej środowiskowej = tryb `web`. Build mobilny: `npm run build:mobile` (czyta `.env.mobile`, wynik w `dist-mobile/`).
W trybie web kontrolki importu i usuwania nie są renderowane, a `importFiles`/`remove` w silniku audio są wyłączone (`null`).

Playlisty, ulubione, oceny i historia odsłuchów zostają w `localStorage` przeglądarki słuchacza i dotyczą tylko jego urządzenia; nie modyfikują katalogu.

## Architektura R2

```
przeglądarka ──GET/HEAD──> https://<domena>/music/<klucz>   (Cloudflare Pages Function)
                                   │ binding MUSIC_BUCKET (tylko odczyt w kodzie)
                                   ▼
                           bucket R2 "music" (prywatny)
```

- `functions/music/[[path]].js` → `server/r2PublicMedia.js`.
- Obsługiwane metody: `GET`, `HEAD`. Wszystko inne: `405` z `Allow: GET, HEAD`. Brak listowania, PUT, DELETE.
- Udostępniane prefiksy kluczy: `tracks/`, `covers/`, `catalog/` (zmiana: `MUSIC_PUBLIC_PREFIXES`, lista po przecinku). Inne klucze, `..`, `\` i nieznane rozszerzenia → `404`.
- `Range` (`bytes=a-b`, `bytes=a-`, `bytes=-n`) → `206` + `Content-Range`; poza zakresem → `416`. `Accept-Ranges: bytes`, `ETag`, `If-None-Match` → `304`.
- Typy: mp3, m4a/aac, ogg/opus, wav, flac, webm; okładki jpg/png/webp/avif/gif; `catalog/*.json`. SVG/HTML nie są serwowane. `X-Content-Type-Options: nosniff`.
- Brak bindingu → `503 {"error":"music_storage_not_configured"}` (strona dalej działa i pokazuje błąd katalogu).
- `/_routes.json` ogranicza wywołania Functions do `/music/*`, `/admin`, `/admin/*` i `/api/admin/*`; reszta to statyczne pliki.
- Ten sam origin: bez CORS, a equalizer/wizualizer (Web Audio) działają na strumieniu.

Credentiale R2 nie występują w kodzie ani w bundlu. Zarządzanie katalogiem odbywa się w SHUTTER ADMIN (`/admin`, Cloudflare Access) — patrz `docs/SHUTTER_ADMIN.md`. Alternatywnie poza aplikacją: panel Cloudflare, `wrangler r2 object put --remote`, rclone/S3 z kluczami administratora.

## Wymagana konfiguracja Cloudflare (ręcznie, nie wykonano z tej sesji)

1. Pages → `shutter-web` → Settings → Bindings → Add → R2 bucket: nazwa zmiennej `MUSIC_BUCKET`, bucket `music`. Dla Production (i opcjonalnie Preview).
2. Build: command `npm run build`, output `dist`. Nie ustawiać `VITE_PLATFORM` (albo `web`).
3. Wgrać do bucketu `music`: `catalog/catalog.json`, pliki audio pod `tracks/`, okładki pod `covers/`.
4. Opcjonalnie domena `music.madebyform.work` (Pages → Custom domains) – nie zmieniano DNS.

Alternatywa bez Functions: publiczna domena R2 + `VITE_MUSIC_BASE_URL=https://<domena-r2>/` i polityka CORS bucketu (GET/HEAD, nagłówek `Range`, origin aplikacji). Wtedy bucket jest publicznie czytelny w całości.

## Zmienne środowiskowe (build, publiczne – trafiają do bundla)

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `VITE_PLATFORM` | `web` | `mobile` włącza import lokalny |
| `VITE_MUSIC_BASE_URL` | `/music/` | baza dla względnych ścieżek z katalogu |
| `VITE_CATALOG_URL` | `<baza>catalog/catalog.json` | adres manifestu |
| `VITE_MUSIC_ALLOWED_ORIGINS` | origin bazy | dodatkowe dozwolone originy URL-i audio/okładek (po przecinku) |

Zmienne Functions (runtime): `MUSIC_BUCKET` (binding R2, wymagany), `MUSIC_PUBLIC_PREFIXES` (opcjonalna).

## Schemat `catalog/catalog.json`

Przykład: [`catalog.example.json`](catalog.example.json).

| Pole | Wymagane | Typ / reguła |
|---|---|---|
| `version` | tak | `1` |
| `title` | nie | tekst ≤ 200 |
| `tracks` | tak | tablica ≤ 5000 |
| `tracks[].id` | tak | `[A-Za-z0-9._:-]{1,128}`, unikalne |
| `tracks[].title` | tak | tekst ≤ 300 |
| `tracks[].audio` | tak | ścieżka względna (np. `tracks/a.mp3`) albo `https://` z dozwolonego originu |
| `tracks[].artist`, `album`, `genre` | nie | tekst |
| `tracks[].cover` | nie | jak `audio`; nieprawidłowa/niedostępna → placeholder |
| `tracks[].duration` | nie | sekundy > 0 |
| `tracks[].year` | nie | liczba całkowita 1000–3000 |
| `tracks[].order` | nie | liczba; sortowanie rosnąco |
| `tracks[].lyrics` | nie | zwykły tekst (bez HTML) |
| `tracks[].metadata` | nie | płaski obiekt tekst/liczba/bool |
| `tracks[].mimeType` | nie | nadpisuje typ z rozszerzenia |
| `tracks[].shareUrl` | nie | publiczny link do udostępniania |

Manifest ≤ 2 MB, limit czasu pobrania 15 s. Wpisy nieprawidłowe lub w formacie nieobsługiwanym przez przeglądarkę są pomijane (komunikat z liczbą pominiętych), reszta katalogu działa. Tekst jest renderowany wyłącznie jako tekst React; znaki sterujące i bidi są usuwane. Zalecany format: MP3.

## Testy

- `npm test` – testy jednostkowe (katalog, platforma, Pages Function, ścieżki buildów, istniejące testy audio).
- `npm run test:e2e` – Playwright: build web + `wrangler pages dev` z lokalnym R2 (Miniflare, dane z `e2e/seed-r2.mjs`, wymaga `ffmpeg`) oraz build mobile przez `vite preview`. `PLAYWRIGHT_CHROME_PATH` może wskazać lokalny Chrome.
