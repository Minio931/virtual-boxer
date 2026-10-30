/** Filtr „cios czy szum”: klasa 1 = prawdziwy cios. */
export const VALID_CLASSES = ['noise', 'punch'] as const;
export type ValidClass = (typeof VALID_CLASSES)[number];

/**
 * Klasyfikator typu ciosu: regresja logistyczna wielu klas (softmax) na cechach z punchFeatures.ts.
 * Mały i przejrzysty celowo: ~200 oznaczonych ciosów to za mało na sieć, a wagi da się obejrzeć.
 * Uczenie: `npm run train -- nagrania/r2/*.json nagrania/r3/*.json` (zapisuje punchModel.ts).
 */
export const TYPE_CLASSES = ['straight', 'hook', 'uppercut'] as const;
export type TypeClass = (typeof TYPE_CLASSES)[number];

export interface PunchModel<C extends string = TypeClass> {
  features: readonly string[];
  classes: readonly C[];
  mean: number[];
  std: number[];
  /** wagi [klasa][cecha] */
  W: number[][];
  b: number[];
  /** na czym uczono: sesje, liczba ciosów, wynik walidacji */
  trainedOn: string;
}

export function predictProba(model: PunchModel<string>, x: number[]): number[] {
  const z = model.W.map((w, k) => {
    let s = model.b[k];
    for (let i = 0; i < w.length; i++) s += w[i] * ((x[i] - model.mean[i]) / model.std[i]);
    return s;
  });
  const mx = Math.max(...z);
  const e = z.map((v) => Math.exp(v - mx));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export function predict<C extends string>(model: PunchModel<C>, x: number[]): { cls: C; p: number } {
  const pr = predictProba(model, x);
  let k = 0;
  for (let i = 1; i < pr.length; i++) if (pr[i] > pr[k]) k = i;
  return { cls: model.classes[k], p: pr[k] };
}

/** Uczenie: gradient prosty z regularyzacją L2 i wagami klas (klasy są nierówno liczne). */
export function train<C extends string = TypeClass>(
  X: number[][],
  y: number[],
  names: readonly string[],
  opts: { lambda?: number; iters?: number; lr?: number; trainedOn?: string; classes?: readonly C[] } = {},
): PunchModel<C> {
  const { lambda = 0.05, iters = 3000, lr = 0.2 } = opts;
  const classes = (opts.classes ?? TYPE_CLASSES) as readonly C[];
  const n = X.length;
  const d = X[0].length;
  const K = classes.length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((a, r) => a + r[j], 0) / n);
  const std = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((a, r) => a + (r[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / std[j]));
  const counts = Array.from({ length: K }, (_, k) => y.filter((v) => v === k).length || 1);
  const cw = counts.map((c) => n / (K * c));
  const W = Array.from({ length: K }, () => new Array(d).fill(0));
  const b = new Array(K).fill(0);
  const model: PunchModel<C> = { features: names, classes, mean, std: std, W, b, trainedOn: opts.trainedOn ?? '' };
  const idModel = { ...model, mean: new Array(d).fill(0), std: new Array(d).fill(1) };
  for (let it = 0; it < iters; it++) {
    const gW = Array.from({ length: K }, () => new Array(d).fill(0));
    const gb = new Array(K).fill(0);
    let wsum = 0;
    for (let i = 0; i < n; i++) {
      const p = predictProba(idModel, Z[i]);
      const w = cw[y[i]];
      wsum += w;
      for (let k = 0; k < K; k++) {
        const g = w * (p[k] - (k === y[i] ? 1 : 0));
        gb[k] += g;
        for (let j = 0; j < d; j++) gW[k][j] += g * Z[i][j];
      }
    }
    for (let k = 0; k < K; k++) {
      b[k] -= (lr * gb[k]) / wsum;
      for (let j = 0; j < d; j++) W[k][j] -= lr * (gW[k][j] / wsum + lambda * W[k][j]);
    }
  }
  return model;
}
