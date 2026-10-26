# Kompaktowa karta utworu — design

## Intencja

W istniejących listach utworów pokazać kwadratową miniaturę po lewej i po prawej trzy zwarte rzędy: tytuł z ellipsis, wykonawcę oraz akcje serca, oceny góra/dół i udostępniania. Karta ma zachować wysokość bieżącego wiersza, wygląd Shutter Glass, responsywność mobilną i niezależny dolny odtwarzacz.

## Zakres

- Serce korzysta z istniejącego `playlists.ensureFavorite` / `playlists.isFavorite`.
- Ocena utworu jest pojedyncza (`up`, `down` albo brak) i trwała w `localStorage` pod osobnym kluczem.
- Udostępnianie używa `navigator.share` bez dołączania lokalnego URL-u; gdy systemowe share nie jest dostępne, kopiuje tylko zweryfikowany publiczny URL `http(s)` z metadanych utworu.
- Brak publicznego URL-u dla pliku lokalnego kończy się czytelnym komunikatem w karcie.
- Dotychczasowe menu playlist/usuwania pozostaje dostępne jako akcja overflow w tym samym trzecim rzędzie.

## Poza zakresem

- Upload plików na serwer, generowanie fałszywych publicznych URL-i i synchronizacja ocen między urządzeniami.
- Zmiany w `PlayerGlass`, logice kolejki lub wysokości dolnego odtwarzacza.

## Podejścia

1. Rozszerzyć istniejący `LibraryTrack` i dodać dwa małe moduły pomocnicze — wybrane, bo zachowuje obecne punkty użycia oraz minimalizuje ryzyko regresji.
2. Przebudować wszystkie listy na nowy wspólny komponent interakcji — odrzucone, bo wymagałoby niepotrzebnego refaktoru playlist i kolejki.
3. Przenieść interakcje do backendu — odrzucone, bo aplikacja obecnie działa na lokalnych plikach i nie ma warstwy konta/serwera.

## Kryteria akceptacji

- Tytuł i wykonawca są obcinane bez rozszerzania wiersza.
- Serce od razu odzwierciedla i zapisuje istniejący stan Ulubionych.
- Oceny odtwarzają się po ponownym załadowaniu i wzajemnie się wykluczają.
- Udostępnienie lokalnego pliku nigdy nie przekazuje jego `blob:`/lokalnego URL-u.
- Testy i build przechodzą.
