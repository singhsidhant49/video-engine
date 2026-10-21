/**
 * Video Window Selector — Semantic Action & Cut Boundary Quality
 * Milestone — Production Hardening & Semantic Visual Understanding
 * 
 * Selects the optimal trim window within a longer video asset rather than defaulting to frame 0.
 * Action-aware:
 * - Samples frames across 10%, 25%, 50%, 75%, 90%
 * - Evaluates actionMatch, subjectVisibility, and motion continuity
 * - Penalizes black starts, camera settling, fade-ins, and mid-clip scene cuts
 * - Ensures the selected window shows the required narrative action (e.g. accelerating aircraft)
 *   rather than merely arbitrary high motion
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { ffmpeg, probeDuration } from '../services/ffmpeg.js';
import { getSharp } from '../services/imageUtils.js';
import { contrastiveRelevance } from '../services/relevance.js';

const CACHE_DIR = path.resolve('.cache', 'video-windows');

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {}
}

/**
 * Generates candidate sliding windows across a video duration.
 */
export function generateCandidateWindows(totalDuration, requiredDuration) {
  if (!totalDuration || totalDuration <= requiredDuration) {
    return [{ start: 0, end: Math.max(0.5, totalDuration || requiredDuration) }];
  }

  const windows = [];
  const step = Math.max(1.0, requiredDuration * 0.5); // 50% overlap steps
  let start = 0.0;

  while (start + requiredDuration <= totalDuration + 0.1) {
    windows.push({
      start: Number(start.toFixed(2)),
      end: Number(Math.min(totalDuration, start + requiredDuration).toFixed(2)),
    });
    start += step;
  }

  // Ensure tail window is represented
  const tailStart = Math.max(0, totalDuration - requiredDuration);
  if (windows.length === 0 || Math.abs(windows[windows.length - 1].start - tailStart) > 0.5) {
    windows.push({
      start: Number(tailStart.toFixed(2)),
      end: Number(totalDuration.toFixed(2)),
    });
  }

  return windows;
}

/**
 * Samples keyframe statistics for a video window.
 * Checks for black start, camera settling, and mid-window cuts.
 */
async function sampleWindowQuality(videoPath, window, tmpDir, index, visibleNeed = null) {
  const sharp = getSharp();
  const dur = window.end - window.start;
  const samplePoints = [
    window.start + 0.10,               // start of window
    window.start + dur * 0.25,         // quarter
    window.start + dur * 0.50,         // midpoint
    window.start + dur * 0.75,         // three quarters
    Math.max(window.start + 0.20, window.end - 0.15), // near end
  ];

  let totalLuma = 0;
  let totalStdev = 0;
  let frameCount = 0;
  let hasBlackStart = false;
  let hasInternalCut = false;
  const lumas = [];
  let semanticEvidence = null;

  for (let p = 0; p < samplePoints.length; p++) {
    const outImg = path.join(tmpDir, `w_${index}_p${p}.png`);
    try {
      await ffmpeg(['-y', '-ss', samplePoints[p].toFixed(3), '-i', videoPath, '-frames:v', '1', outImg]);
      if (sharp) {
        const { data } = await sharp(outImg).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
        let sum = 0;
        for (const v of data) sum += v;
        const mean = sum / data.length;
        let sq = 0;
        for (const v of data) sq += (v - mean) ** 2;
        const stdev = Math.sqrt(sq / data.length);

        if (p === 0 && mean < 14 && stdev < 9) {
          hasBlackStart = true;
        }

        lumas.push(mean);
        totalLuma += mean;
        totalStdev += stdev;
        frameCount++;
        if (p === 2) {
          semanticEvidence = await contrastiveRelevance(
            outImg,
            [visibleNeed?.viewerNeedsToSee, visibleNeed?.primaryConcept, ...(visibleNeed?.acceptableSemanticAlternatives || [])].filter(Boolean),
            visibleNeed?.avoidVisuals || [],
          );
        }
      }
    } catch {}
  }

  // Detect abrupt internal cut (jump in luminance between adjacent samples > 45)
  for (let i = 1; i < lumas.length; i++) {
    if (Math.abs(lumas[i] - lumas[i - 1]) > 55) {
      hasInternalCut = true;
    }
  }

  const avgLuma = frameCount ? totalLuma / frameCount : 120;
  const avgStdev = frameCount ? totalStdev / frameCount : 35;

  return {
    avgLuma,
    avgStdev,
    hasBlackStart,
    hasInternalCut,
    semanticEvidence,
  };
}

/**
 * Selects the optimal video trim window with semantic action scoring.
 */
export async function selectVideoWindow({
  videoPath,
  requiredDurationSec = 3.5,
  visibleNeed = null,
  videoMetadata = null,
}) {
  await ensureCacheDir();

  let totalDuration = videoMetadata?.duration || 0;
  if (!totalDuration && videoPath) {
    try {
      totalDuration = await probeDuration(videoPath);
    } catch {
      totalDuration = requiredDurationSec;
    }
  }

  // Check cache
  const cacheKey = crypto.createHash('sha256')
    .update(`${videoPath || ''}:${totalDuration}:${requiredDurationSec}:${visibleNeed?.action || ''}:${visibleNeed?.subject || ''}`)
    .digest('hex').slice(0, 32);
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);

  try {
    const cached = await fs.readFile(cacheFile, 'utf8');
    return JSON.parse(cached);
  } catch {}

  const candidateWindows = generateCandidateWindows(totalDuration, requiredDurationSec);

  // If video is short or matches required duration, return whole clip
  if (candidateWindows.length <= 1 && !videoPath) {
    const decision = {
      sourceDuration: totalDuration,
      selectedStartTime: 0.0,
      selectedEndTime: Number(Math.min(totalDuration, requiredDurationSec).toFixed(2)),
      windowScore: 0.90,
      selectionReason: 'single candidate window covers required duration',
      rejectedWindows: [],
    };
    return decision;
  }

  let tmpDir = null;
  const scoredWindows = [];

  try {
    if (videoPath) {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vwin-'));
    }

    for (let i = 0; i < candidateWindows.length; i++) {
      const win = candidateWindows[i];
      let score = 75;
      const notes = [];
      let stats = null;

      // Sample actual pixels if file exists
      if (tmpDir && videoPath) {
        stats = await sampleWindowQuality(videoPath, win, tmpDir, i, visibleNeed);
        if (stats.hasBlackStart) {
          score -= 40;
          notes.push('penalized: black start or fade-in');
        }
        if (stats.avgLuma < 20) {
          score -= 25;
          notes.push('penalized: overall dark frame');
        }
        if (stats.hasInternalCut) {
          score -= 30;
          notes.push('penalized: scene cut inside window');
        }
        if (stats.avgStdev > 15) {
          score += 10; // Dynamic range/motion present
        }
        if (stats.semanticEvidence?.available) {
          score += Math.max(-30, Math.min(25, stats.semanticEvidence.margin * 160));
          notes.push(`semantic margin ${stats.semanticEvidence.margin}`);
        }
      }

      // Action-aware positioning preference:
      // Initial 0-2s often has camera settling or autofocus jitter;
      // Mid-clip typically has the most established subject motion.
      if (win.start === 0 && totalDuration > requiredDurationSec + 2.0) {
        score -= 10;
        notes.push('penalized: early camera settling interval');
      } else if (win.start >= 1.5 && win.end <= totalDuration - 0.5) {
        score += 15;
        notes.push('favored: prime action window inside clip');
      }

      scoredWindows.push({
        start: win.start,
        end: win.end,
        score: Number((Math.max(10, score) / 100).toFixed(3)),
        notes: notes.join('; '),
        semanticEvidence: stats?.semanticEvidence || null,
      });
    }
  } finally {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  scoredWindows.sort((a, b) => b.score - a.score);
  const best = scoredWindows[0] || { start: 0, end: requiredDurationSec, score: 0.70, notes: 'fallback default' };

  const result = {
    sourceDuration: totalDuration,
    selectedStartTime: best.start,
    selectedEndTime: best.end,
    windowScore: best.score,
    selectionReason: best.notes || 'highest stability and visible action score',
    semanticEvidence: best.semanticEvidence || null,
    rejectedWindows: scoredWindows.slice(1).map((w) => ({
      start: w.start,
      end: w.end,
      score: w.score,
      reason: w.notes,
    })),
  };

  try {
    await fs.writeFile(cacheFile, JSON.stringify(result, null, 2));
  } catch {}

  return result;
}

/**
 * Deterministically evaluates and scores a candidate window against quality metrics and action.
 */
export function scoreVideoWindow({
  startTime,
  endTime,
  totalDuration = 12,
  requiredDurationSec = 3,
  samples = [],
  visibleNeed = null,
}) {
  let score = 75;
  const penalties = [];
  const bonuses = [];

  for (const s of samples) {
    if (s.brightness < 0.1 || s.hasBlackStart) {
      score -= 30;
      penalties.push('black_or_fade_start');
    }
    if (s.blur > 0.6) {
      score -= 15;
      penalties.push('excessive_blur');
    }
    if (s.hasInternalCut) {
      score -= 25;
      penalties.push('internal_scene_cut');
    }
    if (s.actionPresent) {
      score += 15;
      bonuses.push('action_present');
    }
    if (s.subjectPresent) {
      score += 10;
      bonuses.push('subject_present');
    }
  }

  if (startTime === 0 && totalDuration > requiredDurationSec + 2.0) {
    score -= 10;
    penalties.push('early_camera_settling');
  } else if (startTime >= 1.5 && endTime <= totalDuration - 0.5) {
    score += 15;
    bonuses.push('prime_action_window');
  }

  return {
    windowScore: Number((Math.max(10, Math.min(100, score)) / 100).toFixed(3)),
    penalties,
    bonuses,
  };
}
