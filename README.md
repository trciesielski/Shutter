# Shutter

Responsive music player UI prototype (visual-first).

## Run

1. Install Node.js 20+.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

## Scope

- Responsive music dashboard, library, playlists and player
- Automatic light/dark theme with manual override
- Car-style **visual preview only** (`Car Preview` tab)
- Mock music library and playback controls for layout testing

**Not yet implemented:** audio engine, real media library, account sync, macOS desktop packaging, Android app, Android Auto integration. Android Auto requires a separate compliant native media integration (Android Media3 / MediaLibraryService and platform-controlled car templates); a responsive web view does not itself provide Android Auto compatibility.

## Next steps

Lock visual design, then add shared data/player architecture and Android and desktop shells. Test Android Auto using Desktop Head Unit and automotive emulator before claiming compatibility.
