import type { RefObject } from 'react';
import type { TrainingEngine } from '../core/engine/trainingEngine';
import type { ModelVariant } from '../core/pose/poseEngine';
import { useAppStore } from '../stores/appStore';
import { Panel } from './Panel';

interface Props {
  engineRef: RefObject<TrainingEngine | null>;
  latencyTest: boolean;
  setLatencyTest: (v: boolean) => void;
  onExit?: () => void;
}

const btn = 'h-11 border px-3 text-sm font-semibold';
const on = 'border-ink bg-ink text-surface-900';
const off = 'border-line bg-surface-700 text-ink hover:border-ink-muted';

export function ControlsPanel({ engineRef, latencyTest, setLatencyTest, onExit }: Props) {
  const settings = useAppStore((s) => s.settings);
  const set = useAppStore((s) => s.setSettings);

  return (
    <Panel title="Ustawienia">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 flex" role="group" aria-label="Postawa">
          {(['orthodox', 'southpaw'] as const).map((s) => (
            <button key={s} type="button" onClick={() => set({ stance: s })} className={`${btn} flex-1 ${settings.stance === s ? on : off}`}>
              {s === 'orthodox' ? 'Orthodox (lewa z przodu)' : 'Southpaw (prawa z przodu)'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => set({ swapSides: !settings.swapSides })} className={`${btn} ${settings.swapSides ? on : off}`}>
          Zamień lewa/prawa
        </button>
        <button type="button" onClick={() => engineRef.current?.resetStats()} className={`${btn} ${off}`}>
          Wyzeruj licznik
        </button>
        <div className="col-span-2 flex" role="group" aria-label="Model pozy">
          {(['lite', 'full', 'heavy'] as ModelVariant[]).map((m) => (
            <button key={m} type="button" onClick={() => set({ model: m })} className={`${btn} flex-1 ${settings.model === m ? on : off}`}>
              {m === 'lite' ? 'Model lite' : m === 'full' ? 'Model full' : 'Model heavy'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => set({ mirror: !settings.mirror })} className={`${btn} ${settings.mirror ? on : off}`}>
          Lustro
        </button>
        <button type="button" onClick={() => set({ showSkeleton: !settings.showSkeleton })} className={`${btn} ${settings.showSkeleton ? on : off}`}>
          Szkielet
        </button>
        <button type="button" onClick={() => setLatencyTest(!latencyTest)} className={`${btn} col-span-2 ${latencyTest ? on : off}`}>
          Test opóźnienia
        </button>
        {onExit && (
          <button type="button" onClick={onExit} className={`${btn} col-span-2 border-brand-400 bg-transparent text-brand-400`}>
            Wróć do parowania telefonu
          </button>
        )}
      </div>
      {latencyTest && (
        <p className="text-sm leading-relaxed text-ink-soft">
          Skieruj kamerę na ten ekran, tak żeby w podglądzie było widać zegar. Zrób zrzut ekranu (Win+Shift+S / Cmd+Shift+4):
          różnica między zegarem na żywo a zegarem w podglądzie to opóźnienie „szkło–szkło”. Powtórz 5 razy i weź medianę.
        </p>
      )}
    </Panel>
  );
}
