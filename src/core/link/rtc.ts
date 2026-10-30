/** Wspólne ustawienia WebRTC. W sieci domowej wystarczą kandydaci lokalni i STUN; TURN dojdzie później. */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/** Prosi przeglądarkę o jak najmniejszy bufor po stronie odbiorcy (Chrome). */
export function tuneReceiver(r: RTCRtpReceiver) {
  const rr = r as RTCRtpReceiver & { jitterBufferTarget?: number | null; playoutDelayHint?: number };
  try {
    rr.jitterBufferTarget = 0;
  } catch {
    /* nieobsługiwane */
  }
  try {
    rr.playoutDelayHint = 0;
  } catch {
    /* nieobsługiwane */
  }
}

/** Wysoki bitrate i preferencja płynności: przy ciosach ważniejsze są klatki niż ostrość. */
export async function tuneSender(s: RTCRtpSender) {
  const p = s.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
  if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
  p.encodings[0].maxBitrate = 4_000_000;
  p.encodings[0].maxFramerate = 60;
  p.degradationPreference = 'maintain-framerate';
  try {
    await s.setParameters(p);
  } catch {
    /* część przeglądarek nie pozwala zmienić parametrów przed negocjacją */
  }
}
