import { buildFrames, GUARD, HOOK_POLE, punchKeys, TARGETS, type Keyframe } from '../detect/synthetic';
import { v3 } from '../math/vec';
import type { Delegate, ModelVariant, PoseResult } from './poseEngine';
import type { PoseFrame } from './types';

/** Wspólny interfejs źródła pozy: prawdziwy MediaPipe albo tryb demo. */
export interface PoseSource {
  delegate: Delegate;
  readonly ready: boolean;
  init(variant: ModelVariant): Promise<void>;
  detect(video: HTMLVideoElement, ts: number): PoseResult | null;
  close(): void;
}

/**
 * Tryb demo (`?demo` w adresie): zamiast modelu zwraca syntetyczną sylwetkę,
 * która w pętli robi 1-2, sierpowy, podbródkowy i slip. Pozwala obejrzeć interfejs bez kamery i bez modelu.
 */
export class DemoPoseSource implements PoseSource {
  delegate: Delegate = 'CPU';
  private frames: PoseFrame[] = [];
  private t0 = 0;
  private period = 6000;

  get ready() {
    return this.frames.length > 0;
  }

  async init() {
    const keys: Keyframe[] = [
      { t: 0, left: GUARD.left, right: GUARD.right, head: v3() },
      ...punchKeys('left', 1200, TARGETS.jab),
      ...punchKeys('right', 1650, TARGETS.cross),
      ...punchKeys('left', 2600, TARGETS.hookLead, undefined, 130, 220, HOOK_POLE.left),
      { t: 3300, right: GUARD.right },
      { t: 3450, right: TARGETS.uppercutFromRear },
      ...punchKeys('right', 3600, TARGETS.uppercutRear, TARGETS.uppercutFromRear, 140),
      { t: 4600, head: v3() },
      { t: 4800, head: v3(0.18, 0.03, 0) },
      { t: 5000, head: v3(0.18, 0.03, 0) },
      { t: 5250, head: v3() },
    ];
    this.frames = buildFrames(keys, this.period, 60);
    this.t0 = performance.now();
  }

  detect(_video: HTMLVideoElement, ts: number): PoseResult | null {
    const local = (ts - this.t0) % this.period;
    const f = this.frames[Math.min(this.frames.length - 1, Math.floor((local / this.period) * this.frames.length))];
    return { image: f.image, world: f.world };
  }

  close() {
    this.frames = [];
  }
}
