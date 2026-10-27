# Task 2 report — React playback through Media3

Implemented a native playback adapter and native audio/playlist hooks. Android startup connects to `ShutterMedia`, migrates the five approved WebView keys with the existing helper, then hydrates native catalog, library, and playlists. Incomplete or failed migration retains raw keys and can be retried from the library error action. Browser and mobile browser paths retain the Web Audio and localStorage hooks. Native EQ, analysis, and crossfade are unavailable; Android playback creates no Web Audio player or context.

## Verification

- `node --test test/native-audio-adapter.test.js test/native-playlists.test.js test/native-media.test.js` — 15 passed, 0 failed.
- `npm test` — 65 passed, 0 failed.
- `npm run build` — passed.
- `npm run build:mobile` — passed.
- `PLAYWRIGHT_CHROME_PATH=/usr/bin/chromium XDG_CONFIG_HOME=/tmp/shutter-playwright-config npx playwright test --project=mobile-build` — 2 passed, 0 failed. Covers the mobile browser and a simulated Capacitor Android bridge, including zero `Audio`/`AudioContext` instances.

## Device limitations

No Android device or emulator was available, so the shipped WebView-to-Media3 bridge, SAF picker, Room migration, audio focus, and Android Auto behavior were not exercised on device. The Playwright native check uses a simulated bridge.

## Review fix round

- Playlist playback now submits the selected playlist and index as one serialized adapter operation, waits for `setQueue` acknowledgement, then calls `play`. The playlist UI uses that operation directly, including when the selected song is already current but belongs to a different active queue.
- A failed initial connection can be retried from the visible error action. Retry reconnects, reinstalls listeners, reruns migration, hydrates the library, and then refreshes playlists.
- Position, queue, and metadata events share the strict revision gate with playback snapshots. Analysis and error events do not advance it.
- Android ratings read and write through new `ShutterMedia` methods backed by the existing Room ratings table. Rating updates preserve the stored favorite flag. The browser rating path continues to use localStorage.

### Fix-round verification

- `node --test test/native-audio-adapter.test.js test/native-playlists.test.js test/native-media.test.js` — 21 passed, 0 failed.
- `npm test` — 71 passed, 0 failed.
- `npm run build` — passed.
- `npm run build:mobile` — passed.
- `PLAYWRIGHT_CHROME_PATH=/usr/bin/chromium XDG_CONFIG_HOME=/tmp/shutter-playwright-config npx playwright test --project=mobile-build` — 3 passed, 0 failed. Includes a simulated native rating command, atomic playlist queue/play, and a failed startup followed by full retry.
- `./gradlew :app:testDebugUnitTest --tests com.trciesielski.shutter.data.RepositoryIdentityTest` — blocked before compilation because the default Gradle directory is not writable.
- `GRADLE_USER_HOME=/tmp/shutter-gradle ./gradlew :app:testDebugUnitTest --tests com.trciesielski.shutter.data.RepositoryIdentityTest` — blocked before compilation: Gradle 8.14.3 is not cached and `services.gradle.org` could not be resolved (`UnknownHostException`).

No Android device or emulator test was run. Kotlin changes and the Room test remain unverified until Gradle is available.
