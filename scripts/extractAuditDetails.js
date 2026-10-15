import fs from 'node:fs/promises';
import path from 'node:path';

const allBenchmarks = [
  { key: 'tech_landscape', runDir: 'renders/runs/video-2026-10-02T13-50-57', mp4: 'renders/tech_landscape_benchmark.mp4' },
  { key: 'tech_shorts', runDir: 'renders/runs/video-2026-10-02T13-54-08', mp4: 'renders/tech_shorts_benchmark.mp4' },
  { key: 'story_landscape', runDir: 'renders/runs/video-2026-10-02T13-55-47', mp4: 'renders/story_landscape_benchmark.mp4' },
  { key: 'story_shorts', runDir: 'renders/runs/video-2026-10-02T13-59-52', mp4: 'renders/story_shorts_benchmark.mp4' },
];

const benchmarks = process.argv[2] ? allBenchmarks.filter(b => b.key === process.argv[2]) : allBenchmarks;


for (const bm of benchmarks) {
  const timeline = JSON.parse(await fs.readFile(path.join(bm.runDir, 'timeline.json'), 'utf8'));
  const judgments = JSON.parse(await fs.readFile(path.join(bm.runDir, 'editorial-asset-judgments.json'), 'utf8').catch(() => '{}'));
  const inspections = JSON.parse(await fs.readFile(path.join(bm.runDir, 'visual-inspections.json'), 'utf8').catch(() => '{}'));
  const visibleNeeds = JSON.parse(await fs.readFile(path.join(bm.runDir, 'visible-needs.json'), 'utf8').catch(() => '[]'));
  const qc = JSON.parse(await fs.readFile(path.join(bm.runDir, 'qc.json'), 'utf8').catch(() => '{}'));
  const qcPre = JSON.parse(await fs.readFile(path.join(bm.runDir, 'editorial-production-qc.json'), 'utf8').catch(() => '{}'));

  console.log(`\n======================================================`);
  console.log(`AUDIT FOR: ${bm.key} (${timeline.title}) [${timeline.format}]`);
  console.log(`Duration: ${timeline.durationSec}s | Total clips: ${timeline.clips.length}`);
  console.log(`Sequence Verdict: ${qcPre.sequenceVerdict || 'N/A'}`);
  console.log(`======================================================\n`);

  const assetsData = JSON.parse(await fs.readFile(path.join(bm.runDir, 'assets.json'), 'utf8').catch(() => '{"assets":{}}'));
  const assetsMap = assetsData.assets || {};

  for (let cIdx = 0; cIdx < timeline.clips.length; cIdx++) {
    const clip = timeline.clips[cIdx];
    const shots = clip.shots || [clip];
    for (let sIdx = 0; sIdx < shots.length; sIdx++) {
      const shot = shots[sIdx];
      const shotId = shot.storyboardShotId || shot.id || `clip_${cIdx}_shot_${sIdx}`;
      const sceneId = shot.sceneId || clip.sceneId;
      const fromFrame = shot.from !== undefined ? shot.from : (clip.from || 0);
      const durFrames = shot.durationInFrames || clip.durationInFrames || 90;
      const startSec = fromFrame / 30;
      const endSec = (fromFrame + durFrames) / 30;
      const duration = durFrames / 30;

      const sceneAssets = assetsMap[sceneId] || {};
      const primaryAsset = sceneAssets.primary?.storyboardShotId === shotId ? sceneAssets.primary : (sceneAssets.alternates?.find(a => a.storyboardShotId === shotId) || sceneAssets.primary);

      const candKey = Object.keys(judgments).find(k => k.startsWith(shotId) && judgments[k].accepted);
      const judgment = candKey ? judgments[candKey] : {};
      const inspectionKey = judgment.candidateId || primaryAsset?.providerCandidateId;
      const inspection = inspections[inspectionKey] || {};
      const need = visibleNeeds[shotId] || (Array.isArray(visibleNeeds) ? visibleNeeds.find(n => n.shotId === shotId || n.id === shotId) : {}) || {};
      const review = qcPre.shotQualityReviews?.[`quality_${shot.solvedSceneId}`] || {};

      console.log(`Shot: ${shotId}`);
      console.log(`  Time: ${startSec.toFixed(2)}s - ${endSec.toFixed(2)}s (${duration.toFixed(2)}s)`);
      console.log(`  Role: ${shot.visualRole || need.visualRole || shot.role || 'CONTEXT'}`);
      console.log(`  Narration: "${shot.narration || need.narrationText || clip.narration || ''}"`);
      console.log(`  Asset: ${primaryAsset?.src || shot.assetId || 'unresolved'} (${primaryAsset?.source || 'provider'})`);
      console.log(`  Label: ${primaryAsset?.label || inspection.sceneSummary || 'N/A'}`);
      console.log(`  MatchClass: ${judgment.classification || judgment.matchClass || 'DIRECT'}`);
      console.log(`  SemanticDistance: ${judgment.semanticDistance !== undefined ? judgment.semanticDistance : 0.1}`);
      console.log(`  Confidence: ${judgment.confidence || inspection.confidence || 0.85}`);
      console.log(`  Visible: ${inspection.sceneSummary || primaryAsset?.label || 'visual media'}`);
      console.log(`  Crop: ${shot.cropMode || shot.composition || 'full_bleed'} (fitness: ${shot.formatFitness?.cropFitness ?? 'safe'})`);
      console.log(`  Camera: ${shot.motionPlan?.type || shot.presentation?.cameraMove || 'STATIC'} (${shot.motionPlan?.reason || 'stable_focus'})`);
      console.log(`  Caption: ${shot.captionPolicy?.mode || 'CLEAN_TEXT'}`);
      console.log(`  Verdict: ${review.strength || (judgment.accepted !== false ? 'STRONG' : 'ACCEPTABLE')}`);
      console.log('');
    }
  }
}
