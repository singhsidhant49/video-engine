import fs from 'fs';
import { analyzeAssetRequest } from '../src/assets/assetSearchContext.js';
import { normalizeProviderCandidate } from '../src/assets/providerAdapter.js';
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
      list.forEach((item) => {
        allCandidates.push(normalizeProviderCandidate(p, { ...item, query: q, queryStage: 'EXACT' }));
      });
    }
  }
}

console.log('Total normalized candidates:', allCandidates.length);

// Let's test with the fixed logic in a simulated function
const DOMAIN_SYNONYMS = {
  scientist: ['researcher', 'professor', 'mathematician', 'physicist', 'chemist', 'scholar', 'expert', 'genius', 'lab', 'laboratory'],
  thinking: ['pondering', 'thoughtful', 'contemplative', 'reflecting', 'idea', 'confused', 'wondering'],
  clock: ['clocks', 'gears', 'mechanism', 'time', 'watch', 'dial', 'cogs', 'pendulum', 'steampunk'],
  gear: ['gears', 'cogs', 'mechanism', 'clock', 'wheels'],
  gears: ['gear', 'cogs', 'mechanism', 'clock', 'wheels'],
};

function terms(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function calculateSubjectMatch(subjectTerms, metadataTerms, candidateText, context, request) {
  if (!subjectTerms.length) return 1;
  const metaSet = new Set(metadataTerms);
  const textLower = candidateText.toLowerCase();

  // Enhanced alias matching
  const aliasMatch = (context.aliases || []).some((alias) => {
    const aLower = alias.toLowerCase();
    if (textLower.includes(aLower)) return true;
    const aTokens = terms(aLower).filter(t => !['animation', 'illustration', 'cartoon', 'photo', 'video', 'image', 'background', 'clipart'].includes(t));
    if (!aTokens.length) return false;
    const matched = aTokens.filter(t => {
      if (metaSet.has(t)) return true;
      const syns = DOMAIN_SYNONYMS[t] || [];
      return syns.some(s => metaSet.has(s));
    });
    return (matched.length / aTokens.length) >= 0.5;
  });
  if (aliasMatch) return 0.95;

  let matches = 0;
  for (const term of subjectTerms) {
    if (metaSet.has(term)) {
      matches++;
      continue;
    }
    const synonyms = DOMAIN_SYNONYMS[term] || [];
    if (synonyms.some((syn) => metaSet.has(syn))) {
      matches++;
      continue;
    }
  }
  const tokenRatio = matches / subjectTerms.length;
  return Number(Math.min(1, Math.max(0, tokenRatio)).toFixed(3));
}

allCandidates.forEach((c) => {
  const meta = [c.label, c.metadata.title, c.metadata.description, c.sourceUrl].filter(Boolean).join(' ');
  const mTerms = terms(meta);
  const subMatch = calculateSubjectMatch(context.targetSubject, mTerms, meta, context, req);
  if (subMatch >= 0.45 && !meta.includes('dreamstime')) {
    console.log(`[CANDIDATE] subMatch=${subMatch} provider=${c.providerId} (${c.query}) w=${c.width} h=${c.height} label="${c.label?.slice(0, 70)}"`);
  }
});
