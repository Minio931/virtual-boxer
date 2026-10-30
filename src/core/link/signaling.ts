export interface SignalData {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export type ClientMessage =
  | { type: 'create'; room?: string }
  | { type: 'join'; room: string }
  | { type: 'signal'; data: SignalData };

export type ServerMessage =
  | { type: 'created'; room: string }
  | { type: 'joined'; room: string }
  | { type: 'ready' }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'signal'; data: SignalData }
  | { type: 'error'; code: string; message: string };

export function defaultSignalingUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/** Klient WebSocket do serwera sygnalizacyjnego (server/signaling.mjs). */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();

  constructor(private url: string = defaultSignalingUrl()) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        resolve();
      };
      ws.onerror = () => {
        if (!opened) reject(new Error('Nie można połączyć z serwerem sygnalizacyjnym'));
      };
      ws.onmessage = (e) => {
        let m: ServerMessage;
        try {
          m = JSON.parse(String(e.data)) as ServerMessage;
        } catch {
          return;
        }
        this.listeners.forEach((l) => l(m));
      };
      ws.onclose = () => {
        if (opened) {
          this.listeners.forEach((l) =>
            l({ type: 'error', code: 'ws-closed', message: 'Utracono połączenie z serwerem sygnalizacyjnym.' }),
          );
        }
      };
    });
  }

  on(fn: (m: ServerMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  send(m: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    if (!this.ws) return;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }
}
