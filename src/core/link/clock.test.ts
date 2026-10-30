import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock';

describe('ClockSync', () => {
  it('wylicza RTT i przesunięcie zegarów, wybierając próbkę o najmniejszym RTT', () => {
    const c = new ClockSync();
    const offset = 5000; // zegar telefonu 5 s do przodu
    // próbka z dużym, niesymetrycznym opóźnieniem
    c.addSample(0, 40 + offset, 41 + offset, 50);
    // dobra próbka: 4 ms w każdą stronę
    const r = c.addSample(100, 104 + offset, 105 + offset, 109);
    expect(r.rttMs).toBeCloseTo(8);
    expect(r.offsetMs).toBeCloseTo(offset);
  });
});
