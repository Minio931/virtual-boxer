import { LM, swapLeftRight } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/types';
import { cross, dist, dot, len, mid, norm, scale, sub, angleDeg, type Vec3 } from '../math/vec';
import { contextFeatures, punchFeatures } from './punchFeatures';
import { predict, type PunchModel, type ValidClass } from './punchClassifier';
import { PUNCH_MODEL, PUNCH_VALID_MODEL } from './punchModel';

export type Side = 'left' | 'right';
export type Hand = 'lead' | 'rear';
export type PunchType = 'jab' | 'cross' | 'hook' | 'uppercut';
export type Stance = 'orthodox' | 'southpaw';

export interface PunchEvent {
  kind: 'punch';
  t: number;
  side: Side;
  hand: Hand;
  type: PunchType;
  target: 'head' | 'body';
  /** od startu ruchu do najdalszego punktu */
  durationMs: number;
  /** maks. prędkość nadgarstka względem barków, m/s (szacunek z jednej kamery) */
  peakSpeed: number;
  elbowAngle: number;
  /** 0–1, jak pewna jest klasyfikacja typu */
  confidence: number;
  /** wektor cech ciosu (do uczenia klasyfikatora i analizy) */
  features?: number[];
  /** kontekst do filtra „cios czy szum” (widoczność ręki, druga ręka) */
  context?: number[];
  /** 0–1: na ile to prawdziwy cios, a nie szum trackingu (gdy filtr jest dostępny) */
  validity?: number;
}
export interface SlipEvent {
  kind: 'slip';
  t: number;
  dir: Side;
}
export interface DuckEvent {
  kind: 'duck';
  t: number;
}
export type MotionEvent = PunchEvent | SlipEvent | DuckEvent;

/** Progi detekcji. Wartości startowe do strojenia na własnych nagraniach (npm run eval). */
export interface DetectorConfig {
  /** okno do liczenia prędkości (ms); chroni przed wzmacnianiem szumu przy wysokim FPS */
  velWindowMs: number;
  /** prędkość nadgarstka (m/s, względem barków) rozpoczynająca cios */
  startSpeed: number;
  /** prędkość oddalania nadgarstka od nosa (m/s) rozpoczynająca cios */
  startRadial: number;
  /** albo: prędkość do przodu (w stronę kamery), m/s */
  startForward: number;
  /** albo: prędkość w górę (podbródkowy), m/s */
  startUp: number;
  /** koniec fazy wyprostu, gdy prędkość spadnie poniżej tego ułamka szczytowej */
  endRatio: number;
  minPeakSpeed: number;
  /** minimalne przemieszczenie nadgarstka (m) */
  minAmplitude: number;
  /** minimalne przemieszczenie nadgarstka w obrazie (szerokości barków) — odcina „ciosy” widoczne tylko w zaszumionej głębi */
  minAmplitude2d: number;
  minDurationMs: number;
  maxDurationMs: number;
  /** przerwa po powrocie ręki, zanim liczymy kolejny cios tą ręką */
  refractoryMs: number;
  /** minimalny czas fazy powrotu ręki (ms) */
  minRetractMs: number;
  /*
   * Klasyfikacja i filtr opuszczenia ręki działają na geometrii 2D z obrazu, w szerokościach barków.
   * Dobrane na prawdziwych nagraniach (27.10, kamera na wprost): kąt łokcia i ruch z world landmarks
   * okazały się przy jednej kamerze zbyt zaszumione, by odróżniać typy ciosów.
   */
  /** opuszczenie ręki: nadgarstek zjechał w obrazie w dół o więcej niż tyle… */
  dropDown2d: number;
  /** …i skończył poniżej barku o więcej niż tyle — to zamach/opuszczenie, nie cios */
  dropBelow2d: number;
  /** podbródkowy: nadgarstek na starcie poniżej barku o więcej niż tyle… */
  uppercutStartBelow2d: number;
  /** …a łokieć na końcu nie wyżej niż tyle nad barkiem */
  uppercutElbowMax2d: number;
  /** sierpowy: łokieć na końcu wyżej niż tyle nad barkiem… */
  hookElbowMin2d: number;
  /** …i ręka w obrazie zgięta bardziej niż ten kąt (°) */
  hookElbowAngleMax2d: number;
  /** cios na korpus: nadgarstek na końcu poniżej barku o więcej niż tyle */
  bodyBelow2d: number;
  /** garda: oba nadgarstki bliżej nosa niż ta odległość (m) */
  guardRadius: number;
  /** slip: przesunięcie głowy w bok w obrazie (szerokości barków) */
  slipThreshold: number;
  /** schylenie: obniżenie głowy w obrazie (szerokości barków) */
  duckThreshold: number;
  minVisibility: number;
  /** typ ciosu: 'model' = klasyfikator uczony na nagraniach (punchModel.ts), 'rules' = reguły 2D */
  typeClassifier: 'model' | 'rules';
  /** filtr „cios czy szum”: ciosy z prawdopodobieństwem poniżej progu są odrzucane (0 = filtr wyłączony) */
  validThreshold: number;
}

export const DEFAULT_CONFIG: DetectorConfig = {
  velWindowMs: 30,
  startSpeed: 1.3,
  startRadial: 0.45,
  startForward: 0.6,
  startUp: 0.8,
  endRatio: 0.35,
  minPeakSpeed: 1.8,
  minAmplitude: 0.12,
  minAmplitude2d: 0.12,
  minDurationMs: 50,
  maxDurationMs: 700,
  refractoryMs: 120,
  minRetractMs: 120,
  dropDown2d: 0.1,
  dropBelow2d: 0.3,
  uppercutStartBelow2d: 0.45,
  uppercutElbowMax2d: 0.2,
  hookElbowMin2d: 0.2,
  hookElbowAngleMax2d: 130,
  bodyBelow2d: 0.35,
  guardRadius: 0.3,
  slipThreshold: 0.35,
  duckThreshold: 0.55,
  minVisibility: 0.5,
  typeClassifier: 'model',
  validThreshold: 0.15,
};

/** Układ odniesienia ciała: x = w stronę lewego barku, up = w górę tułowia, fwd = w stronę kamery. */
interface BodyBasis {
  origin: Vec3;
  x: Vec3;
  up: Vec3;
  fwd: Vec3;
  shoulderWidth: number;
}

export function bodyBasis(w: Landmark[]): BodyBasis | null {
  const ls = w[LM.L_SHOULDER];
  const rs = w[LM.R_SHOULDER];
  const lh = w[LM.L_HIP];
  const rh = w[LM.R_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  const origin = mid(ls, rs);
  const shoulderWidth = dist(ls, rs);
  if (shoulderWidth < 0.05) return null;
  const up = norm(sub(origin, mid(lh, rh)));
  let x = sub(ls, rs);
  x = norm(sub(x, scale(up, dot(x, up))));
  let fwd = norm(cross(x, up));
  // W układzie world MediaPipe mniejsze z = bliżej kamery; osoba stoi przodem do kamery.
  if (fwd.z > 0) fwd = scale(fwd, -1);
  return { origin, x, up, fwd, shoulderWidth };
}

const toBody = (b: BodyBasis, p: Vec3): Vec3 => {
  const d = sub(p, b.origin);
  return { x: dot(d, b.x), y: dot(d, b.up), z: dot(d, b.fwd) };
};

export interface ArmSample {
  t: number;
  /** nadgarstek w układzie ciała (m, względem środka barków) */
  rel: Vec3;
  /** łokieć w układzie ciała (m) */
  elbowRel: Vec3;
  /** szerokość barków w 3D (m) */
  sw3: number;
  noseDist: number;
  elbow: number;
  vis: number;
  /** wysokość nadgarstka względem barku tej ręki (m, + = wyżej) */
  wristUp: number;
  /** 2D (obraz, w szerokościach barków): nadgarstek, wysokości względem barku, kąt łokcia */
  img: ArmImage;
}

export interface ArmImage {
  /** nadgarstek względem barku tej ręki / szerokość barków w obrazie (y rośnie w dół) — ruch całego ciała się znosi */
  wx: number;
  wy: number;
  /** wysokość nadgarstka nad barkiem (+ = wyżej), w szerokościach barków */
  wristUp: number;
  /** wysokość łokcia nad barkiem (+ = wyżej), w szerokościach barków */
  elbowUp: number;
  /** kąt łokcia w obrazie (°) */
  elbowAngle: number;
  /** łokieć względem barku tej ręki w obrazie (szerokości barków) */
  ex: number;
  ey: number;
}

export interface PunchCandidate {
  start: ArmSample;
  far: ArmSample;
  /** próbki od startu do najdalszego punktu (tor ręki) */
  path: ArmSample[];
  peakSpeed: number;
  amplitude: number;
  /** największy kąt łokcia w trakcie wyprostu (odporniejszy na szum niż kąt w jednej klatce) */
  maxElbow: number;
}

type ArmState = 'idle' | 'active' | 'retract';

/** Dłuższa przerwa między klatkami = zgubiona sylwetka, resetujemy stan ręki. */
const MAX_FRAME_GAP_MS = 350;
/** Poniżej tego FPS detekcji szybkie ciosy mieszczą się w 1–2 klatkach i nie da się ich wiarygodnie wykryć. */
export const MIN_RELIABLE_FPS = 15;

/**
 * Maszyna stanów jednej ręki: garda → wyprost → powrót.
 * Prędkość liczymy w oknie czasowym (`velWindowMs`), a nie między sąsiednimi klatkami:
 * różnica dwóch klatek przy 60 kl./s wzmacnia szum trackingu kilkukrotnie.
 */
class ArmTracker {
  state: ArmState = 'idle';
  speed = 0;
  private hist: ArmSample[] = [];
  private start: ArmSample | null = null;
  private far: ArmSample | null = null;
  private path: ArmSample[] = [];
  private peakSpeed = 0;
  private maxDist = 0;
  private maxElbow = 0;
  private endT = 0;
  private lastEnd = -Infinity;
  /** ostatni wykryty ruch-kandydat tej ręki (do kontekstu drugiej ręki) */
  lastCand: { startT: number; endT: number; peak: number } | null = null;

  constructor(private cfg: () => DetectorConfig) {}

  /** Okno ruchu do porównań z drugą ręką: trwający wyprost albo ostatni kandydat. */
  motionWindow(now: number): { startT: number; endT: number; peak: number } | null {
    if (this.state === 'active' && this.start) return { startT: this.start.t, endT: now, peak: this.peakSpeed };
    return this.lastCand;
  }

  /** Średnia widoczność ręki w przedziale czasu (z historii ostatnich ~400 ms). */
  visBetween(t0: number, t1: number): number {
    const v = this.hist.filter((h) => h.t >= t0 && h.t <= t1).map((h) => h.vis);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  reset() {
    this.state = 'idle';
    this.hist = [];
    this.start = this.far = null;
    this.peakSpeed = this.maxDist = this.maxElbow = this.speed = 0;
    this.lastEnd = -Infinity;
    this.lastCand = null;
  }

  /** Najnowsza próbka starsza o co najmniej `windowMs`; gdy takiej nie ma, najstarsza dostępna. */
  private reference(now: number, windowMs: number): ArmSample | null {
    for (let i = this.hist.length - 2; i >= 0; i--) if (this.hist[i].t <= now - windowMs) return this.hist[i];
    return this.hist.length > 1 ? this.hist[0] : null;
  }

  update(s: ArmSample): PunchCandidate | null {
    const last = this.hist[this.hist.length - 1];
    if (last && s.t <= last.t) return null;
    if (last && s.t - last.t > MAX_FRAME_GAP_MS) {
      // dziura w danych (zgubiona poza, przycięte wideo)
      this.hist = [];
      this.state = 'idle';
    }
    this.hist.push(s);
    while (this.hist.length > 2 && s.t - this.hist[1].t > 400) this.hist.shift();

    const cfg = this.cfg();
    const ref = this.reference(s.t, cfg.velWindowMs);
    if (!ref) return null;
    const dt = (s.t - ref.t) / 1000;
    const vel = scale(sub(s.rel, ref.rel), 1 / dt);
    const speed = len(vel);
    const radial = (s.noseDist - ref.noseDist) / dt;
    this.speed = speed;

    switch (this.state) {
      case 'idle': {
        const visible = s.vis >= cfg.minVisibility && ref.vis >= cfg.minVisibility;
        const outward = radial > cfg.startRadial || vel.z > cfg.startForward || vel.y > cfg.startUp;
        if (visible && s.t - this.lastEnd > cfg.refractoryMs && speed > cfg.startSpeed && outward) {
          this.state = 'active';
          this.start = ref;
          this.far = s;
          this.path = [ref, s];
          this.peakSpeed = speed;
          this.maxDist = dist(s.rel, ref.rel);
          this.maxElbow = Math.max(ref.elbow, s.elbow);
        }
        return null;
      }
      case 'active': {
        const start = this.start!;
        this.peakSpeed = Math.max(this.peakSpeed, speed);
        this.maxElbow = Math.max(this.maxElbow, s.elbow);
        const d = dist(s.rel, start.rel);
        if (d > this.maxDist) {
          this.maxDist = d;
          this.far = s;
          this.path.push(s);
        }
        const elapsed = s.t - start.t;
        const stopped = speed < this.peakSpeed * cfg.endRatio;
        // ręka wyraźnie zawraca: prędkość skierowana z powrotem w stronę punktu startu
        const out = sub(s.rel, start.rel);
        const cosBack = dot(vel, out) / Math.max(1e-6, speed * len(out));
        const comingBack = cosBack < -0.3 && speed > cfg.startSpeed * 0.6;
        if (!stopped && !comingBack && elapsed <= cfg.maxDurationMs) return null;

        const far = this.far!;
        const duration = far.t - start.t;
        // opuszczenie ręki (zamach przed sierpowym/podbródkowym) to nie cios; wracamy do idle bez przerwy,
        // żeby właściwy cios zaraz po zamachu został wykryty
        const down2d = far.img.wy - start.img.wy;
        const droppingHand = down2d > cfg.dropDown2d && far.img.wristUp < -cfg.dropBelow2d;
        if (droppingHand) {
          this.state = 'idle';
          return null;
        }
        this.state = 'retract';
        this.endT = s.t;
        const amp2d = Math.hypot(far.img.wx - start.img.wx, far.img.wy - start.img.wy);
        if (
          this.peakSpeed >= cfg.minPeakSpeed &&
          this.maxDist >= cfg.minAmplitude &&
          amp2d >= cfg.minAmplitude2d &&
          duration >= cfg.minDurationMs &&
          elapsed <= cfg.maxDurationMs
        ) {
          this.lastCand = { startT: start.t, endT: far.t, peak: this.peakSpeed };
          return { start, far, path: this.path, peakSpeed: this.peakSpeed, amplitude: this.maxDist, maxElbow: this.maxElbow };
        }
        return null;
      }
      case 'retract': {
        // minimalny czas powrotu chroni przed liczeniem jednego ciosu dwa razy, gdy szum „zawróci” rękę
        const settled = radial > -0.2 && speed < cfg.startSpeed && s.t - this.endT >= cfg.minRetractMs;
        if (settled || s.t - this.endT > 500) {
          this.state = 'idle';
          this.lastEnd = s.t;
        }
        return null;
      }
    }
  }
}

/**
 * Wykrywa slipy i schylenia jako „wychylenia głowy” od pozycji wyjściowej (2D, w szerokościach barków).
 * Pozycja wyjściowa powoli podąża za zawodnikiem, gdy stoi spokojnie (przesunął się bliżej/dalej od kamery).
 * Każde wychylenie to jedno zdarzenie, klasyfikowane na końcu ruchu: przeważa ruch w dół → schylenie, w bok → slip.
 */
class DefenseTracker {
  private baseX: number | null = null;
  private baseY: number | null = null;
  /** stała skala: szerokość barków w pozycji wyjściowej (bieżąca maleje przy obrocie tułowia w slipie) */
  private refSw = 0;
  private calib = 0;
  private prevX = 0;
  private prevY = 0;
  private prevT = 0;
  private excursion: { startT: number; maxLat: number; maxDrop: number } | null = null;

  constructor(private cfg: () => DetectorConfig) {}

  reset() {
    this.baseX = this.baseY = null;
    this.calib = 0;
    this.excursion = null;
    this.prevT = 0;
  }

  get calibrated() {
    return this.calib >= 15;
  }

  /**
   * @param rawX, rawY nos względem środka bioder w obrazie (jednostki obrazu, y w dół)
   * @param sw bieżąca szerokość barków w obrazie
   * @param lastPunchT czas ostatniego wykrytego ciosu: ruch głowy przy crossie/sierpowym to nie unik
   */
  update(rawX: number, rawY: number, sw: number, visible: boolean, armsIdle: boolean, lastPunchT: number, t: number): MotionEvent[] {
    const cfg = this.cfg();
    const events: MotionEvent[] = [];
    if (!visible || sw <= 0) return events;
    if (!this.refSw) this.refSw = sw;
    const noseX = rawX / this.refSw;
    const noseY = rawY / this.refSw;

    const dt = this.prevT ? Math.max(1e-3, (t - this.prevT) / 1000) : 0;
    const speed = dt ? Math.hypot(noseX - this.prevX, noseY - this.prevY) / dt : 0;
    this.prevX = noseX;
    this.prevY = noseY;
    this.prevT = t;

    if (this.baseX === null || this.baseY === null) {
      this.baseX = noseX;
      this.baseY = noseY;
      this.calib = 1;
      return events;
    }
    if (!this.calibrated) {
      if (armsIdle) {
        this.refSw += 0.3 * (sw - this.refSw);
        this.baseX = rawX / this.refSw;
        this.baseY = rawY / this.refSw;
        this.calib++;
      }
      return events;
    }

    // + = w lewo osoby (w obrazie nielustrzanym lewa strona osoby ma większe x), drop + = głowa niżej
    const lat = noseX - this.baseX;
    const drop = noseY - this.baseY;
    const out = Math.abs(lat) > cfg.slipThreshold || drop > cfg.duckThreshold * 0.6;
    const back = Math.abs(lat) < cfg.slipThreshold * 0.4 && drop < cfg.duckThreshold * 0.3;

    if (!this.excursion && out) {
      this.excursion = { startT: t, maxLat: lat, maxDrop: drop };
    } else if (this.excursion) {
      const e = this.excursion;
      if (Math.abs(lat) > Math.abs(e.maxLat)) e.maxLat = lat;
      if (drop > e.maxDrop) e.maxDrop = drop;
      const tooLong = t - e.startT > 1500;
      if (back || tooLong) {
        const muted = lastPunchT >= e.startT - DEFENSE_MUTE_AFTER_PUNCH_MS;
        if (!muted) {
          // schylenie rozpoznajemy po obniżeniu głowy, nawet z ruchem w bok („bob and weave”);
          // slip też lekko obniża głowę, ale wyraźnie mniej (na nagraniach < 0,55 szer. barków)
          const isDuck = e.maxDrop >= cfg.duckThreshold;
          if (isDuck) events.push({ kind: 'duck', t });
          else if (Math.abs(e.maxLat) >= cfg.slipThreshold) events.push({ kind: 'slip', t, dir: e.maxLat > 0 ? 'left' : 'right' });
        }
        this.excursion = null;
        // zawodnik został w nowej pozycji (np. przesunął się) — przyjmij ją jako wyjściową
        if (tooLong) {
          this.baseX = noseX;
          this.baseY = noseY;
          this.refSw = sw;
        }
      }
    }

    // Pozycja wyjściowa powoli podąża za zawodnikiem, gdy stoi spokojnie (τ ≈ 1 s przy 30 kl./s)
    if (!this.excursion && armsIdle && speed < 0.6) {
      if (Math.abs(sw / this.refSw - 1) < 0.25) this.refSw += 0.03 * (sw - this.refSw);
      this.baseX += 0.03 * (rawX / this.refSw - this.baseX);
      this.baseY += 0.03 * (rawY / this.refSw - this.baseY);
    }
    return events;
  }
}

export interface AnalyzerOutput {
  ok: boolean;
  events: MotionEvent[];
  guard: boolean;
  /** strony (po ewentualnej zamianie L/P), które są w trakcie ciosu */
  active: { left: boolean; right: boolean };
  elbow: { left: number; right: number };
  /** czy bazowa pozycja głowy jest już ustalona (potrzebne do slipów i schyleń) */
  defenseReady: boolean;
}

/** Jak długo po ciosie ignorujemy ruch głowy jako unik (ms). */
const DEFENSE_MUTE_AFTER_PUNCH_MS = 300;

export class MotionAnalyzer {
  private arms: Record<Side, ArmTracker>;
  private defense: DefenseTracker;
  private cfg: DetectorConfig;
  private lastPunchT = -Infinity;

  /** proporcje obrazu (szerokość / wysokość) — współrzędne obrazu MediaPipe są normalizowane osobno w x i y */
  imageAspect = 1;
  /** klasyfikator typu ciosu (domyślnie wbudowany model); null = reguły 2D */
  typeModel: PunchModel | null = PUNCH_MODEL;
  /** filtr „cios czy szum” (domyślnie wbudowany model); null = bez filtra */
  validModel: PunchModel<ValidClass> | null = PUNCH_VALID_MODEL;

  constructor(cfg: Partial<DetectorConfig> = {}, public stance: Stance = 'orthodox', public swapSides = false) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
    const get = () => this.cfg;
    this.arms = { left: new ArmTracker(get), right: new ArmTracker(get) };
    this.defense = new DefenseTracker(get);
  }

  get config(): DetectorConfig {
    return this.cfg;
  }

  setConfig(cfg: Partial<DetectorConfig>) {
    this.cfg = { ...this.cfg, ...cfg };
  }

  reset() {
    this.arms.left.reset();
    this.arms.right.reset();
    this.defense.reset();
    this.lastPunchT = -Infinity;
  }

  handOf(side: Side): Hand {
    return (this.stance === 'orthodox') === (side === 'left') ? 'lead' : 'rear';
  }

  update(frame: PoseFrame): AnalyzerOutput {
    const world = this.swapSides ? swapLeftRight(frame.world) : frame.world;
    const image = this.swapSides ? swapLeftRight(frame.image) : frame.image;
    const empty: AnalyzerOutput = {
      ok: false,
      events: [],
      guard: false,
      active: { left: false, right: false },
      elbow: { left: 0, right: 0 },
      defenseReady: this.defense.calibrated,
    };
    const basis = bodyBasis(world);
    if (!basis) return empty;

    const t = frame.captureT;
    const nose = world[LM.NOSE];
    const events: MotionEvent[] = [];
    const elbow = { left: 0, right: 0 };
    const sideIdx: Record<Side, [number, number, number]> = {
      left: [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST],
      right: [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST],
    };

    const a = this.imageAspect;
    const p2 = (i: number) => ({ x: image[i].x * a, y: image[i].y, z: 0 });
    const sw2 = Math.max(1e-4, dist(p2(LM.L_SHOULDER), p2(LM.R_SHOULDER)));

    const noseDists: Record<Side, number> = { left: Infinity, right: Infinity };
    const cands: [PunchCandidate, Side][] = [];
    for (const side of ['left', 'right'] as Side[]) {
      const [si, ei, wi] = sideIdx[side];
      const S = world[si];
      const E = world[ei];
      const W = world[wi];
      const S2 = p2(si);
      const E2 = p2(ei);
      const W2 = p2(wi);
      const sample: ArmSample = {
        t,
        rel: toBody(basis, W),
        elbowRel: toBody(basis, E),
        sw3: basis.shoulderWidth,
        noseDist: dist(W, nose),
        elbow: angleDeg(S, E, W),
        vis: Math.min(W.v, E.v),
        wristUp: dot(sub(W, S), basis.up),
        img: {
          wx: (W2.x - S2.x) / sw2,
          wy: (W2.y - S2.y) / sw2,
          wristUp: (S2.y - W2.y) / sw2,
          elbowUp: (S2.y - E2.y) / sw2,
          elbowAngle: angleDeg(S2, E2, W2),
          ex: (E2.x - S2.x) / sw2,
          ey: (E2.y - S2.y) / sw2,
        },
      };
      elbow[side] = sample.elbow;
      noseDists[side] = sample.noseDist;
      const cand = this.arms[side].update(sample);
      if (cand) cands.push([cand, side]);
    }
    // klasyfikacja po aktualizacji obu rąk, żeby znać kontekst drugiej ręki z tej samej klatki
    for (const [cand, side] of cands) {
      const ev = this.classify(cand, side);
      if (ev) events.push(ev);
    }

    const guard = noseDists.left < this.cfg.guardRadius && noseDists.right < this.cfg.guardRadius;
    const armsIdle = this.arms.left.state === 'idle' && this.arms.right.state === 'idle';
    if (events.length) this.lastPunchT = t;
    const hip2 = mid(p2(LM.L_HIP), p2(LM.R_HIP));
    const nose2 = p2(LM.NOSE);
    const headVisible = Math.min(image[LM.NOSE].v, image[LM.L_HIP].v, image[LM.R_HIP].v) >= this.cfg.minVisibility;
    events.push(...this.defense.update(nose2.x - hip2.x, nose2.y - hip2.y, sw2, headVisible, armsIdle, this.lastPunchT, t));

    return {
      ok: true,
      events,
      guard,
      active: { left: this.arms.left.state === 'active', right: this.arms.right.state === 'active' },
      elbow,
      defenseReady: this.defense.calibrated,
    };
  }

  /**
   * Typ ciosu z geometrii 2D (reguły dobrane na prawdziwych nagraniach, ~88% poprawnych na 101 ciosach):
   * podbródkowy startuje nisko i kończy z łokciem pod barkiem; sierpowy kończy z łokciem na wysokości barku
   * i zgiętą ręką; reszta to prosty (jab dla ręki prowadzącej, cross dla tylnej).
   */
  private classify(c: PunchCandidate, side: Side): PunchEvent | null {
    const cfg = this.cfg;
    const hand = this.handOf(side);
    const s0 = c.start.img;
    const f = c.far.img;

    let type: PunchType;
    let confidence: number;
    const features = punchFeatures(c, side, hand);
    const otherArm = this.arms[side === 'left' ? 'right' : 'left'];
    const context = contextFeatures(c, otherArm.visBetween(c.start.t, c.far.t), otherArm.motionWindow(c.far.t));
    let validity: number | undefined;
    if (this.validModel) {
      const pr = predict(this.validModel, [...features, ...context]);
      validity = pr.cls === 'punch' ? pr.p : 1 - pr.p;
      if (cfg.validThreshold > 0 && validity < cfg.validThreshold) return null;
    }
    const upMargin = -s0.wristUp - cfg.uppercutStartBelow2d;
    const hookMargin = f.elbowUp - cfg.hookElbowMin2d;
    if (upMargin > 0 && f.elbowUp < cfg.uppercutElbowMax2d) {
      type = 'uppercut';
      confidence = Math.min(1, 0.6 + upMargin);
    } else if (hookMargin > 0 && f.elbowAngle < cfg.hookElbowAngleMax2d) {
      type = 'hook';
      confidence = Math.min(1, 0.6 + hookMargin + (cfg.hookElbowAngleMax2d - f.elbowAngle) / 200);
    } else {
      type = hand === 'lead' ? 'jab' : 'cross';
      // pewność spada, gdy cios był blisko progu sierpowego lub podbródkowego
      confidence = Math.min(1, 0.55 + Math.min(Math.abs(hookMargin), Math.abs(upMargin)));
    }
    if (cfg.typeClassifier === 'model' && this.typeModel) {
      const { cls, p } = predict(this.typeModel, features);
      type = cls === 'straight' ? (hand === 'lead' ? 'jab' : 'cross') : cls;
      confidence = p;
    }

    return {
      kind: 'punch',
      t: c.far.t,
      side,
      hand,
      type,
      target: f.wristUp < -cfg.bodyBelow2d ? 'body' : 'head',
      durationMs: Math.round(c.far.t - c.start.t),
      peakSpeed: Math.round(c.peakSpeed * 100) / 100,
      elbowAngle: Math.round(f.elbowAngle),
      confidence: Math.round(confidence * 100) / 100,
      features,
      context,
      validity: validity === undefined ? undefined : Math.round(validity * 100) / 100,
    };
  }
}
