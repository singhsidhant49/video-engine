import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisualProposition } from '../src/storyboard/visualProposition.js';
import { routeRepresentation } from '../src/storyboard/representationRouter.js';
import { inspectVisualCandidate } from '../src/assets/visualInspectionService.js';
import { licenseAllowed } from '../src/shared/licensing.js';
import { classifyVisualMatch, judgeAssetCandidate } from '../src/assets/visualEditorialJudge.js';
import { buildVisualCoveragePlan, synthesizeProceduralData } from '../src/storyboard/visualCoveragePlan.js';
import { buildEditorialVisualPlan } from '../src/pipeline/editorialVisualPlanner.js';
import { resolveVisualPolicy } from '../src/config/visualMode.js';
import { applyMediaOnlyReuseFallbacks } from '../src/pipeline/assetDirector.js';

test('structured causal concepts route to procedural timeline instead of stock search', () => {
  const scene = { id: 'scene', kind: 'process', purpose: 'explanation', narration: 'A retained reference prevents garbage collection, causing heap memory to grow.', evidenceRequirement: 'preferred' };
  const shot = { id: 'shot', role: 'graphic', visualConcept: 'memory leak mechanism', assetIntent: 'concept', entities: [], searchConcepts: [] };
  const proposition = buildVisualProposition({ shot, scene });
  const decision = routeRepresentation(proposition);
  assert.equal(proposition.conceptSense, 'SOFTWARE_MEMORY');
  assert.equal(decision.selectedRepresentation, 'process');
  assert.equal(decision.preferredSource, 'procedural');
  assert.equal(decision.searchable, false);
});

test('media production routing never falls back to a procedural template', () => {
  const proposition = { shotId: 'shot', representationNeed: 'DIAGRAM' };
  const decision = routeRepresentation(proposition, {
    shotId: 'shot',
    primaryRepresentation: 'diagram',
    fallbackRepresentations: ['typography'],
  }, { visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }) });

  assert.equal(decision.selectedRepresentation, 'media');
  assert.equal(decision.searchable, true);
  assert.deepEqual(decision.fallbackRepresentations, []);

  const concreteMedia = routeRepresentation({ shotId: 'entity', representationNeed: 'REAL_IMAGE' }, {
    shotId: 'entity', primaryRepresentation: 'media', fallbackRepresentations: ['media'],
  }, { visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }) });
  assert.deepEqual(concreteMedia.fallbackRepresentations, []);
});

test('editorial planner honors an explicit production representation fallback', () => {
  const shot = { id: 'shot', role: 'graphic', visualConcept: 'three-step causal list' };
  const scene = { id: 'scene', shots: [shot], informationDensity: 3, narration: 'First collect, then recycle, then reuse.' };
  const storyboard = { format: 'landscape', sections: [{ id: 'section', scenes: [scene] }] };
  const coverage = [{
    shotId: 'shot', sceneId: 'scene', sectionId: 'section', primaryRepresentation: 'diagram',
    semanticPayload: { communicationObjective: 'explain a three-step causal list' },
    representationDecision: { selectedRepresentation: 'diagram', fallbackApplied: true },
  }];
  const [planned] = buildEditorialVisualPlan({
    storyboard,
    coveragePlan: coverage,
    specs: [{ sceneId: 'scene', family: 'image', treatment: 'editorial' }],
    assets: { scene: { byShot: {} } },
    visualPolicy: resolveVisualPolicy({ visualMode: 'MEDIA_EDITORIAL' }),
  });

  assert.equal(planned.selectedRepresentation, 'diagram');
  assert.equal(planned.assetBindings.length, 0);
});

test('media-only production fallback reuses approved media without procedural output', () => {
  const approved = {
    id: 'approved-image', type: 'image', src: 'assets/approved.jpg', storyboardShotId: 'shot-a',
    license: { name: 'CC BY' }, editorialJudgment: { accepted: true, classification: 'DIRECT', confidence: 0.9 },
    assetIdentityChain: { candidateId: 'candidate-a', timelineAssetId: 'shot-a', sha256ContentHash: 'abc' },
  };
  const assets = {
    scene_a: { primary: approved, alternates: [], byShot: { 'shot-a': approved } },
    scene_b: { primary: null, alternates: [], byShot: {} },
  };
  const requestReports = [{ storyboardShotId: 'shot-b', sceneId: 'scene_b', resolutionStatus: 'unresolved', rejectedTopCandidates: [] }];
  const assetRequests = [{ storyboardShotId: 'shot-b', sceneId: 'scene_b', concept: 'missing media', visibleNeed: { subject: 'subject' } }];

  const fallbacks = applyMediaOnlyReuseFallbacks({ assets, requestReports, assetRequests, sceneIds: ['scene_a', 'scene_b'] });

  assert.equal(requestReports[0].resolutionStatus, 'media_reuse');
  assert.equal(assets.scene_b.byShot['shot-b'].type, 'image');
  assert.equal(assets.scene_b.byShot['shot-b'].src, 'assets/approved.jpg');
  assert.equal(assets.scene_b.byShot['shot-b'].assetIdentityChain.timelineAssetId, 'shot-b');
  assert.equal(fallbacks['shot-b'].fromShotId, 'shot-a');
});

test('database deadlocks route to a concurrency diagram and reject literal visual confusers', () => {
  const scene = {
    id: 'scene', kind: 'list', preferredPresentation: 'list', purpose: 'payoff',
    narration: 'Each thread holds what the other needs. Break circular wait to prevent the database deadlock.',
    evidenceRequirement: 'conceptual_allowed',
  };
  const shot = {
    id: 'shot', role: 'context', visualConcept: 'chain breaking close-up', assetIntent: 'data',
    entities: [], searchConcepts: ['padlock opening', 'four conditions'],
  };
  const proposition = buildVisualProposition({ shot, scene });
  const decision = routeRepresentation(proposition);
  assert.equal(proposition.conceptSense, 'CONCURRENCY_DEADLOCK');
  assert.equal(proposition.representationNeed, 'DIAGRAM');
  assert.equal(decision.selectedRepresentation, 'diagram');
  assert.equal(decision.searchable, false);
  assert.ok(proposition.negativeConfusers.includes('fiber optic cables'));
});

test('an application freeze cannot trigger the financial credit-freeze diagram', () => {
  const data = synthesizeProceduralData({
    narration: 'Your app freezes. No crash, no error. Just silence.',
    text: { headline: 'JUST SILENCE' },
    data: {},
  }, 'diagram');
  assert.notEqual(data.title, 'CREDIT TRANSMISSION SHOCK');
  assert.doesNotMatch(JSON.stringify(data), /interbank|credit transmission/i);
});

test('database retry code synthesis never falls back to the generic agent loop', () => {
  const data = synthesizeProceduralData({ narration: 'This prevents permanent gridlock, but the victim must retry.', data: {} }, 'code');
  assert.match(data.code, /DeadlockError/);
  assert.match(data.code, /rollback/);
  assert.doesNotMatch(data.code, /model\.reason|selectTool/);
});

test('database outage UI synthesis never renders a generic repository workspace', () => {
  const data = synthesizeProceduralData({ narration: 'Two queries gridlock the database and crash the application.', data: {} }, 'ui');
  assert.equal(data.title, 'Database Activity Monitor');
  assert.match(JSON.stringify(data), /blocked queries|circular wait/i);
  assert.doesNotMatch(JSON.stringify(data), /Repository Workspace|agent\.js/);
});

test('banking-app deadlock meaning outranks finance-crisis keyword routing', () => {
  const narration = 'In a banking app, two transfers lock accounts in opposite order, then the database kills one transaction.';
  const diagram = synthesizeProceduralData({ narration, data: {} }, 'diagram');
  const process = synthesizeProceduralData({ narration, data: {} }, 'process');
  assert.equal(diagram.title, 'DATABASE DEADLOCK CYCLE');
  assert.match(JSON.stringify(diagram), /Transfer A|Victim Rollback/);
  assert.doesNotMatch(JSON.stringify(diagram), /SUBPRIME|MORTGAGE|SECURITIZATION/);
  assert.notEqual(process.title, 'CAUSAL PROCESS');
  assert.match(process.title, /BANKING|TRANSFER/);
});

test('implicit deadlock hook uses a title grounded in the narrated words', () => {
  const diagram = synthesizeProceduralData({ narration: 'Two transactions freeze forever, each waiting for the other to release a lock.', data: {} }, 'diagram');
  assert.equal(diagram.title, 'TRANSACTIONS WAIT FOR LOCKS');
});

test('ambiguous lock-wait beat inherits database-deadlock topic and cannot search literal queue stock', () => {
  const storyboard = {
    topic: 'How Database Deadlocks Work', format: 'landscape',
    scenes: [{
      id: 'scene', kind: 'subject', purpose: 'explanation', evidenceRequirement: 'conceptual_allowed',
      narration: 'Transaction B wants that row, so it waits in a queue.',
      shots: [{ id: 'shot', role: 'context', visualConcept: 'queue of people waiting', assetIntent: 'concept', mediaPreference: 'real', entities: [], searchConcepts: ['locked door'] }],
    }],
  };
  const [coverage] = buildVisualCoveragePlan(storyboard);
  assert.equal(coverage.visualProposition.conceptSense, 'CONCURRENCY_DEADLOCK');
  assert.equal(coverage.visualProposition.representationNeed, 'DIAGRAM');
  assert.equal(coverage.representationDecision.selectedRepresentation, 'diagram');
  assert.equal(coverage.representationDecision.searchable, false);
});

test('pixel-inspected movie poster is rejected for a database lock-wait beat', () => {
  const verdict = classifyVisualMatch({
    candidate: { title: 'Locked Doors (1925) poster', label: 'vintage film poster' },
    inspection: { primarySubject: 'movie poster', sceneSummary: 'a vintage theatrical poster', visibleText: ['LOCKED DOORS'], visibleObjects: ['poster'] },
    visibleNeed: { narrationText: 'Transaction B waits for a row lock.', subject: 'transaction lock wait', videoTopic: 'How Database Deadlocks Work', literalnessRequirement: 'DIRECT' },
  });
  assert.equal(verdict.accept, false);
  assert.equal(verdict.classification, 'WRONG');
  assert.match(verdict.reasons[0], /representation_mismatch/);
});

test('metadata-only inspection explicitly reports that pixels were not inspected', async () => {
  const inspection = await inspectVisualCandidate({ id: 'metadata-only', type: 'image', label: 'server room' });
  assert.equal(inspection.pixelInspected, false);
  assert.equal(inspection.semanticPixelInspected, false);
  assert.deepEqual(inspection.inspectionSources, ['METADATA_FALLBACK']);
  assert.ok(inspection.inspectionConfidence <= 0.25);
});

test('search discovery provenance is not treated as a commercial licence', () => {
  const verdict = licenseAllowed({ name: 'Brave Search discovery result', verification_status: 'discovery_only', commercial_use: 'unknown', nonFree: false });
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /no verified asset licence/);
});

test('editorial score uses the canonical zero-to-one scale', () => {
  const inspection = {
    primarySubject: 'server rack', visibleObjects: ['server rack'], visibleAction: 'operating', environment: 'data center',
    visibleText: [], sceneSummary: 'server rack in data center', communicatedMeanings: ['cloud infrastructure'], styleClass: 'TECHNICAL',
    brandEntities: [], productEntities: [], foreignEntities: [], confidence: 0.9,
    composition: { subjectBoundsConfidence: 'HIGH', primarySubjectBounds: { x: .2, y: .2, width: .6, height: .6 }, faceBounds: [], importantObjectBounds: [], visualBusyness: .4 },
  };
  const visibleNeed = {
    visualRole: 'CONTEXT', primaryConcept: 'server rack', subject: 'server rack', action: 'operating', environment: 'data center',
    requiredVisibleObjects: ['server rack'], acceptableAlternatives: ['data center infrastructure'], avoidVisuals: [], literalnessRequirement: 'CONTEXTUAL_ALLOWED', evidenceRequirement: 'preferred',
  };
  const judgment = judgeAssetCandidate({ candidate: { id: 'server', type: 'image', width: 1920, height: 1080, label: 'server rack' }, inspection, visibleNeed, targetFormat: 'landscape', retrievalScore: { semantic: { overall: .9 } } });
  assert.ok(judgment.finalEditorialScore >= 0 && judgment.finalEditorialScore <= 1);
});
