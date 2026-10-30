import { useState, type RefObject } from 'react';
import type { TrainingEngine } from '../core/engine/trainingEngine';
import type { RecordingProtocol } from '../core/session/recorder';
import { useAppStore } from '../stores/appStore';
import { MIN_RELIABLE_FPS } from '../core/detect/motionAnalyzer';
import { downloadJson } from './download';
import { Panel } from './Panel';

const PROTOCOLS: { id: RecordingProtocol; label: string }[] = [
  { id: 'jab', label: 'Jab (ręka prowadząca)' },
  { id: 'cross', label: 'Cross (ręka tylna)' },
  { id: 'hook-lead', label: 'Sierpowy prowadzącą' },
  { id: 'hook-rear', label: 'Sierpowy tylną' },
  { id: 'uppercut-lead', label: 'Podbródkowy prowadzącą' },
  { id: 'uppercut-rear', label: 'Podbródkowy tylną' },
  { id: 'mixed', label: 'Kombinacje (mieszane)' },
  { id: 'slip', label: 'Slipy L/P' },
  { id: 'duck', label: 'Schylenia' },
  { id: 'free', label: 'Dowolnie' },
];

const CAMERA_SETUPS = [
  { id: 'front', label: 'Na wprost' },
  { id: 'bok-30', label: '20–30° z boku' },
  { id: 'bok-45', label: '45° z boku' },
];

interface Summary {
  file: string;
  frames: number;
  seconds: number;
  punches: number;
  expected: number | null;
}

/** Nagrywanie danych do spike'u S2: protokół + deklarowana liczba powtórzeń = etykieta pliku. */
export function RecordPanel({ engineRef }: { engineRef: RefObject<TrainingEngine | null> }) {
  const recordingFrames = useAppStore((s) => s.snap?.recordingFrames ?? null);
  const detectFps = useAppStore((s) => s.snap?.perf.detectFps ?? 0);
  const [protocol, setProtocol] = useState<RecordingProtocol>('jab');
  const [cameraSetup, setCameraSetup] = useState('front');
  const [expected, setExpected] = useState(20);
  const [summary, setSummary] = useState<Summary | null>(null);
  const recording = recordingFrames !== null;

  const start = () => {
    setSummary(null);
    engineRef.current?.resetStats();
    engineRef.current?.startRecording({ protocol, cameraSetup, expectedCount: expected > 0 ? expected : null });
  };

  const stop = () => {
    const rec = engineRef.current?.stopRecording();
    if (!rec) return;
    const stamp = rec.meta.startedAt.replace(/[:.]/g, '-').slice(0, 19);
    const file = `vb-${rec.meta.protocol}-${rec.meta.cameraSetup}-${stamp}.json`;
    downloadJson(rec, file);
    const f = rec.frames;
    setSummary({
      file,
      frames: f.length,
      seconds: f.length > 1 ? Math.round((f[f.length - 1].t - f[0].t) / 100) / 10 : 0,
      punches: rec.events.filter((e) => e.kind === 'punch').length,
      expected: rec.meta.expectedCount,
    });
  };

  return (
    <Panel
      title="Nagranie testowe"
      right={recording ? <span className="text-sm font-semibold text-brand-400">● REC {recordingFrames} kl.</span> : undefined}
    >
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-ink-muted">Co nagrywasz</span>
          <select disabled={recording} value={protocol} onChange={(e) => setProtocol(e.target.value as RecordingProtocol)} className="h-10 border border-line bg-surface-700 px-2">
            {PROTOCOLS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Kamera</span>
          <select disabled={recording} value={cameraSetup} onChange={(e) => setCameraSetup(e.target.value)} className="h-10 border border-line bg-surface-700 px-2">
            {CAMERA_SETUPS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted">Ile powtórzeń</span>
          <input
            disabled={recording}
            type="number"
            min={0}
            max={500}
            value={expected}
            onChange={(e) => setExpected(Number(e.target.value))}
            className="h-10 border border-line bg-surface-700 px-2"
          />
        </label>
      </div>
      {detectFps > 0 && detectFps < MIN_RELIABLE_FPS && (
        <p className="text-sm text-warn">
          Detekcja ma {Math.round(detectFps)} kl./s — nagranie będzie mało przydatne. Najpierw podnieś FPS (lżejszy model).
        </p>
      )}
      {recording ? (
        <button type="button" onClick={stop} className="h-12 bg-ink font-display text-xl font-bold uppercase text-surface-900">
          Zatrzymaj i pobierz JSON
        </button>
      ) : (
        <button type="button" onClick={start} className="h-12 bg-brand-500 font-display text-xl font-bold uppercase">
          Start nagrania
        </button>
      )}
      {summary && (
        <p className="text-sm leading-relaxed text-ink-soft">
          Zapisano <b>{summary.file}</b> ({summary.frames} klatek, {summary.seconds} s). Wykryto {summary.punches} ciosów
          {summary.expected ? ` na ${summary.expected} deklarowanych` : ''}. Po zmianie progów sprawdź offline: <code>npm run eval -- {summary.file}</code>
        </p>
      )}
    </Panel>
  );
}
