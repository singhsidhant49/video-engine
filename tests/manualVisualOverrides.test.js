import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { applyManualVisualOverrides, materializeManualImageOverrides } from '../src/pipeline/manualVisualOverrides.js';
import { VisualOverridesSchema } from '../src/server/videoApiSchemas.js';

function shot(id, solvedSceneId, motionPlanId) {
  return {
    id, storyboardShotId: id, solvedSceneId, motionPlanId,
    presentation: { cameraMove: 'subtlePush' }, imageBehavior: 'SUBTLE_PUSH',
    startFrame: id === 'shot_1' ? 0 : 90, endFrame: id === 'shot_1' ? 90 : 180, from: id === 'shot_1' ? 0 : 90, durationInFrames: 90,
    enter: { type: 'cut', frames: 0 }, exit: { type: 'cut', frames: 0 }, transitionPolicy: 'CUT',
    asset: { type: 'image', src: `${id}.png`, focal: { x: 0.5, y: 0.5 } },
  };
}

test('manual visual overrides remain authoritative for crop, motion, and transition', () => {
  const first = shot('shot_1', 'solved_1', 'motion_1');
  const second = shot('shot_2', 'solved_2', 'motion_2');
  const timeline = {
    fps: 30, clips: [{ shots: [first, second] }], realizedShots: [first, second],
    solvedScenes: {
      solved_2: { mediaGeometry: { media_primary: { crop: { x: 0, y: 0, width: 1, height: 1 } } } },
    },
    motionPlans: {
      motion_2: { tracks: [{ property: 'cameraScale', from: 1, to: 1.05 }, { property: 'cameraFocusX', from: 0.5, to: 0.55 }] },
    },
  };
  const overrides = VisualOverridesSchema.parse({
    shot_2: {
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, durationSeconds: 2,
      motion: 'STATIC', transition: 'CROSS_DISSOLVE', locked: true,
    },
  });
  const result = applyManualVisualOverrides(timeline, overrides);
  assert.deepEqual(result.applied, ['shot_2']);
  assert.deepEqual(timeline.solvedScenes.solved_2.mediaGeometry.media_primary.crop, overrides.shot_2.crop);
  assert.equal(second.presentation.cameraMove, 'static');
  assert.ok(timeline.motionPlans.motion_2.tracks.every((track) => track.to === track.from));
  assert.deepEqual(second.enter, { type: 'dissolve', frames: 16 });
  assert.equal(second.durationInFrames, 60);
  assert.equal(first.durationInFrames, 120);
  assert.equal(second.manualOverride.locked, true);
});

test('manual image overrides only materialize safe managed media-bank files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-manual-image-'));
  const bank = path.join(root, 'bank');
  const publicDir = path.join(root, 'public');
  await fs.mkdir(path.join(bank, 'characters'), { recursive: true });
  await sharp({ create: { width: 64, height: 96, channels: 3, background: '#225588' } }).png().toFile(path.join(bank, 'characters', 'sarah.png'));
  try {
    const result = await materializeManualImageOverrides({
      overrides: { shot_1: { locked: true, asset: { mediaBankPath: 'characters/sarah.png' } } },
      assetRequests: [{ id: 'request_1', sceneId: 'scene_1', storyboardShotId: 'shot_1' }],
      publicDir, mediaBankDir: bank,
    });
    assert.equal(result.reports[0].status, 'resolved');
    assert.equal(result.assets.scene_1.byShot.shot_1.source, 'manual-media-bank');
    assert.equal(result.assets.scene_1.byShot.shot_1.width, 64);
    await assert.rejects(() => materializeManualImageOverrides({
      overrides: { shot_1: { asset: { mediaBankPath: '../outside.png' } } },
      assetRequests: [{ sceneId: 'scene_1', storyboardShotId: 'shot_1' }], publicDir, mediaBankDir: bank,
    }));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('manual override validation rejects crops outside the source frame', () => {
  assert.throws(() => VisualOverridesSchema.parse({ shot_1: { crop: { x: 0.5, y: 0, width: 0.75, height: 1 } } }));
});
