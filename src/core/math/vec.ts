export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
}

/** Kąt w stopniach w punkcie b między odcinkami b→a i b→c. */
export function angleDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const u = sub(a, b);
  const w = sub(c, b);
  const d = len(u) * len(w);
  if (d < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, dot(u, w) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}
