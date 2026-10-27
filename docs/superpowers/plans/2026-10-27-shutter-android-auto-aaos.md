# SHUTTER Android phone, Android Auto and AAOS Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dokończyć istniejącą implementację Capacitor/Media3 na `feature/shutter-android-auto`, dostarczyć telefon React + Android Auto projection + osobny wariant Android Automotive OS bez drugiego silnika audio.

**Architecture:** Wspólny `ShutterMediaLibraryService` posiada jednego `ExoPlayer` i `MediaLibrarySession`. Telefon używa istniejącego React UI przez `ShutterMedia`/`MediaController`; Android Auto i AAOS używają tego samego browse tree i transportu. Gradle product flavors `phoneAuto` i `automotive` zmieniają wyłącznie manifest/deklaracje platformowe, a kod domenowy, Room, SAF, Media3 i plugin pozostają wspólne.

**Tech Stack:** Kotlin, AndroidX Media3, Room, Capacitor, React/Vite, Android SAF, Gradle product flavors, JUnit/Robolectric, Android instrumentation, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-shutter-android-auto-design.md`

## Global Constraints

- Pracować wyłącznie na `feature/shutter-android-auto`; nie modyfikować `main`, Cloudflare, R2, WEB ani ADMIN.
- Zachować istniejące fundamenty Tasks 1–4; poprawiać je tylko gdy test lub kontrakt ujawni błąd.
- `phoneAuto` i `automotive` używają jednej implementacji `ShutterMediaLibraryService`, jednego `ExoPlayer` i jednej `MediaLibrarySession` na proces.
- W natywnym Androidzie nie wolno tworzyć `HTMLAudioElement`, Web Audio graphu ani drugiego native playera.
- `phoneAuto` obsługuje telefon React i Android Auto projection; `automotive` dostarcza osobny APK dla AAOS.
- `com.trciesielski.shutter`, `minSdk 26`, MP3/FLAC/WAV/M4A i konfigurowalne staging/production URL pozostają bez zmian.
- Migracja nie kopiuje IndexedDB Blob; scalar localStorage jest idempotentny, transakcyjny, retryable i zachowuje orphan references.
- Brak testu DHU/Android Auto/AAOS oznacza wynik `unverified`, nigdy zgodność.

## Review Focus

- Native React start must not instantiate audio/WebAudio while still loading native snapshot and library — tests in Task 2.
- A rejected native queue command must leave the prior queue intact and surface an error — tests in Task 1.
- Migration must not mark completion after truncation, malformed input or transaction failure — tests in Task 1.
- Flavor manifest merge must expose the phone projection descriptor only where intended and the automotive feature in the AAOS artifact — tests in Task 3.
- Native analysis may expose only measured frames; unsupported device/audio paths remain explicitly unavailable — tests in Task 4.

### Task 1: Finish and review the existing ShutterMedia bridge/migration

**Files:**
- Modify: existing uncommitted `android/app/src/main/java/com/trciesielski/shutter/plugin/*`
- Modify: `android/app/src/main/java/com/trciesielski/shutter/migration/WebStorageMigration.kt`
- Modify: `src/native/nativeState.js`
- Test: existing plugin/migration/native-media tests plus regression tests

**Interfaces:**
- `ShutterMediaPlugin` remains a MediaController-only Capacitor plugin.
- Invalid queue IDs are resolved before replacing the current player queue.
- `WebStorageMigration` returns a diagnostic report and writes its marker only after complete Room commit.

- [ ] Verify the existing uncommitted fix against the five prior review findings.
- [ ] Add/adjust tests for failed queue replacement, `local-*` Blob orphans, connection retry/disconnect, strict event revisions, and oversized migration input.
- [ ] Run focused/full JVM and JS tests, then commit `fix(android): complete ShutterMedia bridge hardening`.

### Task 2: React native playback adapter and startup migration

**Files:**
- Create: `src/audio/nativePlaybackAdapter.js`
- Create: `src/audio/useNativeAudioEngine.js`
- Create: `src/audio/useNativePlaylists.js`
- Modify: `src/audio/useAudioEngine.js`, `src/audio/usePlaylists.js`, `src/main.jsx`
- Modify: `src/native/shutterMedia.js`, `src/native/nativeState.js` only for contract gaps
- Test: `test/native-audio-adapter.test.js`, `test/native-playlists.test.js`, `test/native-media.test.js`

**Interfaces:**
- `nativePlaybackAdapter.connect()` returns a normalized snapshot and installs removable listeners for playback, position, queue, metadata, catalog, library, playlist, focus, analysis and error events.
- `useNativeAudioEngine()` returns the current UI shape (`files`, `index`, `state`, `seconds`, `duration`, `volume`, `shuffle`, `repeat`, `queueIds`, `catalog`, `history`, `eq`, transport and queue methods) but calls only `ShutterMedia` on Android.
- `useNativePlaylists()` exposes the existing playlist UI shape and uses native CRUD only on Android; web localStorage behavior remains unchanged.
- On first native startup, raw approved localStorage values are sent to `migrateWebStorage`; the UI waits for/report migration outcome and retries without deleting raw values until native completion.

- [ ] Write failing platform-split, command delegation, stale-event, reconnect and migration-startup tests.
- [ ] Implement the adapter with no `Audio`, `AudioContext`, object URL or Web IndexedDB path on Android.
- [ ] Preserve existing React component layout and controls; replace the temporary unavailable handoff with native state/commands.
- [ ] Run `npm test`, web/mobile builds, native adapter tests and Playwright mobile regression.
- [ ] Commit `feat(android): route React playback through Media3`.

### Task 3: Gradle phoneAuto/automotive variants and manifest contracts

**Files:**
- Modify: `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/phoneAuto/AndroidManifest.xml`
- Create: `android/app/src/automotive/AndroidManifest.xml`
- Create/modify: `android/app/src/main/res/xml/automotive_app_desc.xml`
- Test: `android/app/src/test/java/com/trciesielski/shutter/build/VariantManifestTest.kt` or deterministic merged-manifest checks
- Modify: `android/app/src/androidTest` only for variant-qualified service tests

**Interfaces:**
- `phoneAutoDebug` is the phone/projection debug APK and includes the Google car media descriptor.
- `automotiveDebug` is the AAOS debug APK and declares `android.hardware.type.automotive` as required while using the same Media3 service.
- Shared `main` manifest contains common service/permissions; flavor overlays contain platform-specific declarations without duplicate services or players.
- BuildConfig URL overrides work identically for both variants.

- [ ] Add failing manifest/build tests for both application variants, service discovery, package/minSdk and descriptor/automotive feature.
- [ ] Add the product flavor dimension and minimal overlays; keep Android Auto metadata out of the automotive-only overlay unless required by the merged-manifest contract.
- [ ] Run `:app:processPhoneAutoDebugMainManifest`, `:app:processAutomotiveDebugMainManifest`, both unit test variants and both debug APK builds.
- [ ] Commit `feat(android): add phoneAuto and automotive build variants`.

### Task 4: Native audio analysis and visualizer handoff

**Files:**
- Create/modify: `android/app/src/main/java/com/trciesielski/shutter/audio/NativeAudioAnalyzer.kt`
- Modify: `android/app/src/main/java/com/trciesielski/shutter/playback/PlayerFactory.kt`, `android/app/src/main/java/com/trciesielski/shutter/plugin/PluginEventBridge.kt`
- Modify: `src/audio/useNativeAudioEngine.js`, `src/visualizer/MusicVisualizer.jsx`
- Test: native analyzer JVM tests and `test/native-analysis.test.js`

**Interfaces:**
- Analyzer emits bounded, throttled `analysisFrame` bands only when a stable Media3 PCM hook is available; otherwise it emits `signalStatus: unavailable`.
- Existing visualizer receives the same `bins` shape; no React visualizer is sent to Android Auto/AAOS.

- [ ] Write tests for silence, known tone, clipping, frame bounds and throttle budget.
- [ ] Implement only a verifiable Media3 `AudioProcessor` path; do not use Web Audio on Android.
- [ ] Feed existing phone visualizer without changing layout/style and explicitly preserve unavailable state where device data is absent.
- [ ] Run analyzer/native/web tests and commit `feat(android): expose native audio analysis`.

### Task 5: Documentation, platform verification and handoff

**Files:**
- Create/modify: `docs/ANDROID.md`, `README.md` link only
- Create/modify: `android/app/src/androidTest/java/com/trciesielski/shutter/e2e/AndroidPlaybackE2ETest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/e2e/AndroidAutoBrowseE2ETest.kt`
- Create: `android/app/src/androidTest/java/com/trciesielski/shutter/e2e/AndroidAutomotiveE2ETest.kt`
- Modify: progress ledger and plan checkboxes only

**Interfaces:**
- Installation docs distinguish `app-phoneAuto-debug.apk` and `app-automotive-debug.apk`, endpoint overrides, SAF, controller reconnect, Android Auto projection, and AAOS emulator/device setup.
- Final report separates Android phone, Android Auto and AAOS results, marking unavailable host tests explicitly.

- [ ] Run complete web tests/builds/E2E and all available Android JVM/instrumentation tests.
- [ ] Build both debug APKs, inspect merged manifests, and install/run on any available emulator/device without claiming unavailable host behavior.
- [ ] Run Android Auto DHU/projection and AAOS emulator/device tests if tools exist; otherwise record exact commands and blockers.
- [ ] Commit docs/report updates, push only `feature/shutter-android-auto`, and report commit/push status. Never merge or deploy.
