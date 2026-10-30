import type { DetectorConfig, MotionEvent, Stance } from '../detect/motionAnalyzer';
import type { Landmark, PoseFrame } from '../pose/types';

/**
 * Nagranie sesji do analizy offline (spike S2): surowe punkty pozy + wykryte zdarzenia.
 * Plik JSON można przepuścić przez `npm run eval -- plik.json` po zmianie progów.
 */
export type RecordingProtocol =
  | 'free'
  | 'jab'
  | 'cross'
  | 'hook-lead'
  | 'hook-rear'
  | 'uppercut-lead'
  | 'uppercut-rear'
  | 'mixed'
  | 'slip'
  | 'duck';

export interface RecordingMeta {
  protocol: RecordingProtocol;
  /** ile powtórzeń zawodnik deklaruje wykonać */
  expectedCount: number | null;
  /** ustawienie kamery, np. "front", "bok-30" */
  cameraSetup: string;
  stance: Stance;
  swapSides: boolean;
  model: string;
  /** GPU/CPU — przy CPU model heavy bywa kilkukrotnie wolniejszy */
  delegate?: string;
  /** FPS detekcji w chwili startu nagrania */
  detectFps?: number;
  videoWidth: number;
  videoHeight: number;
  startedAt: string;
  userAgent: string;
  config: DetectorConfig;
}

export interface RecordedFrame {
  /** czas detekcji, ms */
  t: number;
  /** szacowany czas przechwycenia klatki, ms */
  ct: number;
  /** 33 × [x, y, z, v] obrazu */
  i: number[];
  /** 33 × [x, y, z, v] world */
  w: number[];
}

export interface Recording {
  version: 1;
  meta: RecordingMeta;
  frames: RecordedFrame[];
  events: MotionEvent[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function packLandmarks(lm: Landmark[]): number[] {
  const out = new Array<number>(lm.length * 4);
  lm.forEach((p, k) => {
    out[k * 4] = r4(p.x);
    out[k * 4 + 1] = r4(p.y);
    out[k * 4 + 2] = r4(p.z);
    out[k * 4 + 3] = Math.round(p.v * 100) / 100;
  });
  return out;
}

export function unpackLandmarks(a: number[]): Landmark[] {
  const out: Landmark[] = [];
  for (let k = 0; k + 3 < a.length; k += 4) out.push({ x: a[k], y: a[k + 1], z: a[k + 2], v: a[k + 3] });
  return out;
}

export const frameFromRecord = (f: RecordedFrame): PoseFrame => ({
  t: f.t,
  captureT: f.ct,
  image: unpackLandmarks(f.i),
  world: unpackLandmarks(f.w),
});

export class Recorder {
  private rec: Recording | null = null;

  get active() {
    return this.rec !== null;
  }

  get frameCount() {
    return this.rec?.frames.length ?? 0;
  }

  start(meta: RecordingMeta) {
    this.rec = { version: 1, meta, frames: [], events: [] };
  }

  push(frame: PoseFrame, events: MotionEvent[]) {
    if (!this.rec) return;
    this.rec.frames.push({
      t: Math.round(frame.t * 10) / 10,
      ct: Math.round(frame.captureT * 10) / 10,
      i: packLandmarks(frame.image),
      w: packLandmarks(frame.world),
    });
    if (events.length) this.rec.events.push(...events);
  }

  stop(): Recording | null {
    const r = this.rec;
    this.rec = null;
    return r;
  }
}
