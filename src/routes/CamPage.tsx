import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CamLink, type CamStatus } from '../core/link/camLink';
import { Logo } from '../ui/Logo';

type Facing = 'environment' | 'user';

const STATUS_TEXT: Record<CamStatus | 'idle', string> = {
  idle: 'Gotowy do startu',
  connecting: 'Łączę z serwerem…',
  joining: 'Dołączam do ekranu…',
  negotiating: 'Zestawiam obraz…',
  connected: 'Połączono',
  'display-left': 'Ekran się rozłączył',
  error: 'Błąd',
};

function openCamera(facing: Facing) {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60, max: 60 },
    },
    audio: false,
  });
}

function describe(stream: MediaStream) {
  const s = stream.getVideoTracks()[0]?.getSettings();
  return s ? `${s.width ?? '?'}×${s.height ?? '?'} · ${Math.round(s.frameRate ?? 0)} kl./s` : '';
}

/** Strona telefonu: kamera → ekran. Telefon tylko nadaje obraz. */
export function CamPage() {
  const [params] = useSearchParams();
  const [room, setRoom] = useState((params.get('room') ?? '').toUpperCase());
  const [facing, setFacing] = useState<Facing>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState('');
  const [dimmed, setDimmed] = useState(false);
  const linkRef = useRef<CamLink | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    streamRef.current = stream;
  }, [stream]);

  useEffect(
    () => () => {
      linkRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void wakeRef.current?.release().catch(() => {});
    },
    [],
  );

  // Ekran telefonu nie może zgasnąć w trakcie treningu
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && streamRef.current) void requestWake();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  async function requestWake() {
    try {
      wakeRef.current = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      /* brak wsparcia albo odmowa */
    }
  }

  async function start() {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Kamera działa tylko na stronie https. Otwórz adres z kodu QR (zaczyna się od https://).');
      return;
    }
    if (!/^[A-Z0-9]{6}$/.test(room)) {
      setError('Wpisz 6-znakowy kod pokoju z ekranu.');
      return;
    }
    try {
      const s = await openCamera(facing);
      setStream(s);
      setInfo(describe(s));
      linkRef.current?.stop();
      const link = new CamLink(room, s);
      linkRef.current = link;
      link.on('status', setStatus);
      link.on('error', setError);
      await link.start();
      await requestWake();
    } catch (e) {
      setError(`Brak dostępu do kamery: ${(e as Error).message}`);
    }
  }

  async function flip() {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    try {
      stream?.getTracks().forEach((t) => t.stop());
      const s = await openCamera(next);
      setFacing(next);
      setStream(s);
      setInfo(describe(s));
      await linkRef.current?.replaceStream(s);
    } catch (e) {
      setError(`Nie udało się przełączyć kamery: ${(e as Error).message}`);
    }
  }

  function disconnect() {
    linkRef.current?.stop();
    linkRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setStatus('idle');
  }

  const dot = status === 'connected' ? 'bg-defense' : status === 'error' || status === 'display-left' ? 'bg-brand-400' : 'bg-warn';
  const started = stream !== null;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-5">
      <header className="flex items-center justify-between pt-2">
        <Logo small />
        <span className="flex items-center gap-2 rounded-full border border-line bg-surface-800 px-3 py-1 text-sm" data-testid="cam-status">
          <span className={`size-2 rounded-full ${dot}`} />
          {STATUS_TEXT[status]}
        </span>
      </header>

      {error && (
        <div role="alert" className="border-l-4 border-brand-500 bg-surface-800 px-4 py-3">
          {error}
        </div>
      )}

      <div className="relative aspect-[3/4] overflow-hidden border border-line bg-surface-800">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={`size-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
        />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-ink-muted">
            Podgląd pojawi się po uruchomieniu kamery
          </div>
        )}
        {info && <span className="absolute left-3 top-3 bg-surface-950/80 px-2 py-1 text-sm font-semibold">{info}</span>}
      </div>

      {!started ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-muted">Kod pokoju z ekranu</span>
            <input
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase().slice(0, 6))}
              inputMode="text"
              autoCapitalize="characters"
              className="h-14 border border-line bg-surface-800 px-4 font-display text-3xl font-bold tracking-[0.2em]"
              aria-label="Kod pokoju"
            />
          </label>
          <button type="button" onClick={start} className="h-16 bg-brand-500 font-display text-2xl font-extrabold uppercase">
            Uruchom kamerę
          </button>
          <p className="text-sm text-ink-muted">
            Tylna kamera daje lepszy obraz. Telefon postaw pod ekranem, ekranem telefonu do siebie albo od siebie — jak wygodniej.
          </p>
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={flip} className="h-12 border border-line bg-surface-800 font-semibold">
              Przełącz kamerę
            </button>
            <button type="button" onClick={() => setDimmed(true)} className="h-12 border border-line bg-surface-800 font-semibold">
              Przyciemnij
            </button>
            <button type="button" onClick={disconnect} className="h-12 border border-brand-400 font-semibold text-brand-400">
              Rozłącz
            </button>
          </div>
          <p className="text-center font-display text-xl font-bold uppercase tracking-wide">Odłóż telefon i wróć przed ekran</p>
          <p className="text-center text-sm text-ink-muted">Podłącz ładowarkę — kamera i wysyłanie obrazu mocno zużywają baterię.</p>
        </>
      )}

      {dimmed && (
        <button
          type="button"
          onClick={() => setDimmed(false)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black text-ink-muted"
          aria-label="Rozjaśnij ekran"
        >
          <span className={`size-3 rounded-full ${dot}`} />
          <span>{STATUS_TEXT[status]} · dotknij, aby rozjaśnić</span>
        </button>
      )}
    </div>
  );
}
