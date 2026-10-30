import { Emitter } from '../util/emitter';
import { ClockSync, nowMs, type ClockEstimate } from './clock';
import { RTC_CONFIG, tuneReceiver } from './rtc';
import { SignalingClient, type ServerMessage, type SignalData } from './signaling';

export type DisplayStatus = 'connecting' | 'waiting' | 'negotiating' | 'connected' | 'disconnected' | 'error';

type Events = {
  room: string;
  status: DisplayStatus;
  stream: MediaStream | null;
  clock: ClockEstimate;
  error: string;
};

/**
 * Strona ekranu (TV/PC): tworzy pokój, czeka na telefon, odbiera wideo
 * i co sekundę mierzy RTT oraz różnicę zegarów po DataChannel.
 */
export class DisplayLink extends Emitter<Events> {
  private sig = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private clock = new ClockSync();
  private clockTimer = 0;
  private stopped = false;

  async start(preferredRoom?: string) {
    this.emit('status', 'connecting');
    this.sig.on((m) => void this.onMessage(m));
    try {
      await this.sig.connect();
    } catch {
      this.emit('status', 'error');
      this.emit('error', 'Brak połączenia z serwerem sygnalizacyjnym. Uruchom projekt przez `npm run dev`.');
      return;
    }
    if (this.stopped) {
      this.sig.close();
      return;
    }
    this.sig.send({ type: 'create', room: preferredRoom });
  }

  stop() {
    this.stopped = true;
    this.closePc();
    this.sig.close();
  }

  private async onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'created':
        this.emit('room', m.room);
        this.emit('status', 'waiting');
        break;
      case 'peer-joined':
        this.closePc();
        this.createPc();
        this.emit('status', 'negotiating');
        break;
      case 'peer-left':
        this.closePc();
        this.emit('stream', null);
        this.emit('status', 'waiting');
        break;
      case 'signal':
        await this.onSignal(m.data);
        break;
      case 'error':
        this.emit('error', m.message);
        if (m.code === 'ws-closed') this.emit('status', 'error');
        break;
      default:
        break;
    }
  }

  private createPc() {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sig.send({ type: 'signal', data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      tuneReceiver(e.receiver);
      this.emit('stream', e.streams[0] ?? new MediaStream([e.track]));
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.connectionState;
      if (s === 'connected') this.emit('status', 'connected');
      else if (s === 'failed' || s === 'disconnected') this.emit('status', 'disconnected');
    };
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'clock') this.setupClock(e.channel);
    };
  }

  private async onSignal(data: SignalData) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.sig.send({ type: 'signal', data: { sdp: pc.localDescription!.toJSON() } });
        }
        for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else this.pending.push(data.candidate);
      }
    } catch (err) {
      this.emit('error', `Błąd negocjacji WebRTC: ${(err as Error).message}`);
    }
  }

  private setupClock(ch: RTCDataChannel) {
    ch.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as { type: string; t0: number; t1: number; t2: number };
      if (msg.type === 'pong') this.emit('clock', this.clock.addSample(msg.t0, msg.t1, msg.t2, nowMs()));
    };
    const ping = () => {
      if (ch.readyState === 'open') ch.send(JSON.stringify({ type: 'ping', t0: nowMs() }));
    };
    ch.onopen = () => {
      window.clearInterval(this.clockTimer);
      ping();
      this.clockTimer = window.setInterval(ping, 1000);
    };
  }

  private closePc() {
    window.clearInterval(this.clockTimer);
    this.pc?.close();
    this.pc = null;
    this.pending = [];
    this.clock.reset();
  }
}
