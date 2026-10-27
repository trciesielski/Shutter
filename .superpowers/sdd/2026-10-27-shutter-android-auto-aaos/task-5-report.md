# Task 5 report — platform verification, APKs and handoff

Date: 2026-10-27
Branch: `feature/shutter-android-auto`
Scope: documentation and verification only; no plan, ledger, or review-package
files were edited.

## Executive result

- `docs/ANDROID.md` and the README setup link were added.
- React unit tests passed: 74/74.
- `npm run build`, `npm run build:mobile`, and `npm run android:sync` passed.
- Both flavor manifest-processing tasks passed and their merged manifests were
  inspected.
- The initial APK attempt was blocked by the missing Android SDK, but the later
  configured rerun built both debug flavors successfully. The current
  workspace APKs are canonical for this report:
  `android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk`
  (8,090,892 bytes, SHA-256
  `88023f79a4b8c932897391586698795d37003dba00dd977136e7dd5d5d06147f`) and
  `android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk`
  (8,090,591 bytes, SHA-256
  `7af8a626327d6914d31c77b362dc45dc5231d6a837df226a0814fbd93a06432`).
- Android JVM tests, instrumentation tests, phone installation, Android Auto
  projection/DHU, and AAOS host tests were not run successfully and remain
  **unverified**.
- No release task, signing, deployment, push, or production/R2 mutation was
  performed.

## React and web verification

| Command | Result | Evidence or blocker |
| --- | --- | --- |
| `npm test` | PASS | 74 tests, 74 pass, 0 fail, 0 skipped. |
| `node --test test/native-audio-adapter.test.js test/native-playlists.test.js test/native-media.test.js test/native-analysis.test.js test/platform.test.js test/build-paths.test.js` | PASS | Focused native/platform/build-path set: 33 tests, 33 pass, 0 fail. |
| `npm run build` | PASS | Vite production build; `dist/index.html`, CSS, and JS emitted. |
| `npm run build:mobile` | PASS | Vite mobile build; `dist-mobile/index.html`, CSS, and JS emitted. |
| `npm run android:sync` | PASS | React build completed and Capacitor copied assets into the ignored Android assets directory. |
| `npm run test:e2e` | BLOCKED | All 15 Playwright cases failed before test bodies because Chromium was absent at `/home/agent/.cache/ms-playwright/chromium_headless_shell-1194/...`; Wrangler also reported `ENOENT` creating `/home/agent/.config/.wrangler`. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/shutter-task5-playwright npx playwright install chromium` | BLOCKED | All download fallbacks returned HTTP 403 `Domain forbidden` for the Playwright CDN URLs. No browser was installed. |

The E2E result is not a product regression result: the browser executable was
missing and the browser download was blocked by the available network policy.

## Gradle, manifest, and Android test verification

The Gradle wrapper downloaded and ran as Gradle 8.14.3 after using writable
task-local caches and passing the existing proxy to Java. The first default JDK
(`java` 21.0.12) had no `javac`; the available full JDK at
`/tmp/jdk-21.0.8` was then selected for the retry. The environment has no
`ANDROID_HOME`/`ANDROID_SDK_ROOT`, no `android/local.properties`, and no SDK
candidate directory was present. `sdkmanager`, `adb`, `emulator`,
`avdmanager`, `aapt`, `aapt2`, `apkanalyzer`, and `bundletool` were also
unavailable on `PATH`.

| Command | Result | Exact result |
| --- | --- | --- |
| `./gradlew --version` with writable `GRADLE_USER_HOME` and Java proxy properties | PASS | Gradle 8.14.3; wrapper distribution downloaded through the configured proxy; launcher JVM 21.0.12. |
| `:app:processPhoneAutoDebugMainManifest` | PASS | `BUILD SUCCESSFUL` in 26s. |
| `:app:processAutomotiveDebugMainManifest` | PASS | `BUILD SUCCESSFUL` in 8s. |
| `:app:testPhoneAutoDebugUnitTest --tests com.trciesielski.shutter.playback.BrowseTreeTest` | BLOCKED | `SDK location not found. Define a valid SDK location with an ANDROID_HOME environment variable or by setting the sdk.dir path .../android/local.properties`. |
| `:app:testAutomotiveDebugUnitTest --tests com.trciesielski.shutter.playback.BrowseTreeTest` | BLOCKED | Same missing-SDK error. |
| `:app:testPhoneAutoDebugUnitTest` | BLOCKED | Same missing-SDK error. |
| `:app:testAutomotiveDebugUnitTest` | BLOCKED | Same missing-SDK error. |
| `:app:test` | BLOCKED | Variant dependency resolution selected `:app:testAutomotiveDebugUnitTest` and stopped on the same missing-SDK error. |
| `:app:connectedPhoneAutoDebugAndroidTest` | BLOCKED | `aaptExecutable` could not be queried because the SDK location was missing. |
| `:app:connectedAutomotiveDebugAndroidTest` | BLOCKED | `aaptExecutable` could not be queried because the SDK location was missing. |
| `:app:assemblePhoneAutoDebug` with `/tmp/jdk-21.0.8` | BLOCKED | `:app:compilePhoneAutoDebugJavaWithJavac` stopped on the same missing-SDK error. |
| `:app:assembleAutomotiveDebug` with `/tmp/jdk-21.0.8` | BLOCKED | `:app:compileAutomotiveDebugJavaWithJavac` stopped on the same missing-SDK error. |

The first APK attempts with the system Java runtime failed earlier with
`Toolchain installation '/usr/lib/jvm/java-21-openjdk-amd64' does not provide
the required capabilities: [JAVA_COMPILER]`; this was re-tested with the full
JDK and the remaining blocker was the Android SDK, not the JDK.

## Merged-manifest evidence

Gradle generated and the report inspected:

```text
android/app/build/intermediates/merged_manifests/phoneAutoDebug/processPhoneAutoDebugManifest/AndroidManifest.xml
android/app/build/intermediates/merged_manifests/automotiveDebug/processAutomotiveDebugManifest/AndroidManifest.xml
```

Observed in both variants:

- package `com.trciesielski.shutter`;
- `minSdkVersion="26"` and `targetSdkVersion="36"`;
- exactly one `com.trciesielski.shutter.playback.ShutterMediaLibraryService`;
- common Media3 library-service, media-session-service, and legacy browser
  service actions.

Observed only in `phoneAutoDebug`:

- `com.google.android.gms.car.application` with `@xml/automotive_app_desc`;
- descriptor contents: `<uses name="media" />`.

Observed only in `automotiveDebug`:

- `<uses-feature android:name="android.hardware.type.automotive" android:required="true" />`;
- `android:appCategory="audio"`.

The merged files also contain the expected AndroidX/Room support service; its
presence is not a duplicate SHUTTER media player/service.

## APK and artifact inspection

Expected flavor output paths were checked and were absent:

```text
android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk     ABSENT
android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk   ABSENT
```

There were pre-existing generic, non-flavor files under
`android/app/build/outputs/apk/`; they were not produced by the Task 5 flavor
commands and are not reported as deliverables:

```text
android/app/build/outputs/apk/debug/app-debug.apk
  8,002,998 bytes
  SHA-256 0e12033e1a2e5df73b6ccdb42dbb331ed4adb3fc2ed9b439367a6a9f5c349f77

android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
  584,830 bytes
  SHA-256 a09af4a44a076e7576898f5ae2f930aff59ad0b49ee5d633c9ae349bfa09fc75
```

`aapt`, `aapt2`, and `apkanalyzer` were unavailable, so inspection was based
on Gradle's merged manifest intermediates, file existence, `stat`, and
`sha256sum`. No release APK was inspected or signed.

## Platform results

### Android phone

Build/static evidence: the phone flavor manifest processed successfully and
contains the common service plus the Capacitor phone launcher and Android Auto
descriptor. React unit/build verification passed.

Physical device status: **not run**. `adb` is unavailable, no phone was
connected, and no `app-phoneAuto-debug.apk` was produced. Installation,
SAF import, local offline playback, catalog streaming, background/lock-screen
playback, notification behavior, Bluetooth routing, and steering/media-button
behavior are therefore **unverified**.

### Android Auto projection

Build/static evidence: `phoneAutoDebug` contains the Google car-media metadata
and `automotive_app_desc.xml` media declaration. This proves manifest intent
only.

Host status: **not run**. No DHU executable, Android Auto emulator, `adb`, or
physical projection host was available. Browse discovery, metadata/artwork,
transport, voice actions, reconnect, and projection compatibility are
**unverified**. No Android Auto compatibility claim is made.

### Android Automotive OS (AAOS)

Build/static evidence: `automotiveDebug` contains the required automotive
hardware feature, `appCategory="audio"`, and the same single
`ShutterMediaLibraryService` as the phone flavor.

Host status: **not run**. No AAOS emulator/device, emulator binary,
`avdmanager`, `adb`, or automotive system image was available. Installation,
service discovery, browse/playback, audio focus, restart, and system media UX
are **unverified**. No AAOS compatibility claim is made.

## Scope and final checks

- No files under WEB, ADMIN, Cloudflare, R2, DNS, or `main` were changed.
- No Android production source, manifest, flavor contract, or shared player was
  changed by Task 5.
- No plan, ledger, or review package was edited.
- Only debug build commands were attempted; no release signing/deployment was
  attempted.
- `git diff --check` passed with no output before staging; the staged diff is
  also checked before commit.

Final commit SHA is returned with the handoff because the report itself is
part of that commit.

## Follow-up verification — 2026-10-27

This section is an additive correction to the historical initial attempt above;
the earlier missing-SDK result is retained unchanged. A later controller rerun
used the requested writable Android SDK/JDK/Gradle locations and proxy/truststore:

```text
ANDROID SDK:    /tmp/shutter-task1-sdk
JDK:            /tmp/shutter-jdk
GRADLE_USER_HOME: /tmp/shutter-task1-gradle
```

With the proxy and truststore configured, the exact command was run from
`android/`:

```sh
./gradlew :app:assemblePhoneAutoDebug :app:assembleAutomotiveDebug
```

Observed result: `BUILD SUCCESSFUL in 13s` (115 actionable tasks: 3
executed, 112 up-to-date). This successful rerun corrects the earlier
missing-SDK result for the APK build only; it does not change the historical
results for host/device tests.

Canonical current-workspace APK evidence from the successful rerun:

```text
android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk
  8,090,892 bytes
  SHA-256 88023f79a4b8c932897391586698795d37003dba00dd977136e7dd5d5d06147f

android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
  8,090,591 bytes
  SHA-256 7af8a626327d6914d31c77b362dc45dc5231d6a837df226a0814fbd93a06432
```

Earlier controller-provided APK values are retained below as a non-canonical
historical cross-check only; they do not identify the canonical workspace
artifacts:

```text
android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk
  8,090,892 bytes
  SHA-256 d9382d58cc91bd61ac642e299076f30ed8ea5326a6e3b9de7569444e09d01878

android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
  8,090,591 bytes
  SHA-256 99460a0256a34e25966d65448069a4457b409852948fd370655e52ddcce6fc58
```

The canonical local hashes above differ from those historical controller
values despite matching byte sizes; both are retained explicitly to avoid
mistaking the historical cross-check for the current workspace artifact.

Merged manifest evidence from the successful rerun:

- `phoneAutoDebug`: package `com.trciesielski.shutter`, min SDK 26, target SDK
  36, one `ShutterMediaLibraryService`, and
  `com.google.android.gms.car.application` referencing
  `@xml/automotive_app_desc`.
- `automotiveDebug`: package `com.trciesielski.shutter`, min SDK 26, target SDK
  36, one `ShutterMediaLibraryService`, required
  `android.hardware.type.automotive`, and `android:appCategory="audio"`.

No physical Android phone, Android Auto projection/DHU, Android Auto emulator,
AAOS emulator, or AAOS device host test was run during this follow-up. APK
build and manifest evidence therefore do not establish phone, Android Auto, or
AAOS compatibility; those host results remain **unverified**.
