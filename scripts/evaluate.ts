/**
 * Ocena detektora na nagraniach z aplikacji (spike S2).
 *
 *   npm run eval -- nagrania/vb-jab-front-2026-10-27T18-00-00.json [kolejne pliki…]
 *
 * Przepuszcza zapisane punkty pozy przez aktualny kod detektora (z progami z DEFAULT_CONFIG,
 * a nie tymi z chwili nagrania), więc po zmianie progów od razu widać efekt.
 * Porównuje wynik z protokołem nagrania i deklarowaną liczbą powtórzeń.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { MotionAnalyzer, DEFAULT_CONFIG, MIN_RELIABLE_FPS, type MotionEvent, type PunchEvent } from '../src/core/detect/motionAnalyzer';
import { DETECT_SMOOTHING, LandmarkSmoother } from '../src/core/pose/oneEuro';
import { frameFromRecord, type Recording, type RecordingProtocol } from '../src/core/session/recorder';

const files = process.argv.slice(2).filter((f) => !f.startsWith('--'));
const useRecordedConfig = process.argv.includes('--recorded-config');
const useRules = process.argv.includes('--rules');
const noFilter = process.argv.includes('--no-filter');

if (!files.length) {
  console.error('Użycie: npm run eval -- plik.json [plik2.json …] [--recorded-config] [--rules] [--no-filter]');
  process.exit(1);
}

type Expect = { kind: 'punch'; side?: 'lead' | 'rear'; type?: PunchEvent['type'] } | { kind: 'slip' } | { kind: 'duck' } | null;

function expectation(p: RecordingProtocol): Expect {
  switch (p) {
    case 'jab':
      return { kind: 'punch', side: 'lead', type: 'jab' };
    case 'cross':
      return { kind: 'punch', side: 'rear', type: 'cross' };
    case 'hook-lead':
      return { kind: 'punch', side: 'lead', type: 'hook' };
    case 'hook-rear':
      return { kind: 'punch', side: 'rear', type: 'hook' };
    case 'uppercut-lead':
      return { kind: 'punch', side: 'lead', type: 'uppercut' };
    case 'uppercut-rear':
      return { kind: 'punch', side: 'rear', type: 'uppercut' };
    case 'mixed':
      return { kind: 'punch' };
    case 'slip':
      return { kind: 'slip' };
    case 'duck':
      return { kind: 'duck' };
    default:
      return null;
  }
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—');

const totals = { expected: 0, matched: 0, typeOk: 0, typeTotal: 0, extra: 0 };
const punchTotals = { expected: 0, matched: 0, extra: 0 };
let lowFps = 0;

for (const file of files) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording;
  const { meta } = rec;
  const analyzer = new MotionAnalyzer({ ...(useRecordedConfig ? meta.config : DEFAULT_CONFIG), typeClassifier: useRules ? 'rules' : 'model', ...(noFilter ? { validThreshold: 0 } : {}) }, meta.stance, meta.swapSides);
  analyzer.imageAspect = meta.videoWidth && meta.videoHeight ? meta.videoWidth / meta.videoHeight : 1;
  const smoother = new LandmarkSmoother(33, DETECT_SMOOTHING);
  const events: MotionEvent[] = [];
  for (const rf of rec.frames) {
    const f = frameFromRecord(rf);
    events.push(...analyzer.update({ ...f, world: smoother.smooth(f.world, f.captureT / 1000) }).events);
  }

  const frames = rec.frames.length;
  const secs = frames > 1 ? (rec.frames[frames - 1].t - rec.frames[0].t) / 1000 : 0;
  const punches = events.filter((e): e is PunchEvent => e.kind === 'punch');
  const exp = expectation(meta.protocol);
  const n = meta.expectedCount ?? 0;

  console.log(`\n■ ${basename(file)}`);
  const fps = frames / Math.max(secs, 0.001);
  console.log(`  protokół: ${meta.protocol} · kamera: ${meta.cameraSetup} · ${frames} klatek / ${secs.toFixed(1)} s (${fps.toFixed(1)} kl./s) · model ${meta.model}${meta.delegate ? ` (${meta.delegate})` : ''}`);
  if (fps < MIN_RELIABLE_FPS) {
    lowFps++;
    console.log(`  ⚠ Za mało klatek (${fps.toFixed(1)} kl./s < ${MIN_RELIABLE_FPS}). Cios trwa 130–300 ms, więc mieści się w 1–2 klatkach — wynik nie mówi nic o progach. Nagraj ponownie z modelem lite/full i sprawdź FPS detekcji.`);
  }

  const byType: Record<string, number> = {};
  for (const p of punches) byType[`${p.type}/${p.hand}`] = (byType[`${p.type}/${p.hand}`] ?? 0) + 1;
  console.log(`  ciosy: ${punches.length} ${JSON.stringify(byType)}`);
  console.log(`  slipy: ${events.filter((e) => e.kind === 'slip').length} · schylenia: ${events.filter((e) => e.kind === 'duck').length}`);

  if (exp && n > 0) {
    // ciosy drugiej ręki to zawsze fałszywe wykrycia (protokół ćwiczy jedną rękę), nie zaliczają się do wykrywalności
    const wrongHand = exp.kind === 'punch' && exp.side ? punches.filter((p) => p.hand !== exp.side).length : 0;
    const relevant = exp.kind === 'punch' ? punches.length - wrongHand : events.filter((e) => e.kind === exp.kind).length;
    const matched = Math.min(relevant, n);
    const extra = Math.max(0, relevant - n) + wrongHand;
    totals.expected += n;
    totals.matched += matched;
    totals.extra += extra;
    if (exp.kind === 'punch') {
      punchTotals.expected += n;
      punchTotals.matched += matched;
      punchTotals.extra += extra;
    }
    console.log(`  wykrywalność: ${matched}/${n} (${pct(matched, n)}) · nadmiarowe: ${extra}`);
    if (exp.kind === 'punch' && exp.type) {
      const ok = punches.filter((p) => p.type === exp.type && (!exp.side || p.hand === exp.side)).length;
      totals.typeOk += ok;
      totals.typeTotal += punches.length;
      console.log(`  poprawny typ: ${ok}/${punches.length} (${pct(ok, punches.length)})`);
      const wrong = punches.filter((p) => p.type !== exp.type).slice(0, 5);
      for (const w of wrong) console.log(`    ✗ ${w.type}/${w.hand} łokieć ${w.elbowAngle}° pewność ${w.confidence}`);
    }
  } else {
    console.log('  (brak protokołu z liczbą powtórzeń — tylko podsumowanie)');
  }
}

if (files.length > 1 && totals.expected) {
  console.log('\n══ Razem');
  if (lowFps) console.log(`  ⚠ ${lowFps} z ${files.length} nagrań ma za niski FPS — razem niewiarygodne`);
  console.log(`  wykrywalność ciosów/akcji: ${pct(totals.matched, totals.expected)} (cel ≥ 95%)`);
  console.log(`  nadmiarowe: ${totals.extra} (${pct(totals.extra, totals.expected)}, cel < 5%)`);
  if (punchTotals.expected) console.log(`  same ciosy: wykrywalność ${pct(punchTotals.matched, punchTotals.expected)} (${punchTotals.matched}/${punchTotals.expected}) · nadmiarowe ${punchTotals.extra} (${pct(punchTotals.extra, punchTotals.expected)})`);
  if (totals.typeTotal) console.log(`  poprawny typ ciosu: ${pct(totals.typeOk, totals.typeTotal)} (cel ≥ 80%)`);
}
