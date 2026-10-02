import fs from 'node:fs';
import path from 'node:path';

function inspectTimeline(runId, label) {
  const file = path.join('renders', 'runs', runId, 'timeline.json');
  const tl = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n=================== ${label} (${runId}) ===================`);
  console.log(`Duration: ${(tl.durationInFrames / 30).toFixed(1)}s, ${tl.realizedShots.length} shots, format: ${tl.format}`);
  for (const s of tl.realizedShots) {
    const startSec = (s.startFrame / 30).toFixed(1);
    const endSec = (s.endFrame / 30).toFixed(1);
    const dur = ((s.endFrame - s.startFrame) / 30).toFixed(1);
    const assetSrc = s.asset?.src || s.asset?.id || 'none';
    const fam = s.family;
    const layout = s.layout || 'unknown';
    const concept = s.visualConcept || s.presentation?.visualConcept || '';
    const camera = s.imageBehavior || s.presentation?.cameraMove || 'none';
    console.log(`[${startSec}s - ${endSec}s] (${dur}s) shot:${s.id} fam:${fam} layout:${layout} camera:${camera}`);
    console.log(`    concept: "${concept}"`);
    console.log(`    asset: ${assetSrc}`);
  }
}

inspectTimeline('video-2026-10-01T09-16-27', 'ORIGINAL LANDSCAPE BENCHMARK');
inspectTimeline('video-2026-10-01T09-33-53', 'ORIGINAL SHORTS BENCHMARK');
