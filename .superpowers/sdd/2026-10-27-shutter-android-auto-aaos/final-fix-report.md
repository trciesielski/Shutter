# Final fix wave report — Android Auto / AAOS

Date: 2026-10-27
Branch: `feature/shutter-android-auto`
Scope: final review Important findings 1–6 only; plan, ledger, and review-package files were not edited.

## Implemented fixes

1. **WebStorageMigration malformed JSON**
   - Malformed approved payloads are diagnosed as incomplete rather than silently falling back to a completed migration.
   - Valid keys are still imported transactionally when possible, but no migration marker is written while any approved key is malformed.
   - `MigrationReport` now distinguishes `alreadyCompleted` from an incomplete migration, so the Capacitor response cannot make React write a false completion marker.
   - Raw WebView values remain untouched and a retry with corrected JSON can complete the migration.

2. **Native catalog outage**
   - The Capacitor catalog method now rejects when the browse tree returns `catalog:error` or any non-success library result.
   - The intentional non-playable browse status item remains available to Android Auto/AAOS browsers.
   - React therefore exposes catalog error/retry state instead of converting an outage into a successful empty catalog.

3. **Native listening history**
   - Shared Media3 transition/play-start tracking records one Room listening-history row per actual current-track transition.
   - This is owned by `ShutterMediaLibraryService`, so phone, Android Auto, and AAOS use the same recording path.
   - `ShutterMedia` now exposes `getHistory` and `clearHistory`; the native adapter hydrates history, refreshes on `historyChanged`, and exposes the existing UI shape/statistics.
   - Browser localStorage history remains unchanged.

4. **Local-track queue reconciliation**
   - Local deletion now sends an acknowledged service command after Room removal.
   - The service removes all queue occurrences of the ID, adjusts current index/position, preserves play state for a non-empty queue, and safely clears an empty queue.
   - Empty queue acknowledgements normalize Media3's `-1` current index so the Capacitor call completes and React receives the cleared snapshot.
   - The returned playback snapshot and library event update React state.

5. **Android Auto/AAOS browse invalidation**
   - Added lifecycle-safe shared change/history notifiers between the plugin and the single MediaLibrarySession.
   - The service calls `notifyChildrenChanged` for local library, playlist root, and affected `playlist:<id>` parents after local, playlist, import, migration, and deletion mutations.

6. **Private artwork URI security**
   - Embedded local artwork now uses `${applicationId}.fileprovider` content URIs rather than `file://` URIs.
   - FileProvider paths are restricted to app-private `files/library-artwork/`; the provider remains `exported=false` with URI grants enabled.
   - A Robolectric contract test verifies URI scheme, authority, path, provider export state, and grant configuration.

## Verification commands and results

Environment used for Android commands: JDK `/tmp/shutter-jdk`, SDK `/tmp/shutter-task1-sdk`, writable Gradle/Android homes under `/tmp`, and the configured HTTPS proxy with `/etc/ssl/certs/java/cacerts`.

| Command | Result |
| --- | --- |
| `node --test test/native-media.test.js test/native-audio-adapter.test.js` | PASS, 22/22 |
| `npm test` | PASS, 76/76 |
| `npm run build` | PASS, Vite 1614 modules |
| `npm run build:mobile` | PASS, Vite 1614 modules |
| `npm run android:sync` | PASS, Capacitor assets synced |
| `./gradlew :app:testPhoneAutoDebugUnitTest :app:testAutomotiveDebugUnitTest --no-daemon --console=plain` | PASS, both full flavor JVM suites |
| `./gradlew :app:processPhoneAutoDebugMainManifest :app:processAutomotiveDebugMainManifest :app:compilePhoneAutoDebugKotlin :app:compileAutomotiveDebugKotlin :app:assemblePhoneAutoDebug :app:assembleAutomotiveDebug --no-daemon --console=plain` | PASS, both Kotlin compiles, manifest merges, and APK builds |
| `PLAYWRIGHT_CHROME_PATH=/usr/bin/chromium XDG_CONFIG_HOME=/tmp/shutter-playwright-config npx playwright test --project=mobile-build` | PASS, 3/3 native/mobile-build cases |
| `git diff --check` | PASS, no whitespace errors |

Merged-manifest checks confirmed one `ShutterMediaLibraryService` in each variant, the phone-only Google car media descriptor, the automotive required hardware feature/category, and the restricted FileProvider contract.

APK artifacts from the final build:

- `android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk` — 8,281,423 bytes — SHA-256 `eb388d765934b9faa02e3fb116446669b19840ed94c285a41e4650eb5e92759f`
- `android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk` — 8,281,116 bytes — SHA-256 `899237d9407d8bb4142facebfd0ce8b3b3cabc92e692819f149899f091c5512c`

## Unresolved environment limits

- No physical Android phone, emulator, `adb`, Android Auto DHU/projection host, or AAOS emulator/device was available. Phone installation, SAF/provider runtime behavior, background playback, Android Auto browse/transport, and AAOS host compatibility remain unverified.
- Android instrumentation/connected tests were not run for the same missing-device/tooling reason. JVM flavor suites, Kotlin compiles, manifest merges, and APK builds are verified.
- No WEB, ADMIN, Cloudflare, R2, main-branch, plan, ledger, or review-package files were changed by this fix wave.
