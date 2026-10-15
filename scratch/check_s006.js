import fs from 'fs';
const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-09T03-14-22';
const reqs = JSON.parse(fs.readFileSync(`${runDir}/asset-requests.json`, 'utf8'));
const qDiag = JSON.parse(fs.readFileSync(`${runDir}/asset-query-diagnostics.json`, 'utf8'));

// Check manifest or provider calls
const manifest = JSON.parse(fs.readFileSync(`${runDir}/manifest.json`, 'utf8'));
console.log('Manifest error:', manifest.error);

// Look at scene_013_shot_01 and scene_006_shot_01
const s006 = reqs.find(r => r.storyboardShotId === 'scene_006_shot_01');
console.log('s006 concept:', s006.concept);
console.log('s006 ladder:', JSON.stringify(s006.queryLadder, null, 2));

const s013 = reqs.find(r => r.storyboardShotId === 'scene_013_shot_01');
console.log('s013 concept:', s013.concept);
console.log('s013 representationDecision:', s013.representationDecision);
