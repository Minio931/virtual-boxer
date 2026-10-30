import { useEffect, useState } from 'react';
import { DisplayLink, type DisplayStatus } from '../core/link/displayLink';
import { useAppStore } from '../stores/appStore';
import { PairingPanel } from '../ui/PairingPanel';
import { TrainingView } from '../ui/TrainingView';

type Source = 'phone' | 'local';

/** Ekran na TV/PC: parowanie telefonu, a po połączeniu widok treningu. */
export function DisplayPage() {
  const [source, setSource] = useState<Source>('phone');
  const [room, setRoom] = useState<string | null>(null);
  const [status, setStatus] = useState<DisplayStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const setLink = useAppStore((s) => s.setLink);

  useEffect(() => {
    if (source !== 'phone') return;
    const link = new DisplayLink();
    const offs = [
      link.on('room', setRoom),
      link.on('status', (s) => {
        setStatus(s);
        if (s === 'connected') setError(null);
      }),
      link.on('error', setError),
      link.on('stream', setStream),
      link.on('clock', (c) => setLink({ rttMs: c.rttMs, offsetMs: c.offsetMs })),
    ];
    void link.start();
    return () => {
      offs.forEach((off) => off());
      link.stop();
      setStream(null);
      setRoom(null);
      setLink({ rttMs: null, offsetMs: null });
    };
  }, [source, setLink]);

  useEffect(() => {
    if (source !== 'local') return;
    let cancelled = false;
    let local: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        local = s;
        setStream(s);
      })
      .catch((e: Error) => {
        setError(`Brak dostępu do kamery komputera: ${e.message}`);
        setSource('phone');
      });
    return () => {
      cancelled = true;
      local?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [source]);

  if (stream) {
    return (
      <TrainingView
        stream={stream}
        sourceLabel={source === 'phone' ? 'Telefon' : 'Kamera komputera'}
        connection={source === 'phone' ? status : 'connected'}
        onExit={source === 'local' ? () => setSource('phone') : undefined}
      />
    );
  }
  return <PairingPanel room={room} status={status} error={error} onUseLocal={() => setSource('local')} />;
}
