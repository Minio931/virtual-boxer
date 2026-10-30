import { Emitter } from '../util/emitter';
import { nowMs } from './clock';
import { RTC_CONFIG, tuneSender } from './rtc';
import { SignalingClient, type ServerMessage, type SignalData } from './signaling';

export type CamStatus = 'connecting' | 'joining' | 'negotiating' | 'connected' | 'display-left' | 'error';

type Events = { status: CamStatus; error: string };

/** Strona telefonu: dołącza do pokoju i wysyła obraz z kamery do ekranu (P2P). */
export class CamLink extends Emitter<Events> {
  private sig = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private sender: RTCRtpSender | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private stopped = false;

  constructor(
    private room: string,
    private stream: MediaStream,
  ) {
    super();
  }

  async start() {
    this.emit('status', 'connecting');
    this.sig.on((m) => void this.onMessage(m));
    try {
      await this.sig.connect();
    } catch {
      this.emit('status', 'error');
      this.emit('error', 'Nie można połączyć z serwerem. Telefon i komputer muszą być w tej samej sieci Wi-Fi.');
      return;
    }
    if (this.stopped) {
      this.sig.close();
      return;
    }
    this.emit('status', 'joining');
    this.sig.send({ type: 'join', room: this.room });
  }

  /** Podmiana kamery (przód/tył) bez ponownej negocjacji. */
  async replaceStream(stream: MediaStream) {
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    if (track) track.contentHint = 'motion';
    await this.sender?.replaceTrack(track ?? null);
  }

  stop() {
    this.stopped = true;
    this.closePc();
    this.sig.close();
  }

  private async onMessage(m: ServerMessage) {
    switch (m.type) {
      case 'ready':
        await this.negotiate();
        break;
      case 'peer-left':
        this.closePc();
        this.emit('status', 'display-left');
        break;
      case 'signal':
        await this.onSignal(m.data);
        break;
      case 'error':
        this.emit('error', m.message);
        this.emit('status', 'error');
        break;
      default:
        break;
    }
  }

  private async negotiate() {
    this.closePc();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.sig.send({ type: 'signal', data: { candidate: e.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') this.emit('status', 'connected');
      else if (pc.connectionState === 'failed') {
        this.emit('status', 'error');
        this.emit('error', 'Połączenie P2P nie powiodło się. Sprawdź, czy sieć Wi-Fi nie izoluje urządzeń.');
      }
    };

    const track = this.stream.getVideoTracks()[0];
    track.contentHint = 'motion';
    this.sender = pc.addTrack(track, this.stream);

    // Kanał do synchronizacji zegarów: bez kolejkowania i retransmisji, stare próbki są bezwartościowe
    const clock = pc.createDataChannel('clock', { ordered: false, maxRetransmits: 0 });
    clock.onmessage = (e) => {
      const t1 = nowMs();
      const msg = JSON.parse(String(e.data)) as { type: string; t0: number };
      if (msg.type === 'ping' && clock.readyState === 'open') {
        clock.send(JSON.stringify({ type: 'pong', t0: msg.t0, t1, t2: nowMs() }));
      }
    };

    this.emit('status', 'negotiating');
    await pc.setLocalDescription(await pc.createOffer());
    await tuneSender(this.sender);
    this.sig.send({ type: 'signal', data: { sdp: pc.localDescription!.toJSON() } });
  }

  private async onSignal(data: SignalData) {
    const pc = this.pc;
    if (!pc) return;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        for (const c of this.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (this.sender) await tuneSender(this.sender);
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else this.pending.push(data.candidate);
      }
    } catch (err) {
      this.emit('error', `Błąd negocjacji WebRTC: ${(err as Error).message}`);
    }
  }

  private closePc() {
    this.pc?.close();
    this.pc = null;
    this.sender = null;
    this.pending = [];
  }
}
