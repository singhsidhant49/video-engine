import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getImageDimensions } from '../services/imageUtils.js';

const MOTION_MAP = Object.freeze({
  STATIC: 'static',
  SLOW_PUSH_IN: 'subtlePush',
  SLOW_PULL_OUT: 'subtlePull',
  PAN_LEFT: 'panLeft',
  PAN_RIGHT: 'panRight',
  GENTLE_DRIFT: 'subtlePush',
});

function applyMotion(shot, motion, timeline) {
  const cameraMove = MOTION_MAP[motion];
  if (!cameraMove) return;
  shot.presentation = { ...shot.presentation, cameraMove, manual: true };
  shot.imageBehavior = motion === 'GENTLE_DRIFT' ? 'SUBTLE_PUSH' : motion === 'SLOW_PUSH_IN' ? 'SUBTLE_PUSH' : motion === 'SLOW_PULL_OUT' ? 'SUBTLE_PULL' : motion;
  if (cameraMove === 'static') shot.move = { type: 'static', scale: [1, 1], focal: shot.asset?.focal || { x: 0.5, y: 0.5 } };
  else shot.move = { ...(shot.move || {}), type: cameraMove };

  const plan = timeline.motionPlans?.[shot.motionPlanId];
  if (!plan) return;
  const cameraTracks = plan.tracks.filter((track) => ['cameraScale', 'cameraFocusX', 'cameraFocusY'].includes(track.property));
  if (motion === 'STATIC') {
    for (const track of cameraTracks) track.to = track.from;
    return;
  }
  const scaleTrack = cameraTracks.find((track) => track.property === 'cameraScale');
  const xTrack = cameraTracks.find((track) => track.property === 'cameraFocusX');
  if (scaleTrack && motion === 'SLOW_PUSH_IN') scaleTrack.to = Math.max(scaleTrack.from + 0.035, scaleTrack.to);
  if (scaleTrack && motion === 'SLOW_PULL_OUT') scaleTrack.to = Math.max(1, scaleTrack.from - 0.035);
  if (xTrack && motion === 'PAN_LEFT') xTrack.to = Math.max(0, xTrack.from - 0.08);
  if (xTrack && motion === 'PAN_RIGHT') xTrack.to = Math.min(1, xTrack.from + 0.08);
}

function applyCrop(shot, crop, timeline) {
  if (!crop) return;
  const solved = timeline.solvedScenes?.[shot.solvedSceneId];
  const geometry = solved?.mediaGeometry?.media_primary;
  if (geometry) geometry.crop = { ...crop };
  shot.asset = shot.asset ? { ...shot.asset, manualCrop: { ...crop } } : shot.asset;
}

function applyTransition(shots, index, transition) {
  if (!transition || index === 0) return;
  const shot = shots[index];
  const previous = shots[index - 1];
  const dissolve = transition === 'CROSS_DISSOLVE';
  const frames = dissolve ? 16 : 0;
  shot.enter = { type: dissolve ? 'dissolve' : 'cut', frames };
  shot.transitionPolicy = dissolve ? 'SHORT_DISSOLVE' : 'CUT';
  previous.exit = { type: dissolve ? 'dissolve' : 'cut', frames };
}

export function applyManualVisualOverrides(timeline, overrides = {}) {
  if (!timeline || !overrides || typeof overrides !== 'object') return { timeline, applied: [], missing: [] };
  const shots = timeline.clips.flatMap((clip) => clip.shots || []);
  const applied = [];
  const missing = [];
  for (const [shotId, override] of Object.entries(overrides)) {
    const index = shots.findIndex((shot) => shot.storyboardShotId === shotId || shot.id === shotId);
    if (index < 0) { missing.push(shotId); continue; }
    const shot = shots[index];
    applyCrop(shot, override.crop, timeline);
    applyMotion(shot, override.motion, timeline);
    applyTransition(shots, index, override.transition);
    shot.manualOverride = {
      locked: override.locked !== false,
      crop: override.crop || null,
      motion: override.motion || null,
      transition: override.transition || null,
      durationSeconds: override.durationSeconds || null,
      asset: override.asset || null,
    };
    applied.push(shotId);
  }
  timeline.realizedShots = shots;
  for (const clip of timeline.clips) {
    const timed = (clip.shots || []).filter((shot) => Number(overrides[shot.storyboardShotId]?.durationSeconds) > 0);
    if (!timed.length || clip.shots.length < 2) continue;
    const total = clip.shots.reduce((sum, shot) => sum + shot.durationInFrames, 0);
    const fixed = new Map(timed.map((shot) => [shot.id, Math.max(1, Math.round(overrides[shot.storyboardShotId].durationSeconds * timeline.fps))]));
    const requested = [...fixed.values()].reduce((sum, frames) => sum + frames, 0);
    if (requested >= total - (clip.shots.length - fixed.size)) continue;
    const flexible = clip.shots.filter((shot) => !fixed.has(shot.id));
    const originalFlexible = flexible.reduce((sum, shot) => sum + shot.durationInFrames, 0);
    const durations = clip.shots.map((shot) => fixed.get(shot.id)
      || Math.max(1, Math.round((total - requested) * shot.durationInFrames / Math.max(1, originalFlexible))));
    const correctionIndex = clip.shots.map((shot, index) => fixed.has(shot.id) ? -1 : index).filter((index) => index >= 0).at(-1);
    const correction = total - durations.reduce((sum, value) => sum + value, 0);
    if (correctionIndex != null) durations[correctionIndex] = Math.max(1, durations[correctionIndex] + correction);
    const clipStart = clip.shots[0].startFrame;
    let cursor = clipStart;
    clip.shots.forEach((shot, index) => {
      const bounded = durations[index];
      const oldDuration = shot.durationInFrames;
      shot.startFrame = cursor;
      shot.endFrame = cursor + bounded;
      shot.from = cursor - clipStart;
      shot.durationInFrames = bounded;
      cursor += bounded;
      const plan = timeline.motionPlans?.[shot.motionPlanId];
      if (plan && oldDuration > 0 && oldDuration !== bounded) {
        const scale = bounded / oldDuration;
        plan.durationInFrames = bounded;
        for (const track of plan.tracks || []) { track.startFrame = Math.round(track.startFrame * scale); track.endFrame = Math.min(bounded, Math.round(track.endFrame * scale)); }
        for (const phase of plan.lifecycle || []) { phase.startFrame = Math.round(phase.startFrame * scale); phase.endFrame = Math.min(bounded, Math.round(phase.endFrame * scale)); }
        for (const state of plan.focalStates || []) { state.startFrame = Math.round(state.startFrame * scale); state.endFrame = Math.min(bounded, Math.round(state.endFrame * scale)); }
        if (plan.frameQuality) plan.frameQuality.finalStateFrame = Math.min(bounded, Math.round(plan.frameQuality.finalStateFrame * scale));
      }
    });
  }
  return { timeline, applied, missing };
}

export async function materializeManualImageOverrides({ overrides = {}, assetRequests = [], publicDir, mediaBankDir }) {
  const assets = {};
  const reports = [];
  const judgments = {};
  const base = path.resolve(mediaBankDir);
  const outputDir = path.join(publicDir, 'assets');
  await fs.mkdir(outputDir, { recursive: true });
  for (const request of assetRequests) {
    const shotId = request.storyboardShotId;
    const override = overrides[shotId];
    if (!override?.asset?.mediaBankPath) continue;
    const source = path.resolve(base, override.asset.mediaBankPath);
    const relative = path.relative(base, source);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe manual media-bank path for ${shotId}`);
    const extension = path.extname(source).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error(`Unsupported manual image type for ${shotId}`);
    const buffer = await fs.readFile(source);
    const dimensions = getImageDimensions(buffer);
    const filename = `manual_${shotId.replace(/[^a-zA-Z0-9_-]/g, '_')}${extension}`;
    const target = path.join(outputDir, filename);
    await fs.copyFile(source, target);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const asset = {
      type: 'image', width: dimensions.width, height: dimensions.height,
      sha256ContentHash: hash, src: `assets/${filename}`, source: 'manual-media-bank',
      isFallback: false, qualityTier: 'MANUAL', tier: 'verified', generic: false,
      label: `Manual image: ${override.asset.mediaBankPath}`,
      license: { provider: 'user-media-bank', name: 'User managed media', attribution_required: false, commercial_use: 'user_verified', verification_status: 'manual_review' },
      relevance: 1, assetRequestId: request.id || `asset_${shotId}`, storyboardShotId: shotId,
      providerCandidateId: `manual_${hash.slice(0, 16)}`, queryStage: 'MANUAL_OVERRIDE',
      focal: { x: 0.5, y: 0.5 }, selectionReason: 'Locked manual image override', finalEditorialScore: 100,
    };
    const sceneAssets = assets[request.sceneId] ||= { primary: null, alternates: [], byShot: {} };
    sceneAssets.byShot[shotId] = asset;
    if (!sceneAssets.primary) sceneAssets.primary = asset; else sceneAssets.alternates.push(asset);
    reports.push({ shotId, sceneId: request.sceneId, status: 'resolved', source: 'manual-media-bank', candidateCount: 1, selected: asset, manualOverride: true });
    judgments[shotId] = { accepted: true, rejected: false, finalEditorialScore: 100, classification: 'MANUAL', rejectReasons: [], selectionReason: 'User locked this managed media-bank image' };
  }
  return { assets, reports, judgments, shotIds: new Set(reports.map((report) => report.shotId)) };
}
