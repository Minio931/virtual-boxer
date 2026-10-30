import { describe, expect, it } from 'vitest';
import { MotionAnalyzer, type MotionEvent, type PunchEvent } from './motionAnalyzer';
import { GUARD, HOOK_POLE, TARGETS, buildFrames, punchKeys, type Keyframe } from './synthetic';
import { v3 } from '../math/vec';

const IDLE: Keyframe[] = [
  { t: 0, left: GUARD.left, right: GUARD.right, head: v3() },
];

function run(keys: Keyframe[], duration: number, opts?: { stance?: 'orthodox' | 'southpaw'; fps?: number }) {
  const a = new MotionAnalyzer({}, opts?.stance ?? 'orthodox');
  const events: MotionEvent[] = [];
  for (const f of buildFrames(keys, duration, opts?.fps ?? 30)) events.push(...a.update(f).events);
  return events;
}

const punches = (e: MotionEvent[]) => e.filter((x): x is PunchEvent => x.kind === 'punch');

// Cele wyprostu / haka / podbródkowego dobrane tak, by geometria była realistyczna
const JAB_TARGET = TARGETS.jab;
const CROSS_TARGET = TARGETS.cross;
const HOOK_TARGET = TARGETS.hookLead;
const UPPER_FROM = TARGETS.uppercutFromRear;
const UPPER_TARGET = TARGETS.uppercutRear;
/** sierpowy z uniesionym łokciem */
const hookKeys = (startT: number) => punchKeys('left', startT, HOOK_TARGET, undefined, 130, 220, HOOK_POLE.left);

describe('MotionAnalyzer — ciosy', () => {
  it('stojąc w gardzie nie liczy ciosów', () => {
    expect(punches(run(IDLE, 3000))).toHaveLength(0);
  });

  it('wykrywa jab lewą ręką (orthodox) i nie liczy powrotu ręki', () => {
    const p = punches(run([...IDLE, ...punchKeys('left', 1000, JAB_TARGET)], 2500));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ side: 'left', hand: 'lead', type: 'jab', target: 'head' });
  });

  it('wykrywa cross prawą ręką', () => {
    const p = punches(run([...IDLE, ...punchKeys('right', 1000, CROSS_TARGET)], 2500));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ side: 'right', hand: 'rear', type: 'cross' });
  });

  it('wykrywa sierpowy lewą ręką', () => {
    const p = punches(run([...IDLE, ...hookKeys(1000)], 2500));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ side: 'left', type: 'hook' });
    expect(p[0].elbowAngle).toBeLessThan(130); // kąt łokcia w obrazie
  });

  it('wykrywa podbródkowy prawą ręką', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      { t: 800, right: GUARD.right },
      { t: 950, right: UPPER_FROM },
      ...punchKeys('right', 1100, UPPER_TARGET, UPPER_FROM, 140),
    ];
    const p = punches(run(keys, 2600));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ side: 'right', type: 'uppercut' });
  });

  it('liczy kombinację 1-2-3 jako trzy ciosy', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      ...punchKeys('left', 1000, JAB_TARGET),
      ...punchKeys('right', 1450, CROSS_TARGET),
      ...hookKeys(1950),
    ];
    const p = punches(run(keys, 3200));
    expect(p.map((x) => x.type)).toEqual(['jab', 'cross', 'hook']);
  });

  it('w postawie southpaw prosty prawą to jab', () => {
    const p = punches(run([...IDLE, ...punchKeys('right', 1000, CROSS_TARGET)], 2500, { stance: 'southpaw' }));
    expect(p[0]).toMatchObject({ hand: 'lead', type: 'jab' });
  });

  it('działa też przy 60 fps', () => {
    const p = punches(run([...IDLE, ...punchKeys('left', 1000, JAB_TARGET)], 2500, { fps: 60 }));
    expect(p).toHaveLength(1);
    expect(p[0].type).toBe('jab');
  });

  it('wolne opuszczenie i podniesienie ręki nie jest ciosem', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      { t: 1000, left: GUARD.left },
      { t: 2000, left: v3(0.25, -0.2, -0.1) },
      { t: 3000, left: GUARD.left },
    ];
    expect(punches(run(keys, 3500))).toHaveLength(0);
  });
});

describe('MotionAnalyzer — obrona', () => {
  it('wykrywa slip w lewo i w prawo', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      { t: 1500, head: v3() },
      { t: 1700, head: v3(0.18, 0.03, 0) },
      { t: 1900, head: v3(0.18, 0.03, 0) },
      { t: 2100, head: v3() },
      { t: 2700, head: v3() },
      { t: 2900, head: v3(-0.18, 0.03, 0) },
      { t: 3100, head: v3(-0.18, 0.03, 0) },
      { t: 3300, head: v3() },
    ];
    const slips = run(keys, 3800).filter((e) => e.kind === 'slip');
    expect(slips.map((s) => (s.kind === 'slip' ? s.dir : ''))).toEqual(['left', 'right']);
  });

  it('wykrywa schylenie', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      { t: 1500, head: v3() },
      { t: 1750, head: v3(0, 0.25, -0.05) },
      { t: 2000, head: v3(0, 0.25, -0.05) },
      { t: 2300, head: v3() },
    ];
    expect(run(keys, 2800).filter((e) => e.kind === 'duck')).toHaveLength(1);
  });
});

describe('MotionAnalyzer — odporność na szum trackingu', () => {
  // deterministyczny pseudo-szum ~±1,5 cm, jak drgania punktów z jednej kamery
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };

  async function runNoisy(keys: Keyframe[], duration: number, amp = 0.03) {
    const { LandmarkSmoother, DETECT_SMOOTHING } = await import('../pose/oneEuro');
    const a = new MotionAnalyzer();
    const sm = new LandmarkSmoother(33, DETECT_SMOOTHING);
    const events: MotionEvent[] = [];
    for (const f of buildFrames(keys, duration)) {
      const world = f.world.map((p) => ({ ...p, x: p.x + rnd() * amp, y: p.y + rnd() * amp, z: p.z + rnd() * amp * 2 }));
      const smoothed = { ...f, world: sm.smooth(world, f.captureT / 1000) };
      events.push(...a.update(smoothed).events);
    }
    return events;
  }

  it('w gardzie z szumem nie ma fałszywych ciosów', async () => {
    expect(punches(await runNoisy(IDLE, 10000))).toHaveLength(0);
  });

  it('z szumem nadal wykrywa kombinację', async () => {
    const keys: Keyframe[] = [
      ...IDLE,
      ...punchKeys('left', 1000, JAB_TARGET),
      ...punchKeys('right', 1450, CROSS_TARGET),
      ...hookKeys(1950),
    ];
    const p = punches(await runNoisy(keys, 3200));
    expect(p.map((x) => x.type)).toEqual(['jab', 'cross', 'hook']);
  });
});

describe('MotionAnalyzer — z wygładzaniem jak w aplikacji', () => {
  // Regresja: zbyt wolny filtr (dCutoff 1 Hz) gubił sierpowe i mylił podbródkowe z prostymi.
  const UPPER: Keyframe[] = [
    { t: 800, right: GUARD.right },
    { t: 950, right: UPPER_FROM },
    ...punchKeys('right', 1100, UPPER_TARGET, UPPER_FROM, 140),
  ];
  const CASES: [string, Keyframe[]][] = [
    ['jab', punchKeys('left', 1000, JAB_TARGET)],
    ['cross', punchKeys('right', 1000, CROSS_TARGET)],
    ['hook', hookKeys(1000)],
    ['uppercut', UPPER],
  ];

  for (const fps of [20, 30, 60]) {
    it(`rozpoznaje jab, cross, sierpowy i podbródkowy przy ${fps} kl./s (szum ±1 cm)`, async () => {
      const { LandmarkSmoother, DETECT_SMOOTHING } = await import('../pose/oneEuro');
      let seed = 5;
      const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647 - 0.5;
      };
      for (const [type, k] of CASES) {
        const a = new MotionAnalyzer();
        const sm = new LandmarkSmoother(33, DETECT_SMOOTHING);
        const ev: MotionEvent[] = [];
        for (const f of buildFrames([...IDLE, ...k], 2500, fps)) {
          const w = f.world.map((p) => ({ ...p, x: p.x + rnd() * 0.02, y: p.y + rnd() * 0.02, z: p.z + rnd() * 0.04 }));
          ev.push(...a.update({ ...f, world: sm.smooth(w, f.captureT / 1000) }).events);
        }
        expect(punches(ev).map((p) => p.type), `${type} @ ${fps} kl./s`).toEqual([type]);
      }
    });
  }
});

describe('MotionAnalyzer — ruch głowy przy ciosie', () => {
  it('przesunięcie głowy podczas crossa nie jest liczone jako slip', () => {
    const keys: Keyframe[] = [
      ...IDLE,
      { t: 1500, head: v3() },
      ...punchKeys('right', 1600, CROSS_TARGET),
      // rotacja tułowia przy crossie przesuwa głowę w bok
      { t: 1620, head: v3() },
      { t: 1730, head: v3(0.16, 0.02, -0.03) },
      { t: 1900, head: v3() },
    ];
    const ev = run(keys, 3000);
    expect(punches(ev).map((p) => p.type)).toEqual(['cross']);
    expect(ev.filter((e) => e.kind === 'slip')).toHaveLength(0);
  });
});
