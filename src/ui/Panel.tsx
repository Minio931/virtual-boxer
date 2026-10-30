import type { ReactNode } from 'react';

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border border-line bg-surface-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-muted">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
