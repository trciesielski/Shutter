# Task 4 report — native audio analysis and visualizer handoff

## Implementation

- Added `NativeAudioAnalyzer` as a Media3 `AudioProcessor` in the existing
  `PlayerFactory` audio sink path. It returns input PCM unchanged, measures
  PCM 16-bit and float samples, emits bounded 32-band spectral values plus RMS,
  peak, status, timestamp and revision, and throttles frames to 20 Hz by
  default. Unsupported PCM encodings remain inactive and pass through safely.
- Added `NativeAudioAnalysisBus` and the shared service/plugin bridge. The
  plugin subscribes on load, forwards measured frames through `analysisFrame`,
  and closes its subscription before scope destruction.
- Added `bands`, `signalStatus`, `signalDebug`, `analysisRevision`, measured
  timestamp and plugin revision to the native event payload. Connection still
  reports `unavailable` until a measured frame arrives.
- Mapped measured native frames into the adapter’s `audio.eq` shape with
  bounds checking and stale-revision rejection. The native hook exposes that
  live state and reports `nativeAnalysis` only after a measured frame; it does
  not create Web Audio or another player.
- No React visualizer layout/style changes were needed; the existing visualizer
  already consumes `audio.eq.bins`, `signalStatus` and `signalDebug`.

## Tests and builds

Passed:

- `node --test test/native-analysis.test.js` — 3 tests.
- `npm test` — 74 tests.
- `npm run build`.
- `npm run build:mobile`.
- `:app:testPhoneAutoDebugUnitTest --tests com.trciesielski.shutter.audio.NativeAudioAnalyzerTest` — 6 tests.
- `:app:compilePhoneAutoDebugKotlin :app:compileAutomotiveDebugKotlin`.

Blocked:

- `:app:testPhoneAutoDebugUnitTest` and `:app:testAutomotiveDebugUnitTest`
  both compile the new sources, then fail while Robolectric initializes
  existing test classes. The required artifact
  `org.robolectric:android-all-instrumented:16-robolectric-13921718-i7` is not
  cached; Robolectric attempts `repo1.maven.org` and fails with
  `UnknownHostException`. The initial system JDK also lacked `javac`; the
  available `/tmp/jdk-21.0.8` JDK was used for the successful compile and
  focused test.

Not tested because no Android device or emulator, Android Auto host, or AAOS
host was available. Therefore this report makes no device, Android Auto, or
AAOS compatibility claim.

## Scope

Only Task 4 implementation/tests and this report are intended for the commit.
No plan, ledger, review-package, WEB, ADMIN, Cloudflare, or R2 files were
edited.
