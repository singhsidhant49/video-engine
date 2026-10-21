import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { JobContext } from '../src/core/jobs/jobContext.js';
import { normalizePlan, demoPlan } from '../src/services/aiDirectorService.js';
import { tokenizeScript, estimateTiming } from '../src/services/alignmentService.js';
import { directScenes } from '../src/pipeline/visualDirector.js';
import { buildStoryboard } from '../src/pipeline/visualStoryboardDirector.js';
import { storyboardToExecutionPlan } from '../src/pipeline/storyboardCompatibility.js';
import { planAssetRequests } from '../src/pipeline/assetRequestPlanner.js';
import { buildTimeline, rngFrom, sceneWordRanges } from '../src/pipeline/timeline.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';
import {
  AssetCandidateSchema,
  AssetRequestSchema,
  StoryboardSchema,
  TimelineSchema,
  VideoVisualStrategySchema,
  createDefaultVisualStrategy,
} from '../src/models/index.js';

test('visual strategy defaults produce a complete bounded contract', () => {
  const strategy = createDefaultVisualStrategy();
  assert.equal(strategy.version, 1);
  assert.equal(strategy.visualFlow, 'hybrid');
  assert.ok(strategy.assetPreference.realMediaWeight > strategy.assetPreference.proceduralWeight);
  assert.deepEqual(VideoVisualStrategySchema.parse(strategy), strategy);
});

test('asset request and candidate contracts reject unusable boundaries', () => {
  const request = AssetRequestSchema.parse({
    id: 'request-1', sceneId: 'scene-1', storyboardShotId: 'shot-1', assetIntent: 'entity',
    concept: 'Nokia N95 mobile phone', entities: ['Nokia'], searchConcepts: ['Nokia N95'],
    stagedQueries: { specific: ['Nokia N95 mobile phone'], fallback: ['Nokia mobile phone'] },
    constraints: { orientation: 'landscape', minWidth: 1280, minHeight: 720 }, evidenceRequired: true,
  });
  assert.equal(request.preferredSource, 'auto');
  assert.throws(() => AssetCandidateSchema.parse({
    id: 'candidate-1', providerId: 'pexels', type: 'image',
  }));
});

test('existing deterministic plan compiles through storyboard and timeline schemas', () => {
  const plan = normalizePlan(demoPlan(), {
    topic: 'How the 2008 financial crisis started',
    niche: 'business documentary',
    format: 'landscape',
  });
  const fps = 30;
  const rawWords = estimateTiming(tokenizeScript(plan.script), 48);
  const words = rawWords.map((word) => ({
    ...word,
    startFrame: Math.round(word.start * fps),
    endFrame: Math.round(word.end * fps),
  }));
  const narration = {
    durationInSeconds: 48,
    totalFrames: 48 * fps,
    fps,
    words,
    transcript: [],
    source: 'estimate',
    matchRate: 1,
  };
  const sceneSeconds = sceneWordRanges(plan.scenes).map(([a, b]) => words[b].end - words[a].start);
  const strategy = createDefaultVisualStrategy();
  const storyboard = buildStoryboard(plan, {
    format: 'landscape', sceneSeconds, videoId: 'fixture-video', visualStrategy: strategy,
  });
  const parsedStoryboard = StoryboardSchema.parse(storyboard);
  assert.ok(parsedStoryboard.sections.flatMap((section) => section.scenes).length <= plan.scenes.length);
  assert.ok(parsedStoryboard.sections.flatMap((section) => section.scenes).every((scene) => scene.shots.length >= 1));

  const executionPlan = storyboardToExecutionPlan(plan, parsedStoryboard);
  assert.ok(executionPlan.scenes.every((scene) => !Object.hasOwn(scene, 'imageQueries')));
  const assetRequests = planAssetRequests(parsedStoryboard, { format: 'landscape' });
  assert.equal(assetRequests.length, parsedStoryboard.sections.flatMap((section) => section.scenes.flatMap((scene) => scene.shots)).length);
  const specs = directScenes(parsedStoryboard, { format: 'landscape', rng: rngFrom('fixture-video:visual') });
  const canonicalScenes = parsedStoryboard.sections.flatMap((section) => section.scenes);
  assert.deepEqual(specs.map((spec) => spec.sceneId), canonicalScenes.map((scene) => scene.id));
  assert.ok(specs.every((spec) => spec.need.allowGenerated === false));
  const assets = Object.fromEntries(executionPlan.scenes.map((scene) => [scene.id, { primary: null, alternates: [] }]));
  const timeline = buildTimeline({
    plan: executionPlan, specs, narration, assets, sfx: {}, bgm: null,
    videoId: 'fixture-video', format: 'landscape', fps, audioSrc: 'narration.wav',
  });
  TimelineSchema.parse(timeline);
  const authoredShotIds = executionPlan.scenes.flatMap((scene) => scene.storyboardShots.map((shot) => shot.id));
  assert.deepEqual(timeline.realizedShots.map((shot) => shot.storyboardShotId), authoredShotIds);
  assert.equal(timeline.clips.flatMap((clip) => clip.shots).length, authoredShotIds.length);
  assert.equal(runTimelineQc(timeline, { plan: executionPlan, narration }).ok, true);
});

test('job context persists validated project and checkpoint state', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'video-job-contract-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const job = await JobContext.create({
    id: 'video-test', topic: 'A contract test', channelId: 'test', format: 'landscape',
    targetDuration: 30, runsDir: tempRoot,
  });
  await job.startStage('request');
  await job.writeArtifact('request.json', { topic: 'A contract test' });
  await job.completeStage('request', ['request.json']);
  await job.skipStage('render');
  await job.finish();

  const project = JSON.parse(await fs.readFile(path.join(tempRoot, 'video-test', 'project.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(tempRoot, 'video-test', 'manifest.json'), 'utf8'));
  assert.equal(project.status, 'complete');
  assert.deepEqual(project.artifacts.request, ['request.json']);
  assert.equal(manifest.stages.request.status, 'complete');
  assert.equal(manifest.stages.render.status, 'skipped');
});
