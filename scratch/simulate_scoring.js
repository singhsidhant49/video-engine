import fs from 'fs';
import { pexelsSearch } from '../src/services/freeMediaService.js';
import { normalizeProviderCandidate } from '../src/assets/providerAdapter.js';
import { scoreAssetCandidate } from '../src/assets/assetIntelligenceScorer.js';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';

const runDir = 'D:/projects/videogenerator/renders/runs/video-2026-10-09T03-14-22';
const reqs = JSON.parse(fs.readFileSync(`${runDir}/asset-requests.json`, 'utf8'));
const request = reqs.find(r => r.storyboardShotId === 'scene_006_shot_01');
const context = analyzeAssetRequest(request);

console.log('Target subject in context:', context.targetSubject);
console.log('Request concept:', request.concept);
console.log('Request exclusions:', request.exclusions);

const rawCandidates = await pexelsSearch('overwhelmed shopper aisle', 'landscape');
for (const raw of rawCandidates) {
  const candidate = normalizeProviderCandidate('pexels-image', raw);
  const score = scoreAssetCandidate(candidate, request, context);
  console.log('--- Candidate:', candidate.label);
  console.log('Quality Rank:', score.qualityRank, '| Resolution:', score.resolutionStatus);
  console.log('Gates:', score.gates);
  console.log('Subject match:', score.metrics?.subjectMatch, '| Action match:', score.metrics?.actionMatch);
}
