// Kopiuje pliki WASM MediaPipe do public/, żeby aplikacja nie zależała od CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dst = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.warn('[mediapipe] Brak folderu wasm w @mediapipe/tasks-vision, pomijam kopiowanie.');
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('[mediapipe] Skopiowano WASM do public/mediapipe/wasm');
