import fs from 'node:fs';

const plan = JSON.parse(fs.readFileSync('renders/runs/video-2026-09-27T15-08-53/plan.json', 'utf8'));
const sb = JSON.parse(fs.readFileSync('renders/runs/video-2026-09-27T15-08-53/storyboard.json', 'utf8'));
const tl = JSON.parse(fs.readFileSync('renders/runs/video-2026-09-27T15-08-53/timeline.json', 'utf8'));
const qc = JSON.parse(fs.readFileSync('renders/runs/video-2026-09-27T15-08-53/qc.json', 'utf8'));

const scenes = sb.sections.flatMap(sec => sec.scenes || []);
console.log('Total sections:', sb.sections.length);
console.log('Total storyboard scenes:', scenes.length);
console.log('Total timeline clips:', tl.clips.length);
console.log('Total realized shots:', tl.realizedShots?.length || 0);

scenes.forEach((s, i) => {
  const c = tl.clips[i];
  const dur = (c.durationInFrames / 30).toFixed(2);
  const words = s.narration ? s.narration.trim().split(/\s+/).length : 0;
  const shots = c.shots || [];
  const shotDurs = shots.map(sh => (sh.durationInFrames / 30).toFixed(2)).join(', ');
  const fams = shots.map(sh => `${sh.family}:${sh.presentation?.variant || sh.variant || ''}`).join(' -> ');
  console.log(`\nScene ${i + 1} (${s.id}):`);
  console.log(`  Section: ${s.sectionId || 'unknown'}`);
  console.log(`  Narration: "${s.narration}"`);
  console.log(`  Words: ${words} | Duration: ${dur}s | Shots: ${shots.length} [${shotDurs}]s`);
  console.log(`  Purpose: ${s.purpose || s.intent || s.role} | Density: ${s.density || 'normal'} | Intensity: ${s.emotionalIntensity || s.intensity || 1}`);
  console.log(`  Visual Families: ${fams}`);
});
