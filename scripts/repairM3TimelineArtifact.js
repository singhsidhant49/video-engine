import fs from 'node:fs/promises';
import path from 'node:path';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

const runDir = path.resolve(process.argv[2] || '');
if (!runDir) throw new Error('Usage: node scripts/repairM3TimelineArtifact.js <run-dir>');
const file = path.join(runDir, 'timeline.json');
const timeline = JSON.parse(await fs.readFile(file, 'utf8'));
let previousVariant = null;
for (const clip of timeline.clips) {
  for (const shot of clip.shots) {
    if (shot.family === 'compare') {
      const variant = previousVariant === 'columns' ? 'versus' : 'columns';
      previousVariant = variant;
      shot.variant = variant;
      shot.layout = `compare:${variant}`;
      shot.presentation.variant = variant;
      shot.presentation.layout = shot.layout;
      shot.overlay.leftAt = 2;
      shot.overlay.rightAt = Math.max(14, shot.overlay.rightAt || 14);
    }
  }
  clip.family = clip.shots[0].family;
  clip.variant = clip.shots[0].variant;
  clip.overlay = clip.shots[0].overlay;
}
timeline.realizedShots = timeline.clips.flatMap((clip) => clip.shots);
const diagnostics = buildVisualRealizationDiagnostics(timeline);
const prior = JSON.parse(await fs.readFile(path.join(runDir, 'qc-pre.json'), 'utf8'));
const qc = runTimelineQc(timeline, { realizationDiagnostics: diagnostics });
await fs.writeFile(file, JSON.stringify(timeline, null, 2));
await fs.writeFile(path.join(runDir, 'visual-realization-diagnostics.json'), JSON.stringify(diagnostics, null, 2));
await fs.writeFile(path.join(runDir, 'qc-pre.json'), JSON.stringify({ ...prior, timeline: qc, postInspectionRepair: 'compare reveal timing and variant alternation' }, null, 2));
console.log(`Repaired ${timeline.videoId}: ${timeline.realizedShots.length} canonical shots preserved`);
