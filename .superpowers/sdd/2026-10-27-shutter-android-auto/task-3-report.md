# Task 3 report: SAF local library and R2 media source

## Status

Implemented and committed as `fd96863 feat(android): import local audio through SAF` on `feature/shutter-android-auto`, based on `70a82da`. Native compilation and test execution remain unverified because this environment has no Android SDK, `adb`, or Java compiler.

## Implementation

- `SafLibraryManager` launches a multi-select `ACTION_OPEN_DOCUMENT` picker for common audio formats with read and persistable grant flags. `importUris` takes a persisted read grant, deduplicates each selection, reads metadata, derives the canonical ID through Task 2's `LibraryRepository.localId`, and upserts the Room record. It reports individual import failures. If the document's size or modified time changes, it replaces the old native record for that URI and removes its owned artwork cache.
- `MetadataReader` reads document display name, size, and modified time through `ContentResolver`, then title, artist, album, duration, and embedded artwork through `MediaMetadataRetriever`. Missing text receives safe fallback labels. Text is capped at 512 characters and cached artwork at 1 MiB. Audio bytes are never copied into app storage.
- `removeTrack` removes only the local Room row, its app-owned artwork cache, and the persisted read grant when no other local identity uses the URI. It never calls provider delete. Task 2 playlist references remain according to repository semantics.
- `MediaItemMapper` maps catalog HTTPS and local `content://` tracks to Media3 items, preserving media ID, URI, MIME, duration, title, artist, album, and artwork. Browse items are playable leaves (`isBrowsable=false`, `isPlayable=true`). No player was created. No manifest change was needed for SAF.
- Added unit tests for canonical local identity and catalog/local Media3 mapping, plus instrumentation cases for picker flags, duplicate selection, renamed metadata, changed document metadata, revoked access, unsupported type handling, grant calls, removal without deleting the source, and shared URI grant retention.

## Verification attempted

- `./gradlew :app:testDebugUnitTest --tests '*LocalTrackIdTest'`: first attempt stopped because Gradle tried to write its lock in read-only `/home/agent/.gradle`. With `GRADLE_USER_HOME=/tmp/shutter-gradle` and `ANDROID_USER_HOME=/tmp/shutter-android-home`, Gradle configured the project but stopped before compilation: `SDK location not found` (no `ANDROID_HOME` or `android/local.properties`). No unit tests ran.
- `./gradlew :app:connectedDebugAndroidTest --tests '*SafLibraryManagerTest'`: Gradle rejects `--tests` for `connectedDebugAndroidTest` as an unknown option. The corrected class-filter attempt, `./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.trciesielski.shutter.library.SafLibraryManagerTest`, stopped before compilation because `/usr/lib/jvm/java-21-openjdk-amd64` lacks `JAVA_COMPILER`. No instrumentation tests ran; no device/emulator or `adb` is present.
- `git diff --cached --check` passed before commit. Inspected the Media3 1.8.0 source API to confirm the mapper's nullable duration and browse/playable setters exist. Reviewed source paths for provider deletion; only app-owned artwork cache files are deleted.

## Self-review and remaining concerns

- The instrumentation suite uses injected grant and metadata functions rather than a real `DocumentsProvider`. It verifies manager flow and that removal leaves its simulated source file intact, but it does not prove a system picker grant survives a process restart. Run a manual/device test using MP3, FLAC, WAV, and M4A documents after SDK and device tooling are available.
- Metadata extraction uses `MediaMetadataRetriever.embeddedPicture`, whose framework API returns a whole byte array. The 1 MiB bound limits caching, not the framework's transient allocation. A pathological embedded cover could still use memory during extraction.
- The requested test commands did not reach Kotlin compilation, so compile and runtime compatibility are not claimed.
- The cloud onboarding guidance was used to diagnose the runtime. No reusable environment configuration was saved because this task explicitly permits reporting absent Android tooling, and source implementation was completed within the requested repository scope.

## Scope

Only the seven new Android source/test files were committed. The approved documents, existing web/Admin/visualizer files, SDD ledger, earlier task reports, and manifest were not modified. This report is the requested separate deliverable.

## Fix round 1 — 2026-10-27

Two reviewer findings were addressed:

- Optional AAC, OGG, and Opus formats were removed from the SAF picker MIME list and `MetadataReader` import allowlist. The picker uses explicit `EXTRA_MIME_TYPES` for the MP3, FLAC, WAV, and M4A MIME variants, and `importUris` checks the allowlist before writing a track. No optional codec is advertised based on an unverified device capability.
- When a document's size or modified time changes its canonical local ID, `LibraryRepository.replaceLocalIdentity` now upserts the new track, retargets every matching playlist entry, clears its orphan flag, and deletes stale local rows in one Room transaction. The manager deletes stale app-owned artwork afterward. Playlist positions and duplicate occurrences are preserved.

Coverage added: `SupportedAudioFormatsTest` checks the picker list, required extensions, and optional exclusions. `LocalIdentityMigrationTest` checks two playlists, duplicate occurrences, positions, orphan flags, stale-row removal, and repeat import. `SafLibraryManagerTest` now checks playlist references after reimport and rejects AAC, OGG, and Opus imports while releasing the simulated grant.

Verification commands and observed output:

- `GRADLE_USER_HOME=/tmp/shutter-gradle ANDROID_USER_HOME=/tmp/shutter-android-home ./gradlew :app:testDebugUnitTest --tests '*LocalIdentityMigrationTest' --tests '*SupportedAudioFormatsTest' --tests '*LocalTrackIdTest'` — exit 1 before compilation: `SDK location not found`. No unit tests ran.
- `GRADLE_USER_HOME=/tmp/shutter-gradle ANDROID_USER_HOME=/tmp/shutter-android-home ./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.trciesielski.shutter.library.SafLibraryManagerTest` — exit 1 before compilation: Java 21 installation does not provide `JAVA_COMPILER`. No instrumentation tests ran. The environment also has no `adb` or attached emulator/device.
- `git diff --check` — exit 0. Source review confirmed the format allowlist is shared by picker/import and that playlist retarget plus stale-row removal occurs inside `db.withTransaction`.

Remaining limitation: native compile and runtime behavior need verification in an Android SDK/JDK/device environment. The instrumentation suite still uses simulated grant and metadata functions, as noted above.
