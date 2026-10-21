import fs from 'fs';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { scoreAssetCandidate, compareCandidateScores } from '../src/assets/assetIntelligenceScorer.js';
import { licenseAllowed } from '../src/shared/licensing.js';

const reqs = JSON.parse(fs.readFileSync('renders/runs/video-2026-10-02T16-39-21/asset-requests.json', 'utf8'));
const req = reqs.find(r => r.storyboardShotId === 'scene_002_shot_01');
const context = analyzeAssetRequest(req);

// Find all candidate search files that were queried for scene_002_shot_01
const assetsData = JSON.parse(fs.readFileSync('renders/runs/video-2026-10-02T16-39-21/assets.json', 'utf8'));
let pool = null;
for (const scene of assetsData.scenes || []) {
  for (const r of scene.requests || []) {
    if (r.storyboardShotId === 'scene_002_shot_01') {
      pool = r;
      break;
    }
  }
}
console.log('Found pool:', pool?.storyboardShotId);

console.log('rejectedTopCandidates:', pool?.rejectedTopCandidates?.length);
(pool?.rejectedTopCandidates || []).forEach((c, idx) => {
  console.log(`Rejected [${idx}]: candidateId=${c.candidateId} gates=${JSON.stringify(c.gates)} label="${c.label}"`);
});

scored.sort(compareCandidateScores);

console.log('Top 15 candidates:');
scored.slice(0, 15).forEach((item, idx) => {
  console.log(`[${idx}] provider=${item.candidate.providerId} rank=${item.score.qualityRank} status=${item.score.resolutionStatus} gates=${JSON.stringify(item.score.gates)} label="${item.candidate.label}"`);
});

const usable = scored.filter(s => s.score.resolutionStatus !== 'unusable');
console.log('Total usable candidates (resolutionStatus !== unusable):', usable.length);
if (usable.length > 0) {
  console.log('Usable candidates:');
  usable.forEach((item, idx) => {
    console.log(`Usable [${idx}]: provider=${item.candidate.providerId} rank=${item.score.qualityRank} label="${item.candidate.label}"`);
  });
}
