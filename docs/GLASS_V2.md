# Shutter Glass V2 — zakres i weryfikacja

## Wdrożone (web)
- Jeden komponent `PlayerGlass` w `src/glass/PlayerGlass.jsx`.
- Jeden arkusz `src/glass/player-glass.css`, bez kaskady poprzednich wersji Glass 01–10.
- Duży okrągły Play (fioletowy), okrągłe poprzedni/następny.
- Elastyczny układ mobilny; tytuł utworu nad sterowaniem w wąskim widoku.
- Niewielkie rozmycie zawartości DOM za panelem (`backdrop-filter`), transparentna powierzchnia bez obrysów.
- Subtelne podświetlenie pod wskaźnikiem; reakcja na dotyk.
- Fallback przy ograniczonej przezroczystości i ograniczenie ruchu.
- Oddzielny prototyp refrakcji WebGL pozostaje w zakładce Glass Engine.

## Ważne ograniczenia
Panel nad **rzeczywistym DOM** wykorzystuje stabilną wersję rozmycia i transparentności. WebGL V1 renderuje refrakcję we własnej scenie, a nie pobiera automatycznie pikseli innych elementów HTML. Nie należy opisywać V2 jako pełnej refrakcji tła DOM ani 1:1 Apple Liquid Glass.

Dla prawdziwej refrakcji pod odtwarzaczem w pełni przenośnym rozwiązaniu potrzebna jest wspólna scena renderowana przez GPU (wraz z obiektami tła) albo implementacje natywne korzystające z mechanizmów danej platformy. Zrzuty DOM do GPU na każdą klatkę są kosztowne i nie nadają się jako domyślny tryb mobilny.

## Test ręczny po publikacji
1. Otwórz `https://trciesielski.github.io/Shutter/` po zielonym deploy.
2. Zweryfikuj okrągły fioletowy Play na ekranie ~360–430 CSS px.
3. Sprawdź, że panel mieści się poziomo przy przewijaniu strony i nie zakrywa treści końcowych.
4. Przewiń karty pod przezroczysty panel: powinno być delikatne rozmycie, bez mocnych mlecznych krawędzi.
5. Sprawdź tryb jasny/ciemny, dotyk i blokadę animacji przy `prefers-reduced-motion`.
6. Sprawdź zakładkę Glass Engine: WebGL może być niedostępny na niektórych urządzeniach.

## Dalsze platformy
- Android: docelowy pakiet natywny i Media3 / Android Auto.
- Windows/macOS: opakowanie desktopowe po stabilizacji playera.
- iOS/iPadOS: osobny pakiet; natywny Liquid Glass tylko w natywnych komponentach Apple.
- CarPlay/Android Auto: interfejs systemowy zgodny z regułami kategorii media.

Brak potwierdzonego testu Chrome Android / iPhone Safari / WebView Windows w tym commicie; workflow Github Pages weryfikuje budowę i deploy.
