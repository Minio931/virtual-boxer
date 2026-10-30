# Virtual Boxer — kontekst dla Claude Code

Ten plik przenosi kontekst z rozmów w Claude (claude.ai), w których powstały założenia, research, makiety i faza 0 kodu.
Odpowiadaj po polsku, zwięźle i konkretnie. Użytkownik (Dominik) to frontend developer (3 lata, Vue + TS, Pinia, Tailwind),
uczy się Reacta w tym projekcie i chce rozwijać się w stronę fullstack/DevOps — tłumacz decyzje architektoniczne, nie tylko je wykonuj.

## Produkt w jednym akapicie

Webowa aplikacja do treningu boksu w domu. Telefon jest tylko kamerą (WebRTC → komputer). Aplikacja działa w przeglądarce
na komputerze podpiętym do TV/monitora. Wykrywa pozę (MediaPipe), liczy ciosy (lewa/prawa, jab/cross/sierpowy/podbródkowy,
głowa/korpus), gardę, slipy i schylenia. Docelowo: przeciwnik 3D reagujący na ciosy, tryby treningu shadow boxingu
(combo z trenerem, drill reakcji), minigry, statystyki, grywalizacja. Kolor przewodni: czerwień (#E5262B), ciemny UI, czytelny z 2–3 m.

## Kluczowe decyzje (nie zmieniaj bez rozmowy)

- **Telefon = kamera, inferencja na komputerze.** Wideo WebRTC P2P → PC → MediaPipe. Inferencja w mobilnej przeglądarce jest za wolna
  (~8–9 kl./s w pomiarze na Pixelu). Tryb „keypointy z telefonu” to ewentualnie później, jako natywna aplikacja-kamera.
- **Stack:** Vite + React 19 + TypeScript, Zustand, Tailwind v4, React Router. Później: React Three Fiber + drei (przeciwnik 3D),
  Supabase (dane/konta), własny serwer sygnalizacyjny + coturn w Dockerze (ścieżka DevOps). Bez Next.js (SSR niepotrzebny).
- **Rdzeń poza Reactem.** `src/core/**` nie importuje Reacta. Pętla klatek, detektor, FSM i (w przyszłości) AI przeciwnika to czyste klasy TS.
  React dostaje migawki stanu ~10×/s; szkielet rysowany bezpośrednio na canvasie. Nie używaj `setState` 60×/s.
- **Czas = czas przechwycenia klatki** (`requestVideoFrameCallback` → `captureTime`). Całe opóźnienie systemu to ~120–250 ms,
  więc zdarzenia gry (trafienie/unik) rozstrzygamy w chwili przechwycenia klatki, nie przetworzenia. Okna reakcji projektujemy na 300–600 ms.
- **Jedna kamera słabo widzi oś głębi.** Jab/cross lecą do kamery → typ prostego rozpoznajemy po kącie łokcia, nie po Z.
  Kamera 20–30° z boku pomaga. Prędkość w m/s to szacunek.
- **HTTPS w dev jest konieczne** (kamera w telefonie wymaga secure context): `@vitejs/plugin-basic-ssl`, Vite proxy `/ws` i `/api` → serwer sygnalizacyjny :8787.

## Środowisko użytkownika

- Windows 11, projekt uruchamiany natywnie na Windows w `D:\Projects\virtual-boxer` (PowerShell/terminal Windows, Node na Windows).
  Adres komputera w LAN: `192.168.0.155`. Na komputerze są też interfejsy Dockera/WSL `172.x` — `/api/lan` sortuje adresy `192.168.*` na początek.
  Przy pierwszym `npm run dev` zapora Windows pyta o dostęp Node.js — musi być dozwolony dla sieci prywatnych, inaczej telefon nie połączy się z :5173.
- Wcześniej była kopia w WSL (`~/Projects/virtual-boxer`, tryb mirrored) — jest nieaktualna, pracujemy na wersji z `D:\Projects`.
- Przeglądarka: Chrome na Windows (`https://localhost:5173`), telefon w tej samej sieci Wi-Fi skanuje QR.
- `npm run dev` uruchamia Vite + serwer sygnalizacyjny (concurrently).

## Mapa kodu

```
server/signaling.mjs        pokoje (6 znaków), relay SDP/ICE, heartbeat, rate limit, /api/lan, /api/health
src/core/link/              displayLink (ekran), camLink (telefon), clock (sync NTP po DataChannel), rtc (tuning nadawcy/odbiorcy)
src/core/pose/              poseEngine (MediaPipe tasks-vision, GPU→CPU fallback, lokalny model z public/models), oneEuro, landmarks, demoSource (?demo)
src/core/detect/            motionAnalyzer (ciosy, garda, slipy, schylenia), synthetic (generator ruchów do testów), testy
src/core/engine/            trainingEngine: rVFC → detect → wygładzanie → analiza → statystyki → nagrywanie → rysowanie
src/core/session/recorder   nagrania JSON (surowe 33×[x,y,z,v] image + world, protokół, deklarowana liczba powtórzeń)
src/core/stats/             agregacja statystyk sesji
src/routes/                 DisplayPage (/), CamPage (/cam)
src/ui/                     panele (Stats, Controls, Record, Perf), PairingPanel, overlay (szkielet), EventFlash, LatencyClock
scripts/evaluate.ts         `npm run eval -- nagrania/*.json` — ocena nagrań aktualnym kodem detektora
```

## Detektor — jak działa i czego się nauczyliśmy

- Układ ciała z world landmarks: x = w stronę lewego barku, up = tułów, fwd = do kamery (MediaPipe: z mniejsze = bliżej kamery).
- Na rękę maszyna stanów `idle → active → retract`. Start: prędkość nadgarstka względem barków > `startSpeed` **i** ruch „na zewnątrz”
  (oddalanie od nosa LUB do przodu LUB w górę). Koniec: spadek prędkości < `endRatio`×szczyt albo wyraźne zawrócenie (cos < −0,3).
- **Prędkość liczona w oknie `velWindowMs` (30 ms), nie z sąsiednich klatek** — różnica klatek przy 60 kl./s wzmacniała szum i psuła detekcję.
- **Wygładzanie detekcji: One Euro `{minCutoff: 3, beta: 3, dCutoff: 4}`.** Pierwsza wersja `{2, 1, 1}` gubiła sierpowe i myliła podbródkowe
  z prostymi, bo niska `dCutoff` opóźniała reakcję filtra na start ciosu. Dobrane siatką parametrów na syntetycznych ciosach.
- **Typ ciosu i filtr opuszczenia ręki działają na geometrii 2D z obrazu** (współrzędne × proporcje obrazu, w szerokościach barków).
  Kąt łokcia i ruch z world landmarks okazały się przy jednej kamerze bezużyteczne do odróżniania typów (kąty 117–145° dla wszystkich typów).
  Reguły dobrane na prawdziwych nagraniach z 27.10:
  - podbródkowy: nadgarstek na starcie > 0,45 szer. barków **pod** barkiem i łokieć na końcu nie wyżej niż 0,2 nad barkiem,
  - sierpowy: łokieć na końcu > 0,2 nad barkiem i ręka zgięta w obrazie (< 130°),
  - reszta: prosty (jab ręka prowadząca, cross tylna).
- **Kamera u Dominika patrzy lekko z dołu** → prosty cios „idzie w górę” w obrazie (o 0,7–1,3 szer. barków). Stara reguła „ruch w górę = podbródkowy” myliła jaby z podbródkowymi.
- Opuszczenie ręki (zamach przed sierpowym/podbródkowym) jest odrzucane w 2D (nadgarstek zjeżdża w dół i kończy pod barkiem) i **nie** uruchamia
  przerwy — inaczej właściwy cios zaraz po zamachu był gubiony.
- `minAmplitude2d`: ruch nadgarstka **względem barku** w obrazie ≥ 0,12 szer. barków — odcina „ciosy” drugiej ręki widoczne tylko w zaszumionej głębi
  i ruch całego ciała.
- Obrona: wychylenia głowy (nos względem środka bioder, 2D) od powoli dopasowującej się pozycji wyjściowej; skala = szerokość barków z pozycji
  wyjściowej (bieżąca spada nawet o połowę przy obrocie tułowia w slipie). Na końcu wychylenia: obniżenie ≥ `duckThreshold` → schylenie, inaczej
  ruch w bok ≥ `slipThreshold` → slip. Wyciszane, gdy w ciągu 300 ms przed wychyleniem padł cios.
- `scripts/features.ts` (`npx tsx scripts/features.ts nagrania/*.json > cechy.csv`) wyciąga cechy 2D/3D każdego wykrytego ciosu — tak dobierano reguły.

### Wyniki na nagraniach z 27.10 (druga sesja, ~30 kl./s, model full na GPU, kamera na wprost, telefon pionowo)

| Nagranie | Wykrywalność | Poprawny typ |
| --- | --- | --- |
| jab | 100% (+4 nadmiarowe) | 92% |
| cross | 95% | 95% |
| sierpowy prowadzącą | 100% (+2) | 82% |
| sierpowy tylną | **75%** | 73% |
| podbródkowy prowadzącą | 95% | 89% |
| podbródkowy tylną | 100% | **65%** (część jako cross) |
| **ciosy razem** | **94%** (cel 95%) | **83%** (cel 80%) |
| slipy | 60% | — |
| schylenia | **25%** | — |

Uwaga: to jedna osoba, jedna sesja, jedno ustawienie kamery — ryzyko dopasowania do tych danych. Potrzebne nagrania z kamerą z boku i w innym dniu.

### Wyniki na nagraniach z 28.10 (`nagrania/r3`, kamera ~25–30° z boku, 10 powtórzeń, 20–24 kl./s)

W nazwach plików jest „front”, bo w panelu zostało „Na wprost”, ale **wszystkie r3 są z boku**.
Ciosy razem: wykrywalność 56/60 (93%), nadmiarowe 11 (18%), **poprawny typ 49%** (na wprost było 83%).
- cross 6/10 wykrytych: tylna ręka częściowo zasłonięta tułowiem,
- nadmiarowe głównie z ręki dalszej od kamery (w nagraniu jaba 5 fałszywych crossów): drgania zasłoniętej ręki,
- sierpowy tylną ręką → podbródkowy (7/12): z boku łokieć w obrazie nie jest „nad barkiem” (elbowUp2Far 0,07 vs 0,47 na wprost),
- jab z boku to ruch poziomy (dx2 −0,89, dy2 0,22), łokieć prawie prosty (169°), czyli inaczej niż na wprost.
**Wniosek:** reguły 2D są dopasowane do kamery na wprost i lekko z dołu; nie przenoszą się na inny kąt. Ręczne strojenie pod każdy kąt to droga donikąd.
**Klasyfikator typu ciosu (28.10, zrobione):** regresja logistyczna (softmax, 3 klasy: prosty / sierpowy / podbródkowy; jab vs cross z ręki)
na 30 cechach toru ręki (`src/core/detect/punchFeatures.ts`: 3D w układzie ciała, 2D z obrazu, krzywizna toru, wysokość łokcia; lustrzane względem ręki).
Uczenie: `npm run train -- nagrania/r2/*.json nagrania/r3/*.json` → `punchModel.ts`. Domyślnie `typeClassifier: 'model'`, reguły zostają jako zapas (`--rules` w eval).
Wyniki na 161 ciosach ręki z protokołu (bez fałszywych wykryć drugiej ręki):

| | reguły 2D | klasyfikator |
| --- | --- | --- |
| sesja r2 (na wprost), walidacja krzyżowa | 88% | 91% |
| sesja r3 (z boku), walidacja krzyżowa | 67% | 82% |
| **uczony tylko na r2 → test na r3 (nowy kąt, nowy dzień)** | 67% | **82%** |
| uczony tylko na r3 (49 ciosów) → test na r2 | — | 64% (za mało danych) |

Najważniejsze cechy: wysokość łokcia względem nadgarstka (sierpowy), łokieć nisko (podbródkowy), długość ruchu w obrazie i wyprost łokcia (prosty).
W `npm run eval` typ liczy też fałszywe ciosy drugiej ręki jako błąd: r2 93%, r3 69% (model widział te dane, więc to wynik zawyżony; uczciwe są liczby z tabeli).
**Filtr „cios czy szum” (29.10, zrobione):** druga regresja logistyczna (`PUNCH_VALID_MODEL`) na 30 cechach toru + 6 cechach kontekstu
(`contextFeatures`: widoczność ręki, różnica widoczności względem drugiej ręki, odstęp i proporcje ruchu drugiej ręki). Odrzuca ruchy z p < `validThreshold` (0,15).
Skąd fałszywe ciosy: (a) ręka zasłonięta tułowiem przy kamerze z boku — MediaPipe „przykleja” jej nadgarstek do widocznej rękawicy, więc „rusza się” razem
z jabem (stąd fałszywe crossy), (b) ręka pociągnięta obrotem tułowia albo unikiem. Proste reguły czasowe usuwały ≤ 40% z nich, model ~76%.
Walidacja „zostaw jedną sesję”: r2 usunięte 9/12 fałszywych, utracone 2/112 prawdziwych; r3 usunięte 23/30, utracone 1/49.

**Poprawka oceny (29.10):** `npm run eval` liczył ciosy drugiej ręki do wykrywalności, więc wcześniejsze wyniki były zawyżone.
Teraz liczą się tylko ciosy ręki z protokołu, a ciosy drugiej ręki to zawsze „nadmiarowe”. Nowa linia „same ciosy” pomija slipy i schylenia.
Flagi: `--rules` (typ z reguł), `--no-filter` (bez filtra). Uczciwe wyniki (modele widziały te dane, więc lekko zawyżone):

| | stary detektor (reguły, bez filtra) | klasyfikator + filtr |
| --- | --- | --- |
| r2 na wprost: wykrywalność / nadmiarowe / typ | 91% / 8% / 83% | 89% / 4% / 97% |
| r3 z boku: wykrywalność / nadmiarowe / typ | 82% / 30% / 49% | 78% / 7% / 88% |

**Sesja r4 (30.10, na wprost, szybkie tempo, 15 powtórzeń, ~25 kl./s) — test na danych, których model nie widział:**
model uczony na r2+r3 → typ **93%** (reguły 69%), nadmiarowe 6% (stary detektor 10%), wykrywalność 87%.
Po douczeniu na r2+r3+r4 („zostaw jedną sesję”): typ r2 94%, r3 84%, r4 96%. Filtr przy teście na r3 (z boku) słabszy: 57% fałszywych usuniętych —
fałszywe ciosy z boku wyglądają inaczej niż na wprost, więcej sesji z boku by pomogło.
Nagrania `free` (83 s bez ciosów: 1 fałszywy cios, ale 4 slipy i 3 schylenia) i `mixed` (141 s kombinacji, 95 ciosów) — czekają na potwierdzenie, co dokładnie było robione.

**Następny problem: wykrywalność** (cel 95%). Najsłabsze: cross z boku 5/10 (tylna ręka startuje zza tułowia), sierpowy tylną ręką na wprost 14/20.
Każda nowa sesja nagrań → dorzucić do `npm run train`. Dalej też: więcej sesji z różnych kątów i od innych osób, kąt kamery z kalibracji jako cecha.

## Aktualne zadanie: strojenie na prawdziwych nagraniach (spike S2)

Dominik widzi, że **jaby nie są dobrze rozpoznawane**.

Nagrania: `nagrania/` (pierwsza sesja, ~4 kl./s — tylko do diagnozy wydajności) i `nagrania/r2/` (druga sesja, ~30 kl./s — do strojenia).

**Diagnoza pierwszych nagrań (27.10, 6 plików, po 20 powtórzeń, kamera na wprost, telefon pionowo 720×1280):**
detekcja działała z **~4,4 kl./s** (klatka co ~228 ms) na modelu **heavy** → wykrywalność 0–40%. To problem wydajności, nie progów:
cios (130–300 ms) mieścił się w 1–2 klatkach. Sygnał w danych jest — w nagraniu jabów lewa ręka ma 16 szczytów wyprostu na 20 ciosów,
strony L/P są przypisane poprawnie. Najpierw podnieść FPS detekcji do ≥ 25 (model lite/full, sprawdzić GPU vs CPU w panelu Wydajność,
akceleracja sprzętowa w Chrome), dopiero potem stroić progi. `eval` ostrzega teraz przy < 15 kl./s; UI pokazuje baner z przyciskiem zmiany modelu.
Slipy/schylenia są wyciszane w trakcie ciosu i 300 ms po nim (ruch głowy przy crossie/sierpowym dawał fałszywe slipy).

**Następne kroki (w tej kolejności):**
1. Sierpowy tylną ręką: wykrywalność 75% — sprawdzić w `features.ts`, czy gubione ciosy są odrzucane jako opuszczenie ręki albo kończą się za wcześnie.
2. Podbródkowy tylną: 5/20 jako cross — część startuje z wyższej gardy; rozważyć dodatkową cechę (ruch nadgarstka w górę względem łokcia, łokieć pod barkiem).
3. Obrona: slipy wywołują fałszywe „ciosy”, które wyciszają slip; schylenia u Dominika to raczej „bob and weave” (obniżenie + ruch w bok).
   Rozważyć osobne nagrania: czyste schylenia w miejscu vs rolki; ewentualnie klasyfikator uczony zamiast reguł.
4. Nagrania z kamerą 20–30° z boku i powtórka całego zestawu w inny dzień (walidacja, że reguły nie są przeuczone).

Procedura:
1. Nagrania z panelu „Nagranie testowe” (protokół + deklarowana liczba powtórzeń) trafiają do `nagrania/`.
2. `npm run eval -- nagrania/*.json` → wykrywalność, nadmiarowe, poprawny typ, lista pomyłek z kątami łokcia.
3. Zmieniaj `DEFAULT_CONFIG` (motionAnalyzer.ts) / `DETECT_SMOOTHING` (oneEuro.ts), powtarzaj eval. Po zmianach zawsze `npm test`.
4. Jeśli syntetyczne testy blokują sensowną zmianę na realnych danych — prawdziwe nagrania mają pierwszeństwo; zaktualizuj generator/testy i opisz dlaczego.

Typowe przyczyny dla jabów: jab nie liczy się wcale → za wysokie `minPeakSpeed`/`minAmplitude`/`startSpeed` (ruch w osi kamery jest „krótki”);
jab jako sierpowy/podbródkowy → model zaniża wyprost łokcia, obniż `straightElbowDeg`; jab jako cross → postawa lub zamienione strony.

**S1 (28.10, monitor, Wi-Fi, telefon 720p ~29 kl./s, model full):** szkło–szkło 170 / 184 / 210 / 220 / ~300 ms → **mediana ~210 ms**
(cel ≤ 200 ms, odczyt ±20 ms, bo ostatnia cyfra zegara się rozmywa). Wynik graniczny, ale mieści się w budżecie 120–250 ms, na który projektujemy okna reakcji.
Do sprawdzenia: kamera telefonu 60 kl./s, Wi-Fi 5 GHz, pomiar na TV w trybie gry.

**Kryteria go/no-go fazy 0:** wykrywalność ≥ 95%, nadmiarowe < 5%, typ ≥ 80% (kamera na wprost) lub ≥ 85% (z boku), opóźnienie szkło–szkło ≤ 200 ms (S1).
Jeśli typy nie dojdą do progu regułami: zbieramy etykietowane nagrania i trenujemy mały klasyfikator (TCN/GRU na oknie 0,6–1 s punktów, PyTorch → ONNX
→ onnxruntime-web; do pretreningu zbiór BoxingVI). Liczenie L/P i gra obronna mają sens nawet bez typów.

## Kalibracja w aplikacji docelowej (decyzja z 27.10)

Kalibracja jest prowadzona krok po kroku i **każdy ruch ma animację pokazową**: postać demonstruje ruch w pętli (z torem rękawicy),
użytkownik patrzy i powtarza, a obok widzi swoje lustro z kamery, licznik powtórzeń i komentarz. Zasada: najpierw zobacz, potem powtórz.
Ta sama biblioteka animacji posłuży do samouczków i combo callera.

Kroki (~50 s, raz na miejsce i ustawienie kamery; profil zapisany pod nazwą miejsca, np. „Salon · TV”):

| # | Ruch (animacja) | Co mierzymy → co zastępuje |
| --- | --- | --- |
| 0 | ustaw kamerę | kadr, światło, widoczność punktów, FPS ≥ 25 (podpowiedzi: odsuń się, za ciemno, przełącz model) |
| 1 | lewa ręka w górę | strony L/P i postawa orthodox/southpaw → koniec z ręcznym „Zamień strony” |
| 2 | garda 3 s bez ruchu | skala (szerokość barków), pozycja gardy i głowy → baseline obrony, próg opuszczonej gardy |
| 3–4 | 2 × jab, 2 × cross | kąt kamery (jak prosty idzie w obrazie, u Dominika lekko z dołu) i obrót tułowia |
| 5 | pełny wyprost, 1 s | zasięg → dystans przeciwnika 3D |
| 6 | 2 × sierpowy | osobisty próg łokcia (`hookElbowMin2d`) i kąta |
| 7 | 2 × podbródkowy | osobisty start podbródkowego, liczony względem gardy, nie barku (`uppercutStartBelow2d`) |
| 8 | slip L i P po 2 razy | osobista amplituda slipu (`slipThreshold` ≈ 60% amplitudy) |
| 9 | 2 × schylenie | głębokość schylenia osobno od slipu (`duckThreshold`) |

Przy każdym starcie: **szybka kontrola** (garda 3 s). Jeśli skala lub kąt odbiegają od profilu → „Kamera się przesunęła, dokalibruj
(garda, jab, cross, 15 s)”. Inna sylwetka → wybór profilu. Progi z `DEFAULT_CONFIG` zostają jako wartości startowe i zapasowe.
Makiety: strona „Kalibracja” na canvasie Claude Design (CalibSetup, CalibStep, CalibLibrary, CalibResult, QuickCheck, komponent DemoFigure).
Biblioteka ruchów (15): jab, cross, sierpowy, podbródkowy, jab i sierpowy na korpus, slip, roll, schylenie, odchylenie, parowanie, blok
oraz garda, lewa w górę i zasięg (kalibracja). Detektor nie rozpoznaje jeszcze rolla (liczy go jako schylenie lub slip), odchylenia, parowania ani bloku.

Animacje pokazowe, dwa etapy:
1. **Teraz (makieta, gotowe):** manekin 3D w Three.js (`DemoFigure` na canvasie). Klatki kluczowe celów rękawic i tułowia, łokcie i kolana liczone IK
   jak w `synthetic.ts`, widok lustrzany, kamera krąży wokół, smuga toru ruchu, półprzezroczysta rękawica przeciwnika przy ruchach obronnych.
   Do aplikacji da się to przenieść prawie 1:1 jako komponent R3F.
2. **Faza 3 (realistycznie):** postać glTF (Mixamo / Character Creator) z klipami ruchów w R3F, wspólna z przeciwnikiem 3D.
   Mixamo ma gotowe proste, sierpowe, podbródkowe i uniki. Brakujące ruchy (roll, parowanie, blok) nagrać przez mocap z wideo (Rokoko Video / Move.ai)
   albo własnym nagrywaniem: punkty 3D z MediaPipe przeniesione na szkielet postaci i wygładzone.

**Silnik (decyzja z 27.10):** zostajemy przy webie. Unreal odpada. Unity rozważymy dopiero, gdy grafika w R3F okaże się za słaba albo
będziemy chcieli natywną aplikację na TV lub konsolę. Wtedy Unity tylko renderuje, a detekcja z `src/core` wysyła zdarzenia przez prosty protokół.

## Roadmapa

0. **Teraz:** spike'i S1 (opóźnienie), S2 (dokładność), S3 opcjonalnie (FPS na telefonie).
1. MVP treningu: rundy 3×3 min + przerwa, kalibracja z animacjami pokazowymi (sekcja wyżej) i szybka kontrola przy starcie, podsumowanie sesji, start gestem (obie ręce w górę 2 s), historia lokalnie.
2. Obrona + reaktywny cel: prosty przeciwnik w R3F z telegrafowanymi atakami (telegraf ≥ opóźnienie + ~250 ms reakcji), rozstrzyganie w czasie
   przechwycenia klatki, tryb combo caller (zbiera też etykietowane dane do ML).
3. Awatar przeciwnika: glTF (Mixamo/Character Creator; Ready Player Me zamknięte 31.01.2026), warstwy animacji, FSM + AI z trudnością.
   Ta sama postać zastępuje manekina w animacjach pokazowych kalibracji i samouczków (klipy Mixamo + mocap brakujących ruchów).
   Detektor: dodać roll, odchylenie, parowanie i blok.
4. Minigry i progresja: „Czytaj barki” (okluzja −250/−150/−50 ms — najsilniej uzasadniony trening antycypacji), Footwork Grid (homografia podłogi,
   balans CoM), Reflex Ball, Ghost Duel (ten sam seed bodźców), XP, misje dzienne, streak, ligi po 30 osób. Ranking po XP, nie po surowych ms.
5. Dopracowanie: design system (tokeny już są w `src/index.css` → `@theme`), PWA, sygnalizacja + TURN w Dockerze, CI.

## Materiały poza repo

- Makiety ekranów (Claude Design): https://claude.ai/artifact/HzS6GkNjTA8QDj6xL1LhiM — strony „Ekrany”, „Rozgrywka i minigry” i „Kalibracja”.
- Raport techniczny (React): https://claude.ai/artifact/TeEwoyHdVWVEWf63EpJqFD
- Dwa raporty researchowe (technika detekcji; fizjologia reakcji + grywalizacja) są w rozmowie w projekcie „Virtual Boxer” na claude.ai.

## Konwencje

- Teksty UI po polsku. Komentarze w kodzie po polsku, krótkie, wyjaśniające „dlaczego”.
- Kolory/typografia tylko z tokenów (`brand-*`, `surface-*`, `ink-*`, `defense`, `warn`; fonty Barlow / Barlow Condensed).
  Semantyka: czerwień = marka/atak/cios, niebieski = obrona/połączenie, żółty = ostrzeżenie.
- Nowa logika w `src/core` dostaje testy w Vitest (generator `synthetic.ts` do ruchów).
- Nagrania zawierają tylko szkielet, ale to dane o ciele — nie commituj ich (`nagrania/*.json` jest w .gitignore).
