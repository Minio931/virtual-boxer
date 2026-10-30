import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { DisplayStatus } from '../core/link/displayLink';
import { Logo } from './Logo';

interface Props {
  room: string | null;
  status: DisplayStatus;
  error: string | null;
  onUseLocal: () => void;
}

const STATUS_TEXT: Record<DisplayStatus, string> = {
  connecting: 'Łączę z serwerem…',
  waiting: 'Czekam na telefon…',
  negotiating: 'Telefon dołączył, zestawiam obraz…',
  connected: 'Połączono',
  disconnected: 'Połączenie przerwane',
  error: 'Błąd połączenia',
};

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export function PairingPanel({ room, status, error, onUseLocal }: Props) {
  const [hosts, setHosts] = useState<string[]>([]);
  const [hostIdx, setHostIdx] = useState(0);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lan')
      .then((r) => r.json() as Promise<{ addresses: { address: string }[] }>)
      .then((d) => setHosts(d.addresses.map((a) => a.address)))
      .catch(() => setHosts([]));
  }, []);

  const onLocalhost = LOCAL_HOSTS.includes(location.hostname);
  const host = !onLocalhost ? location.host : hosts[hostIdx] ? `${hosts[hostIdx]}:${location.port}` : null;
  const url = room && host ? `${location.protocol}//${host}/cam?room=${room}` : null;

  useEffect(() => {
    if (!url) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(url, { margin: 1, width: 440, color: { dark: '#0E0E10', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const dot = status === 'waiting' || status === 'negotiating' ? 'bg-warn' : status === 'error' ? 'bg-brand-400' : 'bg-defense';

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-8 px-4 py-8 lg:px-12 lg:py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="text-lg text-ink-muted">Krok 1 · połącz kamerę</span>
      </header>

      {error && (
        <div role="alert" className="border-l-4 border-brand-500 bg-surface-800 px-5 py-4 text-lg">
          {error}
        </div>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="flex flex-col gap-6">
          <h1 className="font-display text-6xl font-extrabold uppercase leading-[0.95]">
            Zeskanuj
            <br />
            telefonem
          </h1>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex size-60 items-center justify-center bg-white p-3">
              {qr ? (
                <img src={qr} alt="Kod QR do połączenia telefonu" className="size-full" />
              ) : (
                <span className="px-4 text-center text-surface-900">
                  {onLocalhost && !hosts.length ? 'Nie znam adresu w sieci lokalnej' : 'Generuję kod…'}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm uppercase tracking-widest text-ink-muted">Kod pokoju</span>
              <span className="font-display text-5xl font-bold tracking-[0.12em]">{room ?? '······'}</span>
              <div className="mt-2 flex items-center gap-3 text-lg">
                <span className={`size-2.5 rounded-full ${dot}`} />
                {STATUS_TEXT[status]}
              </div>
            </div>
          </div>
          {url && <p className="break-all text-sm text-ink-muted">{url}</p>}
          {onLocalhost && hosts.length > 1 && (
            <label className="flex items-center gap-3 text-sm text-ink-muted">
              Adres komputera w sieci:
              <select
                value={hostIdx}
                onChange={(e) => setHostIdx(Number(e.target.value))}
                className="border border-line bg-surface-800 px-2 py-1 text-ink"
              >
                {hosts.map((h, i) => (
                  <option key={h} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="max-w-md text-base leading-relaxed text-ink-muted">
            Telefon i komputer muszą być w tej samej sieci Wi-Fi. Przy pierwszym otwarciu telefon ostrzeże o
            certyfikacie (to lokalny certyfikat deweloperski) — wybierz „Zaawansowane → Przejdź do strony”.
          </p>
        </section>

        <section className="flex flex-col gap-5 border border-line bg-surface-800 p-6 lg:p-8">
          <h2 className="text-sm uppercase tracking-widest text-ink-muted">Jak ustawić telefon</h2>
          <ol className="grid gap-5 sm:grid-cols-3">
            {[
              'Telefon pod TV, na wysokości klatki piersiowej (1,2–1,5 m), najlepiej na statywie.',
              'Stań 2–3 m dalej. Cała sylwetka od kolan w górę musi być w kadrze.',
              'Dużo światła z przodu lub z boku, bez okna za plecami.',
            ].map((t, i) => (
              <li key={t} className="flex flex-col gap-1.5">
                <span className="font-display text-3xl font-extrabold text-brand-400">0{i + 1}</span>
                <span className="text-lg leading-snug">{t}</span>
              </li>
            ))}
          </ol>
          <p className="text-base text-ink-muted">
            Do testów: ustaw telefon raz na wprost, raz 20–30° z boku. Z boku lepiej widać ciosy proste.
          </p>
          <div className="flex flex-col gap-3 border-t border-line pt-5">
            <span className="text-sm text-ink-muted">Nie masz telefonu pod ręką?</span>
            <button
              type="button"
              onClick={onUseLocal}
              className="h-14 border border-line bg-surface-700 px-6 text-lg font-semibold hover:border-ink-muted"
            >
              Użyj kamery tego komputera
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
