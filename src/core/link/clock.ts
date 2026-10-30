/** Czas w ms (epoka Unix) z rozdzielczością performance.now(). */
export const nowMs = () => performance.timeOrigin + performance.now();

export interface ClockEstimate {
  /** najmniejsze zmierzone RTT (ms) z ostatnich próbek */
  rttMs: number;
  /** różnica zegarów: zegar telefonu − zegar ekranu (ms), z próbki o najmniejszym RTT */
  offsetMs: number;
  /** RTT ostatniej próbki */
  lastRttMs: number;
}

/**
 * Synchronizacja zegarów w stylu NTP po DataChannel.
 * t0: wysłanie z ekranu, t1: odbiór na telefonie, t2: odpowiedź z telefonu, t3: odbiór na ekranie.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];

  addSample(t0: number, t1: number, t2: number, t3: number): ClockEstimate {
    const rtt = t3 - t0 - (t2 - t1);
    const offset = (t1 - t0 + (t2 - t3)) / 2;
    this.samples.push({ rtt, offset });
    if (this.samples.length > 20) this.samples.shift();
    const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    return { rttMs: best.rtt, offsetMs: best.offset, lastRttMs: rtt };
  }

  reset() {
    this.samples = [];
  }
}
