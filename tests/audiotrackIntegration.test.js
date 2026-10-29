import assert from 'node:assert/strict';
import test from 'node:test';
import { getAudioCatalog, scanAudioTracks, parseTrackFilename, CATEGORY_VOLUME_PROFILES } from '../src/audio/musicCatalog.js';
import { selectBackgroundMusic } from '../src/audio/musicTrackSelector.js';
import { ensureBackgroundMusic } from '../src/services/sfxGeneratorService.js';
import { CreateVideoRequestSchema, toPipelineBrief } from '../src/server/videoApiSchemas.js';
import { VideoBriefSchema, ChannelProfileSchema } from '../src/config/videoBrief.js';
import { buildTimeline } from '../src/pipeline/timeline.js';

test('parseTrackFilename correctly extracts title and artist', () => {
  const result1 = parseTrackFilename('Aakash Gandhi - Liquid Time.mp3');
  assert.equal(result1.title, 'Aakash Gandhi');
  assert.equal(result1.artist, 'Liquid Time');

  const result2 = parseTrackFilename('rain-ambient.mp3');
  assert.equal(result2.artist, 'Nature Ambient');

  const result3 = parseTrackFilename('SimpleTrack.wav');
  assert.equal(result3.title, 'SimpleTrack');
  assert.equal(result3.artist, 'YouTube Audio Library');
});

test('getAudioCatalog scans and indexes background music tracks', () => {
  const catalog = getAudioCatalog();
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.length >= 30, `Expected at least 30 tracks, got ${catalog.length}`);

  const sample = catalog[0];
  assert.ok(sample.id);
  assert.ok(sample.title);
  assert.ok(sample.artist);
  assert.ok(sample.category);
  assert.ok(sample.src.startsWith('audiotrack/'));
  assert.equal(typeof sample.baseVolume, 'number');
  assert.equal(typeof sample.duckedVolume, 'number');
});

test('category volume profiles assign distinct audio dynamics', () => {
  const catalog = getAudioCatalog();
  const meditationTrack = catalog.find((t) => t.category === 'meditation');
  assert.ok(meditationTrack, 'Meditation track should exist');
  assert.equal(meditationTrack.baseVolume, 0.22);
  assert.equal(meditationTrack.duckedVolume, 0.08);

  const explainerTrack = catalog.find((t) => t.category === 'explainer' || t.category === 'education');
  assert.ok(explainerTrack, 'Explainer track should exist');
  assert.ok(explainerTrack.duckedVolume <= 0.05);
});

test('selectBackgroundMusic routes content types to suitable audio tracks', () => {
  const catalog = getAudioCatalog();

  const medSelected = selectBackgroundMusic({ contentType: 'meditation', videoId: 'vid-1' }, catalog);
  assert.equal(medSelected.category, 'meditation');
  assert.equal(medSelected.baseVolume, 0.22);

  const docSelected = selectBackgroundMusic({ contentType: 'documentary', videoId: 'vid-1' }, catalog);
  assert.ok(['documentary', 'documenty'].includes(docSelected.category));

  const motSelected = selectBackgroundMusic({ contentType: 'motivational', videoId: 'vid-1' }, catalog);
  assert.equal(motSelected.category, 'motivational');

  const crimeSelected = selectBackgroundMusic({
    contentType: 'documentary',
    topic: 'Unsolved Murder Mystery of 1920',
    videoId: 'vid-1',
  }, catalog);
  assert.equal(crimeSelected.category, 'investigate_crime');
});

test('selectBackgroundMusic deterministically rotates tracks by videoId', () => {
  const catalog = getAudioCatalog();
  const tracks = new Set();
  for (let i = 0; i < 15; i++) {
    const sel = selectBackgroundMusic({
      contentType: 'documentary',
      videoId: `video_run_seed_${i * 997}`,
    }, catalog);
    tracks.add(sel.src);
  }
  assert.ok(tracks.size > 1, 'Expected seeded rotation across multiple video runs');
});

test('selectBackgroundMusic honors explicit user track override', () => {
  const catalog = getAudioCatalog();
  const requested = 'Liquid Time';
  const selected = selectBackgroundMusic({ requestedTrack: requested }, catalog);
  assert.ok(selected.title.toLowerCase().includes('liquid time') || selected.artist.toLowerCase().includes('liquid time') || selected.id.includes('liquid-time'));
});

test('ensureBackgroundMusic integrates smoothly with options object and legacy string', async () => {
  const fromOptions = await ensureBackgroundMusic({
    contentType: 'meditation',
    topic: 'Mindful Breathing',
    videoId: 'test-med-01',
  });
  assert.ok(fromOptions.src);
  assert.ok(fromOptions.src.includes('audiotrack/meditation'));
  assert.equal(fromOptions.baseVolume, 0.22);

  const fromLegacy = await ensureBackgroundMusic('cinematic');
  assert.ok(fromLegacy.src);
  assert.ok(typeof fromLegacy.baseVolume === 'number');
});

import { normalizePlan, demoPlan } from '../src/services/aiDirectorService.js';
import { tokenizeScript, estimateTiming } from '../src/services/alignmentService.js';
import { directScenes } from '../src/pipeline/visualDirector.js';
import { buildStoryboard } from '../src/pipeline/visualStoryboardDirector.js';
import { storyboardToExecutionPlan } from '../src/pipeline/storyboardCompatibility.js';
import { rngFrom, sceneWordRanges } from '../src/pipeline/timeline.js';
import { createDefaultVisualStrategy } from '../src/models/index.js';

test('timeline.js preserves track-specific baseVolume and duckedVolume', () => {
  const plan = normalizePlan(demoPlan(), { topic: 'Background music test', niche: 'tech', format: 'landscape' });
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
  };
  const sceneSeconds = sceneWordRanges(plan.scenes).map(([a, b]) => words[b].end - words[a].start);
  const strategy = createDefaultVisualStrategy();
  const storyboard = buildStoryboard(plan, {
    format: 'landscape', sceneSeconds, videoId: 'fixture-video', visualStrategy: strategy,
  });
  const executionPlan = storyboardToExecutionPlan(plan, storyboard);
  const specs = directScenes(storyboard, { format: 'landscape', rng: rngFrom('fixture-video:visual') });
  const assets = Object.fromEntries(executionPlan.scenes.map((scene) => [scene.id, { primary: null, alternates: [] }]));
  const customBgm = {
    src: 'audiotrack/meditation/rain-ambient.mp3',
    baseVolume: 0.22,
    duckedVolume: 0.08,
  };

  const timeline = buildTimeline({
    plan: executionPlan,
    specs,
    narration,
    assets,
    sfx: {},
    bgm: customBgm,
    videoId: 'test-timeline',
    format: 'landscape',
    fps,
    audioSrc: 'audio.wav',
  });
  assert.equal(timeline.audio.bgm.src, 'audiotrack/meditation/rain-ambient.mp3');
  assert.equal(timeline.audio.bgm.base, 0.22);
  assert.equal(timeline.audio.bgm.ducked, 0.08);
});

test('schema and brief pipelines allow music field without regressions', () => {
  const parsedRequest = CreateVideoRequestSchema.parse({
    prompt: 'History of the Roman Empire and Julius Caesar',
    audio: {
      voice: 'af_bella',
      music: 'Aakash Gandhi - Liquid Time',
    },
  });
  assert.equal(parsedRequest.audio.music, 'Aakash Gandhi - Liquid Time');

  const brief = toPipelineBrief(parsedRequest);
  assert.equal(brief.music, 'Aakash Gandhi - Liquid Time');
  assert.equal(brief.channel.music, 'Aakash Gandhi - Liquid Time');

  const parsedBrief = VideoBriefSchema.parse({
    prompt: 'Guided Evening Meditation for Sleep',
    music: 'rain-ambient.mp3',
    channel: {
      contentType: 'meditation',
      music: 'rain-ambient.mp3',
    },
  });
  assert.equal(parsedBrief.music, 'rain-ambient.mp3');
  assert.equal(parsedBrief.channel.music, 'rain-ambient.mp3');
});
