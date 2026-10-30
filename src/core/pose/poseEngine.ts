import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './types';
import type { PoseSource } from './demoSource';

export type ModelVariant = 'lite' | 'full' | 'heavy';
export type Delegate = 'GPU' | 'CPU';

const BASE = import.meta.env.BASE_URL;
const WASM_BASE = `${BASE}mediapipe/wasm`;
const remoteModel = (v: ModelVariant) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;
const localModel = (v: ModelVariant) => `${BASE}models/pose_landmarker_${v}.task`;

async function resolveModel(v: ModelVariant): Promise<string> {
  // Model pobrany przez `npm run models` ma pierwszeństwo (działa offline, szybszy start)
  try {
    const r = await fetch(localModel(v), { method: 'HEAD' });
    const type = r.headers.get('content-type') ?? '';
    if (r.ok && !type.includes('text/html')) return localModel(v);
  } catch {
    /* brak lokalnego modelu */
  }
  return remoteModel(v);
}

export interface PoseResult {
  image: Landmark[];
  world: Landmark[];
}

/** Opakowanie MediaPipe Pose Landmarker (33 punkty + współrzędne world w metrach). */
export class PoseEngine implements PoseSource {
  private lm: PoseLandmarker | null = null;
  private lastTs = 0;
  delegate: Delegate = 'GPU';
  variant: ModelVariant = 'full';

  async init(variant: ModelVariant) {
    this.close();
    this.variant = variant;
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const modelAssetPath = await resolveModel(variant);
    const create = (delegate: Delegate) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      });
    try {
      this.lm = await create('GPU');
      this.delegate = 'GPU';
    } catch {
      this.lm = await create('CPU');
      this.delegate = 'CPU';
    }
  }

  get ready() {
    return this.lm !== null;
  }

  /** @param ts znacznik czasu w ms; MediaPipe wymaga, by rósł monotonicznie */
  detect(video: HTMLVideoElement, ts: number): PoseResult | null {
    if (!this.lm) return null;
    const t = ts <= this.lastTs ? this.lastTs + 1 : ts;
    this.lastTs = t;
    const r = this.lm.detectForVideo(video, t);
    const img = r.landmarks[0];
    const w = r.worldLandmarks[0];
    if (!img || !w) return null;
    return {
      image: img.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 })),
      world: w.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 })),
    };
  }

  close() {
    this.lm?.close();
    this.lm = null;
    this.lastTs = 0;
  }
}
