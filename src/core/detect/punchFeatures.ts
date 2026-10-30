import type { Hand, PunchCandidate, Side } from './motionAnalyzer';

/**
 * Cechy jednego ciosu dla klasyfikatora typu.
 * Wszystko jest „lustrzane” względem ręki: `out` > 0 = na zewnątrz od ciała dla tej ręki, `in` = do środka,
 * więc lewa i prawa ręka dają porównywalne liczby. Odległości w szerokościach barków (3D i 2D osobno),
 * żeby wynik nie zależał od wzrostu ani odległości od kamery.
 */
export const FEATURE_NAMES = [
  // 3D, układ ciała
  'd3_out', 'd3_up', 'd3_fwd',
  'w3s_out', 'w3s_up', 'w3s_fwd',
  'w3f_out', 'w3f_up', 'w3f_fwd',
  'e3f_out', 'e3f_up_vs_wrist', 'e3f_up',
  'elbow3_far', 'elbow3_max',
  'curv3', 'curv3_out', 'curv3_up',
  // 2D, obraz (y w górę)
  'w2s_out', 'w2s_up', 'w2f_out', 'w2f_up',
  'e2s_up', 'e2f_up', 'e2f_out', 'elbow2_far',
  'd2_len', 'curv2',
  // ruch
  'duration', 'peak_speed', 'is_lead',
] as const;

export const FEATURE_COUNT = FEATURE_NAMES.length;

type P = { x: number; y: number; z: number };

/** Największe odchylenie toru od cięciwy start→koniec (względem jej długości) i jego kierunek. */
function curvature(pts: P[]): { ratio: number; dev: P } {
  const a = pts[0];
  const b = pts[pts.length - 1];
  const c = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const L = Math.hypot(c.x, c.y, c.z);
  if (L < 1e-6 || pts.length < 3) return { ratio: 0, dev: { x: 0, y: 0, z: 0 } };
  const u = { x: c.x / L, y: c.y / L, z: c.z / L };
  let best = 0;
  let dev = { x: 0, y: 0, z: 0 };
  for (const p of pts) {
    const d = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
    const k = d.x * u.x + d.y * u.y + d.z * u.z;
    const perp = { x: d.x - k * u.x, y: d.y - k * u.y, z: d.z - k * u.z };
    const m = Math.hypot(perp.x, perp.y, perp.z);
    if (m > best) {
      best = m;
      dev = perp;
    }
  }
  return { ratio: best / L, dev: { x: dev.x / L, y: dev.y / L, z: dev.z / L } };
}

export function punchFeatures(c: Pick<PunchCandidate, 'start' | 'far' | 'path' | 'peakSpeed' | 'maxElbow'>, side: Side, hand: Hand): number[] {
  const m = side === 'left' ? 1 : -1;
  const s = c.start;
  const f = c.far;
  const sw = s.sw3 || 0.35;
  // nadgarstek względem własnego barku (barki są w ±sw/2 na osi x)
  const own = (p: P) => ({ out: (m * p.x - sw / 2) / sw, up: p.y / sw, fwd: p.z / sw });
  const ws = own(s.rel);
  const wf = own(f.rel);
  const ef = own(f.elbowRel);
  const path = c.path.length >= 2 ? c.path : [s, f];
  const cv3 = curvature(path.map((p) => p.rel));
  const cv2 = curvature(path.map((p) => ({ x: p.img.wx, y: -p.img.wy, z: 0 })));
  const d2 = Math.hypot(f.img.wx - s.img.wx, f.img.wy - s.img.wy);
  return [
    wf.out - ws.out, wf.up - ws.up, wf.fwd - ws.fwd,
    ws.out, ws.up, ws.fwd,
    wf.out, wf.up, wf.fwd,
    ef.out, ef.up - wf.up, ef.up,
    f.elbow / 180, Math.max(c.maxElbow, f.elbow) / 180,
    cv3.ratio, m * cv3.dev.x, cv3.dev.y,
    m * s.img.wx, s.img.wristUp, m * f.img.wx, f.img.wristUp,
    s.img.elbowUp, f.img.elbowUp, m * f.img.ex, f.img.elbowAngle / 180,
    d2, cv2.ratio,
    (f.t - s.t) / 300, c.peakSpeed / 5, hand === 'lead' ? 1 : 0,
  ];
}

export const CONTEXT_NAMES = ['vis_mean', 'vis_min', 'vis_minus_other', 'other_gap', 'other_peak_ratio', 'other_dur_ratio'] as const;

/**
 * Kontekst ciosu do filtra „cios czy szum”: jak dobrze widać rękę i co w tym czasie robiła druga ręka.
 * Fałszywe ciosy to zwykle ręka zasłonięta tułowiem (niska widoczność, punkt „przykleja się” do drugiej rękawicy)
 * albo ręka pociągnięta obrotem tułowia przy ciosie drugą ręką.
 */
export function contextFeatures(
  c: Pick<PunchCandidate, 'start' | 'far' | 'path' | 'peakSpeed'>,
  otherVis: number,
  other: { startT: number; endT: number; peak: number } | null,
): number[] {
  const v = c.path.map((p) => p.vis);
  const visMean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  const visMin = Math.min(...v);
  const st = c.start.t;
  const en = c.far.t;
  let gap = 1;
  let peakRatio = 0;
  let durRatio = 0;
  if (other) {
    const g = Math.max(0, Math.max(st, other.startT) - Math.min(en, other.endT));
    if (g < 1000) {
      gap = Math.min(g, 300) / 300;
      peakRatio = other.peak / Math.max(0.1, c.peakSpeed);
      durRatio = (other.endT - other.startT) / Math.max(1, en - st);
    }
  }
  return [visMean, visMin, visMean - otherVis, gap, peakRatio, durRatio];
}
