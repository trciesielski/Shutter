# SHUTTER — plan platformowy

## Etap A: Audio Engine Web V1 (kod obecny)
- Import własnych plików audio przez wybór plików, z lokalnymi URL obiektowymi bez wysyłania na serwer.
- HTMLAudioElement: play, pause, następny, poprzedni, seek, głośność, czas.
- Media Session API: metadane i systemowe klawisze multimedialne tam, gdzie przeglądarka je wspiera.
- Własne utwory widoczne w Bibliotece. Przykładowe pozycje oznaczone jako demonstracyjne.
- Pliki pozostają w pamięci bieżącej sesji strony; odświeżenie powoduje utratę importowanej listy.
- Format FLAC/M4A/AAC zależy od kodeków dostępnych na urządzeniu/przeglądarce.
- Odtwarzanie w tle zależy od ograniczeń przeglądarki mobilnej; nie jest gwarantowane.

## Etap B: desktop
- Wariant instalowalny Windows i macOS: Tauri 2 jako shell, z buildami tworzonymi osobno na Windows/macOS.
- Dodać bezpieczny wybór folderu, trwałą bibliotekę lokalną, indeksowanie tagów i grafik.
- Dodać testy signed/notarized macOS, Windows installer i autostart tylko po zgodzie.

## Etap C: Android i iOS
- Shell mobilny oraz bezpieczna biblioteka lokalna/persistowane uprawnienia.
- Natywny audio service, sterowanie lockscreen, foreground playback i audio focus.
- iOS background audio + odpowiednia sesja AVAudioSession.
- Integracje nie są jeszcze zaimplementowane.

## Etap D: samochody
- Android Auto / Android Automotive: natywny Media3 MediaLibraryService, biblioteka i media browse, testy Desktop Head Unit.
- Apple CarPlay: natywny szablon audio w aplikacji uprawnionej do CarPlay, testy na kompatybilnym urządzeniu.
- Nie przenosić niestandardowego szklanego UI wprost na ekran samochodu.

## Testy do wykonania po buildzie
1. Android Chrome: wybór MP3, dotknij pliku, realny dźwięk, pause/resume, seek.
2. Kolejne / poprzednie z listą co najmniej 3 plików.
3. Rozmiar 360px / 430px / tablet / 1366px: brak przewijania w poziomie.
4. Format WAV i plik nieobsługiwany: prawdziwy status błędu.
5. Aktualny czas oraz długość z metadanych audio.
6. Przełączanie demo/lokalny i uwolnienie źródła audio.
7. Odtwarzanie po wygaszeniu ekranu — rozróżnić zachowanie webowe od natywnego.

## Stan
Nie zaliczać testów bez realnego urządzenia lub logów CI. GitHub Pages buduje tylko statyczne UI.
