import { getStyle } from '../shared/styles.js';
import { buildVisualRealizationDiagnostics } from '../pipeline/visualRealizationDiagnostics.js';

const STRUCTURED = new Set(['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'quote', 'document', 'ui', 'code', 'statement', 'chapter']);

/** Static, shot-aware QC. Structural failures block rendering; aesthetic risk is reported. */
export function runTimelineQc(timeline, { plan, narration, assetReport, realizationDiagnostics, pacingDiagnostics, durationDiagnostics, audioDiagnostics, visualCoverageDiagnostics, editContinuityDiagnostics } = {}) {
  const checks = [];
  const add = (id, ok, severity, detail) => checks.push({ id, ok, severity, detail });
  const { fps, durationInFrames: total } = timeline;
  const clips = timeline.clips || timeline.scenes || [];
  const style = getStyle(timeline.style);
  const shots = timeline.realizedShots || clips.flatMap((clip) => clip.shots || []);
  const diagnostics = realizationDiagnostics || buildVisualRealizationDiagnostics(timeline);

  const sorted = [...clips].sort((a, b) => a.from - b.from);
  let reach = 0;
  const holes = [];
  for (const clip of sorted) {
    if (clip.from > reach) holes.push([reach, clip.from]);
    reach = Math.max(reach, clip.from + clip.durationInFrames);
  }
  if (reach < total) holes.push([reach, total]);
  add('coverage', holes.length === 0, 'error', holes.length ? `uncovered frames: ${holes.map((hole) => hole.join('-')).join(', ')}` : `0-${total} covered`);

  const shotCoverageFailures = [];
  for (const clip of clips) {
    const localShots = [...(clip.shots || [])].sort((a, b) => a.from - b.from);
    let localReach = 0;
    for (const shot of localShots) {
      if (shot.from !== localReach) shotCoverageFailures.push(`${clip.id}:${localReach}-${shot.from}`);
      localReach = shot.from + shot.durationInFrames;
    }
    if (!localShots.length || localReach !== clip.durationInFrames) shotCoverageFailures.push(`${clip.id}:ends-${localReach}/${clip.durationInFrames}`);
  }
  add('shot-coverage', shotCoverageFailures.length === 0, 'error', shotCoverageFailures.length ? shotCoverageFailures.join('; ') : `${shots.length} canonical shots cover every clip without gaps`);

  const missingTrace = shots.filter((shot) => !shot.storyboardShotId || !shot.sceneId || !shot.sectionId || !shot.presentation?.layout).map((shot) => shot.id || '?');
  const duplicateIds = shots.map((shot) => shot.storyboardShotId).filter((id, index, all) => all.indexOf(id) !== index);
  add('shot-traceability', missingTrace.length === 0 && duplicateIds.length === 0, 'error', missingTrace.length ? `missing trace fields: ${missingTrace.join(', ')}` : duplicateIds.length ? `duplicate storyboard shot ids: ${[...new Set(duplicateIds)].join(', ')}` : `${shots.length} unique storyboardShotId mappings`);

  const tiny = shots.filter((shot) => shot.durationInFrames < Math.max(8, Math.round(fps * 0.45)));
  add('min-shot-length', tiny.length === 0, 'warn', tiny.length ? `${tiny.map((shot) => shot.storyboardShotId).join(', ')} may read as micro-shots` : 'ok');

  // Compute absolute start frames for all shots across clips
  const allShotsWithGlobalTime = [];
  for (const clip of clips) {
    const clipFrom = clip.from || 0;
    for (const shot of (clip.shots || [])) {
      const globalStartFrame = shot.timelineStartFrame ?? (clipFrom + (shot.from || 0));
      allShotsWithGlobalTime.push({
        ...shot,
        globalStartFrame,
        durationSec: (shot.durationInFrames || 1) / fps,
      });
    }
  }

  // Milestone 7 Content Pacing QC rules
  const avgShotSec = total / fps / Math.max(1, shots.length);
  add('pacing-average-shot', avgShotSec >= 1.8, 'warn', `average shot duration ${avgShotSec.toFixed(2)}s (target: ≥ 1.8s)`);

  const windowFrames = fps * 10;
  let maxCutsInWindow = 0;
  for (let f = 0; f <= total - windowFrames; f += Math.round(fps * 2)) {
    const cuts = allShotsWithGlobalTime.filter((s) => s.globalStartFrame >= f && s.globalStartFrame < f + windowFrames).length;
    maxCutsInWindow = Math.max(maxCutsInWindow, cuts);
  }
  add('pacing-rapid-cuts', maxCutsInWindow <= 5, 'warn', `maximum ${maxCutsInWindow} cuts in a 10s window (limit: ≤ 5)`);

  const rushedGraphics = shots.filter((s) => ['process', 'chart', 'compare', 'timeline'].includes(s.family) && (s.durationInFrames / fps) < 3.2);
  add('pacing-graphic-hold', rushedGraphics.length === 0, 'warn', rushedGraphics.length ? `${rushedGraphics.map((s) => s.storyboardShotId).join(', ')} graphic hold too short` : 'ok');

  const rushedText = shots.filter((s) => (s.overlay?.headline || s.title) && (s.durationInFrames / fps) < 2.0);
  add('pacing-text-readability', rushedText.length === 0, 'warn', rushedText.length ? `${rushedText.map((s) => s.storyboardShotId).join(', ')} headline duration < 2.0s` : 'ok');

  const maxStaticSec = style.pacing.maxHoldSec * 1.35;
  add('static-time', diagnostics.longestStaticHold <= maxStaticSec, 'warn', `average ${diagnostics.averageStaticHold.toFixed(1)}s, longest ${diagnostics.longestStaticHold.toFixed(1)}s (guideline ${maxStaticSec.toFixed(1)}s)`);
  add('family-repetition', diagnostics.familyRepetitionRate <= 0.45 && diagnostics.consecutiveStructuredCount <= 3, 'warn', `${(diagnostics.familyRepetitionRate * 100).toFixed(0)}% adjacent repetition; longest structured run ${diagnostics.consecutiveStructuredCount}`);
  add('layout-repetition', diagnostics.layoutRepetitionRate <= 0.35, 'warn', `${(diagnostics.layoutRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('variant-repetition', diagnostics.variantRepetitionRate <= 0.4, 'warn', `${(diagnostics.variantRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('motion-repetition', diagnostics.cameraMoveRepetitionRate <= 0.55, 'warn', `${(diagnostics.cameraMoveRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('asset-reuse', diagnostics.assetReuseRate <= 0.35, 'warn', `${(diagnostics.assetReuseRate * 100).toFixed(0)}% reuse among media shots`);
  add('slideshow', diagnostics.consecutivePhotoCount <= 4, 'warn', `longest consecutive photo/montage run ${diagnostics.consecutivePhotoCount}`);

  // Milestone 8 Duration Budget & Pacing Tolerance rules
  if (durationDiagnostics) {
    const durSec = total / fps;
    const target = durationDiagnostics.requestedDuration;
    const hardMin = durationDiagnostics.hardLimits.min;
    const hardMax = durationDiagnostics.hardLimits.max;
    const allowedMin = durationDiagnostics.allowedRange.min;
    const allowedMax = durationDiagnostics.allowedRange.max;
    const okHard = durSec >= hardMin && durSec <= hardMax;
    const okTarget = durSec >= allowedMin && durSec <= allowedMax;
    const isFatal = durSec > hardMax;
    add('duration-tolerance', okHard, isFatal ? 'error' : 'warn', `duration ${durSec.toFixed(1)}s (target ${target}s ±5%: ${allowedMin}-${allowedMax}s, hard limits: ${hardMin}-${hardMax}s)`);
    if (okHard && !okTarget) {
      add('duration-target-drift', false, 'warn', `duration ${durSec.toFixed(1)}s drifted outside ±5% ideal range (${allowedMin}-${allowedMax}s)`);
    }
  }

  if (pacingDiagnostics?.underactiveWindows?.length) {
    add('pacing-underactive-windows', false, 'warn', `${pacingDiagnostics.underactiveWindows.length} underactive 10s window(s) on static hold`);
  } else {
    add('pacing-underactive-windows', true, 'warn', 'ok');
  }

  if (pacingDiagnostics?.maxTypographicRunLength !== undefined) {
    const maxTypo = pacingDiagnostics.maxTypographicRunLength;
    add('pacing-typographic-runs', maxTypo <= 2, 'warn', maxTypo > 2 ? `consecutive typographic run of ${maxTypo} (limit: ≤ 2)` : 'ok');
  }

  const familyRuntime = {};
  for (const shot of shots) familyRuntime[shot.family] = (familyRuntime[shot.family] || 0) + shot.durationInFrames / total;
  const dominant = Object.entries(familyRuntime).filter(([family, share]) => share > (family === 'image' ? 0.75 : 0.42));
  add('family-share', dominant.length === 0, 'warn', Object.entries(familyRuntime).map(([family, share]) => `${family} ${(share * 100).toFixed(0)}%`).join(', '));

  const designed = clips.filter((clip, index) => index > 0 && clip.enter?.type && clip.enter.type !== 'cut').length
    + (timeline.cutOverlays || []).filter((overlay) => overlay.type === 'dip' || overlay.type === 'flash').length;
  const allowed = Math.ceil(style.transitions.perMinute * Math.max(0.5, total / fps / 60)) + 1;
  add('transition-budget', designed <= allowed, 'warn', `${designed} designed transitions (budget ${allowed})`);

  const verbose = shots.filter((shot) => shot.overlay?.headline?.split(/\s+/).length > 7).map((shot) => shot.storyboardShotId);
  add('text-budget', verbose.length === 0, 'warn', verbose.length ? `headlines over seven words: ${verbose.join(', ')}` : 'ok');
  const hasCaptionContracts = shots.some((shot) => Object.hasOwn(shot, 'captionPolicy'));
  const invalidCaptionPolicies = hasCaptionContracts ? shots.filter((shot) => !shot.captionPolicy
    || (['INTEGRATED', 'HIDDEN'].includes(shot.captionPolicy.mode) && !shot.captionPolicy.equivalentOnScreenText))
    : [];
  add('caption-composition-policy', invalidCaptionPolicies.length === 0, 'error', invalidCaptionPolicies.length
    ? `caption hidden without equivalent text: ${invalidCaptionPolicies.map((shot) => shot.storyboardShotId).join(', ')}`
    : 'every shot has an explicit caption mode and solved geometry');

  if (editContinuityDiagnostics) {
    add('caption-coverage', editContinuityDiagnostics.captionCoveragePercent >= 95, 'error', `${editContinuityDiagnostics.captionCoveragePercent}% of narrated frames have subtitles or equivalent integrated text`);
    add('simultaneous-motion-budget', editContinuityDiagnostics.simultaneousMotionWarnings.length === 0, 'warn', `${editContinuityDiagnostics.simultaneousMotionWarnings.length} over-budget frame state(s)`);
    add('repeated-transition-effects', editContinuityDiagnostics.repeatedTransitionRuns.length === 0, 'warn', `${editContinuityDiagnostics.repeatedTransitionRuns.length} repetitive designed-transition run(s)`);
    add('repeated-camera-effects', editContinuityDiagnostics.repeatedCameraRuns.length === 0, 'warn', `${editContinuityDiagnostics.repeatedCameraRuns.length} repetitive moving-camera run(s)`);
    add('professional-final-hold', editContinuityDiagnostics.insufficientFinalHoldWarnings.length === 0, 'error', `${editContinuityDiagnostics.insufficientFinalHoldWarnings.length} insufficient solved final hold(s)`);
    add('caption-subject-clearance', editContinuityDiagnostics.subjectCaptionWarnings.length === 0, 'warn', `${editContinuityDiagnostics.subjectCaptionWarnings.length} caption/subject collision(s)`);
    add('perceptual-frame0', editContinuityDiagnostics.perceptuallyEmptyStarts.length === 0, 'error', `${editContinuityDiagnostics.perceptuallyEmptyStarts.length} perceptually empty scene start(s)`);
  }

  if (assetReport) {
    const reports = Array.isArray(assetReport) ? assetReport : [];
    const used = reports.filter((report) => report.tier !== 'none' && report.role !== 'none');
    const unlicensed = used.filter((report) => !report.license).map((report) => report.sceneId);
    add('licensing', unlicensed.length === 0, 'error', unlicensed.length ? `assets without recorded licence: ${unlicensed.join(', ')}` : `${used.length} used assets have recorded licences`);
    const missingSubjects = reports.filter((report) => report.role === 'subject' && report.tier === 'none').map((report) => report.sceneId);
    add('subject-coverage', missingSubjects.length === 0, 'warn', missingSubjects.length ? `no acceptable image for ${missingSubjects.join(', ')}` : 'ok');
  }

  if (plan?.diagnostics) {
    const missing = Object.entries(plan.diagnostics.missingAttributes || {});
    add('plan-feel', missing.length === 0, 'warn', missing.length ? `director omitted: ${missing.map(([key, count]) => `${key}x${count}`).join(', ')}` : 'ok');
  }
  if (narration) add('alignment', narration.matchRate >= 0.8, narration.matchRate >= 0.5 ? 'warn' : 'error', `${(narration.matchRate * 100).toFixed(0)}% script-word match (${narration.source})`);
  const badChunks = (timeline.captions?.chunks || []).filter((chunk, index, all) => chunk.endFrame <= chunk.startFrame || (index && chunk.startFrame < all[index - 1].startFrame));
  add('caption-order', badChunks.length === 0, 'error', badChunks.length ? `${badChunks.length} malformed chunks` : `${timeline.captions?.chunks?.length || 0} chunks`);

  // Milestone 9 Audio Polish & Loudness checks
  const duckDiag = timeline.audio?.duckingDiagnostics;
  const sfxDiag = timeline.audio?.sfxDiagnostics;

  if (audioDiagnostics) {
    const lufs = audioDiagnostics.narrationIntegratedLoudness ?? audioDiagnostics.integratedLoudness;
    if (typeof lufs === 'number') {
      const okLufs = lufs >= -18.0 && lufs <= -14.0;
      add('audio-loudness-target', okLufs, 'warn', `${lufs.toFixed(1)} LUFS (target: -14.0 to -18.0 LUFS)`);
    }
    const peak = audioDiagnostics.truePeakDb ?? audioDiagnostics.narrationPeakDb;
    if (typeof peak === 'number') {
      const okPeak = peak <= -1.0;
      const errorPeak = peak > -0.2;
      add('audio-peak-headroom', !errorPeak, errorPeak ? 'error' : 'warn', `${peak.toFixed(1)} dBFS (limit: ≤ -1.0 dBFS)`);
    }
  }

  if (duckDiag) {
    add('audio-pumping-risk', true, 'warn', `${duckDiag.microPauseCount} micro-pause(s) bridged without pumping`);
  }

  if (sfxDiag) {
    const okCount = sfxDiag.sfxCount <= 6;
    const okGap = sfxDiag.sfxCount <= 1 || sfxDiag.minGapSeconds >= 5.0;
    add('audio-sfx-budget', okCount && okGap, 'warn', `${sfxDiag.sfxCount} event(s), min gap ${sfxDiag.minGapSeconds}s (budget: ≤6 events, min 5.0s gap)`);
  }

  // Milestone 10 Visual Coverage & Explanatory Graphics checks (Requirement 41)
  if (visualCoverageDiagnostics) {
    const unres = visualCoverageDiagnostics.unresolvedCount || 0;
    add('visual-coverage-unresolved', unres === 0, 'error', unres === 0 ? 'zero unresolved shots' : `${unres} unresolved shot(s) lacking visual explanation`);

    const blankFrames = visualCoverageDiagnostics.perceptuallyBlankFrames || 0;
    const maxBlankFrames = fps * 2;
    add('visual-coverage-blank-frames', blankFrames <= maxBlankFrames, 'error', `${blankFrames} blank frames (${(blankFrames / fps).toFixed(2)}s, limit: ≤ ${(maxBlankFrames / fps).toFixed(1)}s)`);

    const weakRatio = visualCoverageDiagnostics.weakRatio ?? 0;
    add('visual-coverage-weak-ratio', weakRatio <= 0.40, 'warn', `${(weakRatio * 100).toFixed(0)}% weak coverage (target: ≤ 40%)`);

    const overflowWarns = visualCoverageDiagnostics.textOverflowWarnings || [];
    add('visual-coverage-text-fitting', overflowWarns.length === 0, 'warn', overflowWarns.length === 0 ? 'all headlines fit safe line limits' : `${overflowWarns.length} text overflow warning(s)`);

    const groundingWarns = visualCoverageDiagnostics.textGroundingWarnings || [];
    add('visual-coverage-text-grounding', groundingWarns.length === 0, 'warn', groundingWarns.length === 0 ? 'all on-screen text grounded in beat narration' : `${groundingWarns.length} ungrounded text warning(s)`);
  }

  const errors = checks.filter((check) => !check.ok && check.severity === 'error');
  const warnings = checks.filter((check) => !check.ok && check.severity === 'warn');
  return { ok: errors.length === 0, checks, errors, warnings, diagnostics };
}

export function printQc(title, report) {
  console.log(`\nTimeline quality: ${title}`);
  for (const check of report.checks) console.log(`   ${check.ok ? 'OK' : check.severity === 'error' ? 'ERROR' : 'WARN'} ${check.id.padEnd(20)} ${check.detail}`);
}
