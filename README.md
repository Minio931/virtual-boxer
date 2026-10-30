# Virtual Boxer — faza 0: spike'i

Trening bokserski w przeglądarce. Telefon jest kamerą, a komputer podłączony do TV liczy pozę i ciosy.
Ten etap ma jeden cel: **sprawdzić na Twoim sprzęcie i Twoich ciosach, czy detekcja z jednej kamery jest wystarczająco dobra**, zanim zbudujemy przeciwnika 3D.

Co już działa:

- parowanie telefonu kodem QR i obraz z kamery przez WebRTC (P2P w sieci domowej),
- MediaPipe Pose Landmarker (lite / full / heavy) i szkielet na obrazie,
- licznik ciosów lewa/prawa i typ: jab, cross, sierpowy, podbródkowy, głowa/korpus,
- garda (% czasu), slipy L/P, schylenia,
- pomiar wydajności: FPS detekcji, czas modelu, opóźnienie kamera → wynik, RTT telefon ↔ ekran, zegar do testu „szkło–szkło”,
- nagrywanie sesji do JSON i ocena offline (`npm run eval`),
- tryb demo (`?demo`): syntetyczna sylwetka zamiast modelu, żeby obejrzeć interfejs bez kamery.

## Co potrzebujesz

| Co | Uwagi |
| --- | --- |
| Komputer z Chrome lub Edge | Laptop/PC przy TV (HDMI) albo zwykły monitor. Karta graficzna nie musi być mocna, model działa na GPU przez WebGL. |
| Telefon | Android z Chrome albo iPhone z Safari (iOS 17+). Tylna kamera, 720p, najlepiej 60 kl./s. |
| Uchwyt lub statyw na telefon | Wysokość 1,2–1,5 m, pod ekranem. |
| Ta sama sieć Wi-Fi | Najlepiej 5 GHz. Sieci gościnne i hotelowe często izolują urządzenia — wtedy połączenie P2P się nie zestawi. |
| 2–3 m wolnego miejsca i dobre światło | Światło z przodu lub z boku, bez okna za plecami. |
| Node.js 20+ (polecam 22 LTS) | https://nodejs.org |

Na tym etapie nie potrzebujesz żadnych kont ani serwerów w chmurze.

## Uruchomienie

```bash
npm install          # instaluje zależności i kopiuje pliki WASM MediaPipe do public/
npm run dev          # aplikacja (https://…:5173) + serwer sygnalizacyjny (port 8787)
```

1. Na komputerze otwórz **https://localhost:5173**. Przeglądarka ostrzeże o certyfikacie (to lokalny certyfikat deweloperski) — wybierz „Zaawansowane → Przejdź do strony”.
2. Na telefonie zeskanuj kod QR z ekranu. Telefon też pokaże ostrzeżenie o certyfikacie — zaakceptuj je tak samo.
3. Na telefonie naciśnij **Uruchom kamerę**. Po chwili obraz pojawi się na komputerze.
4. Stań w gardzie na sekundę (kalibracja pozycji głowy) i zacznij boksować.

Bez telefonu: na ekranie parowania wybierz **Użyj kamery tego komputera**.
Bez kamery i bez modelu: otwórz **https://localhost:5173/?demo** i wybierz kamerę komputera — sylwetka demo w pętli robi 1-2, sierpowy, podbródkowy i slip.

Model pozy wczytuje się z serwerów Google przy pierwszym uruchomieniu. Żeby działać offline: `npm run models` (pobiera modele do `public/models`).

### Gdy coś nie działa

| Objaw | Co zrobić |
| --- | --- |
| Telefon nie otwiera strony z QR | Sprawdź, czy jest w tej samej sieci. Na Windows zezwól Node.js na dostęp w sieci prywatnej (zapora) dla portu 5173. |
| „Kamera działa tylko na stronie https” | Otwórz dokładnie adres z kodu QR (https). Zwykłe http nie da dostępu do kamery. |
| Kod QR pokazuje zły adres | Na ekranie parowania wybierz właściwy adres komputera z listy (np. 192.168.x.x zamiast adresu VPN/Dockera). |
| Obraz dochodzi, ale „Nie widzę sylwetki” | Odsuń się, popraw światło, sprawdź kadr od kolan w górę. |
| Lewa i prawa ręka są zamienione | Przycisk **Zamień lewa/prawa**. |
| Niski FPS detekcji (< 24) | Przełącz na **Model lite**. Zamknij inne karty. |

## Spike'i — od tego zacznij

Faza 0 to trzy pomiary. Ich wyniki decydują, czy idziemy dalej z obecnym podejściem.

### S1. Opóźnienie (1 wieczór)

1. Połącz telefon, włącz **Test opóźnienia** (lustro wyłączy się samo).
2. Skieruj telefon na ekran tak, żeby w podglądzie było widać zegar.
3. Zrób zrzut ekranu (Win+Shift+S / Cmd+Shift+4). Różnica między zegarem na żywo a zegarem widocznym w podglądzie to opóźnienie „szkło–szkło”.
4. Powtórz 5 razy, weź medianę. Zrób to też na TV (z włączonym trybem gry w TV).
5. Zanotuj z panelu „Wydajność”: FPS detekcji, czas modelu, kamera → wynik, RTT.

**Cel:** szkło–szkło ≤ 200 ms w sieci domowej.

### S2. Dokładność detekcji (2–3 wieczory)

Nagrywaj panelem **Nagranie testowe**. Każdy plik to jeden protokół i deklarowana liczba powtórzeń, więc nagranie samo niesie etykietę.

1. Dla każdego typu (jab, cross, sierpowy L/P, podbródkowy L/P) zrób **20 powtórzeń** w spokojnym tempie, potem 20 w szybkim.
2. Powtórz wszystko w dwóch ustawieniach kamery: **na wprost** i **20–30° z boku** (wybierz to w polu „Kamera”).
3. Dograj 3 nagrania kombinacji (np. 1-2, 1-2-3, 1-2-slip-2) i po jednym ze slipami i schyleniami.
4. Pliki JSON zapisują się w Pobranych. Przenieś je do folderu `nagrania/` w projekcie i uruchom:

```bash
npm run eval -- nagrania/*.json
```

Skrypt przepuszcza nagranie przez **aktualny** kod detektora, więc po każdej zmianie progów od razu widzisz efekt. Progi są w `src/core/detect/motionAnalyzer.ts` (`DEFAULT_CONFIG`), wygładzanie w `src/core/pose/oneEuro.ts`. Najpierw upewnij się, że detekcja ma 25+ kl./s (`eval` ostrzega przy < 15).

**Cele (go/no-go):**

| Metryka | Próg |
| --- | --- |
| Wykrywalność ciosów (bez typu) | ≥ 95% |
| Ciosy nadmiarowe (fałszywe) | < 5% |
| Poprawny typ (4 typy) | ≥ 80% przy kamerze na wprost lub ≥ 85% z boku |

Jeśli typ ciosu wypada słabo, a samo liczenie jest dobre, MVP i tak ma sens (licznik L/P + gra obronna), a typy poprawimy klasyfikatorem uczonym na Twoich nagraniach.

### S3. FPS na telefonie (opcjonalnie, 1 wieczór)

Sprawdza, czy kiedyś da się liczyć pozę na samym telefonie (bez komputera). Otwórz na telefonie MediaPipe Studio (Pose Landmarker) i zanotuj FPS dla lite i full. Poniżej ~24 kl./s zostajemy przy liczeniu na komputerze.

## Co dalej (po fazie 0)

1. **Faza 1 — MVP treningu:** rundy i timer (3 × 3 min), kalibracja prowadzona krok po kroku z animacjami pokazowymi (zobacz → powtórz, ~50 s, profil per miejsce; szczegóły w `CLAUDE.md`), szybka kontrola gardy przy każdym starcie, podsumowanie sesji, start rundy gestem (obie ręce w górę na 2 s), zapis historii lokalnie.
2. **Faza 2 — obrona i reaktywny cel:** prosty przeciwnik w React Three Fiber z telegrafowanymi atakami, rozstrzyganie trafień w chwili przechwycenia klatki (kompensacja opóźnienia), tryb „combo caller”, który przy okazji zbiera etykietowane dane.
3. **Faza 3 — awatar przeciwnika:** postać glTF (Mixamo / Character Creator), warstwy animacji, AI z poziomami trudności.
4. **Faza 4 — minigry, statystyki, konta:** „Czytaj barki” (okluzja), Footwork Grid, Reflex Ball, Ghost Duel, Supabase, ligi.
5. **Faza 5 — dopracowanie:** design system, onboarding ustawienia kamery, PWA, własny serwer sygnalizacyjny + TURN w Dockerze.

Makiety wszystkich ekranów są w projekcie Claude Design („Aplikacja bokserska — ekrany”).

## Struktura

```
server/signaling.mjs      serwer sygnalizacyjny (pokoje, przekazywanie SDP/ICE, /api/lan)
src/core/link/            WebRTC: ekran (displayLink), telefon (camLink), synchronizacja zegarów
src/core/pose/            MediaPipe, filtr One Euro, punkty pozy, tryb demo
src/core/detect/          analiza ruchu: ciosy, garda, slipy, schylenia (+ testy na syntetycznych ruchach)
src/core/engine/          pętla treningowa poza Reactem (klatka → poza → zdarzenia → statystyki)
src/core/session/         nagrywanie do JSON
src/core/stats/           agregacja statystyk sesji
src/routes/               / (ekran) i /cam (telefon)
src/ui/                   panele, szkielet na canvasie, komponenty
scripts/evaluate.ts       ocena nagrań offline
```

Zasada architektury: kod w `src/core` nie zależy od Reacta. React tylko wyświetla migawki stanu (~10 razy na sekundę), a szkielet rysuje się bezpośrednio na canvasie. Dzięki temu detektor da się testować w Node i przenieść później do innego frontu.

## Polecenia

| Polecenie | Co robi |
| --- | --- |
| `npm run dev` | aplikacja + serwer sygnalizacyjny |
| `npm test` | testy jednostkowe (detektor, filtr, zegar) |
| `npm run typecheck` | TypeScript |
| `npm run build` | build produkcyjny do `dist/` |
| `npm run eval -- pliki.json` | ocena nagrań na aktualnych progach (`--recorded-config` = progi z chwili nagrania, `--rules` = typ z reguł zamiast modelu, `--no-filter` = bez filtra „cios czy szum”) |
| `npm run train -- nagrania/r2/*.json nagrania/r3/*.json` | uczy klasyfikator typu ciosu i filtr „cios czy szum” na nagraniach i zapisuje `src/core/detect/punchModel.ts` (`--dry-run` = tylko ocena) |
| `npm run models` | pobranie modeli pozy do `public/models` |
| `npx tsx scripts/features.ts nagrania/*.json > cechy.csv` | cechy 2D/3D każdego wykrytego ciosu (do dobierania reguł) |

## Ograniczenia, o których warto pamiętać

- Jedna kamera słabo widzi ruch w głąb (jab i cross lecą do kamery). Dlatego typ prostego rozpoznajemy po kącie łokcia, a nie po głębokości. Kamera lekko z boku pomaga.
- Prędkość ciosu w m/s to szacunek z modelu, nie pomiar.
- Progi detektora są dobrane na syntetycznych ruchach z szumem i trzeba je dostroić na prawdziwych nagraniach (S2).
- Nagrania zawierają tylko punkty szkieletu, nie obraz. To nadal dane o ciele — nie udostępniaj ich bez zgody osoby nagrywanej.
