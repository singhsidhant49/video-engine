/**
 * Pipeline Stage Registry & Dependency Definitions (Milestone 12).
 * 
 * Formalizes all pipeline stages:
 * - Declares inputs
 * - Declares outputs
 * - Declares dependencies
 * - Computes deterministic input hashes
 */

import crypto from 'node:crypto';

export const PIPELINE_STAGES = [
  'request',
  'plan',
  'audio',
  'alignment',
  'visualStrategy',
  'storyboard',
  'assets',
  'timeline',
  'package',
  'preRenderQa',
  'render',
  'postRenderQa',
];

export const STAGE_ALIASES = {
  'topic-input': 'request',
  'duration-budget': 'request',
  'content-plan': 'plan',
  'script': 'plan',
  'tts': 'audio',
  'visual-coverage-plan': 'storyboard',
  'asset-requests': 'storyboard',
  'asset-search': 'assets',
  'visual-realization': 'direction',
  'creative-qa': 'timeline',
  'audio-mastering': 'timeline',
  'preflight': 'preRenderQa',
  'post-qc': 'postRenderQa',
};

export function canonicalStageName(stage) {
  return STAGE_ALIASES[stage] || stage;
}

export const STAGE_DEFINITIONS = {
  request: {
    id: 'request',
    name: 'Topic Input & Duration Request',
    inputs: ['topic', 'niche', 'format', 'targetDuration', 'style', 'voice', 'visualMode'],
    outputs: ['request.json', 'duration-budget.json'],
    dependencies: [],
    computeInputHash(context) {
      return hashObject({
        topic: context.topic,
        niche: context.niche,
        format: context.format,
        durationSec: context.durationSec,
        style: context.style,
        visualMode: context.visualMode || 'MEDIA_EDITORIAL',
      });
    },
  },
  'duration-budget': {
    id: 'duration-budget',
    name: 'Duration Budget Calculation',
    inputs: ['request.json'],
    outputs: ['duration-budget.json'],
    dependencies: ['request'],
    computeInputHash(context) {
      return hashObject({
        durationSec: context.durationSec,
        format: context.format,
        style: context.style,
      });
    },
  },
  plan: {
    id: 'plan',
    name: 'Editorial & Script Planning',
    inputs: ['request.json', 'duration-budget.json'],
    outputs: ['plan.json', 'content-quality-diagnostics.json'],
    dependencies: ['request'],
    computeInputHash(context) {
      return hashObject({
        topic: context.topic,
        format: context.format,
        style: context.style,
        planFileHash: context.planFileHash || null,
      });
    },
  },
  audio: {
    id: 'audio',
    name: 'TTS Narration Audio Generation',
    inputs: ['plan.json'],
    outputs: ['narration.wav'],
    dependencies: ['plan'],
    computeInputHash(context) {
      return hashObject({
        script: context.script || '',
        voice: context.voice,
        speed: context.speed || 0.9,
        audioFileHash: context.audioFileHash || null,
      });
    },
  },
  alignment: {
    id: 'alignment',
    name: 'Speech-to-Script Word Alignment',
    inputs: ['narration.wav', 'plan.json'],
    outputs: ['words.json'],
    dependencies: ['audio', 'plan'],
    computeInputHash(context) {
      return hashObject({
        script: context.script || '',
        audioHash: context.audioHash || null,
        model: 'whisper-base.en',
      });
    },
  },
  visualStrategy: {
    id: 'visualStrategy',
    name: 'Visual Strategy Selection',
    inputs: ['plan.json', 'request.json'],
    outputs: ['visual-strategy.json'],
    dependencies: ['plan', 'request'],
    computeInputHash(context) {
      return hashObject({
        style: context.style,
        format: context.format,
        topic: context.topic,
      });
    },
  },
  storyboard: {
    id: 'storyboard',
    name: 'Canonical Storyboard Authoring',
    inputs: ['plan.json', 'words.json', 'visual-strategy.json'],
    outputs: ['storyboard.json', 'storyboard-diagnostics.json'],
    dependencies: ['plan', 'alignment', 'visualStrategy'],
    computeInputHash(context) {
      return hashObject({
        script: context.script,
        style: context.style,
        format: context.format,
        wordsDuration: context.wordsDuration,
      });
    },
  },
  'visual-coverage-plan': {
    id: 'visual-coverage-plan',
    name: 'Visual Coverage Plan',
    inputs: ['storyboard.json'],
    outputs: ['visual-coverage-plan.json'],
    dependencies: ['storyboard'],
    computeInputHash(context) {
      return hashObject({
        storyboardShots: (context.storyboard?.sections || []).flatMap((section) => section.scenes || []).map((scene) => scene.shots?.length || 0),
        style: context.style,
      });
    },
  },
  'asset-requests': {
    id: 'asset-requests',
    name: 'Asset Request Planning',
    inputs: ['storyboard.json'],
    outputs: ['asset-requests.json'],
    dependencies: ['storyboard'],
    computeInputHash(context) {
      return hashObject({
        scenes: (context.storyboard?.scenes || []).map((s) => s.sceneId),
      });
    },
  },
  assets: {
    id: 'assets',
    name: 'Asset Retrieval & Semantic Scoring',
    inputs: ['asset-requests.json', 'storyboard.json'],
    outputs: ['assets.json', 'asset-quality-diagnostics.json', 'credits.txt'],
    dependencies: ['asset-requests', 'storyboard'],
    computeInputHash(context) {
      return hashObject({
        requestsCount: context.assetRequestsCount || 0,
        allowGenerated: false,
        offline: Boolean(context.offline),
      });
    },
  },
  direction: {
    id: 'direction',
    name: 'Visual Direction & Recast',
    inputs: ['storyboard.json', 'assets.json'],
    outputs: ['direction.json', 'continuity.json'],
    dependencies: ['storyboard', 'assets'],
    computeInputHash(context) {
      return hashObject({
        style: context.style,
        assetsHash: context.assetsHash,
      });
    },
  },
  timeline: {
    id: 'timeline',
    name: 'Timeline Compilation',
    inputs: ['direction.json', 'assets.json', 'words.json'],
    outputs: [
      'timeline.json', 'visual-realization-diagnostics.json', 'pacing-diagnostics.json',
      'editorial-visual-plan.json', 'editorial-visual-beats.json', 'media-shot-plan.json', 'scene-compositions.json', 'comparison-specs.json', 'chart-specs.json', 'media-scene-specs.json', 'solved-scenes.json',
      'motion-plans.json', 'visual-quality-reviews.json', 'frame-state-preflight.json', 'composition-fallbacks.json', 'media-composition-diagnostics.json', 'edit-continuity-diagnostics.json',
    ],
    dependencies: ['direction', 'assets', 'alignment'],
    computeInputHash(context) {
      return hashObject({
        fps: context.fps || 30,
        format: context.format,
        style: context.style,
        visualMode: context.visualMode || 'MEDIA_EDITORIAL',
      });
    },
  },
  'creative-qa': {
    id: 'creative-qa',
    name: 'Creative QA Review & Automated Repair',
    inputs: ['timeline.json', 'visual-coverage-plan.json'],
    outputs: ['creative-qa-before.json', 'creative-repairs.json', 'creative-qa-after.json'],
    dependencies: ['timeline', 'visual-coverage-plan'],
    computeInputHash(context) {
      return hashObject({
        timelineClipsCount: context.timeline?.clips?.length || 0,
        topic: context.topic,
      });
    },
  },
  'audio-mastering': {
    id: 'audio-mastering',
    name: 'Audio Diagnostics & SFX/BGM Mix',
    inputs: ['timeline.json', 'narration.wav'],
    outputs: ['audio-diagnostics.json'],
    dependencies: ['timeline', 'audio'],
    computeInputHash(context) {
      return hashObject({
        style: context.style,
        narrationLufs: context.narrationLufs,
      });
    },
  },
  package: {
    id: 'package',
    name: 'Packaging & Metadata Generation',
    inputs: ['plan.json', 'timeline.json'],
    outputs: ['packaging.json', 'package.md'],
    dependencies: ['plan', 'timeline'],
    computeInputHash(context) {
      return hashObject({
        title: context.title,
        format: context.format,
      });
    },
  },
  preRenderQa: {
    id: 'preRenderQa',
    name: 'Preflight Timeline QC & Contact Sheet',
    inputs: ['timeline.json', 'creative-qa-after.json'],
    outputs: ['qc-pre.json'],
    dependencies: ['timeline', 'creative-qa', 'audio-mastering'],
    computeInputHash(context) {
      return hashObject({
        timelineDuration: context.timeline?.durationInFrames,
      });
    },
  },
  render: {
    id: 'render',
    name: 'Remotion Media Render & Bundling',
    inputs: ['timeline.json', 'preRenderQa'],
    outputs: ['output.mp4'],
    dependencies: ['preRenderQa', 'package'],
    computeInputHash(context) {
      return hashObject({
        timelineHash: context.timelineHash,
        crf: 17,
        fps: context.fps || 30,
      });
    },
  },
  postRenderQa: {
    id: 'postRenderQa',
    name: 'Post-Render QC & Frame Critic',
    inputs: ['output.mp4', 'timeline.json'],
    outputs: ['qc.json'],
    dependencies: ['render'],
    computeInputHash(context) {
      return hashObject({
        outputPath: context.outputPath,
      });
    },
  },
};

function hashObject(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}
