import fs from 'node:fs';

const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-11T06-05-23';
const fail = JSON.parse(fs.readFileSync(`${runDir}/asset-resolution-failure.json`, 'utf8'));

const targets = ['scene_005_shot_01', 'scene_010_shot_01', 'scene_011_shot_03'];
for (const req of (fail.unresolvedRequests || []).filter(r => targets.includes(r.storyboardShotId || r.shotId))) {
  console.log('====================================================');
  console.log('Shot ID:', req.storyboardShotId || req.shotId);
  console.log('Scene ID:', req.sceneId);
  console.log('Concept:', req.concept);
  console.log('Request Class:', req.requestClass);
  console.log('SearchContext targetSubject:', req.searchContext?.targetSubject);
  console.log('Materialization Rejects:', req.materializationRejects);
  console.log('Rejected candidates:');
  (req.rejectedTopCandidates || []).slice(0, 3).forEach(c => {
    console.log(`  - [${c.provider}] "${c.label}" | query: "${c.query}" | gates:`, c.gates, '| overall:', c.semantic?.overall);
  });
}
