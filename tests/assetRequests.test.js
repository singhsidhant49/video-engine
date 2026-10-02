import assert from 'node:assert/strict';
import test from 'node:test';

import { planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { AssetCandidateSchema, AssetRequestListSchema } from '../src/models/index.js';
import { createProvider } from '../src/assets/providerAdapter.js';
import { searchAssetProviders } from '../src/assets/providerRegistry.js';

const shot = (id, overrides = {}) => ({
  id, role: 'subject', durationHint: 3, visualConcept: 'EUV lithography machine',
  assetIntent: 'product', mediaPreference: 'real', searchConcepts: ['ASML EUV machine'],
  entities: ['ASML'], motionPreference: 'stable', evidenceRequirement: 'required', ...overrides,
});

const storyboard = {
  format: 'landscape',
  sections: [{
    id: 'section-1',
    scenes: [{ id: 'scene-1', shots: [shot('shot-1'), shot('shot-2', { visualConcept: 'How EUV works', assetIntent: 'data', mediaPreference: 'procedural', entities: [], searchConcepts: [], evidenceRequirement: 'preferred' })] }],
  }],
};

test('every canonical shot produces one validated provider-independent request', () => {
  const requests = planAssetRequests(storyboard);
  AssetRequestListSchema.parse(requests);
  assert.deepEqual(requests.map((request) => request.storyboardShotId), ['shot-1', 'shot-2']);
  assert.equal(requests[0].sceneId, 'scene-1');
  assert.equal(requests[1].preferredSource, 'procedural');
});

test('specific entity-product request preserves object semantics and exclusions', () => {
  const [request] = planAssetRequests(storyboard);
  assert.equal(request.concept, 'EUV lithography machine');
  assert.ok(request.stagedQueries.specific.some((query) => /ASML.*EUV lithography machine/i.test(query)));
  assert.ok(request.exclusions.includes('corporate headquarters'));
  assert.ok(request.exclusions.includes('generic office'));
  assert.ok(request.exclusions.includes('logo-only image'));
  assert.equal(request.continuityKey, 'entity:asml');
});

test('entity-only visual labels promote the most specific object search concept', () => {
  const entityStoryboard = structuredClone(storyboard);
  entityStoryboard.sections[0].scenes[0].shots = [shot('shot-entity', {
    visualConcept: 'ASML',
    searchConcepts: ['ASML', 'ASML lithography machine', 'semiconductor cleanroom'],
    assetIntent: 'entity',
  })];
  const [request] = planAssetRequests(entityStoryboard);
  assert.equal(request.concept, 'ASML lithography machine');
  assert.ok(request.exclusions.includes('corporate headquarters'));
});

test('provider adapter normalizes source-specific results into AssetCandidate', async () => {
  const provider = createProvider({
    id: 'fixture-provider',
    supports: (request) => request.preferredSource === 'image',
    search: async () => [{ type: 'image', url: 'https://example.test/asml.jpg', width: 1600, height: 900, tier: 'verified', label: 'ASML EUV system' }],
  });
  const request = planAssetRequests(storyboard)[0];
  const result = await searchAssetProviders(request, [provider]);
  assert.deepEqual(result.providerIds, ['fixture-provider']);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].providerId, 'fixture-provider');
  assert.equal(result.candidates[0].sourceUrl, 'https://example.test/asml.jpg');
  AssetCandidateSchema.parse(result.candidates[0]);
});

test('provider routing honors supports and never routes procedural shots', async () => {
  let calls = 0;
  const provider = createProvider({
    id: 'images-only',
    supports: (request) => request.preferredSource === 'image',
    search: async () => { calls++; return []; },
  });
  const [, procedural] = planAssetRequests(storyboard);
  const result = await searchAssetProviders(procedural, [provider]);
  assert.deepEqual(result.providerIds, []);
  assert.equal(result.candidates.length, 0);
  assert.equal(calls, 0);
});
