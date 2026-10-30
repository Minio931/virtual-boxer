import type { MotionEvent, PunchType, Side } from '../core/detect/motionAnalyzer';

export const PUNCH_LABEL: Record<PunchType, string> = {
  jab: 'Jab',
  cross: 'Cross',
  hook: 'Sierpowy',
  uppercut: 'Podbródkowy',
};

export const SIDE_LABEL: Record<Side, string> = { left: 'lewa', right: 'prawa' };

export function eventLabel(e: MotionEvent): string {
  if (e.kind === 'punch') return `${PUNCH_LABEL[e.type]} · ${SIDE_LABEL[e.side]} · ${e.target === 'head' ? 'głowa' : 'korpus'}`;
  if (e.kind === 'slip') return `Slip w ${e.dir === 'left' ? 'lewo' : 'prawo'}`;
  return 'Schylenie';
}
