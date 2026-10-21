/**
 * Director evaluation: run the REAL LLM path on a spread of briefs and measure
 * the plans it produces, then (optionally) render each through the full
 * pipeline with dev narration and collect QC.
 *
 *   node scripts/evalDirector.js                 # all briefs, plans + metrics only
 *   node scripts/evalDirector.js --only 2,5      # selected briefs
 *   node scripts/evalDirector.js --render        # also render (macOS `say` narration) + QC
 *   node scripts/evalDirector.js --dry           # no API: run the metrics on the demo plan
 *
 * Output: renders/evals/<timestamp>/<slug>/{raw.json, plan.json, metrics.json[, qc.json]} and summary.json.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../src/config/index.js';
import { generateDirectorPlan, normalizePlan, demoPlan } from '../src/services/aiDirectorService.js';
import { createFacelessVideo } from '../src/pipeline/videoGeneratorPipeline.js';

const BRIEFS = [
  { slug: 'short-educational', topic: 'Why the sky is blue', format: 'shorts', durationSec: 40 },
  { slug: 'documentary', topic: 'The sinking of the Titanic', format: 'landscape', durationSec: 150 },
  { slug: 'finance', topic: 'How the 2008 financial crisis happened', niche: 'finance', format: 'landscape', durationSec: 120 },
  { slug: 'history', topic: 'Why the Western Roman Empire fell', niche: 'history', format: 'landscape', durationSec: 120 },
  { slug: 'technology', topic: 'How GPUs made modern AI possible', niche: 'tech', format: 'landscape', durationSec: 120 },
  { slug: 'listicle', topic: '5 habits of the best chess players in history', format: 'shorts', durationSec: 50 },
  { slug: 'storytelling', topic: 'The con man who sold the Eiffel Tower twice', format: 'shorts', durationSec: 60 },
  { slug: 'statistics', topic: 'The global coffee economy in numbers', niche: 'data', format: 'landscape', durationSec: 90 },
  { slug: 'quotes', topic: "Steve Jobs' 2005 Stanford commencement speech", format: 'landscape', durationSec: 90 },
  { slug: 'poor-imagery', topic: 'What a zero-knowledge proof actually is', niche: 'tech', format: 'landscape', durationSec: 90 },
];

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const only = val('--only')?.split(',').map(Number);

function metrics(plan, brief) {
  const scenes = plan.scenes;
  const words = plan.script.split(/\s+/).length;
  const budget = Math.round((brief.durationSec || 45) * 2.45);
  const kinds = {};
  scenes.forEach((s) => { kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
  let sameKindRun = 1, maxRun = 1;
  for (let i = 1; i < scenes.length; i++) { sameKindRun = scenes[i].kind === scenes[i - 1].kind ? sameKindRun + 1 : 1; maxRun = Math.max(maxRun, sameKindRun); }
  const photo = scenes.filter((s) => s.kind === 'atmosphere' || s.kind === 'subject');
  const distinct = (k) => new Set(scenes.map((s) => s[k])).size;
  const imp = scenes.map((s) => s.importance);
  const mean = imp.reduce((a, b) => a + b, 0) / imp.length;
  const spread = Math.sqrt(imp.reduce((a, b) => a + (b - mean) ** 2, 0) / imp.length);
  const d = plan.diagnostics || {};
  const m = {
    style: plan.style,
    scenes: scenes.length,
    words,
    wordBudgetRatio: +(words / budget).toFixed(2),
    secondsPerScene: +((words / 2.45) / scenes.length).toFixed(1),
    kinds,
    photoShare: +(photo.length / scenes.length).toFixed(2),
    maxSameKindRun: maxRun,
    downgrades: d.downgrades?.length || 0,
    downgradeRate: +((d.downgrades?.length || 0) / Math.max(1, d.rawScenes || scenes.length)).toFixed(2),
    invalidEmphasis: d.invalidEmphasis || 0,
    droppedHeadlines: d.droppedHeadlines || 0,
    missingFeel: d.missingAttributes || {},
    distinctTones: distinct('tone'),
    distinctShots: distinct('shot'),
    distinctTreatments: distinct('treatment'),
    importanceSpread: +spread.toFixed(2),
    photoScenesWithEntity: photo.length ? +(photo.filter((s) => s.entity).length / photo.length).toFixed(2) : null,
    scenesWithQueries: +(scenes.filter((s) => s.imageQueries.length).length / scenes.length).toFixed(2),
  };
  const flags = [];
  if (m.wordBudgetRatio < 0.8 || m.wordBudgetRatio > 1.25) flags.push(`length off budget (${m.wordBudgetRatio}×)`);
  if (m.downgradeRate > 0.2) flags.push(`${m.downgrades} scenes downgraded (invalid data)`);
  if (m.photoShare < 0.25) flags.push(`photography only ${Math.round(m.photoShare * 100)}% of scenes`);
  if (m.photoShare > 0.8) flags.push(`graphics only ${Math.round((1 - m.photoShare) * 100)}% of scenes`);
  if (m.maxSameKindRun >= 3) flags.push(`${m.maxSameKindRun} scenes of the same kind in a row`);
  if (Object.keys(m.missingFeel).length) flags.push(`feel attributes omitted: ${Object.keys(m.missingFeel).join(', ')}`);
  if (m.distinctShots < 2 && scenes.length > 4) flags.push('no shot-scale variation');
  if (m.importanceSpread < 0.6) flags.push('importance is flat (no peaks)');
  if (m.invalidEmphasis > scenes.length * 0.3) flags.push(`${m.invalidEmphasis} emphasis phrases not in narration`);
  if (m.secondsPerScene > 7) flags.push(`scenes average ${m.secondsPerScene}s (too long)`);
  if (m.secondsPerScene < 2) flags.push(`scenes average ${m.secondsPerScene}s (too choppy)`);
  return { ...m, flags };
}

if (!has('--dry') && !config.deepseek.apiKey && !config.openai.apiKey) {
  console.error('No DEEPSEEK_API_KEY (or OPENAI_API_KEY) set — the eval must hit the real model. Use --dry to test the harness itself.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outRoot = path.join(config.rendersDir, 'evals', stamp);
await fs.mkdir(outRoot, { recursive: true });

const selected = has('--dry') ? [{ slug: 'dry-demo', topic: 'demo', format: 'shorts', durationSec: 20 }] : BRIEFS.filter((_, i) => !only || only.includes(i + 1));
const summary = [];
for (const brief of selected) {
  const dir = path.join(outRoot, brief.slug);
  await fs.mkdir(dir, { recursive: true });
  const row = { slug: brief.slug, topic: brief.topic };
  try {
    const t0 = Date.now();
    const plan = has('--dry') ? normalizePlan(demoPlan(), brief) : await generateDirectorPlan(brief);
    row.planSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    await fs.writeFile(path.join(dir, 'raw.json'), JSON.stringify(plan.raw || demoPlan(), null, 1));
    await fs.writeFile(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
    Object.assign(row, metrics(plan, brief));
    await fs.writeFile(path.join(dir, 'metrics.json'), JSON.stringify(row, null, 1));
    if (has('--render')) {
      const r = await createFacelessVideo({ ...brief, planFile: path.join(dir, 'raw.json'), tts: 'say' });
      row.video = r.outputPath;
      row.qcWarnings = [...r.qc.timeline.checks, ...(r.qc.render?.checks || [])].filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`);
      await fs.writeFile(path.join(dir, 'qc.json'), JSON.stringify(r.qc, null, 1));
    }
  } catch (err) {
    row.error = err.message;
  }
  summary.push(row);
  console.log(`\n■ ${brief.slug}: ${row.error ? `ERROR ${row.error}` : `${row.style} · ${row.scenes} scenes · ${row.words} words (${row.wordBudgetRatio}×) · photo ${row.photoShare} · ${row.flags.length ? `⚠ ${row.flags.join('; ')}` : 'no flags'}`}`);
}
await fs.writeFile(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`\nSummary → ${path.join(outRoot, 'summary.json')}`);
