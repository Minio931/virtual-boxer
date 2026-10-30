import type { MotionEvent, PunchType } from '../detect/motionAnalyzer';

export interface SessionStats {
  punches: number;
  bySide: { left: number; right: number };
  byType: Record<PunchType, number>;
  byTarget: { head: number; body: number };
  slips: { left: number; right: number };
  ducks: number;
  /** klatki z gardą / klatki poza ciosem (do % gardy) */
  guardFrames: number;
  idleFrames: number;
  firstEventT: number | null;
  lastEventT: number | null;
  recent: MotionEvent[];
}

export const emptyStats = (): SessionStats => ({
  punches: 0,
  bySide: { left: 0, right: 0 },
  byType: { jab: 0, cross: 0, hook: 0, uppercut: 0 },
  byTarget: { head: 0, body: 0 },
  slips: { left: 0, right: 0 },
  ducks: 0,
  guardFrames: 0,
  idleFrames: 0,
  firstEventT: null,
  lastEventT: null,
  recent: [],
});

const RECENT = 8;

/** Mutuje `s` (wywoływane w pętli 30–60 razy na sekundę). */
export function applyFrame(s: SessionStats, events: MotionEvent[], guard: boolean, punching: boolean): SessionStats {
  if (!punching) {
    s.idleFrames++;
    if (guard) s.guardFrames++;
  }
  for (const e of events) {
    if (e.kind === 'punch') {
      s.punches++;
      s.bySide[e.side]++;
      s.byType[e.type]++;
      s.byTarget[e.target]++;
    } else if (e.kind === 'slip') {
      s.slips[e.dir]++;
    } else {
      s.ducks++;
    }
    s.firstEventT ??= e.t;
    s.lastEventT = e.t;
    s.recent.unshift(e);
    if (s.recent.length > RECENT) s.recent.length = RECENT;
  }
  return s;
}

export const guardPercent = (s: SessionStats) => (s.idleFrames ? Math.round((100 * s.guardFrames) / s.idleFrames) : 0);

export function punchesPerMinute(s: SessionStats, nowT: number, startedAt: number): number {
  const minutes = (nowT - startedAt) / 60000;
  return minutes > 0.05 ? Math.round(s.punches / minutes) : 0;
}

export const snapshot = (s: SessionStats): SessionStats => ({
  ...s,
  bySide: { ...s.bySide },
  byType: { ...s.byType },
  byTarget: { ...s.byTarget },
  slips: { ...s.slips },
  recent: s.recent.slice(),
});
