# SHUTTER Android Auto 1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do SHUTTER natywną aplikację Android opartą o Capacitor i Kotlin/Media3, w której jeden `MediaLibraryService` obsługuje telefon, systemowe sterowanie i Android Auto, bez zmiany webowego playera.

**Architecture:** Istniejący build React/Vite pozostaje interfejsem telefonu. W trybie Capacitor React rozmawia przez własny plugin `ShutterMedia` z `MediaController`, natomiast `ShutterMediaLibraryService` jako jedyny właściciel tworzy i steruje `ExoPlayer`; Android Auto korzysta bezpośrednio z tej samej `MediaLibrarySession`. Dane katalogu R2 i lokalnej biblioteki SAF są mapowane do wspólnego modelu `Track`, a stan i komendy są przesyłane przez wersjonowany kontrakt snapshotów/eventów.

**Tech Stack:** Kotlin, AndroidX Media3 (`ExoPlayer`, `MediaLibraryService`, `MediaLibrarySession`), Capacitor Android/custom plugin, Room, Android Storage Access Framework, Vite/React, istniejący Cloudflare Pages/R2 endpoint, JUnit/Robolectric/Android instrumentation, Playwright dla regresji webowej.

**Spec:** `docs/superpowers/specs/2026-10-27-shutter-android-auto-design.md`

## Global Constraints

- Pracować wyłącznie na `feature/shutter-android-auto`; nie tworzyć worktree i nie modyfikować `main`.
- `com.trciesielski.shutter`, `minSdk 26`; `phoneAuto` covers phone/projection and the continuation plan `docs/superpowers/plans/2026-10-27-shutter-android-auto-aaos.md` adds the shared-code `automotive` AAOS artifact.
- `https://shutter-web-6p2.pages.dev` jest stagingowym base URL: `/music/catalog/catalog.json` i `/music/*`; produkcja ma być konfigurowalna jako `https://music.madebyform.work`.
- `MediaLibraryService`/Media3 jest jedynym silnikiem audio Androida; w natywnym trybie React nie może tworzyć `HTMLAudioElement` ani Web Audio graphu.
- Nie migrować Blob-ów z IndexedDB; scalar state z `localStorage` migrować jednokrotnie, idempotentnie i bez utraty/duplikatów.
- Android Auto otrzymuje wyłącznie standardowe media browse/transport templates; bez React UI, wizualizerów, importu i usuwania plików.
- Webowy tryb i istniejące testy webowe muszą pozostać działające; konfiguracja R2 pozostaje read-only i bez credentiali administracyjnych.
- MP3/FLAC/WAV/M4A są obowiązkowe; OGG/AAC/Opus są obsługiwane tylko, jeśli faktycznie wspiera je Media3 i urządzenie.
- Nie deklarować zgodności Android Auto bez DHU, emulatora Android Auto lub fizycznego hosta.

## Review Focus

- Niedostępny, usunięty lub wygasły URI SAF powinien pojawić się jako kontrolowany błąd i nie usuwać oryginalnego pliku — test w Task 3.
- Opóźniony snapshot/event nie może cofnąć nowszej pozycji lub kolejki — test w Task 4.
- Uszkodzony/nieznany JSON `localStorage` oraz powtórzona migracja nie mogą utracić ani zdublować danych — test w Task 5.
- Brak/timeout/HTTP 4xx/5xx katalogu R2 i chwilowa utrata sieci muszą dać retry/offline state bez crashu — test w Task 3.
- Uruchomienie Androida nie może utworzyć `HTMLAudioElement` ani `AudioContext`, a web nadal musi używać obecnego silnika — test w Task 6.

### Task 1: Capacitor Android foundation and reproducible build

**Files:**
- Create: `capacitor.config.json`
- Create: `android/` generated Capacitor Android project, then modify only project-owned build/manifest/resource files below
- Modify: `package.json`, `package-lock.json`
- Modify: `.gitignore`
- Create: `android/gradle.properties` defaults for staging URL and non-secret build settings
- Modify: `android/app/build.gradle` (namespace, `applicationId`, `minSdk 26`, Media3/Room dependencies, build config URL fields)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Test: `android/app/src/test/java/com/trciesielski/shutter/build/BuildConfigurationTest.kt`

**Interfaces:**
- Produces an installable Capacitor shell with `com.trciesielski.shutter`, `minSdk 26`, `webDir: dist`, debug build type, and `BuildConfig.SHUTTER_MUSIC_BASE_URL`/`BuildConfig.SHUTTER_CATALOG_URL`.
- Produces npm scripts `android:sync`, `android:assembleDebug`, and `android:test` without changing `build`, `build:mobile`, `test`, or `test:e2e` behavior.

- [ ] **Step 1: Add the Capacitor packages and scripts without touching web runtime behavior.**
  Add matching-major `@capacitor/core`, `@capacitor/android`, and `@capacitor/cli` dependencies, add `capacitor.config.json` with app name `Shutter`, app ID `com.trciesielski.shutter`, and `webDir: dist`, then run `npm install` so the lockfile records the exact versions.
- [ ] **Step 2: Generate the Android project and set exact build identity.**
  Run `npx cap add android`; set namespace/application ID to `com.trciesielski.shutter`, `minSdk 26`, debug output, and URL build fields defaulting to `https://shutter-web-6p2.pages.dev/music/` and `https://shutter-web-6p2.pages.dev/music/catalog/catalog.json`. Allow Gradle properties or environment overrides to select `https://music.madebyform.work` without source changes.
- [ ] **Step 3: Add only required Media3, Room and test dependencies.**
  Pin a single Media3 version for `media3-exoplayer`, `media3-session`, and HTTP datasource support; pin one Room version with runtime/compiler setup; add JUnit/Robolectric/AndroidX test dependencies. Keep all versions in the generated project’s existing Gradle convention or a new `gradle/libs.versions.toml`, not duplicated across modules.
- [ ] **Step 4: Add build and manifest placeholders for later service registration.**
  Register the application label/icon, foreground media playback service permissions, and an automotive media app descriptor placeholder without exposing any file-management activity to Android Auto.
- [ ] **Step 5: Run the foundation checks.**
  Run `npm ci --no-audit --no-fund`, `npm run build`, `npx cap sync android`, and `./gradlew :app:testDebugUnitTest`. Expected: web build succeeds and the JVM build configuration test reports the exact package ID, min SDK, and staging URL; if Android SDK is unavailable, record the precise blocker instead of claiming an APK.
- [ ] **Step 6: Commit the foundation.**
  `git add capacitor.config.json package.json package-lock.json .gitignore android && git commit -m "feat(android): add Capacitor foundation"`

### Task 2: Shared native domain model, catalog and Room persistence

**Files:**
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/Track.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/TrackSource.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/PlaylistEntity.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/TrackEntity.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/PlaybackStateEntity.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/ShutterDatabase.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/LibraryRepository.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/PlaylistRepository.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/CatalogRepository.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/data/JsonCatalogParser.kt`
- Create: `android/app/src/test/java/com/trciesielski/shutter/data/JsonCatalogParserTest.kt`
- Create: `android/app/src/test/java/com/trciesielski/shutter/data/RepositoryIdentityTest.kt`

**Interfaces:**
- `data class Track(id: String, title: String, artist: String, album: String, uri: Uri, source: TrackSource, mimeType: String?, durationMs: Long?, artworkUri: Uri?, order: Int?)`.
- `CatalogRepository.load(): Result<CatalogSnapshot>` reads configured HTTPS catalog, enforces the existing 2 MB/5000-track/allowed-origin rules, and returns typed retryable errors.
- `LibraryRepository.upsert(track)`, `observeTracks()`, `remove(trackId)`, and `resolve(trackId)` are idempotent and never delete source SAF files.
- `PlaylistRepository` upserts by stable playlist ID and stores ordered track IDs, including a persisted orphan-reference record for a scalar playlist entry whose Blob source cannot be migrated.

- [ ] **Step 1: Write parser and identity tests first.**
  Cover valid staging-relative paths, unsafe paths/origins, duplicate IDs, unsupported MIME, invalid metadata, size/count limits, malformed JSON, and stable local identity derived from persisted document URI plus file metadata.
- [ ] **Step 2: Implement the shared track model and catalog parser.**
  Reuse the web contract semantics but keep Kotlin parsing independent of the WebView. Normalize text, reject non-HTTPS remote media except loopback test fixtures, and preserve catalog IDs so playlists/history can match.
- [ ] **Step 3: Implement Room schema and repositories.**
  Store catalog/local tracks, playlist order, ratings/history, playback position, migration marker, and orphaned references. Use transactions for playlist/rating/history updates and upserts for idempotent re-import/migration.
- [ ] **Step 4: Test the native data layer.**
  Run `./gradlew :app:testDebugUnitTest --tests '*JsonCatalogParserTest' --tests '*RepositoryIdentityTest'`. Expected: all malformed-input, dedupe, and transaction tests pass.
- [ ] **Step 5: Commit the data layer.**
  `git add android/app/src/main/java/com/trciesielski/shutter/data android/app/src/test/java/com/trciesielski/shutter/data && git commit -m "feat(android): add catalog and local library data layer"`

### Task 3: SAF local library and R2 media source

**Files:**
- Create: `android/app/src/main/java/com/trciesielski/shutter/library/SafLibraryManager.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/library/MetadataReader.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/library/LocalTrackId.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/media/MediaItemMapper.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/test/java/com/trciesielski/shutter/library/LocalTrackIdTest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/library/SafLibraryManagerTest.kt`

**Interfaces:**
- `SafLibraryManager.openDocumentPicker(Activity)` launches `ACTION_OPEN_DOCUMENT` with multiple audio selection and persistable permissions for MP3/FLAC/WAV/M4A plus supported optional types.
- `SafLibraryManager.importUris(uris): ImportReport` reads metadata/artwork and upserts tracks; `removeTrack(id)` revokes only the app’s grant/cache.
- `MediaItemMapper.toMediaItem(track)` returns a playable Media3 item with stable `mediaId`, URI, MIME, duration and artwork; `toBrowseItem` returns browsable/playable flags.

- [ ] **Step 1: Write SAF identity and grant tests.**
  Test duplicate selection, renamed metadata, revoked URI, unsupported type, and removal without deleting the provider document.
- [ ] **Step 2: Implement SAF import and metadata extraction.**
  Use `ContentResolver.takePersistableUriPermission`, `MediaMetadataRetriever`, safe fallback title/artist/album, and bounded artwork caching. Never copy or delete the original document as part of removal.
- [ ] **Step 3: Implement Media3 item mapping.**
  Map HTTPS R2 URIs and `content://` SAF URIs to the same `Track`/`MediaItem` shape, preserving metadata and artwork for Android Auto.
- [ ] **Step 4: Run unit and instrumentation checks.**
  Run `./gradlew :app:testDebugUnitTest --tests '*LocalTrackIdTest'` and, when an emulator/device exists, `./gradlew :app:connectedDebugAndroidTest --tests '*SafLibraryManagerTest'`. Expected: permission and removal behavior is verified; otherwise mark the device test unrun.
- [ ] **Step 5: Commit local media support.**
  `git add android/app/src/main/java/com/trciesielski/shutter/library android/app/src/main/java/com/trciesielski/shutter/media android/app/src/androidTest android/app/src/test android/app/src/main/AndroidManifest.xml && git commit -m "feat(android): import local audio through SAF"`

### Task 4: Media3 playback service, queue and Android Auto browse tree

**Files:**
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/ShutterMediaLibraryService.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/PlayerFactory.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/PlaybackStateStore.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/BrowseTree.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/MediaSessionCallback.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/playback/NotificationFactory.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/automotive_app_desc.xml`
- Create: `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/test/java/com/trciesielski/shutter/playback/BrowseTreeTest.kt`
- Create: `android/app/src/test/java/com/trciesielski/shutter/playback/QueueStateTest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/playback/MediaLibraryServiceTest.kt`

**Interfaces:**
- `ShutterMediaLibraryService` owns exactly one `ExoPlayer` and one `MediaLibrarySession` for the process; clients interact only through `MediaController`.
- `BrowseTree.rootId`, `children(parentId)`, and `item(mediaId)` expose `catalog`, `local`, and `playlists` browse nodes, with no import/delete actions.
- `PlaybackStateStore.snapshot()` returns `PlaybackSnapshot(revision, mediaId, state, positionMs, durationMs, bufferedPositionMs, shuffle, repeat, queue)`.

- [ ] **Step 1: Write browse, queue and service-controller tests first.**
  Assert root/category visibility, playable metadata, empty/error states, deterministic queue transitions, shuffle/repeat, seek clamping, and state restoration after controller reconnect.
- [ ] **Step 2: Implement the single-player service.**
  Configure `ExoPlayer` with Media3 audio attributes, automatic audio focus, `becoming noisy`, network data source, local `content://` playback, queue transitions, notification and foreground lifecycle. Do not instantiate an HTML/Web Audio player anywhere in the Android module.
- [ ] **Step 3: Implement browse and standard media commands.**
  Wire `MediaLibrarySession.Callback` for root/children/item, play-from-media-ID/search where supported, and standard transport/shuffle/repeat commands. Keep car browsing read-only and driver-safe.
- [ ] **Step 4: Register Android Auto and notification metadata.**
  Add the media foreground service declaration, `androidx.media3.session.MediaSessionService` actions, automotive media descriptor, icon/label, and only necessary foreground/notification permissions.
- [ ] **Step 5: Run native service tests.**
  Run `./gradlew :app:testDebugUnitTest --tests '*BrowseTreeTest' --tests '*QueueStateTest'`; then run connected service/controller tests when an emulator exists. Expected: JVM tests pass; connected Auto-host behavior remains explicitly unverified until DHU/device testing.
- [ ] **Step 6: Commit the Media3 foundation.**
  `git add android/app/src/main/java/com/trciesielski/shutter/playback android/app/src/main/res android/app/src/main/AndroidManifest.xml android/app/src/test android/app/src/androidTest && git commit -m "feat(android): add Media3 library service"`

### Task 5: Capacitor `ShutterMedia` plugin and one-time migration

**Files:**
- Create: `android/app/src/main/java/com/trciesielski/shutter/plugin/ShutterMediaPlugin.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/plugin/PluginPayloads.kt`
- Create: `android/app/src/main/java/com/trciesielski/shutter/plugin/PluginEventBridge.kt`
- Modify: `android/app/src/main/java/com/trciesielski/shutter/MainActivity.java` (or generated Kotlin equivalent)
- Create: `src/native/shutterMedia.js`
- Create: `src/native/nativeState.js`
- Create: `android/app/src/main/java/com/trciesielski/shutter/migration/WebStorageMigration.kt`
- Create: `android/app/src/test/java/com/trciesielski/shutter/migration/WebStorageMigrationTest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/plugin/ShutterMediaPluginTest.kt`

**Interfaces:**
- JS plugin methods: `connect`, `play`, `pause`, `toggle`, `skipNext`, `skipPrevious`, `seekTo({positionMs})`, `setVolume({value})`, `setQueue({trackIds,startIndex})`, `setShuffle({enabled})`, `setRepeat({mode})`, `getLibrary`, `getPlaylists`, `pickLocalFiles`, `removeLocalTrack({trackId})`, and `migrateWebStorage({payload, schemaVersion})`.
- Plugin events: `playbackState`, `position`, `queueChanged`, `metadataChanged`, `catalogChanged`, `libraryChanged`, `playlistChanged`, `audioFocusChanged`, `analysisFrame`, and `error`; each payload includes `schemaVersion` and monotonic `revision` where state ordering matters.
- `WebStorageMigration.migrate(payload): MigrationReport` validates each known key, merges by stable ID, preserves orphaned local-Web references, records malformed input for diagnostics, and writes a completion marker only after the transaction commits.

- [ ] **Step 1: Write migration and event-ordering tests first.**
  Cover valid state, malformed JSON, missing keys, duplicate playlist tracks, repeated migration, unknown schema versions, orphan references to non-migratable IndexedDB Blob tracks, and stale event revisions.
- [ ] **Step 2: Implement Kotlin plugin methods through `MediaController`.**
  Resolve/connect to `ShutterMediaLibraryService`, translate JSON payloads to controller commands, return snapshots, and forward service/player events. The plugin must never create or own an `ExoPlayer`.
- [ ] **Step 3: Implement the JS plugin wrapper.**
  Register `ShutterMedia` with `registerPlugin`, expose typed-by-convention payload helpers, normalize native errors, and make no native calls when `Capacitor.getPlatform() !== 'android'`.
- [ ] **Step 4: Implement safe WebView storage migration.**
  Read the existing keys `shutter-user-playlists-v1`, `shutter-favorites`, `shutter-track-preferences-v1`, `shutter-listening-history-v1`, and `shutter-last-position-v1`; send parsed/raw values to Kotlin; retain a report and retry marker until the native transaction succeeds.
- [ ] **Step 5: Run plugin and migration tests.**
  Run `./gradlew :app:testDebugUnitTest --tests '*WebStorageMigrationTest'`; run connected plugin tests if available. Expected: repeated migration is a no-op, malformed fields are quarantined/reported, and no native player duplication occurs.
- [ ] **Step 6: Commit bridge and migration.**
  `git add src/native android/app/src/main/java/com/trciesielski/shutter/plugin android/app/src/main/java/com/trciesielski/shutter/migration android/app/src/test android/app/src/androidTest android/app/src/main/java/com/trciesielski/shutter/MainActivity.* && git commit -m "feat(android): add Media3 Capacitor bridge"`

### Task 6: React audio/platform adapter with native-only Android playback

**Files:**
- Create: `src/audio/useWebAudioEngine.js` (extracted current web implementation without behavior changes)
- Create: `src/audio/useNativeAudioEngine.js`
- Modify: `src/audio/useAudioEngine.js`
- Create: `src/audio/nativePlaybackAdapter.js`
- Modify: `src/audio/usePlaylists.js`
- Create: `src/audio/useNativePlaylists.js`
- Modify: `src/platform.js`
- Modify: `src/main.jsx` only where the shared return shape or migration status needs rendering
- Create: `test/native-audio-adapter.test.js`
- Modify: `test/platform.test.js`

**Interfaces:**
- `useNativeAudioEngine()` returns the existing UI-facing shape (`files`, `index`, `state`, `seconds`, `duration`, `volume`, `shuffle`, `repeat`, `queueIds`, `catalog`, `history`, `eq`, and transport methods), but delegates every transport operation to `ShutterMedia`.
- `nativePlaybackAdapter.connect()` returns the native snapshot and subscribes to all plugin events; it drops events with a revision older than the last applied snapshot.
- `usePlaylists()` selects native persistence only on Android/Capacitor; web keeps the current `localStorage` implementation.

- [ ] **Step 1: Write JS tests proving the platform split.**
  Mock `Capacitor.getPlatform()` and the plugin; assert Android never calls `new Audio`, `AudioContext`, `URL.createObjectURL`, or the web IndexedDB engine, while web retains the existing engine and capabilities.
- [ ] **Step 2: Extract the current web hook unchanged.**
  Move the existing `HTMLAudioElement`/Web Audio implementation into `useWebAudioEngine.js`; preserve all current web return fields and behavior so the existing unit/E2E suite remains meaningful.
- [ ] **Step 3: Implement the native hook and adapter.**
  Hydrate tracks/catalog/playlists from native snapshots, map events to React state, send commands to the plugin, and expose a no-DSP `eq` shape until analysis frames are available. Ensure no Android code path calls the web hook’s player setup.
- [ ] **Step 4: Switch playlist and migration behavior only for native Android.**
  Keep web `localStorage` unchanged. On native startup, run the one-time migration before rendering native playlist state, retain unavailable Blob references as native orphan metadata, and keep React controls visually unchanged.
- [ ] **Step 5: Run web and adapter verification.**
  Run `npm test`, `npm run build`, `npm run build:mobile`, and `node --test test/native-audio-adapter.test.js`. Expected: all existing tests plus native branch tests pass; web output contains no Android-only runtime requirement.
- [ ] **Step 6: Commit the React integration.**
  `git add src/audio src/native src/platform.js src/main.jsx test && git commit -m "feat(android): route Capacitor playback through Media3"`

### Task 7: Native audio analysis and phone visualizer integration

**Files:**
- Create: `android/app/src/main/java/com/trciesielski/shutter/audio/NativeAudioAnalyzer.kt`
- Modify: `android/app/src/main/java/com/trciesielski/shutter/playback/PlayerFactory.kt`
- Modify: `android/app/src/main/java/com/trciesielski/shutter/plugin/PluginEventBridge.kt`
- Modify: `src/audio/useNativeAudioEngine.js`
- Modify: `src/visualizer/MusicVisualizer.jsx` only for the existing `bins` input contract
- Create: `android/app/src/test/java/com/trciesielski/shutter/audio/NativeAudioAnalyzerTest.kt`
- Create: `test/native-analysis.test.js`

**Interfaces:**
- `NativeAudioAnalyzer` consumes PCM frames through a Media3-compatible `AudioProcessor` and emits bounded, throttled `FloatArray` magnitudes (target 32 bands) only while the service is playing.
- `analysisFrame` payloads include `revision`, `timestampMs`, `bands`, and `signalStatus`; absence of frames is represented explicitly, not as fabricated data.

- [ ] **Step 1: Write analyzer tests for silence, tone, clipping and throttling.**
  Assert silence produces near-zero bands, a known tone produces energy in the expected range, frames are bounded, and event rate stays below the documented UI budget.
- [ ] **Step 2: Implement the processor only if the Media3 audio sink exposes a stable PCM hook.**
  Keep analyzer allocation bounded and detach it on service destroy. If the device/API path cannot provide PCM safely, implement a capability-disabled state and document the limitation rather than using Web Audio.
- [ ] **Step 3: Feed existing phone visualizers.**
  Map native bands to the current `bins` shape without changing visualizer layout/style or enabling visualizers on Android Auto.
- [ ] **Step 4: Run analyzer tests and document measured behavior.**
  Run native JVM tests and `npm test`; record whether real device audio frames were verified. Do not mark full Web Audio/EQ parity.
- [ ] **Step 5: Commit the analysis integration.**
  `git add android/app/src/main/java/com/trciesielski/shutter/audio android/app/src/main/java/com/trciesielski/shutter/playback android/app/src/main/java/com/trciesielski/shutter/plugin src/audio/useNativeAudioEngine.js src/visualizer/MusicVisualizer.jsx test && git commit -m "feat(android): expose native audio analysis to visualizers"`

### Task 8: End-to-end verification, installation documentation and release handoff

**Files:**
- Create: `docs/ANDROID.md`
- Modify: `README.md` only to link the native Android instructions; do not alter web run semantics
- Create/modify: `android/app/src/androidTest/java/com/trciesielski/shutter/e2e/AndroidPlaybackE2ETest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/e2e/AndroidAutoBrowseE2ETest.kt`
- Create: `docs/superpowers/plans/2026-10-27-shutter-android-auto.md` checklist updates

**Interfaces:**
- `docs/ANDROID.md` documents JDK/Android SDK/Gradle setup, staging/production URL overrides, debug APK install, SAF import, offline playback, DHU setup, Android Auto test steps, and known limitations.
- Test reports distinguish passed, skipped/unrun, and unavailable physical Android Auto checks.

- [ ] **Step 1: Add native instrumentation coverage.**
  Exercise install/launch, catalog load, local import, local playback, queue controls, background/notification state, controller reconnect, and service restart. Use a local HTTPS fixture or MockWebServer for deterministic R2 behavior.
- [ ] **Step 2: Run the complete web regression suite.**
  Run `npm test`, `npm run build`, `npm run build:mobile`, and `CI=1 XDG_CONFIG_HOME=/tmp/shutter-config PLAYWRIGHT_CHROME_PATH=/usr/bin/chromium npm run test:e2e`. Expected: existing web/mobile tests pass and no web source is changed for Android-specific behavior.
- [ ] **Step 3: Build and install debug APK when tooling exists.**
  Run `npm run build`, `npx cap sync android`, `./gradlew :app:assembleDebug`, install with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, and capture launch/logcat evidence. If SDK/ADB is unavailable, report the exact unrun commands.
- [ ] **Step 4: Run Android Auto manual verification.**
  With DHU/emulator/physical projection available, verify discoverability, browse categories, play/pause/next/previous/seek, shuffle/repeat, artwork/metadata, voice command routing, steering-wheel/Bluetooth controls, focus/noisy interruptions, network loss/retry, lock-screen state and restart recovery. Do not claim Auto compatibility if this step is unrun.
- [ ] **Step 5: Run final repository checks.**
  Run `git diff --check`, `git status --short`, inspect generated APK/test reports, and confirm no files outside this branch’s Android/docs/adapter scope changed. Leave debug servers stopped.
- [ ] **Step 6: Push branch and create a PR without merging.**
  Push `feature/shutter-android-auto` to `origin`, create a PR targeting `main` with the test matrix and explicit Android Auto limitations, then attach/report the PR URL. Do not merge or deploy. If GitHub API/push permission remains unavailable, report the exact blocker and provide the branch/commit sequence for handoff.

## Execution order and checkpoints

Tasks 1–4 establish a working native playback/Auto foundation before any React
adapter is allowed to control it. Task 5 defines the bridge and migration
contract. Task 6 integrates the existing UI while enforcing the no-HTMLAudio
Android invariant. Task 7 is optional only in the narrow technical sense that
the capability may be disabled when Media3 cannot expose safe PCM; Tasks 1–6
remain required. Task 8 is the release gate and must separate automated proof
from unavailable device/Auto checks.

Every task ends with its own tests and commit. Never claim the final acceptance
criteria from a JVM/build result alone; Android Auto requires the manual host
test in Task 8.
