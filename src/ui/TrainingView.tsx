import { useEffect, useRef, useState } from 'react';
import { TrainingEngine } from '../core/engine/trainingEngine';
import type { DisplayStatus } from '../core/link/displayLink';
import { useAppStore } from '../stores/appStore';
import { MIN_RELIABLE_FPS } from '../core/detect/motionAnalyzer';
import { ControlsPanel } from './ControlsPanel';
import { EventFlash } from './EventFlash';
import { LatencyClock } from './LatencyClock';
import { Logo } from './Logo';
import { PerfPanel } from './PerfPanel';
import { RecordPanel } from './RecordPanel';
import { StatsPanel } from './StatsPanel';

interface Props {
  stream: MediaStream;
  sourceLabel: string;
  connection: DisplayStatus;
  onExit?: () => void;
}

export function TrainingView({ stream, sourceLabel, connection, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<TrainingEngine | null>(null);
  const settings = useAppStore((s) => s.settings);
  const setSnap = useAppStore((s) => s.setSnap);
  const modelStatus = useAppStore((s) => s.snap?.perf.modelStatus);
  const modelError = useAppStore((s) => s.snap?.perf.modelError);
  const poseVisible = useAppStore((s) => s.snap?.perf.poseVisible);
  const detectFps = useAppStore((s) => s.snap?.perf.detectFps ?? 0);
  const delegate = useAppStore((s) => s.snap?.perf.delegate);
  const setSettings = useAppStore((s) => s.setSettings);
  const [latencyTest, setLatencyTest] = useState(false);

  useEffect(() => {
    const v = videoRef.current!;
    v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);

  // Silnik tworzymy raz na strumień; zmiany ustawień idą przez updateSettings
  useEffect(() => {
    const { stance, swapSides, model } = useAppStore.getState().settings;
    const demo = new URLSearchParams(location.search).has('demo');
    const engine = new TrainingEngine(videoRef.current!, canvasRef.current!, { stance, swapSides, model, demo }, setSnap);
    engineRef.current = engine;
    void engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
      setSnap(null);
    };
  }, [stream, setSnap]);

  useEffect(() => {
    void engineRef.current?.updateSettings({ stance: settings.stance, swapSides: settings.swapSides, model: settings.model });
  }, [settings.stance, settings.swapSides, settings.model]);

  const mirrored = settings.mirror && !latencyTest;
  const isDemo = new URLSearchParams(location.search).has('demo');
  const connWarn = connection === 'disconnected' || connection === 'error';

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:flex-row lg:p-6">
      <div className="relative min-h-[50vh] min-w-0 flex-1 overflow-hidden border border-line bg-surface-950">
        <div className={`absolute inset-0 ${mirrored ? '-scale-x-100' : ''}`}>
          <video ref={videoRef} muted playsInline autoPlay data-testid="display-video" className="absolute inset-0 size-full object-contain" />
          <canvas ref={canvasRef} className={`absolute inset-0 size-full object-contain ${settings.showSkeleton ? '' : 'hidden'}`} />
        </div>

        <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="bg-surface-950/85 px-3 py-1.5"><Logo small /></span>
            <span className="bg-surface-950/85 px-3 py-1.5 text-base font-semibold">{sourceLabel}</span>
            {isDemo && <span className="bg-warn px-3 py-1.5 text-base font-semibold text-surface-950">Tryb demo</span>}
            {connWarn && <span className="bg-brand-500 px-3 py-1.5 text-base font-semibold">Połączenie przerwane</span>}
          </div>
          {modelStatus === 'loading' && <span className="bg-surface-950/85 px-3 py-1.5 text-base">Wczytuję model pozy…</span>}
          {modelStatus === 'ready' && !poseVisible && (
            <span className="bg-warn px-3 py-1.5 text-base font-semibold text-surface-950">Nie widzę sylwetki — wejdź w kadr</span>
          )}
        </div>

        {modelStatus === 'ready' && detectFps > 0 && detectFps < MIN_RELIABLE_FPS && (
          <div role="alert" className="absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-3 border-l-4 border-warn bg-surface-950/90 px-4 py-3">
            <span className="flex-1">
              <b>Za mało klatek: {Math.round(detectFps)}/s</b> (potrzeba ≥ {MIN_RELIABLE_FPS}, najlepiej 25+). Cios trwa 130–300 ms, więc część ciosów
              przepadnie. {delegate === 'CPU' && 'Model liczy się na CPU — włącz akcelerację sprzętową w Chrome (chrome://settings/system). '}
            </span>
            {settings.model !== 'lite' && (
              <button type="button" onClick={() => setSettings({ model: settings.model === 'heavy' ? 'full' : 'lite' })} className="h-11 bg-warn px-4 font-semibold text-surface-950">
                Przełącz na {settings.model === 'heavy' ? 'full' : 'lite'}
              </button>
            )}
          </div>
        )}

        {modelStatus === 'error' && (
          <div role="alert" className="absolute inset-x-4 bottom-4 border-l-4 border-brand-500 bg-surface-950/90 px-4 py-3">
            <b>Model pozy się nie wczytał</b> ({modelError}). Sprawdź internet, spróbuj modelu „lite” albo pobierz model
            lokalnie: <code>npm run models</code>.
          </div>
        )}

        <EventFlash />
        {latencyTest && <LatencyClock />}
      </div>

      <aside className="flex w-full flex-col gap-3 lg:w-[390px] lg:overflow-y-auto">
        <StatsPanel />
        <ControlsPanel engineRef={engineRef} latencyTest={latencyTest} setLatencyTest={setLatencyTest} onExit={onExit} />
        <RecordPanel engineRef={engineRef} />
        <PerfPanel />
      </aside>
    </div>
  );
}
