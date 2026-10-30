import type { Vec3 } from '../math/vec';

/** Punkt pozy. `v` to visibility 0–1 z MediaPipe. */
export interface Landmark extends Vec3 {
  v: number;
}

/**
 * Jedna klatka pozy.
 * - `image`: współrzędne znormalizowane do obrazu (x, y w 0–1).
 * - `world`: metry, początek w środku bioder (y w dół, z mniejsze = bliżej kamery).
 * - `t`: czas detekcji (ms, zegar `performance.now()` ekranu).
 * - `captureT`: szacowany czas zrobienia klatki przez kamerę (ten sam zegar).
 */
export interface PoseFrame {
  t: number;
  captureT: number;
  image: Landmark[];
  world: Landmark[];
}
