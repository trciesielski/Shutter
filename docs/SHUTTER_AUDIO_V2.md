# Shutter Audio V2 — implementation status

Updated: 2026-10-25

## Added in source
1. Audio stabilization: dual-deck audio lifecycle, media-session controls, restore track/position, safe removal, HTML Audio fallback when Web Audio is unavailable.
2. Local ID3v2 and FLAC Vorbis tags: TITLE, ARTIST, ALBUM; embedded artwork (ID3 APIC / FLAC PICTURE). Browser codec support still varies.
3. Playback queue: shuffle, repeat off/all/one, Play Next, reorder controls, playlist navigation.
4. Expanded Shutter Glass: retained accepted player styling, added queue and playback modes inside expanded view.
5. EQ PRO 2.0: A/B bypass, automatic preamp headroom reduction, 10-band existing DSP.
6. Equal-power overlapping crossfade: two audio elements into one Web Audio filter chain; adjustable 0–12 s; preloading of upcoming track. **Zero-second preloaded transitions are best effort, not guaranteed sample-accurate gapless** in browsers.
7. Listening history: local timestamps and most-played counts; clear history command.

## Browser limitations
- Stored music remains in the current origin's IndexedDB; clearing site data removes it.
- Some codecs (especially FLAC, M4A) depend on browser support.
- HTML Audio fallback lacks DSP/crossfade on browsers that cannot create Web Audio graphs.
- No automatic remote sync or cloud upload.
- Embedded cover art parsing supports common tags, not every ID3 version, malformed tag or external art.
- Metadata extraction has a 12 MB tag scanning limit per file.
- Auto-crossfade depends on decoder readiness, hardware and background throttling.
- No guarantee of true sample-perfect gapless playback; requires native engine or dedicated decoding.

## Testing and release gate
GitHub Actions workflow runs `npm test` then `npm run build` before the Pages deployment.
Unit tests cover queue advance/repeat/shuffle, reorder, metadata fallback/ID3, listening history count and equal-power curves.

**Important:** Commit presence does not prove GitHub Actions PASS. Build/run result and mobile listening QA must be checked in:
https://github.com/trciesielski/Shutter/actions/workflows/pages.yml

Manual smoke:
1. Import valid MP3 and FLAC, verify labels, tags, artwork and audio.
2. Reload PWA, verify library and last-played position.
3. Verify shuffle/repeat and next/previous at both ends of queue.
4. Move tracks up/down and use Play Next.
5. Open/close Glass queue, check mobile height and fixed transport.
6. EQ boost/preamp/protection/A-B while playing.
7. Play two tracks with 0 s, 4 s and 12 s transitions, listen for glitches.
8. Play/pause from Android media notification and locked screen.
9. Verify history, play counts and clear operation.
10. Remove a nonplaying track while another plays.

## Not part of this deployment
Native Android/iOS/Windows/macOS installers, Android Auto and Apple CarPlay.
