import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './oneEuro';

// deterministyczny „szum”
const noise = (i: number) => Math.sin(i * 12.9898) * 0.01;

describe('OneEuroFilter', () => {
  it('tłumi drgania przy stałej wartości', () => {
    const f = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    let raw = 0;
    let filt = 0;
    for (let i = 0; i < 300; i++) {
      const x = 1 + noise(i);
      const y = f.filter(x, i / 60);
      if (i > 60) {
        raw += Math.abs(x - 1);
        filt += Math.abs(y - 1);
      }
    }
    expect(filt).toBeLessThan(raw * 0.5);
  });

  it('przy wysokim beta szybko dogania skok wartości', () => {
    const slow = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    const fast = new OneEuroFilter({ minCutoff: 1, beta: 2, dCutoff: 1 });
    let ys = 0;
    let yf = 0;
    for (let i = 0; i < 10; i++) {
      const x = i < 3 ? 0 : 1;
      ys = slow.filter(x, i / 30);
      yf = fast.filter(x, i / 30);
    }
    expect(yf).toBeGreaterThan(ys);
    expect(yf).toBeGreaterThan(0.8);
  });
});
