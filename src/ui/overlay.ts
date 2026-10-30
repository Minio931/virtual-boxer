import { BODY, LEFT_ARM, LM, RIGHT_ARM } from '../core/pose/landmarks';
import type { Landmark } from '../core/pose/types';

export interface OverlayState {
  activeLeft: boolean;
  activeRight: boolean;
  guard: boolean;
  minVisibility: number;
}

const COLORS = {
  body: 'rgba(244,244,245,0.85)',
  arm: 'rgba(244,244,245,0.95)',
  punch: '#FF4D52',
  guard: '#4C8DFF',
  joint: '#FFFFFF',
};

/** Rysuje szkielet na płótnie o rozmiarze klatki wideo (współrzędne 0–1 × rozmiar). */
export function drawPose(ctx: CanvasRenderingContext2D, lm: Landmark[] | null, o: OverlayState) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  if (!lm) return;
  const lw = Math.max(3, W / 240);
  const P = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H, ok: lm[i].v >= o.minVisibility });

  const line = (pairs: [number, number][], color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    for (const [a, b] of pairs) {
      const p = P(a);
      const q = P(b);
      if (!p.ok || !q.ok) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
  };

  line(BODY, COLORS.body, lw);
  const armColor = (active: boolean) => (active ? COLORS.punch : o.guard ? COLORS.guard : COLORS.arm);
  line(LEFT_ARM, armColor(o.activeLeft), o.activeLeft ? lw * 1.8 : lw * 1.2);
  line(RIGHT_ARM, armColor(o.activeRight), o.activeRight ? lw * 1.8 : lw * 1.2);

  // głowa
  const nose = P(LM.NOSE);
  const ls = P(LM.L_SHOULDER);
  const rs = P(LM.R_SHOULDER);
  if (nose.ok && ls.ok && rs.ok) {
    const r = Math.hypot(ls.x - rs.x, ls.y - rs.y) * 0.28;
    ctx.strokeStyle = COLORS.body;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(nose.x, nose.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // stawy
  ctx.fillStyle = COLORS.joint;
  for (const i of [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_ELBOW, LM.R_ELBOW, LM.L_HIP, LM.R_HIP, LM.L_KNEE, LM.R_KNEE]) {
    const p = P(i);
    if (!p.ok) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // nadgarstki (rękawice) większe
  for (const [i, active] of [
    [LM.L_WRIST, o.activeLeft],
    [LM.R_WRIST, o.activeRight],
  ] as const) {
    const p = P(i);
    if (!p.ok) continue;
    ctx.fillStyle = active ? COLORS.punch : o.guard ? COLORS.guard : COLORS.joint;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * (active ? 3.2 : 2.4), 0, Math.PI * 2);
    ctx.fill();
  }
}
