/**
 * Generator syntetycznych sekwencji pozy do testów detektora.
 * Układ jak w MediaPipe world: metry, początek w środku bioder, y w dół, z mniejsze = bliżej kamery,
 * osoba stoi przodem do kamery (jej lewy bark ma dodatnie x).
 */
import { LM, LANDMARK_COUNT } from '../pose/landmarks';
import type { Landmark, PoseFrame } from '../pose/types';
import { add, cross, dot, len, norm, scale, sub, v3, type Vec3 } from '../math/vec';

const UPPER = 0.3;
const FORE = 0.28;

export const SHOULDER = { left: v3(0.2, -0.5, 0), right: v3(-0.2, -0.5, 0) };
export const NOSE = v3(0, -0.68, -0.05);
export const GUARD = { left: v3(0.08, -0.6, -0.2), right: v3(-0.08, -0.6, -0.18) };

export interface Keyframe {
  /** ms od początku */
  t: number;
  left?: Vec3;
  right?: Vec3;
  /** przesunięcie głowy (nosa i barków) */
  head?: Vec3;
  /** kierunek, w który „ucieka” łokieć (biegun IK); domyślnie w dół i na zewnątrz */
  leftPole?: Vec3;
  rightPole?: Vec3;
}

/** Łokieć w dół i na zewnątrz — garda, proste, podbródkowe. */
export const DEFAULT_POLE = { left: v3(0.5, 1, 0), right: v3(-0.5, 1, 0) };
/** Łokieć uniesiony na wysokość barku — sierpowy (tak wyglądał na prawdziwych nagraniach). */
export const HOOK_POLE = { left: v3(0.6, -1, 0), right: v3(-0.6, -1, 0) };

/** Łokieć z prostego IK dwóch odcinków, zgięty w stronę bieguna `pole`. */
function elbowFor(S: Vec3, W: Vec3, pole: Vec3): Vec3 {
  const dirRaw = sub(W, S);
  const d = Math.min(len(dirRaw), (UPPER + FORE) * 0.999);
  const dir = norm(dirRaw);
  const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  let perp = sub(pole, scale(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = cross(dir, v3(0, 0, 1));
  return add(add(S, scale(dir, a)), scale(norm(perp), h));
}

/** Wrist na dokładnej odległości (ramię nie może się wydłużyć). */
function clampWrist(S: Vec3, W: Vec3): Vec3 {
  const d = sub(W, S);
  const l = len(d);
  const max = (UPPER + FORE) * 0.999;
  return l > max ? add(S, scale(d, max / l)) : W;
}

const ease = (x: number) => x * x * (3 - 2 * x);

function lerpV(a: Vec3, b: Vec3, k: number): Vec3 {
  return add(a, scale(sub(b, a), k));
}

function at(keys: Keyframe[], t: number, pick: (k: Keyframe) => Vec3 | undefined, fallback: Vec3): Vec3 {
  const pts = keys.filter((k) => pick(k)).map((k) => ({ t: k.t, p: pick(k)! }));
  if (!pts.length) return fallback;
  if (t <= pts[0].t) return pts[0].p;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].t) {
      const k = (t - pts[i - 1].t) / (pts[i].t - pts[i - 1].t);
      return lerpV(pts[i - 1].p, pts[i].p, ease(k));
    }
  }
  return pts[pts.length - 1].p;
}

function project(p: Vec3): Landmark {
  return { x: 0.5 + p.x * 0.5, y: 0.5 + p.y * 0.5, z: p.z, v: 1 };
}

export function buildFrames(keys: Keyframe[], durationMs: number, fps = 30): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const step = 1000 / fps;
  for (let t = 0; t <= durationMs; t += step) {
    const head = at(keys, t, (k) => k.head, v3());
    const Ls = add(SHOULDER.left, scale(head, 0.4));
    const Rs = add(SHOULDER.right, scale(head, 0.4));
    const nose = add(NOSE, head);
    const Lw = clampWrist(Ls, add(at(keys, t, (k) => k.left, GUARD.left), scale(head, 0.4)));
    const Rw = clampWrist(Rs, add(at(keys, t, (k) => k.right, GUARD.right), scale(head, 0.4)));
    const world: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, v: 1 }));
    const set = (i: number, p: Vec3) => (world[i] = { ...p, v: 1 });
    set(LM.NOSE, nose);
    set(LM.L_EAR, add(nose, v3(0.07, 0.02, 0.08)));
    set(LM.R_EAR, add(nose, v3(-0.07, 0.02, 0.08)));
    set(LM.L_SHOULDER, Ls);
    set(LM.R_SHOULDER, Rs);
    set(LM.L_WRIST, Lw);
    set(LM.R_WRIST, Rw);
    set(LM.L_ELBOW, elbowFor(Ls, Lw, norm(at(keys, t, (k) => k.leftPole, DEFAULT_POLE.left))));
    set(LM.R_ELBOW, elbowFor(Rs, Rw, norm(at(keys, t, (k) => k.rightPole, DEFAULT_POLE.right))));
    set(LM.L_HIP, v3(0.1, 0, 0));
    set(LM.R_HIP, v3(-0.1, 0, 0));
    set(LM.L_KNEE, v3(0.12, 0.45, -0.05));
    set(LM.R_KNEE, v3(-0.12, 0.45, 0.05));
    set(LM.L_ANKLE, v3(0.14, 0.88, -0.1));
    set(LM.R_ANKLE, v3(-0.14, 0.88, 0.1));
    frames.push({ t, captureT: t, world, image: world.map(project) });
  }
  return frames;
}

/** Cios: garda → cel (outMs) → przytrzymanie → garda (backMs). `pole` ustawia łokieć w fazie ciosu. */
export function punchKeys(
  side: 'left' | 'right',
  startT: number,
  target: Vec3,
  from?: Vec3,
  outMs = 130,
  backMs = 220,
  pole?: Vec3,
): Keyframe[] {
  const g = GUARD[side];
  const s = from ?? g;
  const poleKey = side === 'left' ? 'leftPole' : 'rightPole';
  const base = DEFAULT_POLE[side];
  const k = (t: number, p: Vec3, pl: Vec3): Keyframe => ({ t, [side]: p, [poleKey]: pl });
  return [
    k(startT, s, base),
    k(startT + outMs, target, pole ?? base),
    k(startT + outMs + 40, target, pole ?? base),
    k(startT + outMs + 40 + backMs, g, base),
  ];
}

/** Gotowe cele ciosów (geometria zgodna z prawdziwymi nagraniami w 2D). */
export const TARGETS = {
  jab: v3(0.16, -0.52, -0.565),
  cross: v3(-0.12, -0.52, -0.57),
  hookLead: v3(-0.1, -0.5, -0.32),
  /** podbródkowy startuje nisko (nadgarstek wyraźnie pod barkiem) i kończy na wysokości brody */
  uppercutFromRear: v3(-0.12, -0.22, -0.15),
  uppercutRear: v3(-0.08, -0.62, -0.42),
};
