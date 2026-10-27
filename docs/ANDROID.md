# SHUTTER Android

This document covers the debug Android phone/projection artifact (`phoneAuto`)
and the separate Android Automotive OS artifact (`automotive`). Both variants
use the shared Media3 service and player. Android Auto, Bluetooth, steering
wheel, background playback, and AAOS compatibility are host behaviours: they
must be tested on the relevant host before being called compatible.

## Prerequisites and setup

- Node.js 20 or newer and npm dependencies installed with `npm install`.
- A full JDK 21, including `javac`. A Java runtime without the compiler is not
  enough for the Android build.
- Android SDK with platform/build tools for `compileSdk 36` and `targetSdk 36`.
  `adb`, `emulator`, `avdmanager`, and `sdkmanager` are needed for device and
  emulator validation.
- The repository Gradle wrapper, Gradle 8.14.3. Do not use a release build or
  configure release signing for this debug-only handoff.

Set `JAVA_HOME` to the full JDK and configure the SDK in the usual Android
project way, for example with `android/local.properties`:

```properties
sdk.dir=/absolute/path/to/Android/Sdk
```

Keep Gradle and Android user directories writable. If the environment requires
an HTTP proxy, pass it to Java as Gradle/JVM properties; setting only
`HTTP_PROXY`/`HTTPS_PROXY` is not sufficient for the Java Gradle wrapper:

```sh
export JAVA_HOME=/absolute/path/to/jdk-21
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME=/writable/path/gradle
export ANDROID_USER_HOME=/writable/path/android-user
export JAVA_TOOL_OPTIONS="-Dhttps.proxyHost=proxy.example -Dhttps.proxyPort=8080 -Dhttp.proxyHost=proxy.example -Dhttp.proxyPort=8080"

npm install
npm run build
npm run android:sync
cd android
./gradlew --version
```

`android:sync` copies the public web build into the ignored Capacitor assets
directory. It does not change the web/admin/Cloudflare/R2 configuration.

## Variants and endpoints

The default debug endpoint is staging:

```text
SHUTTER_MUSIC_BASE_URL=https://shutter-web-6p2.pages.dev/music/
SHUTTER_CATALOG_URL=https://shutter-web-6p2.pages.dev/music/catalog/catalog.json
```

The catalog URL is derived from the base URL when it is not explicitly set.
For the production custom domain, use the corresponding `/music/` paths and
override both values when needed:

```sh
cd android
SHUTTER_MUSIC_BASE_URL=https://music.madebyform.work/music/ \
SHUTTER_CATALOG_URL=https://music.madebyform.work/music/catalog/catalog.json \
./gradlew :app:assemblePhoneAutoDebug :app:assembleAutomotiveDebug
```

The same overrides can be passed as Gradle properties:

```sh
./gradlew \
  -PSHUTTER_MUSIC_BASE_URL=https://music.madebyform.work/music/ \
  -PSHUTTER_CATALOG_URL=https://music.madebyform.work/music/catalog/catalog.json \
  :app:assemblePhoneAutoDebug :app:assembleAutomotiveDebug
```

BuildConfig receives the values for both flavors. No URL override authorizes
uploads or changes to the public R2 catalog.

Build the two debug artifacts with:

```sh
./gradlew :app:assemblePhoneAutoDebug
./gradlew :app:assembleAutomotiveDebug
```

When a build succeeds, the expected files are:

```text
android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk
android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
```

Install only the artifact that matches the target. Installing two variants
with the same application ID on one target is not a way to test both at once:

```sh
# Android phone and Android Auto projection
adb install -r android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk
adb shell am start -n com.trciesielski.shutter/.MainActivity

# AAOS emulator/device
adb -s <aaos-serial> install -r android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
```

For an auditable handoff, record the path, byte size, and SHA-256 after each
successful build:

```sh
sha256sum android/app/build/outputs/apk/phoneAuto/debug/app-phoneAuto-debug.apk
sha256sum android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
```

Only `Debug` tasks are described here. No release signing, deployment, DNS,
Cloudflare, R2, or production publish step is part of this workflow.

## Phone operation

The `phoneAuto` APK loads the existing React phone UI and delegates native
playback to `ShutterMedia`/`MediaController`. The native service owns the one
Media3 `ExoPlayer` and `MediaLibrarySession`.

1. Install `app-phoneAuto-debug.apk` and launch SHUTTER.
2. Open **Library** and use **Add music files**. The picker uses Android SAF
   with multiple selection for MP3, FLAC, WAV, M4A/AAC, OGG/Opus, and related
   supported audio MIME types.
3. Grant read access when prompted. SHUTTER persists the read grant, reads
   metadata/artwork, and stores the library record in Room. Removing a track
   removes SHUTTER's record/cache and does not delete the user's source file.
4. Play a local track with the network disabled to check offline local
   playback; use the catalog to check HTTPS streaming, seek/range requests,
   retry, and the catalog error state.
5. Start playback, lock the phone, and inspect the MediaStyle notification.
   Media3 audio focus and “becoming noisy” handling are configured in the
   shared player. Headset/Bluetooth route changes and external transport
   buttons should be checked on a real phone.
6. If native analysis is available for the decoded PCM path, the phone
   visualizer can receive bounded native frames. Native Android does not start
   an HTML audio element or Web Audio graph as a second player.

### Migration notes

On first native startup, the approved scalar WebView `localStorage` keys are
sent to Room migration:

```text
shutter-user-playlists-v1
shutter-favorites
shutter-track-preferences-v1
shutter-listening-history-v1
shutter-last-position-v1
```

The migration is schema-versioned, transactional, idempotent, and retryable.
Malformed rows are diagnosed; the completion marker is written only after the
Room transaction succeeds. Raw WebView values remain available until native
completion. IndexedDB Blob audio is deliberately not copied, so old web Blob
tracks must be re-imported through SAF. Android local files are not uploaded
to R2.

## Android Auto projection

Projection uses the `phoneAuto` APK. Its merged manifest contains
`com.google.android.gms.car.application` pointing to the media descriptor;
the car host receives the Media3 browse tree and transport controls, not the
React phone screen or file-management actions.

The following is a test procedure, not a compatibility claim:

1. Install and launch the phone APK, import at least one local track, and
   confirm the phone-side library state.
2. Connect the phone to an Android Auto-capable vehicle or a configured
   Desktop Head Unit (DHU). Use the Android Auto developer settings required
   by the selected host.
3. If the DHU package is installed, forward the DHU port and start the host
   from its SDK installation, adapting the executable path for the host OS:

   ```sh
   adb forward tcp:5277 tcp:5277
   <android-sdk>/extras/google/auto/desktop-head-unit
   ```

4. Select SHUTTER in the host's media apps. Check the root nodes (catalog,
   local library, playlists), metadata/artwork, browse-to-play, play/pause,
   next/previous, seek, shuffle/repeat, voice/media-button actions, reconnect,
   and offline local playback.
5. Record the phone model, Android version, Android Auto/DHU version, APK
   SHA-256, and each result. A manifest merge or a successful APK build is not
   evidence that the projection host discovered or operated the app.

## Android Automotive OS (AAOS)

The `automotive` APK is a separate artifact. Its manifest requires
`android.hardware.type.automotive`, labels the application as audio, and
registers the same `ShutterMediaLibraryService`; it does not introduce a
second player or copy the phone UI into the car host.

Use Android Studio's Device Manager or the command-line SDK tools to create an
AAOS AVD with a compatible automotive system image. A typical command-line
sequence is:

```sh
sdkmanager --list
avdmanager list device
avdmanager create avd -n shutter-aaos -k '<installed-automotive-system-image>'
emulator -avd shutter-aaos
adb devices
adb -s <aaos-serial> install -r android/app/build/outputs/apk/automotive/debug/app-automotive-debug.apk
adb -s <aaos-serial> shell dumpsys media_session
```

On the running host, select SHUTTER in the system media UI and repeat browse,
playback, queue, seek, audio focus, route, restart, and offline-local checks.
Also confirm that an automotive device can resolve the media service and that
the required automotive feature is present. Do not infer any of these results
from a phone build or a merged manifest.

## Evidence and compatibility boundary

The following are build/static evidence only:

- React unit tests and Vite builds;
- Gradle manifest processing;
- merged-manifest declarations and artifact hashes when APKs exist;
- JVM tests, when a complete Android SDK is available.

The following require a real host run and must be recorded as **unverified** if
they were not executed:

- Android phone installation and playback;
- Android Auto projection or DHU discovery and transport;
- Bluetooth/headset/steering-wheel behaviour;
- AAOS installation, discovery, and system media UX;
- background playback and lock-screen behaviour on a physical device.

See the Task 5 verification report for the environment-specific command
results, artifact paths/hashes, and blockers. Never describe SHUTTER as phone,
Android Auto, or AAOS compatible based on build output alone.
