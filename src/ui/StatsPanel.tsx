import { guardPercent, punchesPerMinute } from '../core/stats/sessionStats';
import { useAppStore } from '../stores/appStore';
import { PUNCH_LABEL, eventLabel } from './labels';
import { Panel } from './Panel';

export function StatsPanel() {
  const snap = useAppStore((s) => s.snap);
  if (!snap) return null;
  const { stats } = snap;
  const total = stats.punches;
  const leftPct = total ? Math.round((100 * stats.bySide.left) / total) : 50;
  const ppm = punchesPerMinute(stats, performance.now(), snap.startedAt);

  return (
    <Panel title="Sesja">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-7xl font-extrabold leading-none tabular" data-testid="punch-total">
            {total}
          </div>
          <div className="text-ink-muted">ciosów · {ppm}/min</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-semibold ${snap.guard ? 'text-defense' : 'text-ink-muted'}`}>
            {snap.guard ? 'Garda w górze' : 'Garda opuszczona'}
          </div>
          <div className="text-ink-muted">garda {guardPercent(stats)}% czasu</div>
        </div>
      </div>

      <div className="flex h-9 font-display text-xl font-bold" aria-label="Lewa kontra prawa ręka">
        <div className="flex items-center bg-ink pl-3 text-surface-900" style={{ width: `${leftPct}%`, minWidth: '4rem' }}>
          L {stats.bySide.left}
        </div>
        <div className="flex flex-1 items-center justify-end bg-brand-500 pr-3" style={{ minWidth: '4rem' }}>
          P {stats.bySide.right}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(PUNCH_LABEL) as (keyof typeof PUNCH_LABEL)[]).map((k) => (
          <div key={k} className="bg-surface-700 px-2 py-2">
            <div className="text-xs text-ink-muted">{PUNCH_LABEL[k]}</div>
            <div className="font-display text-3xl font-bold tabular">{stats.byType[k]}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2 text-sm">
        <Mini label="Głowa" value={stats.byTarget.head} />
        <Mini label="Korpus" value={stats.byTarget.body} />
        <Mini label="Slip L/P" value={`${stats.slips.left}/${stats.slips.right}`} tone="defense" />
        <Mini label="Schylenia" value={stats.ducks} tone="defense" />
      </div>
      {!snap.defenseReady && (
        <p className="text-sm text-warn">Stań spokojnie w gardzie na sekundę — kalibruję pozycję głowy dla uników.</p>
      )}

      {stats.recent.length > 0 && (
        <ol className="flex flex-col gap-1 border-t border-line pt-3 text-sm" aria-label="Ostatnie akcje">
          {stats.recent.slice(0, 5).map((e, i) => (
            <li key={`${e.t}-${i}`} className={`flex justify-between ${i === 0 ? 'text-ink' : 'text-ink-muted'}`}>
              <span>{eventLabel(e)}</span>
              {e.kind === 'punch' && (
                <span className="tabular">
                  {e.durationMs} ms · {e.elbowAngle}° · {Math.round(e.confidence * 100)}%
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Mini({ label, value, tone }: { label: string; value: number | string; tone?: 'defense' }) {
  return (
    <div className="bg-surface-700 px-2 py-2">
      <div className={`text-xs ${tone === 'defense' ? 'text-defense' : 'text-ink-muted'}`}>{label}</div>
      <div className="font-display text-2xl font-bold tabular">{value}</div>
    </div>
  );
}
