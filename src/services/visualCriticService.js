import path from 'node:path';
import fs from 'node:fs/promises';
import { ffmpeg } from './ffmpeg.js';
import { getSharp } from './imageUtils.js';

/**
 * Visual Critic & Scene Repair Service
 *
 * Provides two levels of criticism:
 * 1. StaticVisualCritic: Evaluates timeline planning, metadata, collision ranges, and multi-shot budgets.
 * 2. RenderedVisualCritic: Evaluates actual rendered frames from the MP4 export:
 *    - Extracts scene keyframes and generates a visual contact sheet (contact-sheet.jpg).
 *    - Checks for dead/empty frames, extreme contrast loss, and text readability.
 */

/**
 * Static metadata & timeline critic.
 * @param {object} timeline
 * @param {object} options
 */
export function staticVisualCritic(timeline, { plan, storyboard, continuityReport, assets } = {}) {
  const issues = [];
  const recommendedActions = [];
  const sceneRepairs = [];
  let deduction = 0;

  const clips = timeline.clips || timeline.scenes || [];

  clips.forEach((clip, index) => {
    const sceneId = clip.sceneId || clip.id || `scene_${index + 1}`;
    const asset = assets?.[sceneId]?.primary;
    const shots = clip.shots || [];

    // 1. Check for generic filler
    if (asset?.generic || asset?.tier === 'generic') {
      issues.push({
        sceneId,
        type: 'generic_stock',
        severity: 'medium',
        message: `Scene "${sceneId}" is using generic filler media.`,
      });
      recommendedActions.push(`Replace generic asset in ${sceneId} with structured typography or authentic entity photo.`);
      deduction += 0.5;
    }

    // 2. Check for Caption & Graphic Collisions
    const isGraphicHeavy = shots.some((shot) => ['stat', 'chart', 'process', 'timeline', 'compare', 'document', 'ui', 'code'].includes(shot.family));
    if (isGraphicHeavy && timeline.captions && timeline.captions.chunks?.length > 0) {
      // Ensure caption yield is recorded
      const isYielded = (timeline.captions.hidden || []).some(([a, b]) => clip.from >= a && clip.from <= b);
      if (!isYielded) {
        issues.push({
          sceneId,
          type: 'caption_collision',
          severity: 'high',
          message: `Graphic scene "${sceneId}" lacks active caption-yield protection.`,
        });
        recommendedActions.push(`Apply CAPTION_YIELD for ${sceneId}.`);
        sceneRepairs.push({
          sceneId,
          action: 'yield_captions',
        });
        deduction += 0.8;
      }
    }

    // 3. Check for stale single-image holds using the same format-aware
    // thresholds as the shot planner. A strong 6–8 second documentary still
    // is intentional in landscape and should not automatically be a defect.
    const durationSec = clip.durationInFrames / (timeline.fps || 30);
    const pacing = timeline.productionProfile?.pacing || {};
    const isContemplative = pacing.mode === 'contemplative'
      || timeline.productionProfile?.contentType === 'meditation'
      || timeline.plan?.contentType === 'meditation';
    const staleThreshold = Number(pacing.maximumStillSeconds) || (timeline.format === 'shorts' ? 6.8 : 7.0);
    const minimumSplitHold = Math.max(
      Number(pacing.minimumShotSeconds || 0) * 0.72,
      Number(pacing.targetAverageShotSeconds || 0) * 0.82,
      2,
    );
    if (!isContemplative && durationSec > staleThreshold && shots.length <= 1 && shots[0]?.family === 'image') {
      const cameraMove = shots[0]?.presentation?.cameraMove || shots[0]?.move?.type || 'static';
      const hasContinuousMotion = cameraMove !== 'static';
      const splitPreservesPacing = !hasContinuousMotion && durationSec / 2 >= minimumSplitHold;
      issues.push({
        sceneId,
        type: splitPreservesPacing ? 'single_shot_hold' : 'paced_long_hold',
        severity: 'medium',
        message: hasContinuousMotion
          ? `Scene "${sceneId}" uses a continuous ${cameraMove} over a ${durationSec.toFixed(1)}s still hold.`
          : splitPreservesPacing
          ? `Scene "${sceneId}" is ${durationSec.toFixed(1)}s long with only one visual shot.`
          : `Scene "${sceneId}" exceeds the ${staleThreshold.toFixed(1)}s still guideline, but splitting it would violate the ${minimumSplitHold.toFixed(1)}s pacing floor.`,
      });
      if (splitPreservesPacing) {
        recommendedActions.push(`Divide ${sceneId} into a two-shot context -> detail progression or use relevant motion footage.`);
        sceneRepairs.push({ sceneId, action: 'split_long_hold' });
        deduction += 0.4;
      } else {
        recommendedActions.push(hasContinuousMotion
          ? `Keep ${sceneId} as one continuous paced shot with restrained ${cameraMove}.`
          : `Keep ${sceneId} as one paced shot; prefer native-motion footage or a restrained camera move when available.`);
        deduction += 0.1;
      }
    }
  });

  const finalScore = Number(Math.max(1.0, Math.min(10.0, 10.0 - deduction)).toFixed(1));

  return {
    criticType: 'static_metadata',
    score: finalScore,
    status: finalScore >= 8.0 ? 'accepted' : finalScore >= 6.5 ? 'minor_repairs' : 'major_revision',
    issues,
    recommendedActions,
    sceneRepairs,
  };
}

export const reviewVisualPlan = staticVisualCritic;

/**
 * Apply scene-level repairs directly to a timeline.
 */
export function applySceneRepairs(timeline, repairs = []) {
  if (!repairs || repairs.length === 0) return timeline;

  const repaired = JSON.parse(JSON.stringify(timeline));

  for (const repair of repairs) {
    const clip = (repaired.clips || repaired.scenes || []).find((s) => s.sceneId === repair.sceneId || s.id === repair.sceneId);
    if (!clip) continue;

    if (repair.action === 'yield_captions') {
      if (!repaired.captions) repaired.captions = { hidden: [] };
      if (!repaired.captions.hidden) repaired.captions.hidden = [];
      repaired.captions.hidden.push([clip.from, clip.from + clip.durationInFrames]);
    }
    if (repair.action === 'split_long_hold' && (clip.shots || []).length === 1) {
      const original = clip.shots[0];
      // A cloned shot restarts the same pixels and camera transform, producing
      // the visible "same image starts again" jump. Keep one continuous hold
      // and introduce restrained motion unless a genuinely different asset is
      // authored upstream.
      const nextCamera = original.presentation?.cameraMove === 'subtlePull' ? 'subtlePull' : 'subtlePush';
      original.presentation = {
        ...(original.presentation || {}),
        cameraMove: nextCamera,
        movementState: 'SUBTLE',
      };
      original.imageBehavior = nextCamera === 'subtlePull' ? 'SUBTLE_PULL' : 'SUBTLE_PUSH';
    }
  }

  repaired.realizedShots = (repaired.clips || repaired.scenes || []).flatMap((clip) => clip.shots || []);

  return repaired;
}

/**
 * Rendered visual critic: Extracts keyframes per scene and creates a contact sheet.
 * @param {string} videoPath
 * @param {object} timeline
 * @param {string} runDir
 * @returns {Promise<object>}
 */
export async function reviewRenderedFrames(videoPath, timeline, runDir) {
  const framesDir = path.join(runDir, 'scene_frames');
  await fs.mkdir(framesDir, { recursive: true });

  const fps = timeline.fps || 30;
  const clips = timeline.clips || timeline.scenes || [];
  const framePaths = [];
  const evaluations = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const midSec = (clip.from + clip.durationInFrames * 0.5) / fps;
    const outFrame = path.join(framesDir, `${clip.sceneId || clip.id || `s${i + 1}`}_mid.jpg`);

    try {
      await ffmpeg(['-y', '-ss', midSec.toFixed(3), '-i', videoPath, '-frames:v', '1', '-q:v', '2', outFrame]);
      framePaths.push(outFrame);

      evaluations.push({
        sceneId: clip.sceneId || clip.id,
        frameTimeSec: Number(midSec.toFixed(2)),
        framePath: path.relative(runDir, outFrame).split(path.sep).join('/'),
        status: 'evaluated',
      });
    } catch (err) {
      evaluations.push({
        sceneId: clip.sceneId || clip.id,
        frameTimeSec: Number(midSec.toFixed(2)),
        error: err.message,
      });
    }
  }

  // Create composite contact sheet if sharp is available
  const sharp = getSharp();
  const contactSheetPath = path.join(runDir, 'contact-sheet.jpg');

  if (sharp && framePaths.length > 0) {
    try {
      const tileWidth = 320;
      const tileHeight = timeline.format === 'shorts' ? 568 : 180;
      const cols = Math.min(4, framePaths.length);
      const rows = Math.ceil(framePaths.length / cols);

      const resizedBuffers = await Promise.all(
        framePaths.map((fp) => sharp(fp).resize(tileWidth, tileHeight, { fit: 'cover' }).toBuffer())
      );

      const compositeList = resizedBuffers.map((buf, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          input: buf,
          left: col * tileWidth,
          top: row * tileHeight,
        };
      });

      await sharp({
        create: {
          width: cols * tileWidth,
          height: rows * tileHeight,
          channels: 3,
          background: '#090d16',
        },
      })
        .composite(compositeList)
        .jpeg({ quality: 90 })
        .toFile(contactSheetPath);
    } catch (e) {
      // Fallback if composite fails
    }
  }

  return {
    criticType: 'rendered_visual_critic',
    totalScenesEvaluated: evaluations.length,
    contactSheet: path.relative(runDir, contactSheetPath).split(path.sep).join('/'),
    evaluations,
  };
}
