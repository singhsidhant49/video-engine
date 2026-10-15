import fs from 'fs';
const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-09T03-14-22';
const qDiag = fs.existsSync(`${runDir}/asset-query-diagnostics.json`) ? JSON.parse(fs.readFileSync(`${runDir}/asset-query-diagnostics.json`, 'utf8')) : [];

const unresolved = ['scene_005_shot_03', 'scene_006_shot_01', 'scene_009_shot_02', 'scene_013_shot_01', 'scene_014_shot_01', 'scene_015_shot_01', 'scene_016_shot_01', 'scene_019_shot_01', 'scene_019_shot_02'];

for (const id of unresolved) {
  const item = qDiag.find(d => d.shotId === id);
  console.log('=== SHOT:', id);
  if (item) {
    console.log(JSON.stringify(item, null, 2));
  } else {
    console.log('Not found in asset-query-diagnostics');
  }
}
