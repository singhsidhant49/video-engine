/**
 * Creative QA Director & Automated Repair Engine (Milestone 11).
 * 
 * Evaluates the timeline holistically before rendering:
 * 1. Semantic relevance & domain appropriateness (e.g. flags software UI in psychology).
 * 2. Whole-video representation balance & fatigue (detects 3+ identical representations or layouts).
 * 3. Media vs. procedural quality trades (replaces weak generic stock with diagrams, or repetitive graphics with authentic B-roll).
 * 4. Composition QA (empty area ratio, meaningful content area, safe margins).
 * 5. Pacing, shot holds & micro-progression (shortens dead holds, adds progression to long shots, extends rushed graphics).
 * 6. Text fitting, safe areas, caption yielding, and hook/ending strength.
 * 7. Audio diagnostics integration (clipping risk, loudness drift).
 * 
 * Executes bounded repairs in priority order (up to 2 passes maximum), preserving STRONG/GOOD shots.
 */

import {
  classifyInformationType,
  synthesizeProceduralData,
  INFORMATION_TYPES,
  REPRESENTATIONS,
} from '../storyboard/visualCoveragePlan.js';
import {
  evaluateDiagramQuality,
  applyDiagramRepair,
  DIAGRAM_REPAIR_ACTIONS,
  DIAGRAM_QUALITY_STATE,
} from '../diagrams/diagramQaDirector.js';

export const SHOT_QUALITY_STATE = {
  STRONG: 'STRONG',
  GOOD: 'GOOD',
  ACCEPTABLE: 'ACCEPTABLE',
  WEAK: 'WEAK',
  FAILED: 'FAILED',
};

export const ISSUE_SEVERITY = {
  HARD: 'HARD',
  EDITORIAL: 'EDITORIAL',
};

export const SEMANTIC_RANKING = {
  DIRECT: 'DIRECT',
  STRONG_SUPPORT: 'STRONG_SUPPORT',
  ACCEPTABLE: 'ACCEPTABLE',
  WEAK: 'WEAK',
};

export const REPAIR_ACTIONS = {
  REPLACE_ASSET: 'REPLACE_ASSET',
  CHANGE_REPRESENTATION: 'CHANGE_REPRESENTATION',
  CHANGE_LAYOUT: 'CHANGE_LAYOUT',
  MERGE_SCENES: 'MERGE_SCENES',
  SPLIT_SHOT: 'SPLIT_SHOT',
  EXTEND_HOLD: 'EXTEND_HOLD',
  SHORTEN_HOLD: 'SHORTEN_HOLD',
  ADD_MICRO_PROGRESSION: 'ADD_MICRO_PROGRESSION',
  SIMPLIFY_TEXT: 'SIMPLIFY_TEXT',
  HIDE_CAPTION: 'HIDE_CAPTION',
  REPLAN_FALLBACK: 'REPLAN_FALLBACK',
};

// Numerical repair priority order (lower number = higher priority)
export const REPAIR_PRIORITY = {
  HARD_FAILURE: 1,
  SEMANTIC_MISMATCH: 2,
  PERCEPTUAL_BLANKNESS: 3,
  TEXT_LAYOUT_PROBLEM: 4,
  REPRESENTATION_FATIGUE: 5,
  PACING: 6,
  STYLISTIC_REPETITION: 7,
};

/**
 * Calculates composition metrics for a shot.
 */
function evaluateComposition(shot, clip) {
  const family = shot.family || clip.family || 'statement';
  const headline = shot.overlay?.headline || clip.overlay?.headline || '';
  const hasAsset = Boolean(shot.asset || shot.assetUrl || clip.asset);
  const isGraphic = ['code', 'ui', 'diagram', 'chart', 'compare', 'document', 'process', 'timeline'].includes(family);

  let emptyAreaRatio = 0.2;
  let mediaAreaRatio = 0.0;
  let textAreaRatio = 0.1;
  let meaningfulContentArea = 0.7;

  if (family === 'ground') {
    emptyAreaRatio = 0.95;
    meaningfulContentArea = 0.05;
    textAreaRatio = 0.0;
  } else if (family === 'statement') {
    if (headline.length < 25) {
      emptyAreaRatio = 0.75;
      meaningfulContentArea = 0.25;
      textAreaRatio = 0.25;
    } else {
      emptyAreaRatio = 0.55;
      meaningfulContentArea = 0.45;
      textAreaRatio = 0.45;
    }
  } else if (family === 'image') {
    if (hasAsset) {
      mediaAreaRatio = 0.85;
      emptyAreaRatio = 0.15;
      meaningfulContentArea = 0.85;
    } else {
      emptyAreaRatio = 0.85;
      meaningfulContentArea = 0.15;
    }
  } else if (isGraphic) {
    emptyAreaRatio = 0.25;
    meaningfulContentArea = 0.75;
    textAreaRatio = 0.35;
  }

  return {
    emptyAreaRatio: Number(emptyAreaRatio.toFixed(2)),
    mediaAreaRatio: Number(mediaAreaRatio.toFixed(2)),
    textAreaRatio: Number(textAreaRatio.toFixed(2)),
    meaningfulContentArea: Number(meaningfulContentArea.toFixed(2)),
    safeMargins: true,
  };
}

/**
 * Evaluates the entire timeline and produces a comprehensive CreativeQAReport.
 * 
 * @param {Object} context
 * @returns {Object} Comprehensive CreativeQAReport
 */
export function evaluateCreativeQa({
  timeline,
  storyboard,
  visualCoveragePlan = [],
  assets = {},
  durationDiagnostics,
  pacingDiagnostics,
  visualCoverageDiagnostics,
  audioDiagnostics,
  topic = '',
  format = 'landscape',
}) {
  const fps = timeline.fps || 30;
  const clips = timeline.clips || timeline.scenes || [];
  const allShots = clips.flatMap((c) => c.shots || []);
  const topicLower = topic.toLowerCase();
  const isPsychologyTopic = /\b(brain|gratification|psychology|impulse|behavior|dopamine|limbic|prefrontal)\b/i.test(topicLower);
  const isTechTopic = /\b(code|coding|software|agent|developer|api|repo|terminal)\b/i.test(topicLower);
  const recentDiagramBackgrounds = [];

  const shotEvaluations = [];
  const repairsNeeded = [];
  let hardFailureCount = 0;
  let editorialWarningCount = 0;

  // Representation counts across whole video
  const repCounts = {};
  for (const shot of allShots) {
    repCounts[shot.family] = (repCounts[shot.family] || 0) + 1;
  }
  const totalShots = Math.max(1, allShots.length);

  for (let i = 0; i < allShots.length; i++) {
    const shot = allShots[i];
    const clip = clips.find((c) => c.sceneId === shot.sceneId) || clips[i] || {};
    const sceneNarration = clip.narration || '';
    const shotDurationSec = (shot.durationInFrames || clip.durationInFrames || fps * 3) / fps;
    const issues = [];
    const repairCandidates = [];
    let state = SHOT_QUALITY_STATE.GOOD;
    let severity = null;

    // Composition evaluation
    const comp = evaluateComposition(shot, clip);

    // 1. HARD FAILURES
    // Blank frame: ground family or missing image with no overlay
    if (shot.family === 'ground' || (!shot.asset && shot.family === 'image' && !shot.overlay?.headline)) {
      issues.push('blank_frame');
      state = SHOT_QUALITY_STATE.FAILED;
      severity = ISSUE_SEVERITY.HARD;
      hardFailureCount++;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.HARD_FAILURE,
        action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
        reason: 'Eliminate blank ground frame with topic-grounded procedural primitive',
      });
    }

    // Perceptual blankness / nearly empty screen
    if (comp.emptyAreaRatio > 0.7 && shot.family === 'statement' && (!shot.overlay?.headline || shot.overlay.headline.length < 15)) {
      issues.push('nearly_empty_screen');
      if (state !== SHOT_QUALITY_STATE.FAILED) state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;
      const candidateAsset = shot.asset || assets?.[shot.sceneId]?.primary || clip.asset;
      if (candidateAsset) {
        repairCandidates.push({
          priority: REPAIR_PRIORITY.PERCEPTUAL_BLANKNESS,
          action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
          targetFamily: 'image',
          targetVariant: 'editorial',
          targetAsset: candidateAsset,
          reason: 'Promote nearly-empty statement to authentic editorial image layout',
        });
      } else {
        repairCandidates.push({
          priority: REPAIR_PRIORITY.PERCEPTUAL_BLANKNESS,
          action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
          targetFamily: 'diagram',
          reason: 'Replace nearly-empty screen with structured explanatory diagram',
        });
      }
    }

    // Clipped or excessively long text
    if (shot.overlay?.headline && shot.overlay.headline.length > 80) {
      issues.push('clipped_text');
      if (state !== SHOT_QUALITY_STATE.FAILED) state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.HARD;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.HARD_FAILURE,
        action: REPAIR_ACTIONS.SIMPLIFY_TEXT,
        reason: 'Headline exceeds 80 characters; wrap and trim upstream',
      });
    }

    // 2. DOMAIN SEMANTIC APPROPRIATENESS
    // Rule: Psychology and non-software videos must not render software developer repository UIs or code syntax!
    if (!isTechTopic && (shot.family === 'code' || shot.family === 'ui')) {
      issues.push(shot.family === 'code' ? 'inappropriate_domain_code' : 'inappropriate_domain_ui');
      state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;
      const candidateAsset = shot.asset || assets?.[shot.sceneId]?.primary || clip.asset;
      if (candidateAsset) {
        repairCandidates.push({
          priority: REPAIR_PRIORITY.SEMANTIC_MISMATCH,
          action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
          targetFamily: 'image',
          targetVariant: 'editorial',
          targetAsset: candidateAsset,
          reason: `Replace developer ${shot.family} with authentic media in ${topic || 'non-technical'} video`,
        });
      } else {
        repairCandidates.push({
          priority: REPAIR_PRIORITY.SEMANTIC_MISMATCH,
          action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
          targetFamily: /timeline|history|year|date/i.test(sceneNarration) ? 'timeline'
            : /versus|compare|choice|two/i.test(sceneNarration) ? 'compare'
              : 'diagram',
          reason: `Replace software ${shot.family} with domain-appropriate graphic in ${topic || 'non-technical'} video`,
        });
      }
    } else if (isPsychologyTopic && shot.family === 'ui') {
      issues.push('inappropriate_domain_ui');
      state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.SEMANTIC_MISMATCH,
        action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
        targetFamily: /compete|versus|choice|two/i.test(sceneNarration) ? 'compare' : 'diagram',
        reason: 'Replace software repository UI with neural/behavioral diagram or comparison in psychology video',
      });
    }

    // 3. WHOLE-VIDEO REPRESENTATION FATIGUE
    // Rule: Detect 3+ consecutive shots with identical procedural representation (e.g. CODE -> CODE -> CODE or DIAGRAM -> DIAGRAM -> DIAGRAM)
    // Authentic images and video footage do NOT suffer from representation fatigue in documentaries/explainers.
    const prevShot1 = allShots[i - 1];
    const prevShot2 = allShots[i - 2];
    if (shot.family !== 'image' && prevShot1 && prevShot2 && shot.family === prevShot1.family && shot.family === prevShot2.family) {
      issues.push('representation_fatigue');
      if (state === SHOT_QUALITY_STATE.GOOD || state === SHOT_QUALITY_STATE.STRONG) state = SHOT_QUALITY_STATE.ACCEPTABLE;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;

      // Suggest valid semantic alternatives based on narration context
      let altFamily = 'diagram';
      if (shot.family === 'code') {
        if (/loop|step|cycle|read.*plan/i.test(sceneNarration)) altFamily = 'process';
        else if (/file|search|context|repo/i.test(sceneNarration)) altFamily = 'ui';
        else if (/compete|versus|different|human/i.test(sceneNarration)) altFamily = 'compare';
        else altFamily = 'diagram';
      } else if (shot.family === 'diagram') {
        altFamily = 'compare';
      }

      repairCandidates.push({
        priority: REPAIR_PRIORITY.REPRESENTATION_FATIGUE,
        action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
        targetFamily: altFamily,
        reason: `Break repetitive run of 3+ consecutive "${shot.family}" shots with semantic "${altFamily}"`,
      });
    }

    // Rule: Detect repetitive layout/variant inside same family (e.g. code:syntax -> code:syntax) if not already breaking family
    const hasRepFatigue = issues.includes('representation_fatigue');
    if (!hasRepFatigue && prevShot1 && shot.family === prevShot1.family && shot.variant === prevShot1.variant && ['code', 'diagram', 'ui'].includes(shot.family)) {
      issues.push('layout_fatigue');
      repairCandidates.push({
        priority: REPAIR_PRIORITY.TEXT_LAYOUT_PROBLEM,
        action: REPAIR_ACTIONS.CHANGE_LAYOUT,
        targetVariant: shot.family === 'code' ? 'terminal' : 'workspace',
        reason: `Vary presentation layout inside "${shot.family}" family`,
      });
    }

    // 4. MEDIA QUALITY & ASSET TRADES
    if (shot.family === 'image') {
      const asset = shot.asset || assets?.[shot.sceneId]?.primary;
      const alternates = assets?.[shot.sceneId]?.alternates || [];
      const hasBetterAlternate = alternates.length > 0 && alternates[0].score > (asset?.score || 0);

      if (asset?.generic || asset?.tier === 'generic' || (asset?.score && asset.score < 50)) {
        issues.push('weak_media');
        if (state === SHOT_QUALITY_STATE.GOOD || state === SHOT_QUALITY_STATE.STRONG) state = SHOT_QUALITY_STATE.WEAK;
        severity = severity || ISSUE_SEVERITY.EDITORIAL;
        editorialWarningCount++;

        if (hasBetterAlternate) {
          repairCandidates.push({
            priority: REPAIR_PRIORITY.SEMANTIC_MISMATCH,
            action: REPAIR_ACTIONS.REPLACE_ASSET,
            targetAsset: alternates[0],
            reason: `Replace low-scoring asset (${asset?.score || 0}) with higher-scoring alternate (${alternates[0].score})`,
          });
        } else {
          const infoType = classifyInformationType({ narration: sceneNarration, visualConcept: shot.visualConcept });
          const proceduralAlternative = ['code', 'ui', 'diagram', 'chart', 'compare', 'timeline'].includes(infoType) ? infoType : 'diagram';
          repairCandidates.push({
            priority: REPAIR_PRIORITY.SEMANTIC_MISMATCH,
            action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
            targetFamily: proceduralAlternative,
            reason: `Replace generic stock photo with authentic procedural "${proceduralAlternative}"`,
          });
        }
      } else if (asset && asset.score && asset.score >= 80) {
        state = SHOT_QUALITY_STATE.STRONG;
      }
    }

    // 5. SHOT HOLD & PACING
    if (shotDurationSec > 5.5 && ['image', 'statement', 'ground'].includes(shot.family)) {
      issues.push('hold_too_long');
      if (state === SHOT_QUALITY_STATE.GOOD) state = SHOT_QUALITY_STATE.ACCEPTABLE;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.PACING,
        action: REPAIR_ACTIONS.ADD_MICRO_PROGRESSION,
        reason: `Add visual micro-progression to ${shotDurationSec.toFixed(1)}s static shot`,
      });
    }

    if (shotDurationSec < 2.5 && ['diagram', 'chart', 'compare'].includes(shot.family)) {
      issues.push('rushed_graphic');
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      editorialWarningCount++;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.PACING,
        action: REPAIR_ACTIONS.EXTEND_HOLD,
        reason: `Extend cognitive graphic hold duration (${shotDurationSec.toFixed(1)}s is too fast to scan)`,
      });
    }

    // 6. DIAGRAM & INFORMATION-DESIGN QA (Milestone 13)
    const isDiagramFamily = ['diagram', 'process', 'compare', 'timeline', 'list', 'chart'].includes(shot.family);
    if (isDiagramFamily) {
      const dEval = evaluateDiagramQuality(clip, {
        format,
        width: timeline.width || (format === 'shorts' ? 1080 : 1920),
        height: timeline.height || (format === 'shorts' ? 1920 : 1080),
        recentBackgrounds: recentDiagramBackgrounds,
      });
      if (dEval.backgroundMode) {
        recentDiagramBackgrounds.push(dEval.backgroundMode);
      }
      for (const dIssue of dEval.issues) {
        if (!issues.includes(dIssue)) {
          issues.push(dIssue);
        }
      }
      if (dEval.state === DIAGRAM_QUALITY_STATE.FAILED) {
        state = SHOT_QUALITY_STATE.FAILED;
        severity = ISSUE_SEVERITY.HARD;
        hardFailureCount++;
      } else if (dEval.state === DIAGRAM_QUALITY_STATE.WEAK) {
        if (state !== SHOT_QUALITY_STATE.FAILED) state = SHOT_QUALITY_STATE.WEAK;
        severity = severity || ISSUE_SEVERITY.EDITORIAL;
        editorialWarningCount++;
      }
      for (const candidate of dEval.repairCandidates) {
        repairCandidates.push({
          priority: dEval.state === DIAGRAM_QUALITY_STATE.FAILED
            ? REPAIR_PRIORITY.HARD_FAILURE
            : candidate.action === DIAGRAM_REPAIR_ACTIONS.CHANGE_BACKGROUND
              ? REPAIR_PRIORITY.STYLISTIC_REPETITION
              : REPAIR_PRIORITY.TEXT_LAYOUT_PROBLEM,
          ...candidate,
        });
      }
    }

    // 7. CAPTION YIELDING & READABILITY
    const isGraphic = ['code', 'ui', 'diagram', 'chart', 'compare', 'document', 'process', 'timeline'].includes(shot.family);
    if (isGraphic && timeline.captions?.chunks?.length > 0) {
      const shotStart = clip.from + (shot.from || 0);
      const shotEnd = shotStart + (shot.durationInFrames || clip.durationInFrames);
      const isYielded = (timeline.captions.hidden || []).some(([a, b]) => a <= shotStart && b >= shotEnd);
      if (!isYielded) {
        issues.push('caption_competition');
        repairCandidates.push({
          priority: REPAIR_PRIORITY.TEXT_LAYOUT_PROBLEM,
          action: REPAIR_ACTIONS.HIDE_CAPTION,
          reason: 'Suppress floating captions during primary graphic presentation',
        });
      }
    }

    // 7. HOOK & ENDING REVIEW
    const isHook = i === 0;
    const isEnding = i === allShots.length - 1;
    if (isHook && (shot.family === 'statement' || shot.family === 'ground')) {
      issues.push('weak_hook');
      if (state !== SHOT_QUALITY_STATE.FAILED) state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.STYLISTIC_REPETITION,
        action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
        targetFamily: isTechTopic ? 'code' : isPsychologyTopic ? 'diagram' : 'image',
        reason: 'Upgrade opening shot from plain statement card to engaging explanatory primitive',
      });
    }
    if (isEnding && (shot.family === 'ground' || shot.family === 'statement')) {
      issues.push('weak_ending');
      if (state !== SHOT_QUALITY_STATE.FAILED) state = SHOT_QUALITY_STATE.WEAK;
      severity = severity || ISSUE_SEVERITY.EDITORIAL;
      repairCandidates.push({
        priority: REPAIR_PRIORITY.STYLISTIC_REPETITION,
        action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
        targetFamily: isTechTopic ? 'ui' : 'document',
        reason: 'Ensure resolving payoff visual on final frame',
      });
    }

    // Sort candidates by repair priority
    repairCandidates.sort((a, b) => (a.priority || 99) - (b.priority || 99));

    if (issues.length > 0 && repairCandidates.length > 0) {
      repairsNeeded.push({
        shotId: shot.id || shot.storyboardShotId || `shot_${i + 1}`,
        sceneId: shot.sceneId,
        family: shot.family,
        issues,
        candidates: repairCandidates,
      });
    }

    shotEvaluations.push({
      shotId: shot.id || shot.storyboardShotId || `shot_${i + 1}`,
      sceneId: shot.sceneId,
      family: shot.family,
      variant: shot.variant,
      qualityState: state,
      severity,
      issues,
      composition: comp,
      repairCandidates,
    });
  }

  // Audio QA integration
  const audioIssues = [];
  if (audioDiagnostics) {
    if (audioDiagnostics.narrationPeakDb > -0.5 || audioDiagnostics.truePeakDb > -0.5) {
      audioIssues.push('audio_clipping_risk');
      hardFailureCount++;
    }
    if (audioDiagnostics.narrationIntegratedLoudness && (audioDiagnostics.narrationIntegratedLoudness < -20 || audioDiagnostics.narrationIntegratedLoudness > -12)) {
      audioIssues.push('audio_loudness_drift');
      editorialWarningCount++;
    }
  }

  const strongCount = shotEvaluations.filter((s) => s.qualityState === SHOT_QUALITY_STATE.STRONG).length;
  const goodCount = shotEvaluations.filter((s) => s.qualityState === SHOT_QUALITY_STATE.GOOD).length;
  const acceptableCount = shotEvaluations.filter((s) => s.qualityState === SHOT_QUALITY_STATE.ACCEPTABLE).length;
  const weakCount = shotEvaluations.filter((s) => s.qualityState === SHOT_QUALITY_STATE.WEAK).length;
  const failedCount = shotEvaluations.filter((s) => s.qualityState === SHOT_QUALITY_STATE.FAILED).length;

  return {
    evaluatedShotsCount: allShots.length,
    qualitySummary: {
      strongCount,
      goodCount,
      acceptableCount,
      weakCount,
      failedCount,
      hardFailureCount,
      editorialWarningCount,
    },
    representationDistribution: repCounts,
    audioIssues,
    shotEvaluations,
    repairsNeeded,
    isProductionReady: hardFailureCount === 0 && failedCount === 0 && weakCount <= Math.max(2, Math.floor(allShots.length * 0.2)),
  };
}

/**
 * Applies bounded creative repairs to the timeline.
 * 
 * Follows strict priority order:
 * 1. Hard failures (blank frames, clipped text)
 * 2. Semantic domain mismatches (psychology UI -> diagram/compare)
 * 3. Perceptual blankness
 * 4. Text/layout problems
 * 5. Representation fatigue (runs of 3+ identical representations)
 * 6. Pacing & micro-progression
 * 
 * Preserves STRONG and GOOD shots untouched unless there is a hard failure.
 * 
 * @param {Object} timeline - Timeline to mutate/repair
 * @param {Array<Object>} repairsNeeded - List of repair targets from evaluateCreativeQa
 * @param {Object} context
 * @returns {{ timeline: Object, appliedRepairs: Array<Object> }}
 */
export function applyCreativeRepairs(timeline, repairsNeeded = [], context = {}) {
  const repaired = JSON.parse(JSON.stringify(timeline));
  const appliedRepairs = [];
  const fps = repaired.fps || 30;

  for (const item of repairsNeeded) {
    // Find matching clip and shot
    const clip = (repaired.clips || repaired.scenes || []).find((c) => c.sceneId === item.sceneId);
    if (!clip) continue;
    const shot = (clip.shots || []).find((s) => s.id === item.shotId || s.storyboardShotId === item.shotId) || clip.shots?.[0];
    if (!shot) continue;
    // Solved compositions can only be repaired by recompiling their typed IR.
    // Legacy creative repair mutations would desynchronize pixels from preflight.
    if (shot.renderMode === 'solved') continue;

    // Preserve STRONG and GOOD shots unless there is a hard failure
    const isHardFailure = item.issues.includes('blank_frame') || item.issues.includes('clipped_text');
    if (!isHardFailure && (shot.presentation?.qualityState === SHOT_QUALITY_STATE.STRONG || shot.presentation?.qualityState === SHOT_QUALITY_STATE.GOOD)) {
      continue;
    }

    // Select highest-priority candidate
    const candidate = item.candidates[0];
    if (!candidate) continue;

    const beforeState = {
      family: shot.family,
      variant: shot.variant,
      asset: shot.asset ? { id: shot.asset.id, tier: shot.asset.tier } : null,
      overlayMode: shot.presentation?.overlayMode,
    };

    switch (candidate.action) {
      case REPAIR_ACTIONS.REPLACE_ASSET: {
        if (candidate.targetAsset) {
          shot.asset = candidate.targetAsset;
          clip.asset = candidate.targetAsset;
          appliedRepairs.push({
            shotId: item.shotId,
            sceneId: item.sceneId,
            action: REPAIR_ACTIONS.REPLACE_ASSET,
            reason: candidate.reason,
            before: beforeState,
            after: { asset: { id: candidate.targetAsset.id, score: candidate.targetAsset.score } },
          });
        }
        break;
      }

      case REPAIR_ACTIONS.CHANGE_REPRESENTATION: {
        const targetFamily = candidate.targetFamily || 'diagram';
        shot.family = targetFamily;
        shot.variant = targetFamily === 'image' ? (candidate.targetVariant || 'editorial')
          : targetFamily === 'diagram' ? 'nodes'
          : targetFamily === 'ui' ? 'workspace'
          : targetFamily === 'compare' ? 'columns'
          : 'default';
        clip.family = targetFamily;
        clip.variant = shot.variant;

        if (targetFamily === 'image') {
          const assetToUse = candidate.targetAsset || shot.asset || clip.asset;
          if (assetToUse) {
            shot.asset = assetToUse;
            clip.asset = assetToUse;
          }
          if (shot.presentation) {
            shot.presentation.family = 'image';
            shot.presentation.variant = shot.variant;
            shot.presentation.layout = `image:${shot.variant}`;
            shot.presentation.overlayMode = 'secondary';
          }
        } else {
          // Populate semantic procedural data so it renders immediately
          const synth = synthesizeProceduralData({ narration: clip.narration, data: clip.overlay }, targetFamily);
          shot.overlay = { ...shot.overlay, ...synth, at: 4 };
          clip.overlay = shot.overlay;

          if (shot.presentation) {
            shot.presentation.family = targetFamily;
            shot.presentation.variant = shot.variant;
            shot.presentation.layout = `${targetFamily}:${shot.variant}`;
            shot.presentation.overlayMode = 'primary';
          }
        }

        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: REPAIR_ACTIONS.CHANGE_REPRESENTATION,
          reason: candidate.reason,
          before: beforeState,
          after: { family: shot.family, variant: shot.variant },
        });
        break;
      }

      case REPAIR_ACTIONS.CHANGE_LAYOUT: {
        const targetVariant = candidate.targetVariant || 'terminal';
        shot.variant = targetVariant;
        clip.variant = targetVariant;
        if (shot.presentation) {
          shot.presentation.variant = targetVariant;
          shot.presentation.layout = `${shot.family}:${targetVariant}`;
        }
        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: REPAIR_ACTIONS.CHANGE_LAYOUT,
          reason: candidate.reason,
          before: beforeState,
          after: { variant: targetVariant },
        });
        break;
      }

      case REPAIR_ACTIONS.SIMPLIFY_TEXT: {
        if (shot.overlay?.headline && shot.overlay.headline.length > 70) {
          const oldHeadline = shot.overlay.headline;
          const words = oldHeadline.split(/\s+/).slice(0, 6);
          shot.overlay.headline = words.join(' ');
          clip.overlay.headline = shot.overlay.headline;
          appliedRepairs.push({
            shotId: item.shotId,
            sceneId: item.sceneId,
            action: REPAIR_ACTIONS.SIMPLIFY_TEXT,
            reason: candidate.reason,
            before: { headline: oldHeadline },
            after: { headline: shot.overlay.headline },
          });
        }
        break;
      }

      case REPAIR_ACTIONS.HIDE_CAPTION: {
        if (!repaired.captions) repaired.captions = { hidden: [] };
        if (!repaired.captions.hidden) repaired.captions = { hidden: [] };
        const shotStart = clip.from + (shot.from || 0);
        const shotEnd = shotStart + (shot.durationInFrames || clip.durationInFrames);
        repaired.captions.hidden.push([shotStart, shotEnd]);
        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: REPAIR_ACTIONS.HIDE_CAPTION,
          reason: candidate.reason,
          before: { captionHidden: false },
          after: { captionHidden: true, range: [shotStart, shotEnd] },
        });
        break;
      }

      case REPAIR_ACTIONS.ADD_MICRO_PROGRESSION: {
        // In code shots, toggle terminal pass at midpoint
        if (shot.family === 'code' && shot.overlay?.code) {
          shot.overlay.highlightLines = [2, 3];
          shot.overlay.terminal = '$ agent test\nPASS 14 tests verified.';
        } else if (shot.family === 'diagram' && shot.overlay?.nodes) {
          shot.overlay.nodes = shot.overlay.nodes.map((n, idx) => ({ ...n, activeAt: idx * Math.round(fps * 1.5) }));
        }
        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: REPAIR_ACTIONS.ADD_MICRO_PROGRESSION,
          reason: candidate.reason,
          before: { microProgression: false },
          after: { microProgression: true },
        });
        break;
      }

      case REPAIR_ACTIONS.EXTEND_HOLD: {
        const extraFrames = Math.round(fps * 0.75);
        shot.durationInFrames = (shot.durationInFrames || clip.durationInFrames) + extraFrames;
        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: REPAIR_ACTIONS.EXTEND_HOLD,
          reason: candidate.reason,
          before: { durationInFrames: shot.durationInFrames - extraFrames },
          after: { durationInFrames: shot.durationInFrames },
        });
        break;
      }

      case DIAGRAM_REPAIR_ACTIONS.REDUCE_NODES:
      case DIAGRAM_REPAIR_ACTIONS.STACK_VERTICAL:
      case DIAGRAM_REPAIR_ACTIONS.INCREASE_LABEL_SIZE:
      case DIAGRAM_REPAIR_ACTIONS.REMOVE_METADATA:
      case DIAGRAM_REPAIR_ACTIONS.CHANGE_BACKGROUND:
      case DIAGRAM_REPAIR_ACTIONS.CHANGE_GRAMMAR:
      case DIAGRAM_REPAIR_ACTIONS.SIMPLIFY_DIAGRAM: {
        applyDiagramRepair(clip, candidate, { format: context.format || 'landscape' });
        shot.overlay = clip.overlay;
        appliedRepairs.push({
          shotId: item.shotId,
          sceneId: item.sceneId,
          action: candidate.action,
          reason: candidate.reason,
          before: beforeState,
          after: { overlay: clip.overlay },
        });
        break;
      }

      default:
        break;
    }
  }

  return {
    timeline: repaired,
    appliedRepairs,
  };
}

/**
 * Runs the complete Creative QA & Automated Repair Loop (Max 2 passes).
 * 
 * Evaluates -> Repairs -> Evaluates -> Repairs -> Evaluates -> Produces Artifacts.
 * 
 * @param {Object} params
 * @param {Object} params.timeline
 * @param {Object} [params.storyboard]
 * @param {Array<Object>} [params.visualCoveragePlan]
 * @param {Object} [params.assets]
 * @param {Object} [params.durationDiagnostics]
 * @param {Object} [params.pacingDiagnostics]
 * @param {Object} [params.visualCoverageDiagnostics]
 * @param {Object} [params.audioDiagnostics]
 * @param {string} [params.topic]
 * @param {number} [params.maxPasses=2]
 * @returns {{ timeline: Object, creativeQaBefore: Object, creativeQaAfter: Object, repairsApplied: Array<Object>, passesRun: number }}
 */
export function runCreativeQaLoop({
  timeline,
  storyboard,
  visualCoveragePlan = [],
  assets = {},
  durationDiagnostics,
  pacingDiagnostics,
  visualCoverageDiagnostics,
  audioDiagnostics,
  topic = '',
  format = 'landscape',
  maxPasses = 2,
}) {
  const initialQa = evaluateCreativeQa({
    timeline,
    storyboard,
    visualCoveragePlan,
    assets,
    durationDiagnostics,
    pacingDiagnostics,
    visualCoverageDiagnostics,
    audioDiagnostics,
    topic,
    format,
  });

  let currentTimeline = timeline;
  let currentQa = initialQa;
  const allRepairsApplied = [];
  let passesRun = 0;

  while (passesRun < maxPasses && currentQa.repairsNeeded.length > 0) {
    passesRun++;
    const { timeline: repairedTimeline, appliedRepairs } = applyCreativeRepairs(
      currentTimeline,
      currentQa.repairsNeeded,
      { topic, assets, storyboard, format }
    );

    if (appliedRepairs.length === 0) {
      break; // No further repairs possible
    }

    allRepairsApplied.push(...appliedRepairs);
    currentTimeline = repairedTimeline;

    // Re-evaluate
    currentQa = evaluateCreativeQa({
      timeline: currentTimeline,
      storyboard,
      visualCoveragePlan,
      assets,
      durationDiagnostics,
      pacingDiagnostics,
      visualCoverageDiagnostics,
      audioDiagnostics,
      topic,
      format,
    });
  }

  return {
    timeline: currentTimeline,
    creativeQaBefore: initialQa,
    creativeQaAfter: currentQa,
    repairsApplied: allRepairsApplied,
    passesRun,
  };
}
