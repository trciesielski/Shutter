# Plan: kompaktowa karta utworu

## Cel

Dodać zwartą kartę utworu z miniaturą, metadanymi i akcjami serce/ocena/udostępnij, bez zmiany wysokości dolnego odtwarzacza ani istniejących ścieżek playlist.

## Interfejsy

- `src/audio/trackPreferences.js`: `getTrackRating(trackId, storage?) -> 'up' | 'down' | null`, `setTrackRating(trackId, rating, storage?) -> 'up' | 'down' | null`.
- `src/audio/shareTrack.js`: `getPublicShareUrl(track) -> string | null`, `buildSharePayload(track) -> { title, text, url? }`, `shareTrack(track, navigatorObject?) -> Promise<'shared' | 'copied' | 'cancelled' | 'unavailable'>`.
- `LibraryTrack` otrzyma lokalny stan oceny i komunikatu udostępniania; dotychczasowe propsy oraz `playlists` zostają zachowane.

## Kroki TDD

- [ ] Dodać testy dla trwałych ocen: zapis `up`, przełączenie na `down`, wyzerowanie tej samej oceny i odczyt po ponownym utworzeniu store.
- [ ] Uruchomić testy i potwierdzić RED z powodu brakujących modułów.
- [ ] Dodać minimalny `trackPreferences.js` i `shareTrack.js`.
- [ ] Dodać testy dla share: publiczny `http(s)` URL trafia do payloadu i fallbacku clipboard, a lokalny `blob:`/brak URL-u nigdy nie trafia do payloadu ani fallbacku.
- [ ] Uruchomić testy i potwierdzić GREEN.
- [ ] Przebudować `LibraryTrack.jsx` na układ miniatura + trzy rzędy; podłączyć istniejące ulubione, nowe oceny i share bez zagnieżdżonych przycisków.
- [ ] Dodać responsywne reguły Shutter Glass w `src/glass/player-glass.css`, utrzymując wysokość wiersza i touch targets na Androidzie.
- [ ] Uruchomić pełny test suite i `npm run build`.
- [ ] Sprawdzić diff, status i commit `feat: add compact track actions card`.

## Ryzyka i weryfikacja

- Lokalny plik może mieć `blob:` URL, ale ten URL nie będzie przekazywany do żadnego payloadu share.
- Ikony będą osobnymi przyciskami, więc kliknięcie oceny/share nie uruchomi odtwarzania.
- Overflow zachowa istniejące akcje playlist/usuwania.
- Weryfikacja końcowa obejmie `npm test`, `npm run build`, `git diff --check` i kontrolę statusu repozytorium.
