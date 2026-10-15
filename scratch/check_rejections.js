import fs from 'fs';
const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-09T03-14-22';
const preQc = fs.existsSync(`${runDir}/editorial-media-qc.json`) ? JSON.parse(fs.readFileSync(`${runDir}/editorial-media-qc.json`, 'utf8')) : null;
console.log('Pre-QC summary:', preQc ? Object.keys(preQc) : 'None');
if (preQc?.unresolvedShots) {
  console.log('Unresolved shots in QC:', preQc.unresolvedShots);
}
if (preQc?.rejectionLog) {
  console.log('Rejection log:', JSON.stringify(preQc.rejectionLog, null, 2));
}

// Check provider calls or query results
const queryDiag = fs.existsSync(`${runDir}/query-performance.json`) ? JSON.parse(fs.readFileSync(`${runDir}/query-performance.json`, 'utf8')) : null;
console.log('Query performance:', queryDiag);

// Let's check editorial-asset-judgments
const judgments = fs.existsSync(`${runDir}/editorial-asset-judgments.json`) ? JSON.parse(fs.readFileSync(`${runDir}/editorial-asset-judgments.json`, 'utf8')) : {};
for (const [k, v] of Object.entries(judgments)) {
  if (['scene_005_shot_03', 'scene_006_shot_01', 'scene_009_shot_02', 'scene_013_shot_01', 'scene_014_shot_01', 'scene_015_shot_01', 'scene_016_shot_01', 'scene_019_shot_01', 'scene_019_shot_02'].includes(k)) {
    console.log(`Judgments for ${k}:`, v.length);
  }
}
