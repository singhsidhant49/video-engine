import fs from 'node:fs';

const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-11T06-05-23';
const fail = JSON.parse(fs.readFileSync(`${runDir}/asset-resolution-failure.json`, 'utf8'));

console.log('Unresolved count:', fail.unresolvedRequests?.length);

for (const req of (fail.unresolvedRequests || [])) {
  console.log('====================================================');
  console.log('Shot ID:', req.storyboardShotId || req.shotId);
  console.log('Scene ID:', req.sceneId);
  console.log('Concept:', req.concept);
  console.log('Request Class:', req.requestClass);
  console.log('SearchContext primaryEntity:', req.searchContext?.primaryEntity);
  console.log('SearchContext targetSubject:', req.searchContext?.targetSubject);
  console.log('SearchContext modifiers:', req.searchContext?.modifiers);
  console.log('Materialization Rejects:', req.materializationRejects);
  console.log('Rejected candidates:');
  (req.rejectedTopCandidates || []).slice(0, 4).forEach(c => {
    console.log(`  - [${c.provider}] "${c.label}" | query: "${c.query}" | gates:`, c.gates, '| overall:', c.semantic?.overall);
  });
}
