/**
 * Wyciąga cechy każdego wykrytego ciosu z nagrań do CSV — do analizy, co odróżnia typy ciosów.
 *
 *   npm run features -- nagrania/*.json > cechy.csv
 *
 * Etykieta (label) pochodzi z protokołu nagrania. Cechy 2D liczone są w pikselach i normalizowane szerokością barków w obrazie,
 * cechy 3D w układzie ciała z world landmarks (x = w stronę lewego barku, y = w górę, z = do kamery).
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { MotionAnalyzer, DEFAULT_CONFIG, bodyBasis, type PunchEvent } from '../src/core/detect/motionAnalyzer';
import { DETECT_SMOOTHING, LandmarkSmoother } from '../src/core/pose/oneEuro';
import { LM } from '../src/core/pose/landmarks';
import { frameFromRecord, type Recording } from '../src/core/session/recorder';
import type { PoseFrame } from '../src/core/pose/types';
import { angleDeg, dot, sub, type Vec3 } from '../src/core/math/vec';

const files = process.argv.slice(2);
const cols = [
  'file', 'label', 'detected', 'side', 'hand', 'durationMs', 'peakSpeed', 'elbowW',
  'dx3', 'dy3', 'dz3', 'in3', 'wristUp3Start', 'wristUp3Far',
  'dx2', 'dy2', 'in2', 'elbowUp2Far', 'wristUp2Start', 'wristUp2Far', 'arm2Start', 'arm2Far', 'arm2Ratio', 'elbow2Far', 'fore2Ratio',
  'shoulderRot2', 'headDx2',
];
console.log(cols.join(','));

const r3 = (n: number) => Math.round(n * 1000) / 1000;

for (const file of files) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
  const { meta } = rec;
  const W = meta.videoWidth || 1;
  const H = meta.videoHeight || 1;
  const label = meta.protocol;
  const analyzer = new MotionAnalyzer(DEFAULT_CONFIG, meta.stance, meta.swapSides);
  analyzer.imageAspect = meta.videoWidth && meta.videoHeight ? meta.videoWidth / meta.videoHeight : 1;
  const smoother = new LandmarkSmoother(33, DETECT_SMOOTHING);
  const frames: PoseFrame[] = [];
  const punches: PunchEvent[] = [];
  for (const rf of rec.frames) {
    const f = frameFromRecord(rf);
    const sm = { ...f, world: smoother.smooth(f.world, f.captureT / 1000) };
    frames.push(sm);
    for (const e of analyzer.update(sm).events) if (e.kind === 'punch') punches.push(e);
  }
  const at = (t: number) => frames.reduce((a, b) => (Math.abs(b.captureT - t) < Math.abs(a.captureT - t) ? b : a));
  const px = (f: PoseFrame, i: number): Vec3 => ({ x: f.image[i].x * W, y: f.image[i].y * H, z: 0 });

  for (const p of punches) {
    const start = at(p.t - p.durationMs);
    const far = at(p.t);
    const [si, ei, wi] = p.side === 'left' ? [LM.L_SHOULDER, LM.L_ELBOW, LM.L_WRIST] : [LM.R_SHOULDER, LM.R_ELBOW, LM.R_WRIST];
    const inSign = p.side === 'left' ? -1 : 1;

    // 3D
    const b0 = bodyBasis(start.world)!;
    const toB = (f: PoseFrame, i: number) => {
      const d = sub(f.world[i], b0.origin);
      return { x: dot(d, b0.x), y: dot(d, b0.up), z: dot(d, b0.fwd) };
    };
    const w0 = toB(start, wi);
    const w1 = toB(far, wi);
    const s0 = toB(start, si);
    const s1 = toB(far, si);

    // 2D (obraz nie jest lustrzany: lewy bark osoby ma większe x; w górę = mniejsze y)
    const sw = Math.hypot(px(start, LM.L_SHOULDER).x - px(start, LM.R_SHOULDER).x, px(start, LM.L_SHOULDER).y - px(start, LM.R_SHOULDER).y) || 1;
    const W0 = px(start, wi), W1 = px(far, wi), S0 = px(start, si), S1 = px(far, si), E0 = px(start, ei), E1 = px(far, ei);
    const dx2 = (W1.x - W0.x) / sw;
    const dy2 = -(W1.y - W0.y) / sw;
    const len2 = (a: Vec3, c: Vec3) => Math.hypot(a.x - c.x, a.y - c.y);
    const arm2Start = len2(S0, W0) / sw;
    const arm2Far = len2(S1, W1) / sw;
    const shoulderW = (f: PoseFrame) => len2(px(f, LM.L_SHOULDER), px(f, LM.R_SHOULDER));
    const nose0 = px(start, LM.NOSE), nose1 = px(far, LM.NOSE);

    const row = [
      basename(file), label, p.type, p.side, p.hand, p.durationMs, p.peakSpeed, p.elbowAngle,
      r3(w1.x - w0.x), r3(w1.y - w0.y), r3(w1.z - w0.z), r3(inSign * (w1.x - w0.x)), r3(w0.y - s0.y), r3(w1.y - s1.y),
      r3(dx2), r3(dy2), r3(inSign * -dx2 * -1), r3((S1.y - E1.y) / sw), r3((S0.y - W0.y) / sw), r3((S1.y - W1.y) / sw),
      r3(arm2Start), r3(arm2Far), r3(arm2Far / (arm2Start || 1)), r3(angleDeg(S1, E1, W1)), r3(len2(E1, W1) / (len2(E0, W0) || 1)),
      r3(shoulderW(far) / (shoulderW(start) || 1)), r3((nose1.x - nose0.x) / sw),
    ];
    console.log(row.join(','));
  }
}
