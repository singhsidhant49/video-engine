import fs from 'node:fs';

const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-11T06-05-23';
const vn = JSON.parse(fs.readFileSync(`${runDir}/visible-needs.json`, 'utf8'));
const plan = JSON.parse(fs.readFileSync(`${runDir}/plan.json`, 'utf8'));

const targets = ['scene_005_shot_01', 'scene_010_shot_01', 'scene_011_shot_03', 'scene_012_shot_01', 'scene_019_shot_01'];

for (const id of targets) {
  const item = vn[id] || (Array.isArray(vn) ? vn.find(v => v.shotId === id) : null);
  console.log('====================================================');
  console.log('SHOT:', id);
  console.log('Narration:', item?.narrationText);
  console.log('primaryConcept:', item?.primaryConcept);
  console.log('subject:', item?.subject);
  console.log('action:', item?.action);
  console.log('visualRole:', item?.visualRole);
  console.log('evidenceRequirement:', item?.evidenceRequirement);
  console.log('literalnessRequirement:', item?.literalnessRequirement);
  console.log('requiredConcepts:', item?.requiredConcepts);
}
