# SHUTTER Android Auto 1.0 — projekt architektury

Data: 2026-10-27  
Gałąź docelowa pracy: `feature/shutter-android-auto`  
Repozytorium: `trciesielski/Shutter`

## Intencja

SHUTTER ma zachować obecny interfejs React/Vite na telefonie, a jednocześnie
otrzymać natywny silnik audio Androida, który działa po zamknięciu WebView, przy
zablokowanym ekranie i w Android Auto. Android Auto będzie korzystać wyłącznie
ze standardowego interfejsu `MediaLibraryService`/`MediaLibrarySession`; ekran
samochodu nie będzie renderował Reacta, wizualizatorów ani ekranów zarządzania
plikami.

## Stan zastany i konsekwencje

- Repozytorium jest aplikacją React/Vite. Nie ma katalogu Android, Gradle,
  `AndroidManifest.xml`, Capacitor ani natywnego serwisu.
- Wariant `VITE_PLATFORM=mobile` jest mobilnym buildem webowym, nie aplikacją
  Android.
- Obecny webowy `useAudioEngine` tworzy dwa `HTMLAudioElement`, opcjonalny
  Web Audio graph dla EQ/crossfade, kolejkę, shuffle/repeat i Media Session API.
- Lokalna biblioteka przechowuje Blob-y, metadane i okładki w IndexedDB;
  playlisty, ulubione, oceny i historia są w `localStorage`.
- Katalog online jest read-only i walidowany w `src/catalog/catalog.js`, a media
  są pobierane przez istniejący endpoint `/music/*` z Cloudflare R2. Aplikacja
  nie posiada poświadczeń administracyjnych R2.
- Gałęzie zdalne obejmują `main`, `feature/shutter-web-r2` i
  `fix/transparent-audio-visualizers`. Sprawdzenie otwartych PR przez `gh`
  zakończyło się `403 Forbidden`, więc lista PR wymaga późniejszego dostępu do
  GitHub API.
- Środowisko ma JDK 21, ale nie ma Android SDK, Gradle ani emulatora. Build APK,
  instalacja, DHU i testy Android Auto pozostają warunkowe do czasu udostępnienia
  tych narzędzi.

## Cele

1. Dodać projekt Android oparty o Kotlin, Capacitor i AndroidX Media3.
2. Uczynić `MediaLibraryService` jedynym właścicielem `ExoPlayer` i stanu
   odtwarzania w aplikacji Android.
3. Zachować istniejący interfejs React i jego wygląd; webowy build pozostaje
   niezmienionym trybem działania.
4. Udostępnić katalog R2 i lokalną bibliotekę SAF przez jedną natywną warstwę
   mediów, widoczną także w Android Auto.
5. Zapewnić synchronizację transportu, kolejki, pozycji, metadanych i artworku
   między Reactem, MediaSession, powiadomieniem i hostem Android Auto.
6. Dostarczyć testy automatyczne oraz instrukcje instalacji, DHU i ograniczeń.

## Poza zakresem i antycele

- Nie zmieniamy SHUTTER WEB, SHUTTER ADMIN, Cloudflare R2, DNS ani domen.
- Nie przenosimy niestandardowego UI, Glass Engine ani animowanych wizualizerów
  na ekran samochodu.
- Nie uruchamiamy `HTMLAudioElement` ani Web Audio jako drugiego silnika w
  natywnej aplikacji Android.
- Nie dodajemy synchronizacji kont ani uploadu plików do R2.
- Nie deklarujemy zgodności Android Auto bez testu w DHU, emulatorze lub na
  fizycznym urządzeniu.
- EQ/crossfade Web Audio nie zostaną udawane po stronie natywnej. Natywne DSP
  zostanie dodane tylko w zakresie, który można zweryfikować; reszta będzie
  jawnie oznaczona jako niedostępna.

## Rozważone podejścia

### A. Capacitor + natywny Media3 service/plugin — wybrane

React pozostaje interfejsem telefonu. Capacitor ładuje jego build, a własny
plugin Kotlin łączy JavaScript z `MediaController`, który steruje istniejącym
`MediaLibraryService`. Tylko serwis tworzy i posiada `ExoPlayer` oraz
`MediaLibrarySession`. Android Auto, lock screen, Bluetooth, przyciski
multimedialne i powiadomienie korzystają z tej samej sesji.

Zalety: zachowanie obecnego UI i stylu, jedna natywna ścieżka odtwarzania,
zgodność z oficjalnym modelem Android Auto. Koszt: trzeba zaprojektować stabilny
most zdarzeń i zastąpić webową gałąź audio w trybie natywnym.

### B. Osobny natywny klient Kotlin/Compose

Najprostszy model dla Android Auto i Media3, ale wymagałby odtworzenia telefonu,
playlist, wyszukiwania i ustawień w drugim UI. Zwiększa ryzyko rozjazdu z SHUTTER
i narusza cel zachowania istniejącego interfejsu.

### C. Tylko natywny silnik jako pierwszy spike

Pozwala szybko zweryfikować Media3, SAF i Android Auto, ale bez mostu nie daje
pełnej aplikacji telefonu. Jest użyteczny jako kolejność faz, nie jako końcowa
architektura.

Wybrano A, realizowane kolejno jako fundament natywny, integracja danych i
pełny adapter React. C nie będzie osobnym produktem; jego zakres zostanie
wykonany jako testowalny etap A.

## Architektura docelowa

```text
React/Vite UI (telefon)
        │ Capacitor plugin: commands + state/events
        ▼
MediaController ───────────────┐
        │                       │ Android Auto / system media controls
        ▼                       │ przez MediaLibrarySession
ShutterMediaLibraryService ◄───┘
        │ owns exactly one ExoPlayer
        ├── R2 catalog + HTTPS MediaItems
        ├── SAF local MediaItems (content:// + persisted grants)
        ├── Room library/playlist store
        └── Media3 audio focus, noisy events, notification, queue
```

Wtyczka nie otrzymuje referencji do `ExoPlayer` i nie tworzy drugiego playera.
Każde wywołanie JS jest komendą do `MediaController`, a stan jest emitowany z
`Player.Listener`/`MediaLibrarySession` do wszystkich odbiorców. Jeśli WebView
zostanie zniszczony, serwis i sesja pozostają aktywne.

## Kontrakt mostu JavaScript ↔ Kotlin

Nazwa publicznego pluginu zostanie ustalona jako `ShutterMedia` i otrzyma
wersjonowany kontrakt. Minimalne komendy:

- `connect` / `disconnect` — podłączenie do serwisu i zwrot bieżącego snapshotu;
- `play`, `pause`, `toggle`, `skipNext`, `skipPrevious`, `seekTo`, `setVolume`;
- `setQueue`, `playItem`, `setShuffle`, `setRepeat`, `stop`;
- `getCatalog`, `getLibrary`, `pickLocalFiles`, `removeLocalTrack`;
- `getPlaylists`, `createPlaylist`, `updatePlaylist`, `deletePlaylist`;
- `getAudioAnalysisCapabilities` — bez obietnicy FFT, dopóki nie ma testu.

Zdarzenia pluginu:

- `playbackState`: `idle | buffering | ready | playing | paused | ended | error`;
- `position`: pozycja, duration, bufferedPosition i identyfikator utworu;
- `queueChanged`, `metadataChanged`, `catalogChanged`, `libraryChanged`;
- `playlistChanged`, `audioFocusChanged`, `analysisFrame` oraz `error`.

Każdy track ma stabilny `id`, `source` (`catalog` lub `local`), tytuł,
wykonawcę, album, czas trwania, artwork i URI. Komendy są idempotentne względem
`id`; zdarzenia zawierają `revision`/timestamp, aby React nie nadpisywał
nowszego stanu opóźnionym eventem.

W trybie webowym istniejący `useAudioEngine` pozostaje aktywny. W trybie
Capacitor `useAudioEngine` nie tworzy `Audio`, nie importuje Web Audio i używa
wyłącznie adaptera pluginu. Wspólny komponent UI otrzymuje ten sam kształt
stanu i metod, dzięki czemu nie wymaga redesignu.

## Źródła mediów

### Katalog R2

Natywna warstwa pobiera JSON katalogu po HTTPS, stosując te same zasady
walidacji co web: limity rozmiaru, dozwolone originy, typy audio i bezpieczne
metadane. Każdy plik audio jest `MediaItem` z `Uri` HTTPS. ExoPlayer korzysta
z istniejącego wsparcia HTTP Range; błędy HTTP, timeouty i chwilowy brak sieci
przechodzą do stanu błędu/wznowienia bez żadnych poświadczeń R2.

Natywny APK używa konfigurowalnych `SHUTTER_MUSIC_BASE_URL` i
`SHUTTER_CATALOG_URL`. Staging na tę wersję wskazuje
`https://shutter-web-6p2.pages.dev`, odpowiednio `/music/` oraz
`/music/catalog/catalog.json`; docelowa konfiguracja wskazuje
`https://music.madebyform.work`. Zmiana staging/production nie może wymagać
zmiany architektury ani kodu serwisu.

### Lokalna biblioteka SAF

Plugin otwiera `ACTION_OPEN_DOCUMENT` z `CATEGORY_OPENABLE`, `EXTRA_ALLOW_MULTIPLE`
i typami audio. Dla wybranych URI zapisuje persistable read permission, odczytuje
tagi i artwork przez `MediaMetadataRetriever`, a rekord przechowuje w Room:

- track id, content URI, nazwa, rozmiar, mtime, MIME;
- tytuł, wykonawca, album, duration i opcjonalny artwork cache;
- źródło i stan dostępności.

Usunięcie tracka usuwa rekord oraz grant/cache aplikacji, nigdy oryginalny plik
użytkownika. Android Auto dostaje lokalne utwory jako playables, ale nie dostaje
akcji importu ani usuwania.

Playlisty, ulubione, oceny, historia i ostatnia pozycja odtwarzania są
przenoszone jednorazowo z WebView `localStorage` do natywnej bazy. Migracja jest
wersjonowana, idempotentna, odporna na uszkodzony JSON i zapisuje marker dopiero
po poprawnym zakończeniu; istniejące rekordy łączy po stabilnym ID bez
duplikowania. Webowa IndexedDB nie jest kopiowana: Blob-y audio pozostają
wyłącznie w źródle webowym, a lokalna biblioteka Androida pochodzi z SAF.

## Android Auto i systemowe sterowanie

`MediaLibraryService` udostępnia drzewo:

- root: `Katalog SHUTTER`, `Moja biblioteka`, `Playlisty`;
- katalog: artyści/albumy lub opłacalny, stabilny podział tracków;
- biblioteka: utwory lokalne i playlisty;
- playlisty: playables z metadanymi i artworkiem.

Używane są standardowe `MediaItem`, `MediaDescription`, `MediaMetadata`,
`MediaLibrarySession.Callback` i komendy Media3. Android Auto otrzymuje tylko
bezpieczne szablony mediów. Transport, shuffle/repeat, seek, voice actions,
przyciski kierownicy i Bluetooth są obsługiwane przez `MediaSession`; nie ma
osobnego kanału sterowania dla samochodu.

ExoPlayer/MediaSession skonfiguruje audio focus, `becoming noisy`, lifecycle
foreground service i MediaStyle notification. Odtwarzanie lokalne nie wymaga
Internetu; katalog online ma jawny stan retry/offline.

## Audio analysis i wizualizatory

W pierwszej fazie wizualizatory React zostają zachowane jako UI telefonu, ale
adapter natywny może wystawić tylko stan odtwarzania. Następnie zostanie
sprawdzony własny `AudioProcessor`/analyzer Media3 emitujący ograniczone, np.
32-band frames z throttlingiem. Dopiero po pomiarze kosztu CPU/baterii i teście
na urządzeniu event `analysisFrame` zasili istniejące tryby wizualizacji.

Equalizer/crossfade nie będą nazywane zgodnymi z webem bez osobnych testów
odsłuchowych i automatycznych. Jeśli Media3 nie zapewni bezpiecznego odpowiednika
konkretnej funkcji, UI pokaże ograniczenie zamiast uruchamiać Web Audio.

## Etapy dostarczenia

### Etap 1 — natywny fundament i Android Auto

- Gradle/Android/Capacitor shell, manifest i minimalne permissiony;
- Media3 service, session, notification, focus/noisy i lifecycle;
- R2 MediaItems oraz lokalny SAF/Room;
- browse tree i standardowe transport controls;
- testy JVM/instrumentation oraz smoke test z kontrolerem Media3;
- build/debug APK, jeśli SDK i build tools będą dostępne.

Parametry aplikacji: package/application ID `com.trciesielski.shutter`,
`minSdk 26`, priorytet Android Auto przez projekcję telefonu. Android
Automotive OS i release signing są poza zakresem tej wersji.

### Etap 2 — most i pełny interfejs React

- Capacitor plugin i wersjonowany kontrakt eventów;
- natywny adapter `useAudioEngine` bez tworzenia HTMLAudio w Androidzie;
- synchronizacja kolejki, pozycji, metadanych, playlist i błędów;
- zachowanie istniejącego interfejsu telefonu i wizualizatorów;
- testy regresji webowej potwierdzające brak zmian w trybie web.

### Etap 3 — walidacja urządzeń i wydanie

- Android Auto DHU/emulator lub fizyczny telefon/samochód;
- testy lock screen, Bluetooth, steering wheel, focus/noisy, restartu i offline;
- dokumentacja instalacji APK, konfiguracji endpointu i testów Auto;
- commit i PR do `main`, bez automatycznego merge/deploy.

## Testy i kryteria dowodu

Automatyczne:

- Kotlin/JVM: mapowanie katalogu, stabilne ID, kolejka, shuffle/repeat,
  redukcja eventów pozycji, playlisty i błędy URI;
- Android instrumentation: `MediaLibraryService`, controller browse/play,
  SAF grants, metadata i restart serwisu;
- JS: adapter natywny nie tworzy `Audio`, mapuje snapshoty/eventy i zachowuje
  obecne testy webowe;
- obecne `npm test`, `npm run build`, `npm run build:mobile` oraz E2E web.

Manualne, wymagane do deklaracji Android Auto:

1. build/install/launch APK;
2. import MP3/FLAC/WAV/M4A przez SAF i odtworzenie offline;
3. stream R2, seek/range, retry po przerwie sieci;
4. background/lock screen/notification;
5. audio focus, headset/Bluetooth i przyciski kierownicy;
6. browse/play/pause/next/previous/seek/shuffle/repeat w DHU lub na urządzeniu;
7. zgodność metadanych/artworku i synchronizacja UI;
8. brak regresji SHUTTER WEB.

Jeżeli SDK, emulator, DHU lub urządzenie nie będą dostępne, raport rozdzieli
zweryfikowany kod/build/testy JVM od niezweryfikowanej integracji samochodowej.

## Ryzyka i otwarte zależności

- Brak Android SDK/Gradle w aktualnym środowisku może uniemożliwić build APK.
- Stagingowy HTTPS base URL jest ustalony na `https://shutter-web-6p2.pages.dev`;
  produkcyjny docelowo będzie `https://music.madebyform.work`. Oba pozostają
  konfiguracją builda, nie stałą logiki serwisu.
- Android Auto nie może być zatwierdzone na podstawie samego kompilowania;
  wymaga DHU, emulatora lub fizycznego hosta.
- Natywna analiza audio i pełny odpowiednik webowego EQ/crossfade mogą wymagać
  ograniczeń wydajnościowych i osobnego testu.
- Utworzenie PR może wymagać dostępu GitHub API/push, którego wcześniejsze
  `gh pr list` nie posiadało (`403 Forbidden`); nie będziemy obchodzić tego
  przez kopiowanie tokenów.

## Decyzja projektowa

Implementować wariant A etapami. Najpierw działający Media3/Android Auto
fundament i testowalny serwis, następnie adapter Capacitor i pełna synchronizacja
istniejącego React UI. Przyjąć `minSdk 26`, package ID
`com.trciesielski.shutter`, projekcję Android Auto, staging URL wskazany wyżej
oraz jednorazową migrację danych scalar z `localStorage`, bez Blob-ów. Nie
zmieniać trybu webowego poza neutralnym kodem wykrywającym natywny adapter.
