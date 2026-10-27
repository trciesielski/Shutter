# Task 3 report — Gradle platform variants and manifest contracts

Date: 2026-10-27

## Result

Implemented the two Android platform variants while retaining one shared
application, Media3 service, Room database, SAF library manager, and
ShutterMedia plugin implementation.

The source/manifest contract checks pass and both variant manifest merge tasks
pass. Full JVM unit-test and assemble tasks reach the Kotlin build step but are
blocked by an external repository response described below. No Android Auto or
Android Automotive OS host compatibility is claimed from these JVM/build
checks.

## Implementation

- `android/app/build.gradle`
  - Added one `platform` flavor dimension.
  - Added `phoneAuto` and `automotive` flavors with no application ID suffix.
  - Kept the existing default application ID, minSdk configuration, URL
    `BuildConfig` fields, dependencies, and shared `main` source set.
  - Passed the app module path to JVM tests so source/manifest assertions are
    independent of Gradle's working directory.
- `android/app/src/main/AndroidManifest.xml`
  - Removed the Google car projection metadata so the common manifest contains
    only shared application, service, activity, provider, and permissions.
  - Left the exported `ShutterMediaLibraryService` declaration and all of its
    Media3/browser intent actions singular and unchanged.
- `android/app/src/phoneAuto/AndroidManifest.xml`
  - Added the Google car application metadata for Android Auto projection.
- `android/app/src/phoneAuto/res/xml/automotive_app_desc.xml`
  - Moved the existing media projection descriptor into the `phoneAuto`
    resource source set.
- `android/app/src/automotive/AndroidManifest.xml`
  - Added the required `android.hardware.type.automotive` feature.
  - Set the AAOS application category to `audio`.
- `android/app/src/test/java/com/trciesielski/shutter/build/BuildVariantManifestContractTest.kt`
  - Added focused assertions for the single dimension, both flavor names,
    shared application ID/minSdk, phone projection ownership, AAOS feature
    requirement, and exactly one shared media library service.

## Verification

### Passed

1. Static source/XML equivalent of the focused contract test:

   ```text
   STATIC VARIANT/MANIFEST CONTRACTS: PASS
   ```

2. Repository whitespace check:

   ```text
   git diff --check: PASS
   ```

3. Android manifest merge tasks, using the available SDK at
   `/tmp/shutter-task1-sdk` and a temporary JDK/truststore outside the
   repository:

   ```text
   ./gradlew --offline :app:processPhoneAutoDebugMainManifest \
     :app:processAutomotiveDebugMainManifest
   BUILD SUCCESSFUL
   ```

   The merged manifests confirmed:

   - `phoneAutoDebug` contains
     `com.google.android.gms.car.application` pointing to
     `@xml/automotive_app_desc` and one
     `com.trciesielski.shutter.playback.ShutterMediaLibraryService`.
   - `automotiveDebug` contains
     `android.hardware.type.automotive`, `android:appCategory="audio"`, and
     one `com.trciesielski.shutter.playback.ShutterMediaLibraryService`.

### Blocked

The focused JVM tests were attempted for both variants:

```text
:app:testPhoneAutoDebugUnitTest \
  --tests com.trciesielski.shutter.build.BuildVariantManifestContractTest
:app:testAutomotiveDebugUnitTest \
  --tests com.trciesielski.shutter.build.BuildVariantManifestContractTest
```

Both reached `:app:kaptGenerateStubs<Variant>DebugKotlin` and stopped because
the managed proxy returned HTTP 503 for these Kotlin 2.2.21 artifacts from
`dl.google.com`:

```text
org.jetbrains.kotlin:kotlin-script-runtime:2.2.21
org.jetbrains.kotlin:kotlin-daemon-embeddable:2.2.21
```

The same public POMs returned HTTP 200 from Maven Central, but Gradle's current
repository resolution selected the Google Maven URL for these artifacts, so
the Kotlin test task could not reach the test runner. The attempted assemble
command was likewise blocked at `:app:kaptGenerateStubsPhoneAutoDebugKotlin`
for the same reason:

```text
:app:assemblePhoneAutoDebug :app:assembleAutomotiveDebug
```

The unit tests therefore have not been claimed as executed or passing; the
successful manifest merge tasks and static assertions are the available
verification evidence.

## Environment limitations encountered

These were resolved where possible without changing the repository:

- The wrapper's default `/home/agent/.gradle` was read-only; verification used
  `GRADLE_USER_HOME=/tmp/shutter-gradle`.
- Android tooling initially failed because `/home/agent/.android` was
  read-only; verification used `ANDROID_USER_HOME=/tmp/shutter-android`.
- No Android SDK variables were configured. The existing SDK at
  `/tmp/shutter-task1-sdk` was used via `ANDROID_HOME` and `ANDROID_SDK_ROOT`.
- The image's `/usr/lib/jvm/java-21-openjdk-amd64` has no Java compiler.
  JDK 21.0.8 was downloaded to `/tmp/jdk-21.0.8` solely to run Gradle.
- Java initially rejected the proxy certificate with
  `PKIX path building failed`; the managed `CODEX_PROXY_CERT` was imported
  into a temporary truststore at `/tmp/shutter-gradle-cacerts`. TLS
  verification remained enabled.

## Scope audit

Outside the required Android common-manifest/resource-source-set adjustment,
no WEB, ADMIN, root main application, cloud, R2, plan, ledger, or
review-package files were modified. Shared Media3, Room, SAF,
Capacitor/plugin dependencies, configurable catalog/music URLs, and the
existing common service implementation were preserved. The report and focused
test are the only additions outside the variant Gradle/manifest/resource
changes.
