export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className={`font-display font-extrabold uppercase tracking-wide ${small ? 'text-xl' : 'text-3xl'}`}>
      Virtual<span className="text-brand-400"> Boxer</span>
    </div>
  );
}
