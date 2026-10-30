/**
 * Uczy klasyfikator typu ciosu na nagraniach z protokołem i zapisuje go do src/core/detect/punchModel.ts.
 *
 *   npm run train -- nagrania/r2/*.json nagrania/r3/*.json            # ocena + zapis modelu
 *   npm run train -- nagrania/r2/*.json nagrania/r3/*.json --dry-run  # tylko ocena
 *
 * Sesja = folder nagrania (r2, r3, …). Najważniejsza miara to „zostaw jedną sesję”: uczymy na pozostałych
 * i sprawdzamy na tej jednej — tak wygląda prawdziwe użycie (nowy dzień, inne ustawienie kamery).
 * Do uczenia bierzemy tylko ciosy ręki, którą przewiduje protokół (ciosy drugiej ręki to fałszywe wykrycia).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { MotionAnalyzer, DEFAULT_CONFIG, type PunchEvent } from '../src/core/detect/motionAnalyzer';
import { CONTEXT_NAMES, FEATURE_NAMES } from '../src/core/detect/punchFeatures';
import { predict, train, TYPE_CLASSES, VALID_CLASSES, type TypeClass } from '../src/core/detect/punchClassifier';
import { DETECT_SMOOTHING, LandmarkSmoother } from '../src/core/pose/oneEuro';
import { frameFromRecord, type Recording } from '../src/core/session/recorder';

const files = process.argv.slice(2).filter((f) => !f.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');

const LABELS: Record<string, { hand: 'lead' | 'rear'; cls: TypeClass }> = {
  jab: { hand: 'lead', cls: 'straight' },
  cross: { hand: 'rear', cls: 'straight' },
  'hook-lead': { hand: 'lead', cls: 'hook' },
  'hook-rear': { hand: 'rear', cls: 'hook' },
  'uppercut-lead': { hand: 'lead', cls: 'uppercut' },
  'uppercut-rear': { hand: 'rear', cls: 'uppercut' },
};

interface Sample { x: number[]; y: number; session: string; rule: TypeClass; hand: 'lead' | 'rear'; file: string }
const samples: Sample[] = [];
/** wszystkie wykryte ruchy, także fałszywe — do filtra „cios czy szum” */
interface VSample { x: number[]; y: number; session: string }
const vsamples: VSample[] = [];
const NO_PUNCH = new Set(['slip', 'duck']);
const toClass = (t: PunchEvent['type']): TypeClass => (t === 'jab' || t === 'cross' ? 'straight' : t);

for (const file of files) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
  const lab = LABELS[rec.meta.protocol];
  if (!lab && !NO_PUNCH.has(rec.meta.protocol)) continue;
  const a = new MotionAnalyzer({ ...DEFAULT_CONFIG, typeClassifier: 'rules', validThreshold: 0 }, rec.meta.stance, rec.meta.swapSides);
  a.validModel = null;
  a.imageAspect = rec.meta.videoWidth && rec.meta.videoHeight ? rec.meta.videoWidth / rec.meta.videoHeight : 1;
  const sm = new LandmarkSmoother(33, DETECT_SMOOTHING);
  for (const rf of rec.frames) {
    const f = frameFromRecord(rf);
    for (const e of a.update({ ...f, world: sm.smooth(f.world, f.captureT / 1000) }).events) {
      if (e.kind !== 'punch' || !e.features || !e.context) continue;
      vsamples.push({ x: [...e.features, ...e.context], y: lab && e.hand === lab.hand ? 1 : 0, session: basename(dirname(file)) });
      if (!lab || e.hand !== lab.hand) continue;
      samples.push({ x: e.features, y: TYPE_CLASSES.indexOf(lab.cls), session: basename(dirname(file)), rule: toClass(e.type), hand: e.hand, file: basename(file) });
    }
  }
}

const sessions = [...new Set(samples.map((s) => s.session))];
console.log(`Ciosy do uczenia: ${samples.length} · sesje: ${sessions.map((s) => `${s} (${samples.filter((x) => x.session === s).length})`).join(', ')}`);
console.log(`Klasy: ${TYPE_CLASSES.map((c, k) => `${c} ${samples.filter((s) => s.y === k).length}`).join(' · ')}`);

const pct = (a: number, b: number) => `${b ? Math.round((100 * a) / b) : 0}%`;
function report(name: string, test: Sample[], pred: TypeClass[]) {
  const ok = test.filter((s, i) => TYPE_CLASSES[s.y] === pred[i]).length;
  const conf = TYPE_CLASSES.map((_, k) => TYPE_CLASSES.map((c2) => test.filter((s, i) => s.y === k && pred[i] === c2).length));
  console.log(`  ${name.padEnd(34)} ${pct(ok, test.length).padStart(4)}  (${ok}/${test.length})   macierz [prawda→ prosty/sierp/podbr]: ${conf.map((r, k) => `${TYPE_CLASSES[k][0]}:${r.join('/')}`).join('  ')}`);
}
const fit = (tr: Sample[]) => train(tr.map((s) => s.x), tr.map((s) => s.y), FEATURE_NAMES);

console.log('\nReguły 2D (obecny detektor):');
for (const s of sessions) { const t = samples.filter((x) => x.session === s); report(`sesja ${s}`, t, t.map((x) => x.rule)); }
report('razem', samples, samples.map((x) => x.rule));

console.log('\nKlasyfikator, zostaw jedną sesję (uczony na pozostałych):');
if (sessions.length > 1) {
  for (const s of sessions) {
    const tr = samples.filter((x) => x.session !== s);
    const te = samples.filter((x) => x.session === s);
    const m = fit(tr);
    report(`test ${s}, uczony na ${sessions.filter((x) => x !== s).join('+')}`, te, te.map((x) => predict(m, x.x).cls));
  }
}

console.log('\nKlasyfikator, walidacja krzyżowa 5× na wszystkich sesjach (warstwowo po nagraniu):');
{
  const order = samples.map((_, i) => i).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
  const pred: TypeClass[] = new Array(samples.length);
  for (let k = 0; k < 5; k++) {
    const te = order.filter((_, j) => j % 5 === k);
    const teSet = new Set(te);
    const m = fit(samples.filter((_, i) => !teSet.has(i)));
    for (const i of te) pred[i] = predict(m, samples[i].x).cls;
  }
  for (const s of sessions) {
    const idx = samples.map((x, i) => (x.session === s ? i : -1)).filter((i) => i >= 0);
    report(`sesja ${s}`, idx.map((i) => samples[i]), idx.map((i) => pred[i]));
  }
  report('razem', samples, pred);
}

const final = train(samples.map((s) => s.x), samples.map((s) => s.y), FEATURE_NAMES, {
  trainedOn: `${sessions.join('+')}: ${samples.length} ciosów, ${new Date().toISOString().slice(0, 10)}`,
});
const top = final.W.map((w, k) => `${TYPE_CLASSES[k]}: ` + w.map((v, j) => [v, FEATURE_NAMES[j]] as const).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 5).map(([v, n]) => `${n} ${v > 0 ? '+' : ''}${v.toFixed(2)}`).join(', '));
console.log('\nNajważniejsze cechy (model na wszystkich danych):\n  ' + top.join('\n  '));

// ── Filtr „cios czy szum” ──
const VALID_NAMES = [...FEATURE_NAMES, ...CONTEXT_NAMES];
const VALID_LAMBDA = 0.05;
const VALID_THRESHOLD = 0.15;
console.log(`\nFiltr „cios czy szum”: ${vsamples.length} ruchów, prawdziwe ${vsamples.filter((v) => v.y).length}, fałszywe ${vsamples.filter((v) => !v.y).length}`);
console.log(`  zostaw jedną sesję, próg ${VALID_THRESHOLD}:`);
for (const s of sessions) {
  const tr = vsamples.filter((v) => v.session !== s);
  const te = vsamples.filter((v) => v.session === s);
  if (!tr.some((v) => !v.y) || !te.length) continue;
  const m = train(tr.map((v) => v.x), tr.map((v) => v.y), VALID_NAMES, { classes: VALID_CLASSES, lambda: VALID_LAMBDA });
  const keep = te.map((v) => { const p = predict(m, v.x); return (p.cls === 'punch' ? p.p : 1 - p.p) >= VALID_THRESHOLD; });
  const fp = te.filter((v) => !v.y).length, tp = te.filter((v) => v.y).length;
  const rem = te.filter((v, i) => !v.y && !keep[i]).length, lost = te.filter((v, i) => v.y && !keep[i]).length;
  console.log(`  test ${s}: usunięte fałszywe ${rem}/${fp} (${pct(rem, fp)}), utracone prawdziwe ${lost}/${tp} (${pct(lost, tp)})`);
}
const validFinal = train(vsamples.map((v) => v.x), vsamples.map((v) => v.y), VALID_NAMES, {
  classes: VALID_CLASSES, lambda: VALID_LAMBDA,
  trainedOn: `${sessions.join('+')}: ${vsamples.length} ruchów (${vsamples.filter((v) => !v.y).length} fałszywych), ${new Date().toISOString().slice(0, 10)}`,
});

if (!dryRun) {
  const r = (v: number) => Math.round(v * 1e5) / 1e5;
  const ser = (m: typeof final | typeof validFinal) => JSON.stringify({ ...m, mean: m.mean.map(r), std: m.std.map(r), W: m.W.map((w) => w.map(r)), b: m.b.map(r) });
  writeFileSync(
    'src/core/detect/punchModel.ts',
    `// Plik generowany przez \`npm run train\` — nie edytuj ręcznie.\n// typ: ${final.trainedOn}\n// filtr: ${validFinal.trainedOn}\nimport type { PunchModel, ValidClass } from './punchClassifier';\n\n` +
      `export const PUNCH_MODEL: PunchModel | null = ${ser(final)};\n\nexport const PUNCH_VALID_MODEL: PunchModel<ValidClass> | null = ${ser(validFinal)};\n`,
  );
  console.log('\nZapisano src/core/detect/punchModel.ts');
}
