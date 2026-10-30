import type { Landmark } from './types';

/**
 * Filtr One Euro (Casiez, Roussel, Vogel, CHI 2012).
 * Przy wolnym ruchu mocno wygładza drgania, przy szybkim podnosi częstotliwość odcięcia,
 * żeby nie opóźniać ciosów. Strojenie: najpierw `minCutoff` w bezruchu, potem `beta` przy szybkim ruchu.
 */
export interface OneEuroParams {
  minCutoff: number; // Hz
  beta: number; // współczynnik prędkości
  dCutoff: number; // Hz, dla pochodnej
}

/**
 * Słabe wygładzanie dla detekcji (współrzędne world w metrach): mało opóźnienia.
 * Dobrane siatką parametrów na syntetycznych ciosach (20/30/60 kl./s, szum ±1–2 cm).
 * Ważne: dCutoff musi być wysokie, inaczej filtr reaguje na start ciosu z opóźnieniem.
 */
export const DETECT_SMOOTHING: OneEuroParams = { minCutoff: 3.0, beta: 3.0, dCutoff: 4.0 };
/** Mocniejsze wygładzanie do rysowania szkieletu (współrzędne obrazu 0–1). */
export const DRAW_SMOOTHING: OneEuroParams = { minCutoff: 1.2, beta: 0.6, dCutoff: 1.0 };

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastT: number | null = null;

  constructor(private p: OneEuroParams) {}

  /** @param t czas w sekundach */
  filter(value: number, t: number): number {
    if (this.x === null || this.lastT === null) {
      this.x = value;
      this.dx = 0;
      this.lastT = t;
      return value;
    }
    const dt = Math.max(t - this.lastT, 1e-4);
    this.lastT = t;
    const d = (value - this.x) / dt;
    this.dx = this.dx + alpha(this.p.dCutoff, dt) * (d - this.dx);
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
    this.x = this.x + alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.lastT = null;
    this.dx = 0;
  }
}

/** Filtruje każdą oś każdego punktu osobno. Visibility przechodzi bez zmian. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[];

  constructor(count: number, params: OneEuroParams) {
    this.filters = Array.from({ length: count * 3 }, () => new OneEuroFilter(params));
  }

  /** @param tSec czas w sekundach */
  smooth(lm: Landmark[], tSec: number): Landmark[] {
    return lm.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, tSec),
      y: this.filters[i * 3 + 1].filter(p.y, tSec),
      z: this.filters[i * 3 + 2].filter(p.z, tSec),
      v: p.v,
    }));
  }

  reset() {
    for (const f of this.filters) f.reset();
  }
}
