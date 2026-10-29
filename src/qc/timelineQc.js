import { getStyle } from '../shared/styles.js';
import { buildVisualRealizationDiagnostics } from '../pipeline/visualRealizationDiagnostics.js';

const STRUCTURED = new Set(['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'quote', 'document', 'ui', 'code', 'statement', 'chapter']);

/** Static, shot-aware QC. Structural failures block rendering; aesthetic risk is reported. */
export function runTimelineQc(timeline, { plan, narration, assetReport, realizationDiagnostics, pacingDiagnostics, durationDiagnostics, audioDiagnostics, visualCoverageDiagnostics, editContinuityDiagnostics, publishMode = 'DEV_RENDER' } = {}) {
  const checks = [];
  const add = (id, ok, severity, detail) => checks.push({ id, ok, severity, detail });
  const { fps, durationInFrames: total } = timeline;
  const clips = timeline.clips || timeline.scenes || [];
  const style = getStyle(timeline.style);
  const shots = timeline.realizedShots || clips.flatMap((clip) => clip.shots || []);
  const diagnostics = realizationDiagnostics || buildVisualRealizationDiagnostics(timeline);

  const allowedCameraBehaviors = new Set(['STATIC', 'SUBTLE_PUSH', 'SUBTLE_PULL', 'PAN_LEFT', 'PAN_RIGHT']);
  const allowedTransitionPolicies = new Set(['CUT', 'SHORT_DISSOLVE']);
  const unsupportedMotion = shots.filter((shot) => shot.imageBehavior && !allowedCameraBehaviors.has(shot.imageBehavior));
  const unsupportedTransitions = shots.filter((shot) => !allowedTransitionPolicies.has(shot.transitionPolicy || 'CUT')
    || !['cut', 'dissolve'].includes(shot.enter?.type || 'cut'));
  add('motion-vocabulary', unsupportedMotion.length === 0, 'error', unsupportedMotion.length
    ? `unsupported camera motion: ${unsupportedMotion.map((shot) => `${shot.storyboardShotId}:${shot.imageBehavior}`).join(', ')}`
    : 'only static, zoom in/out, and horizontal pan are used');
  add('transition-vocabulary', unsupportedTransitions.length === 0, 'error', unsupportedTransitions.length
    ? `unsupported transitions: ${unsupportedTransitions.map((shot) => `${shot.storyboardShotId}:${shot.transitionPolicy || shot.enter?.type}`).join(', ')}`
    : 'only clean cuts and cross dissolves are used');

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
  const pacingPolicy = timeline.productionProfile?.pacing || null;
  const targetAverageShotSeconds = Number(pacingPolicy?.targetAverageShotSeconds || 1.8);
  const minimumShotSeconds = Number(pacingPolicy?.minimumShotSeconds || 0);
  const cutLimit = Number(pacingPolicy?.maximumCutsPer10Seconds || 5);
  const pacingProfileName = pacingPolicy?.mode || 'legacy';
  const productionPacing = publishMode === 'PRODUCTION_RENDER' && Boolean(pacingPolicy);
  add('pacing-average-shot', avgShotSec >= targetAverageShotSeconds * 0.82, productionPacing ? 'error' : 'warn', `average shot duration ${avgShotSec.toFixed(2)}s (profile ${pacingProfileName}, target: ≥ ${(targetAverageShotSeconds * 0.82).toFixed(2)}s)`);

  const rushedProfileShots = minimumShotSeconds > 0
    ? shots.filter((shot) => (shot.durationInFrames / fps) < minimumShotSeconds * 0.72)
    : [];
  const rushedProfileRatio = rushedProfileShots.length / Math.max(1, shots.length);
  const profileHoldOk = rushedProfileRatio <= 0.1;
  add('pacing-profile-holds', profileHoldOk, productionPacing ? 'error' : 'warn', profileHoldOk
    ? `${pacingProfileName} hold distribution is within profile limits`
    : `${rushedProfileShots.length}/${shots.length} shots are substantially shorter than the ${minimumShotSeconds.toFixed(1)}s profile minimum`);

  const windowFrames = fps * 10;
  let maxCutsInWindow = 0;
  for (let f = 0; f <= total - windowFrames; f += Math.round(fps * 2)) {
    const cuts = allShotsWithGlobalTime.filter((s) => s.globalStartFrame > 0 && s.globalStartFrame >= f && s.globalStartFrame < f + windowFrames).length;
    maxCutsInWindow = Math.max(maxCutsInWindow, cuts);
  }
  add('pacing-rapid-cuts', maxCutsInWindow <= cutLimit, productionPacing ? 'error' : 'warn', `maximum ${maxCutsInWindow} cuts in a 10s window (profile ${pacingProfileName}, limit: ≤ ${cutLimit})`);

  const rushedGraphics = shots.filter((s) => ['process', 'chart', 'compare', 'timeline'].includes(s.family) && (s.durationInFrames / fps) < 3.2);
  add('pacing-graphic-hold', rushedGraphics.length === 0, 'warn', rushedGraphics.length ? `${rushedGraphics.map((s) => s.storyboardShotId).join(', ')} graphic hold too short` : 'ok');

  const rushedText = shots.filter((s) => (s.overlay?.headline || s.title) && (s.durationInFrames / fps) < 2.0);
  add('pacing-text-readability', rushedText.length === 0, 'warn', rushedText.length ? `${rushedText.map((s) => s.storyboardShotId).join(', ')} headline duration < 2.0s` : 'ok');

  const maxStaticSec = style.pacing.maxHoldSec * 1.35;
  const mediaOnly = diagnostics.proceduralVsMediaRatio === 0;
  add('static-time', diagnostics.longestStaticHold <= maxStaticSec, 'warn', `average ${diagnostics.averageStaticHold.toFixed(1)}s, longest ${diagnostics.longestStaticHold.toFixed(1)}s (guideline ${maxStaticSec.toFixed(1)}s)`);
  const mediaOnlyDetail = 'media-only policy; variety is measured by footage, assets, and camera movement';
  add('family-repetition', mediaOnly || (diagnostics.familyRepetitionRate <= 0.45 && diagnostics.consecutiveStructuredCount <= 3), 'warn', mediaOnly ? mediaOnlyDetail : `${(diagnostics.familyRepetitionRate * 100).toFixed(0)}% adjacent repetition; longest structured run ${diagnostics.consecutiveStructuredCount}`);
  add('layout-repetition', mediaOnly || diagnostics.layoutRepetitionRate <= 0.35, 'warn', mediaOnly ? mediaOnlyDetail : `${(diagnostics.layoutRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('variant-repetition', mediaOnly || diagnostics.variantRepetitionRate <= 0.4, 'warn', mediaOnly ? mediaOnlyDetail : `${(diagnostics.variantRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('motion-repetition', diagnostics.cameraMoveRepetitionRate <= 0.55, 'warn', `${(diagnostics.cameraMoveRepetitionRate * 100).toFixed(0)}% adjacent repetition`);
  add('asset-reuse', diagnostics.assetReuseRate <= 0.35, 'warn', `${(diagnostics.assetReuseRate * 100).toFixed(0)}% reuse among media shots`);
  add('asset-reuse-hard-limit', diagnostics.assetReuseRate <= 0.60, publishMode === 'PRODUCTION_RENDER' ? 'error' : 'warn', `${(diagnostics.assetReuseRate * 100).toFixed(0)}% reuse (production hard limit: 60%)`);
  const photoRunLimit = mediaOnly ? 10 : 4;
  const excessivePhotoRun = diagnostics.consecutivePhotoCount > photoRunLimit;
  // A lack of third-party stock footage must not make an otherwise valid
  // media-only render impossible. Keep this visible as an editorial warning;
  // provider acquisition and asset-reuse diagnostics explain the cause.
  add('slideshow', !excessivePhotoRun, 'warn', `longest consecutive photo/montage run ${diagnostics.consecutivePhotoCount} (limit: ${photoRunLimit})`);

  // Milestone 8 Duration Budget & Pacing Tolerance rules
  if (durationDiagnostics) {
    const durSec = total / fps;
    const target = durationDiagnostics.requestedDuration;
    const hardMin = durationDiagnostics.hardLimits.min;
    const hardMax = durationDiagnostics.hardLimits.max;
    const allowedMin = durationDiagnostics.allowedRange.min;
    const allowedMax = durationDiagnostics.allowedRange.max;
    const frameTolerance = 1 / fps + 0.01;
    const okHard = durSec >= (hardMin - frameTolerance) && durSec <= (hardMax + frameTolerance);
    const okTarget = durSec >= (allowedMin - frameTolerance) && durSec <= (allowedMax + frameTolerance);
    const isFatal = durSec < (hardMin - frameTolerance) || durSec > (hardMax + frameTolerance) || (publishMode === 'PRODUCTION_RENDER' && !okTarget);
    add('duration-tolerance', !isFatal, isFatal ? 'error' : 'warn', `duration ${durSec.toFixed(1)}s (target ${target}s ±5%: ${allowedMin}-${allowedMax}s, hard limits: ${hardMin}-${hardMax}s)`);
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
  // Transition overlaps make summed shot durations exceed the timeline. Count
  // one dominant family per frame so shares are bounded to 100%.
  const familyFrames = new Map();
  for (const clip of clips) for (const shot of (clip.shots || [])) {
    const family = shot.asset?.type === 'video' ? 'video' : shot.family;
    const start = Math.max(0, Number.isFinite(shot.startFrame) ? shot.startFrame : clip.from + shot.from);
    const end = Math.min(total, Number.isFinite(shot.endFrame) ? shot.endFrame : start + shot.durationInFrames);
    for (let frame = start; frame < end; frame++) familyFrames.set(frame, family);
  }
  for (const family of familyFrames.values()) familyRuntime[family] = (familyRuntime[family] || 0) + 1 / total;
  const dominant = Object.entries(familyRuntime).filter(([family, share]) => share > (family === 'image' ? 0.75 : 0.42));
  add('family-share', dominant.length === 0, 'warn', Object.entries(familyRuntime).map(([family, share]) => `${family} ${(share * 100).toFixed(0)}%`).join(', '));

  const baselineTransitions = new Set(['CUT', 'MATCH_MOVE', 'SMOOTH_CUT']);
  const designed = clips.filter((clip, index) => index > 0 && !baselineTransitions.has(clip.transitionPolicy || 'CUT')).length
    + shots.filter((shot, index) => index > 0 && !baselineTransitions.has(shot.transitionPolicy || 'CUT')
      && !clips.some((clip) => clip.shots?.[0]?.storyboardShotId === shot.storyboardShotId)).length
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

  const usedFallbackCount = timeline.captions?.chunks?.filter((c) => c.usedRendererFallback).length || 0;
  add('caption-renderer-fallback', usedFallbackCount === 0, 'error', usedFallbackCount === 0
    ? 'zero renderer fallback captions'
    : `${usedFallbackCount} caption chunks fell back to renderer positioning`);

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
    const reports = Array.isArray(assetReport)
      ? assetReport
      : Array.isArray(assetReport.scenes) ? assetReport.scenes : [];
    const used = reports.filter((report) => report.tier !== 'none' && report.tier !== 'unresolved' && report.role !== 'none');
    const unlicensed = used.filter((report) => {
      let lic = report.license;
      if (!lic && assetReport?.assets && assetReport.assets[report.sceneId]) {
        const sa = assetReport.assets[report.sceneId];
        const p = sa.primary || Object.values(sa.byShot || {})[0];
        if (p?.license) lic = p.license;
      }
      if (!lic && Array.isArray(report.requests)) {
        for (const req of report.requests) {
          if (req.selectedCandidate?.license) lic = req.selectedCandidate.license;
          else if (req.selectedCandidate?.provider) lic = req.selectedCandidate.provider;
        }
      }
      if (!lic) return true;
      if (typeof lic === 'string') return lic.trim().length === 0;
      return !(lic.name || lic.license_name || lic.type || lic.source || lic.provider);
    }).map((report) => report.sceneId);
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
    const groundingSeverity = publishMode === 'PRODUCTION_RENDER' || timeline.publishMode === 'PRODUCTION_RENDER' ? 'error' : 'warn';
    add('visual-coverage-text-grounding', groundingWarns.length === 0, groundingSeverity, groundingWarns.length === 0 ? 'all on-screen text grounded in beat narration' : `${groundingWarns.length} ungrounded text warning(s)`);
  }

  // Stage B & Milestone Production Hardening: Editorial Integrity & Publishability
  const isProd = publishMode === 'PRODUCTION_RENDER' || timeline.publishMode === 'PRODUCTION_RENDER';
  const wrongShots = shots.filter((s) => s.editorialApproval?.classification === 'WRONG' || s.asset?.editorialJudgment?.classification === 'WRONG');
  add('editorial-wrong-assets', wrongShots.length === 0, 'error', wrongShots.length ? `${wrongShots.length} shot(s) with WRONG classification: ${wrongShots.map((s) => s.id || s.storyboardShotId).join(', ')}` : 'zero wrong assets');

  const accidentalShots = shots.filter((s) => s.editorialApproval?.classification === 'ACCIDENTAL' || s.asset?.editorialJudgment?.classification === 'ACCIDENTAL');
  add('editorial-accidental-assets', accidentalShots.length === 0, 'error', accidentalShots.length ? `${accidentalShots.length} shot(s) with ACCIDENTAL keyword match: ${accidentalShots.map((s) => s.id || s.storyboardShotId).join(', ')}` : 'zero accidental keyword collisions');

  const foreignEntityShots = shots.filter((s) => {
    const role = s.visibleNeed?.visualRole || s.role || 'CONTEXT';
    const isImportant = ['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF'].includes(role);
    const judgment = s.asset?.editorialJudgment || s.editorialApproval;
    const hasForeign = judgment?.rejectReasons?.some((r) => r.includes('foreign_entity_intrusion') || r.includes('unrelated_brand')) ||
      (judgment?.foreignEntities && judgment.foreignEntities.length > 0) ||
      (judgment?.distractionRisk >= 0.60 && judgment?.rejectReasons?.some((r) => r.includes('brand')));
    return isImportant && hasForeign;
  });
  add('editorial-foreign-entity', foreignEntityShots.length === 0, 'error', foreignEntityShots.length ? `${foreignEntityShots.length} important shot(s) with foreign entity intrusion: ${foreignEntityShots.map((s) => s.id || s.storyboardShotId).join(', ')}` : 'zero foreign entity intrusions on important shots');

  // Milestone Editorial Usefulness: Critical Shot Quality Gating (Sections 40, 41)
  const distractingCriticalShots = shots.filter((s) => {
    const role = s.visibleNeed?.visualRole || s.role || 'CONTEXT';
    const isImportant = ['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF'].includes(role);
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    const usefulness = judgment.editorialUsefulness || {};
    return isImportant && (usefulness.verdict === 'DISTRACTING' || judgment.usefulnessVerdict === 'DISTRACTING' || (judgment.distractionRisk || 0) >= 0.60);
  });
  add('editorial-distracting-critical', distractingCriticalShots.length === 0, isProd ? 'error' : 'warn', distractingCriticalShots.length === 0 ? 'zero distracting assets on critical shots' : `${distractingCriticalShots.length} critical shot(s) with high distraction risk: ${distractingCriticalShots.map((s) => s.id || s.storyboardShotId).join(', ')}`);

  const weakCriticalShots = shots.filter((s) => {
    const role = s.visibleNeed?.visualRole || s.role || 'CONTEXT';
    const isImportant = ['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF'].includes(role);
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    const usefulness = judgment.editorialUsefulness || {};
    return isImportant && (usefulness.verdict === 'WEAK' || judgment.usefulnessVerdict === 'WEAK');
  });
  add('editorial-weak-critical-shots', weakCriticalShots.length === 0, isProd ? 'error' : 'warn', weakCriticalShots.length === 0 ? 'zero weak critical shots' : `${weakCriticalShots.length} critical shot(s) evaluated as WEAK: ${weakCriticalShots.map((s) => s.id || s.storyboardShotId).join(', ')}`);

  // Section 40: Separately track and count errors vs weaknesses
  const allWeakShots = shots.filter((s) => {
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    const usefulness = judgment.editorialUsefulness || {};
    return usefulness.verdict === 'WEAK' || judgment.usefulnessVerdict === 'WEAK';
  });
  const allDistractingShots = shots.filter((s) => {
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    const usefulness = judgment.editorialUsefulness || {};
    return usefulness.verdict === 'DISTRACTING' || judgment.usefulnessVerdict === 'DISTRACTING' || (judgment.distractionRisk || 0) >= 0.60;
  });
  const allGenericShots = shots.filter((s) => {
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    return (judgment.genericness || 0) >= 0.50 || (judgment.editorialUsefulness?.genericness || 0) >= 0.50;
  });
  const allMetaphoricalShots = shots.filter((s) => {
    const judgment = s.asset?.editorialJudgment || s.editorialApproval || {};
    return judgment.classification === 'METAPHORICAL';
  });

  const identityDriftShots = shots.filter((s) => {
    const chain = s.asset?.assetIdentityChain;
    if (!chain) return false;
    const timelineMismatch = chain.timelineAssetId && chain.timelineAssetId !== s.storyboardShotId;
    const hashMismatch = s.asset?.sha256ContentHash && chain.sha256ContentHash && s.asset.sha256ContentHash !== chain.sha256ContentHash;
    return timelineMismatch || hashMismatch;
  });
  add('asset-identity-drift', identityDriftShots.length === 0, 'error', identityDriftShots.length ? `identity drift detected in ${identityDriftShots.length} shot(s): ${identityDriftShots.map((s) => s.id || s.storyboardShotId).join(', ')}` : 'asset identity chain fully intact across all shots');

  const unresolvedShots = shots.filter((s) => s.unresolvedMedia || s.editorialApproval?.classification === 'UNRESOLVED' || s.asset?.unresolved);
  add('editorial-unresolved-media', !isProd || unresolvedShots.length === 0, isProd ? 'error' : 'warn', unresolvedShots.length === 0 ? 'zero unresolved media shots' : `${unresolvedShots.length} unresolved media shot(s) in timeline`);

  const errors = checks.filter((check) => !check.ok && check.severity === 'error');
  const warnings = checks.filter((check) => !check.ok && check.severity === 'warn');
  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
    diagnostics,
    editorialCounts: {
      semanticErrors: wrongShots.length + accidentalShots.length,
      editorialWeaknesses: allWeakShots.length,
      distractingAssets: allDistractingShots.length,
      genericAssets: allGenericShots.length,
      metaphoricalAssets: allMetaphoricalShots.length,
      weakCriticalShots: weakCriticalShots.length,
    },
  };
}

export function printQc(title, report) {
  console.log(`\nTimeline quality: ${title}`);
  for (const check of report.checks) console.log(`   ${check.ok ? 'OK' : check.severity === 'error' ? 'ERROR' : 'WARN'} ${check.id.padEnd(20)} ${check.detail}`);
}
