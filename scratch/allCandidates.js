import fs from 'fs';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { scoreAssetCandidate, compareCandidateScores } from '../src/assets/assetIntelligenceScorer.js';
import { licenseAllowed } from '../src/shared/licensing.js';
import crypto from 'crypto';

function hash(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const reqs = JSON.parse(fs.readFileSync('renders/runs/video-2026-10-02T16-39-21/asset-requests.json', 'utf8'));
const req = reqs.find(r => r.storyboardShotId === 'scene_002_shot_01');
const context = analyzeAssetRequest(req);

const queries = [
  'scientist thinking cartoon',
  'clock gears animation',
  'challenges cause effect. active demonstration or relevant physical phenomenon',
  'challenges cause effect. authentic real-world environment matching context'
];

const providers = ['brave-image', 'pexels-image', 'pixabay-image', 'pexels-video'];

const allCandidates = [];

for (const p of providers) {
  for (const q of queries) {
    const k = hash(`${p}:${q}:{}`);
    const filePath = `.cache/searches/${k}.json`;
    if (fs.existsSync(filePath)) {
      const list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      list.forEach((item, idx) => {
        allCandidates.push({ ...item, id: `${p}_${idx}`, providerId: p, query: q });
      });
    }
  }
}

console.log('Total candidates found across searches:', allCandidates.length);

const scored = allCandidates.map(c => {
  const verdict = licenseAllowed(c.license);
  const score = scoreAssetCandidate(c, req, context);
  if (!verdict.ok) {
    score.resolutionStatus = 'unusable';
    score.qualityRank = 0;
    score.gates.push(`license: ${verdict.why}`);
  }
  return { candidate: c, score };
});

scored.sort((a, b) => compareCandidateScores(a, b, 'portrait'));

const nonWatermark = scored.filter(s => !s.score.gates.includes('watermark_risk') && s.score.resolutionStatus !== 'unusable');
console.log('Non-watermark usable candidates:', nonWatermark.length);
nonWatermark.slice(0, 10).forEach((s, i) => {
  console.log(`[${i}] ${s.candidate.providerId} (${s.candidate.query}) | rank=${s.score.qualityRank} status=${s.score.resolutionStatus} gates=${JSON.stringify(s.score.gates)} label="${s.candidate.label?.slice(0, 60)}"`);
});
