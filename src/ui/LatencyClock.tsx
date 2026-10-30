import { useEffect, useRef } from 'react';

/** Zegar milisekundowy do pomiaru opóźnienia „szkło–szkło” (spike S1). */
export function LatencyClock() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.textContent = String(Math.floor(performance.now()) % 100000).padStart(5, '0');
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="absolute bottom-4 left-4 border-4 border-white bg-black px-5 py-2">
      <div className="text-xs uppercase tracking-widest text-ink-muted">zegar ekranu, ms</div>
      <div ref={ref} className="font-mono text-6xl font-bold text-white tabular" />
    </div>
  );
}
