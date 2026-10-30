// Pobiera modele MediaPipe Pose Landmarker do public/models (opcjonalne: bez tego aplikacja ładuje je z Google).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'models');
mkdirSync(dir, { recursive: true });

const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['lite', 'full', 'heavy'];
for (const v of variants) {
  const file = join(dir, `pose_landmarker_${v}.task`);
  if (existsSync(file)) {
    console.log(`[models] ${v}: już jest`);
    continue;
  }
  const url = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;
  process.stdout.write(`[models] ${v}: pobieram… `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`błąd HTTP ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}
