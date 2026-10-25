# Shutter — stan wdrożenia (2026-10-25)

## Działa w kodzie przeglądarkowym
- Interfejs React/Vite, Shutter Glass, motywy, responsive
- Realny HTML audio: play/pause, next/prev, seek, volume
- Import lokalnych plików
- Trwałe zapisywanie plików w IndexedDB w tej samej przeglądarce
- Usuwanie plików z IndexedDB
- Lokalne playlisty w localStorage, przypisywanie utworów
- Media Session API na kompatybilnych przeglądarkach
- PWA: manifest, service worker, podstawowy offline shell
- Przykładowa biblioteka demo bez dźwięku jest wyraźnie odróżniona

## Do testów / ograniczenia
- Potwierdzić build GitHub Actions najnowszego commita, działanie Android Chrome i iPad Safari
- Wyczyścić storage/site data oznacza utratę biblioteki i playlist
- Quota IndexedDB zależy od urządzenia; brak importu katalogów i synchronizacji między urządzeniami
- Format audio zależy od kodeków przeglądarki
- PWA na Androidzie nie gwarantuje stabilnego odtwarzania przy zablokowanym ekranie
- PWA to nie podpisane APK/EXE/DMG/IPA
- Android Auto i CarPlay nie są zaimplementowane i wymagają dedykowanych natywnych usług multimedialnych i weryfikacji

## Natywne etapy pozostające do wykonania
1. Testy i naprawy biblioteki i audio, testy integracyjne
2. Opakowanie Tauri 2 i instalatory Windows/macOS
3. Natywny audio service Android (Media3) wraz z Android Auto
4. iOS/iPadOS AVAudioSession oraz integracja CarPlay w zatwierdzonej kategorii audio
5. Podpisywanie, instalacja, testy na urządzeniach i dystrybucja

## Linki
- CI: https://github.com/trciesielski/Shutter/actions/workflows/pages.yml
- Web: https://trciesielski.github.io/Shutter/
- Commity: https://github.com/trciesielski/Shutter/commits/main/
