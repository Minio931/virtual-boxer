import { useAppStore } from '../stores/appStore';
import { Panel } from './Panel';

const ms = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);

export function PerfPanel() {
  const perf = useAppStore((s) => s.snap?.perf);
  const link = useAppStore((s) => s.link);
  if (!perf) return null;
  const rows: [string, string, string?][] = [
    ['Detekcja', `${Math.round(perf.detectFps)} kl./s`, perf.detectFps && perf.detectFps < 24 ? 'warn' : undefined],
    ['Obraz z kamery', `${Math.round(perf.videoFps)} kl./s · ${perf.width}×${perf.height}`],
    ['Czas modelu', ms(perf.inferMs), perf.inferMs > 33 ? 'warn' : undefined],
    ['Kamera → wynik', ms(perf.captureToResultMs)],
    ['Odbiór → wynik', ms(perf.receiveToResultMs)],
    ['RTT telefon ↔ ekran', ms(link.rttMs)],
    ['Model', perf.modelStatus === 'ready' ? `gotowy · ${perf.delegate}` : perf.modelStatus === 'loading' ? 'wczytywanie…' : 'błąd'],
  ];
  return (
    <Panel title="Wydajność">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="perf">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className={`text-right tabular ${tone === 'warn' ? 'text-warn' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-ink-muted">
        „Kamera → wynik” pokazuje się, gdy przeglądarka podaje czas zrobienia klatki. Pełne opóźnienie ze ekranem TV zmierzysz
        testem opóźnienia.
      </p>
    </Panel>
  );
}
