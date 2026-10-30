import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { PUNCH_LABEL } from './labels';

/** Duży napis z ostatnią akcją, czytelny z 2–3 m. Znika po 0,9 s. */
export function EventFlash() {
  const last = useAppStore((s) => s.snap?.stats.recent[0]);
  const [shown, setShown] = useState<typeof last>(undefined);

  useEffect(() => {
    if (!last) return;
    setShown(last);
    const id = window.setTimeout(() => setShown(undefined), 900);
    return () => window.clearTimeout(id);
  }, [last]); // obiekty zdarzeń są stabilne między migawkami, więc zmienia się tylko przy nowej akcji

  if (!shown) return null;
  const isPunch = shown.kind === 'punch';
  const text = isPunch ? PUNCH_LABEL[shown.type] : shown.kind === 'slip' ? `Slip ${shown.dir === 'left' ? 'L' : 'P'}` : 'Schylenie';
  const sub = isPunch ? `${shown.side === 'left' ? 'lewa' : 'prawa'} · ${shown.target === 'head' ? 'głowa' : 'korpus'}` : 'obrona';

  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/4 flex flex-col items-center">
      <div className={`px-6 py-2 font-display text-6xl font-extrabold uppercase ${isPunch ? 'bg-brand-500' : 'bg-defense text-surface-950'}`}>
        {text}
      </div>
      <div className="mt-1 bg-surface-950/80 px-3 py-1 text-xl">{sub}</div>
    </div>
  );
}
