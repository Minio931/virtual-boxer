import { MotionAnalyzer, type DetectorConfig, type Stance } from '../detect/motionAnalyzer';
import { DETECT_SMOOTHING, DRAW_SMOOTHING, LandmarkSmoother } from '../pose/oneEuro';
import { LANDMARK_COUNT, swapLeftRight } from '../pose/landmarks';
import { PoseEngine, type Delegate, type ModelVariant } from '../pose/poseEngine';
import { DemoPoseSource, type PoseSource } from '../pose/demoSource';
import type { PoseFrame } from '../pose/types';
import { Recorder, type RecordingMeta } from '../session/recorder';
import { applyFrame, emptyStats, snapshot, type SessionStats } from '../stats/sessionStats';
import { drawPose } from '../../ui/overlay';

export interface EngineSettings {
  stance: Stance;
  swapSides: boolean;
  model: ModelVariant;
  config?: Partial<DetectorConfig>;
  /** syntetyczna sylwetka zamiast modelu (adres z ?demo) */
  demo?: boolean;
}

export type ModelStatus = 'loading' | 'ready' | 'error';

export interface PerfStats {
  modelStatus: ModelStatus;
  modelError: string | null;
  delegate: Delegate | null;
  /** detekcje na sekundę */
  detectFps: number;
  /** klatki wideo na sekundę (z kamery) */
  videoFps: number;
  inferMs: number;
  /**
   * Czas od zrobienia klatki przez kamerę do wyniku detekcji (ms).
   * Dostępny, gdy przeglądarka podaje `captureTime` dla wideo WebRTC; inaczej null.
   */
  captureToResultMs: number | null;
  /** Czas od odebrania klatki z sieci do wyniku detekcji (ms). */
  receiveToResultMs: number | null;
  width: number;
  height: number;
  poseVisible: boolean;
}

export interface EngineSnapshot {
  stats: SessionStats;
  perf: PerfStats;
  guard: boolean;
  defenseReady: boolean;
  startedAt: number;
  recordingFrames: number | null;
}

const emptyPerf = (): PerfStats => ({
  modelStatus: 'loading',
  modelError: null,
  delegate: null,
  detectFps: 0,
  videoFps: 0,
  inferMs: 0,
  captureToResultMs: null,
  receiveToResultMs: null,
  width: 0,
  height: 0,
  poseVisible: false,
});

const ema = (prev: number, next: number, a = 0.1) => (prev ? prev + a * (next - prev) : next);

/**
 * Pętla treningowa poza Reactem: klatka wideo → MediaPipe → wygładzanie → analiza ruchu → statystyki.
 * React dostaje migawkę stanu ~10 razy na sekundę, a szkielet jest rysowany bezpośrednio na canvasie.
 */
export class TrainingEngine {
  readonly recorder = new Recorder();
  private pose: PoseSource;
  private analyzer: MotionAnalyzer;
  private drawSmoother = new LandmarkSmoother(LANDMARK_COUNT, DRAW_SMOOTHING);
  private detectSmoother = new LandmarkSmoother(LANDMARK_COUNT, DETECT_SMOOTHING);
  private stats: SessionStats = emptyStats();
  private perf: PerfStats = emptyPerf();
  private guard = false;
  private defenseReady = false;
  private startedAt = performance.now();
  private rvfc = 0;
  private running = false;
  private lastVideoT = 0;
  private lastDetectT = 0;
  private lastEmit = 0;
  private ctx: CanvasRenderingContext2D | null;

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
    private settings: EngineSettings,
    private onSnapshot: (s: EngineSnapshot) => void,
  ) {
    this.pose = settings.demo ? new DemoPoseSource() : new PoseEngine();
    this.analyzer = new MotionAnalyzer(settings.config, settings.stance, settings.swapSides);
    this.ctx = canvas.getContext('2d');
  }

  async start() {
    this.running = true;
    await this.loadModel(this.settings.model);
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.rvfc) this.video.cancelVideoFrameCallback(this.rvfc);
    this.rvfc = 0;
    this.pose.close();
  }

  async updateSettings(s: Partial<EngineSettings>) {
    const modelChanged = s.model && s.model !== this.settings.model;
    this.settings = { ...this.settings, ...s };
    this.analyzer.stance = this.settings.stance;
    this.analyzer.swapSides = this.settings.swapSides;
    if (s.config) this.analyzer.setConfig(s.config);
    if (modelChanged) await this.loadModel(this.settings.model);
  }

  resetStats() {
    this.stats = emptyStats();
    this.startedAt = performance.now();
    this.analyzer.reset();
    this.emit(true);
  }

  startRecording(meta: Omit<RecordingMeta, 'stance' | 'swapSides' | 'model' | 'videoWidth' | 'videoHeight' | 'startedAt' | 'userAgent' | 'config'>) {
    this.recorder.start({
      ...meta,
      stance: this.settings.stance,
      swapSides: this.settings.swapSides,
      model: this.settings.model,
      delegate: this.perf.delegate ?? undefined,
      detectFps: Math.round(this.perf.detectFps),
      videoWidth: this.video.videoWidth,
      videoHeight: this.video.videoHeight,
      startedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      config: this.analyzer.config,
    });
    this.emit(true);
  }

  stopRecording() {
    const r = this.recorder.stop();
    this.emit(true);
    return r;
  }

  private async loadModel(model: ModelVariant) {
    this.perf.modelStatus = 'loading';
    this.perf.modelError = null;
    this.emit(true);
    try {
      await this.pose.init(model);
      this.perf.modelStatus = 'ready';
      this.perf.delegate = this.pose.delegate;
    } catch (err) {
      this.perf.modelStatus = 'error';
      this.perf.modelError =
        (err as Error).message ||
        'Nie udało się wczytać modelu pozy. Sprawdź internet albo pobierz model: npm run models.';
    }
    this.emit(true);
  }

  private schedule() {
    if (!this.running) return;
    this.rvfc = this.video.requestVideoFrameCallback(this.onFrame);
  }

  private onFrame = (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
    if (!this.running) return;
    const v = this.video;
    if (this.lastVideoT) this.perf.videoFps = ema(this.perf.videoFps, 1000 / Math.max(1, now - this.lastVideoT));
    this.lastVideoT = now;
    this.perf.width = v.videoWidth;
    this.perf.height = v.videoHeight;

    if (this.canvas.width !== v.videoWidth || this.canvas.height !== v.videoHeight) {
      this.canvas.width = v.videoWidth;
      this.canvas.height = v.videoHeight;
    }

    if (this.pose.ready && v.videoWidth > 0) this.process(meta);

    this.emit(false);
    this.schedule();
  };

  private process(meta: VideoFrameCallbackMetadata) {
    const t0 = performance.now();
    const captureT = meta.captureTime ?? meta.receiveTime ?? meta.presentationTime ?? t0;
    let result;
    try {
      // Znacznik czasu przechwycenia klatki: spójny z czasem, którego używa analiza ruchu
      result = this.pose.detect(this.video, captureT);
    } catch (err) {
      this.perf.modelStatus = 'error';
      this.perf.modelError = (err as Error).message;
      return;
    }
    const t1 = performance.now();
    this.perf.inferMs = ema(this.perf.inferMs, t1 - t0);
    if (this.lastDetectT) this.perf.detectFps = ema(this.perf.detectFps, 1000 / Math.max(1, t1 - this.lastDetectT));
    this.lastDetectT = t1;

    if (meta.captureTime !== undefined) this.perf.captureToResultMs = ema(this.perf.captureToResultMs ?? 0, t1 - meta.captureTime);
    if (meta.receiveTime !== undefined) this.perf.receiveToResultMs = ema(this.perf.receiveToResultMs ?? 0, t1 - meta.receiveTime);

    this.perf.poseVisible = !!result;
    if (!result) {
      if (this.ctx) drawPose(this.ctx, null, { activeLeft: false, activeRight: false, guard: false, minVisibility: 0.5 });
      return;
    }

    const raw: PoseFrame = { t: t0, captureT, image: result.image, world: result.world };
    const tSec = captureT / 1000;
    const frame: PoseFrame = { ...raw, world: this.detectSmoother.smooth(raw.world, tSec) };
    if (this.video.videoHeight > 0) this.analyzer.imageAspect = this.video.videoWidth / this.video.videoHeight;
    const out = this.analyzer.update(frame);
    this.guard = out.guard;
    this.defenseReady = out.defenseReady;
    applyFrame(this.stats, out.events, out.guard, out.active.left || out.active.right);
    this.recorder.push(raw, out.events);

    if (this.ctx) {
      const drawn = this.drawSmoother.smooth(raw.image, tSec);
      drawPose(this.ctx, this.settings.swapSides ? swapLeftRight(drawn) : drawn, {
        activeLeft: out.active.left,
        activeRight: out.active.right,
        guard: out.guard,
        minVisibility: this.analyzer.config.minVisibility,
      });
    }
    if (out.events.length) this.emit(true);
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.onSnapshot({
      stats: snapshot(this.stats),
      perf: { ...this.perf },
      guard: this.guard,
      defenseReady: this.defenseReady,
      startedAt: this.startedAt,
      recordingFrames: this.recorder.active ? this.recorder.frameCount : null,
    });
  }
}
