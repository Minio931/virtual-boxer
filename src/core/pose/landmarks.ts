import type { Landmark } from './types';

/** Indeksy 33 punktów BlazePose (anatomiczne: L = lewa strona osoby). */
export const LM = {
  NOSE: 0,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

export const LANDMARK_COUNT = 33;

export const LEFT_ARM: [number, number][] = [
  [LM.L_SHOULDER, LM.L_ELBOW],
  [LM.L_ELBOW, LM.L_WRIST],
];
export const RIGHT_ARM: [number, number][] = [
  [LM.R_SHOULDER, LM.R_ELBOW],
  [LM.R_ELBOW, LM.R_WRIST],
];
export const BODY: [number, number][] = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_HIP],
  [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],
  [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],
  [LM.R_KNEE, LM.R_ANKLE],
];

const LR_PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

/**
 * Zamienia etykiety lewa/prawa. Przydaje się, gdy obraz z kamery jest lustrzany
 * albo model myli strony przy danym ustawieniu kamery.
 */
export function swapLeftRight(lm: Landmark[]): Landmark[] {
  const out = lm.slice();
  for (const [a, b] of LR_PAIRS) {
    out[a] = lm[b];
    out[b] = lm[a];
  }
  return out;
}
