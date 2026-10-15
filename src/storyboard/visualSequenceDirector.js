/**
 * Visual Sequence Director — Whole-Video Narrative Progression & Coherence
 * Milestone — Production Hardening & Semantic Visual Understanding
 * 
 * Evaluates the entire video sequence as a cohesive narrative arc rather than isolated shots.
 * Features:
 * - Assigns and tracks visual roles: HOOK, ESTABLISH, CONTEXT, ACTION, DETAIL, EVIDENCE, CONSEQUENCE, ATMOSPHERE, TRANSITION, PAYOFF
 * - Transition scoring: semanticContinuity, visualNovelty, narrativeProgression, styleCompatibility, formatContinuity
 * - Detects flat role runs (e.g. 5+ consecutive CONTEXT shots -> flat_visual_progression)
 * - Detects erratic subject jumps (random stock collage)
 * - Caps metaphor runs and layered media overuse
 * - Computes macro sequence verdict: STRONG, ACCEPTABLE, WEAK, or FAILED
 */

import { QualityTokens } from '../config/tokens/editorialTokens.js';

export function evaluateVisualSequence({
  shots = [],
  storyboard = null,
  editorialJudgments = {},
  visualInspections = {},
  editorialMode = 'TECHNICAL_EXPLAINER',
  format = 'landscape',
}) {
  const warnings = [];
  const assignedRoles = [];
  const transitions = [];

  let directCount = 0;
  let contextualCount = 0;
  let metaphoricalCount = 0;
  let accidentalCount = 0;
  let wrongCount = 0;
  let layeredCount = 0;
  let videoCount = 0;
  let imageCount = 0;

  let maxRoleRun = 1;
  let currentRoleRun = 1;
  let lastRole = null;

  let maxMetaphorRun = 0;
  let currentMetaphorRun = 0;
  let currentGenericMetaphorChain = 0;

  let maxLayeredRun = 0;
  let currentLayeredRun = 0;
  let currentGenericStockRun = 0;
  let maxGenericStockRun = 0;
  let genericStockCount = 0;

  let currentLowInfoGainRun = 0;
  let maxLowInfoGainRun = 0;
  let semanticRedundancyCount = 0;
  let editorialWeaknessCount = 0;
  let distractingAssetCount = 0;
  let weakCriticalShotCount = 0;

  const roleDistribution = {};
  const subjectDistribution = {};

  const getDomain = (text) => {
    if (/server|cpu|datacenter|cloud|software|memory|ram|code|browser|tcp|network|transistor/i.test(text)) return 'COMPUTING';
    if (/quantum|timeline|multiverse|paradox|relativity|physics|cosmic|space/i.test(text)) return 'PHYSICS';
    if (/coffee|cafe|office|meeting|handshake|business/i.test(text)) return 'OFFICE_LIFESTYLE';
    if (/tree|forest|leaf|nature|river|stream/i.test(text)) return 'NATURE';
    if (/pipe|water|faucet|plumber/i.test(text)) return 'PLUMBING';
    if (/map|road|highway|freeway|traffic/i.test(text)) return 'GEOGRAPHY_ROAD';
    if (/car|sedan|vehicle|automobile/i.test(text)) return 'VEHICLE';
    if (/guitar|pedal|stompbox|music/i.test(text)) return 'MUSIC_AUDIO';
    if (/currency|banknote|rupee|cash|money/i.test(text)) return 'CURRENCY';
    return 'GENERAL';
  };

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const judgment = editorialJudgments[shot.id] || editorialJudgments[shot.storyboardShotId] || {};
    const inspection = visualInspections[shot.id] || visualInspections[shot.storyboardShotId] || shot.asset?.visualInspection || judgment.inspection || {};
    const visibleNeed = shot.visibleNeed || {};
    const asset = shot.asset || {};

    // 1. Assign or validate visual role
    const authoredRole = {
      establishing: 'ESTABLISH',
      subject: 'CONTEXT',
      context: 'CONTEXT',
      action: 'ACTION',
      detail: 'DETAIL',
      evidence: 'EVIDENCE',
      graphic: 'EVIDENCE',
      reaction: 'CONSEQUENCE',
      transition: 'TRANSITION',
      atmosphere: 'ATMOSPHERE',
      payoff: 'PAYOFF',
      hook: 'HOOK',
    }[String(shot.role || '').toLowerCase()];
    let role = visibleNeed.visualRole || shot.visualRole || authoredRole || 'CONTEXT';
    if (role === 'CONTEXT' && authoredRole && authoredRole !== 'CONTEXT') role = authoredRole;
    if (i === 0) role = 'HOOK';
    else if (i === shots.length - 1) role = 'PAYOFF';
    assignedRoles.push({ shotId: shot.id || shot.storyboardShotId, role });
    roleDistribution[role] = (roleDistribution[role] || 0) + 1;

    // Track asset types
    if (asset.type === 'video') videoCount++;
    else imageCount++;

    if (shot.strategy === 'LAYERED_MEDIA' || shot.presentation?.variant === 'layered') {
      layeredCount++;
      currentLayeredRun++;
      if (currentLayeredRun > maxLayeredRun) maxLayeredRun = currentLayeredRun;
    } else {
      currentLayeredRun = 0;
    }

    // Track match classifications
    const classification = judgment.classification || 'DIRECT';
    if (classification === 'DIRECT') {
      directCount++;
      currentMetaphorRun = 0;
    } else if (classification === 'CONTEXTUAL') {
      contextualCount++;
      currentMetaphorRun = 0;
    } else if (classification === 'METAPHORICAL') {
      metaphoricalCount++;
      currentMetaphorRun++;
      if (currentMetaphorRun > maxMetaphorRun) maxMetaphorRun = currentMetaphorRun;
    } else if (classification === 'ACCIDENTAL') {
      accidentalCount++;
    } else if (classification === 'WRONG') {
      wrongCount++;
    }

    // Track editorial usefulness verdicts (Sections 2, 40)
    const usefulnessVerdict = judgment.editorialUsefulness?.verdict || judgment.usefulnessVerdict;
    if (usefulnessVerdict === 'WEAK') editorialWeaknessCount++;
    if (usefulnessVerdict === 'DISTRACTING' || (judgment.distractionRisk || 0) >= 0.60) distractingAssetCount++;
    if (['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF'].includes(role) && usefulnessVerdict === 'WEAK') {
      weakCriticalShotCount++;
    }

    // Generic metaphor chain detection
    const isGenericMetaphor = (classification === 'METAPHORICAL') &&
      /light\s*bulb|puzzle|clock|hourglass|gears|stepping\s*stones|maze|chess|ladder/i.test(`${asset.label || ''} ${inspection.primarySubject || ''} ${shot.visualConcept || ''}`);
    if (isGenericMetaphor) {
      currentGenericMetaphorChain++;
      if (currentGenericMetaphorChain >= 2) {
        warnings.push({
          code: 'generic_metaphor_chain',
          severity: 'warn',
          detail: `Detected generic metaphor chain of length ${currentGenericMetaphorChain} at shot index ${i}`,
          shotId: shot.id || shot.storyboardShotId,
        });
      }
    } else {
      currentGenericMetaphorChain = 0;
    }

    // Role repetition & flat sequence detection (Part 39, 78)
    if (role === lastRole) {
      currentRoleRun++;
      if (currentRoleRun > maxRoleRun) maxRoleRun = currentRoleRun;
      if (currentRoleRun >= 5 && role === 'CONTEXT') {
        warnings.push({
          code: 'flat_visual_progression',
          severity: 'warn',
          detail: `Run of ${currentRoleRun} consecutive CONTEXT shots without ACTION, DETAIL, or EVIDENCE progression`,
          shotId: shot.id || shot.storyboardShotId,
        });
      } else if (currentRoleRun >= 3) {
        warnings.push({
          code: 'repeated_visual_role',
          severity: 'warn',
          detail: `Run of ${currentRoleRun} consecutive ${role} shots around shot index ${i}`,
          shotId: shot.id || shot.storyboardShotId,
        });
      }
    } else {
      currentRoleRun = 1;
      lastRole = role;
    }

    // Transition coherence, informationGain & semanticRedundancy between adjacent shots (Sections 36, 37, 38, 39)
    let informationGain = 1.0;
    let semanticRedundancy = 0.0;

    if (i > 0) {
      const prevShot = shots[i - 1];
      const prevJudg = editorialJudgments[prevShot.id] || editorialJudgments[prevShot.storyboardShotId] || {};
      const prevInspection = visualInspections[prevShot.id] || visualInspections[prevShot.storyboardShotId] || prevShot.asset?.visualInspection || prevJudg.inspection || {};
      const prevNeed = prevShot.visibleNeed || {};
      const prevSubject = String(prevShot.asset?.label || prevNeed.subject || '').toLowerCase();
      const currSubject = String(asset.label || visibleNeed.subject || '').toLowerCase();

      // Check if both shots represent identical or near-identical physical objects / concepts (e.g. clock -> watch -> hourglass)
      const isTimeCluster = /clock|watch|hourglass|pendulum|timepiece/i.test(prevSubject) && /clock|watch|hourglass|pendulum|timepiece/i.test(currSubject);
      const isServerCluster = /server|datacenter|rack/i.test(prevSubject) && /server|datacenter|rack/i.test(currSubject);
      const isScientistCluster = /scientist|researcher|lab/i.test(prevSubject) && /scientist|researcher|lab/i.test(currSubject);
      const isOfficeCluster = /office|meeting|colleague|handshake/i.test(prevSubject) && /office|meeting|colleague|handshake/i.test(currSubject);
      const isSignCluster = /sign|caution|no[\s-]entry|warning/i.test(prevSubject) && /sign|caution|no[\s-]entry|warning/i.test(currSubject);

      const isConceptuallyRedundant = isTimeCluster || isServerCluster || isScientistCluster || isOfficeCluster || isSignCluster || (prevSubject === currSubject && prevSubject.length > 0);

      if (isConceptuallyRedundant) {
        semanticRedundancy = 0.85;
        informationGain = 0.20;
        semanticRedundancyCount++;
      } else {
        const conceptAdvance = prevNeed.primaryConcept !== visibleNeed.primaryConcept ? 0.35 : 0.15;
        const roleAdvance = role !== prevShot.visualRole ? 0.25 : 0.10;
        const usefulnessQuality = (judgment.editorialUsefulness?.communicationValue || 0.6) * 0.40;
        informationGain = Number((conceptAdvance + roleAdvance + usefulnessQuality).toFixed(2));
        semanticRedundancy = Number((1 - Math.min(1, informationGain)).toFixed(2));
      }

      // Track low information gain runs (Section 39)
      if (informationGain < 0.35) {
        currentLowInfoGainRun++;
        if (currentLowInfoGainRun > maxLowInfoGainRun) maxLowInfoGainRun = currentLowInfoGainRun;
        if (currentLowInfoGainRun >= 3) {
          warnings.push({
            code: 'low_information_gain_run',
            severity: 'warn',
            detail: `Run of ${currentLowInfoGainRun} consecutive shots with low information gain around shot index ${i}`,
            shotId: shot.id || shot.storyboardShotId,
          });
        }
      } else {
        currentLowInfoGainRun = 0;
      }

      const semanticContinuity = prevNeed.primaryConcept === visibleNeed.primaryConcept ? 0.90 : 0.65;
      const visualNovelty = prevSubject !== currSubject ? 0.85 : 0.40;
      const narrativeProgression = (role !== prevShot.visualRole) ? 0.90 : 0.50;
      const styleCompatibility = 0.90;
      const formatContinuity = 1.0;

      const transitionSemanticScore = Number((
        semanticContinuity * 0.40 +
        (classification === 'DIRECT' && prevJudg.classification === 'DIRECT' ? 0.95 : 0.60) * 0.30 +
        visualNovelty * 0.15 +
        narrativeProgression * 0.15
      ).toFixed(2));

      transitions.push({
        fromShotId: prevShot.id || prevShot.storyboardShotId,
        toShotId: shot.id || shot.storyboardShotId,
        transitionSemanticScore,
        semanticContinuity,
        visualNovelty,
        narrativeProgression,
        styleCompatibility,
        formatContinuity,
        informationGain,
        semanticRedundancy,
      });

      // Erratic jump detection: if adjacent shots have completely disparate subjects and both are metaphorical/weak
      if ((prevJudg.classification === 'METAPHORICAL' || prevJudg.classification === 'ACCIDENTAL') &&
          (classification === 'METAPHORICAL' || classification === 'ACCIDENTAL')) {
        warnings.push({
          code: 'sequence_semantic_jump',
          severity: 'warn',
          detail: `Erratic transition between disparate non-direct shots: "${prevSubject}" → "${currSubject}"`,
          shotId: shot.id || shot.storyboardShotId,
        });
      }

      // Unjustified domain jump detection
      const prevDomain = getDomain(`${prevSubject} ${prevInspection.primarySubject || ''} ${prevNeed.subject || ''}`);
      const currDomain = getDomain(`${currSubject} ${inspection.primarySubject || ''} ${visibleNeed.subject || ''}`);
      const isUnjustifiedDomainJump = prevDomain !== 'GENERAL' && currDomain !== 'GENERAL' && prevDomain !== currDomain &&
        (prevJudg.classification !== 'DIRECT' || classification !== 'DIRECT');

      if (isUnjustifiedDomainJump) {
        warnings.push({
          code: 'unjustified_domain_jump',
          severity: 'warn',
          detail: `Unjustified domain jump between shot ${prevShot.id || prevShot.storyboardShotId} (${prevDomain}) and ${shot.id || shot.storyboardShotId} (${currDomain})`,
          shotId: shot.id || shot.storyboardShotId,
        });
      }
    }

    // Generic stock run tracking (Section 29)
    const isGenericStock = (judgment.genericness >= 0.50) ||
      (judgment.editorialUsefulness?.genericness >= 0.50) ||
      /generic|office|business\s+team|smiling|colleagues|scientist\s+with\s+clipboard/i.test(`${asset.label || ''} ${shot.visualConcept || ''}`);
    if (isGenericStock) {
      genericStockCount++;
      currentGenericStockRun++;
      if (currentGenericStockRun > maxGenericStockRun) maxGenericStockRun = currentGenericStockRun;
      if (currentGenericStockRun >= 3) {
        warnings.push({
          code: 'generic_stock_run',
          severity: 'warn',
          detail: `Run of ${currentGenericStockRun} consecutive generic stock shots around shot index ${i}`,
          shotId: shot.id || shot.storyboardShotId,
        });
      }
    } else {
      currentGenericStockRun = 0;
    }

    // Subject tracking for diversity
    const subject = asset.label || visibleNeed.subject || shot.visualConcept || '';
    if (subject) {
      subjectDistribution[subject] = (subjectDistribution[subject] || 0) + 1;
    }
  }

  // 2. Metaphor run detection (Part 36, 83)
  if (['TECHNICAL_EXPLAINER', 'DOCUMENTARY', 'TUTORIAL'].includes(editorialMode) && maxMetaphorRun >= 3) {
    warnings.push({
      code: 'metaphor_run',
      severity: 'warn',
      detail: `Detected ${maxMetaphorRun} consecutive metaphorical shots in technical/documentary video`,
    });
  }

  // 3. Layered media overuse detection
  if (maxLayeredRun >= 2) {
    warnings.push({
      code: 'layered_media_overuse',
      severity: 'warn',
      detail: `Detected ${maxLayeredRun} consecutive LAYERED_MEDIA shots; consider reselecting assets to avoid blurred background overuse`,
    });
  }

  // 4. Hook Quality Evaluation (Part 26, 57)
  const hookJudgment = editorialJudgments[shots[0]?.id] || editorialJudgments[shots[0]?.storyboardShotId] || {};
  if (hookJudgment.classification === 'WRONG' || hookJudgment.classification === 'ACCIDENTAL') {
    warnings.push({
      code: 'weak_hook_visual',
      severity: 'error',
      detail: `Hook shot visual match classified as ${hookJudgment.classification}`,
      shotId: shots[0]?.id,
    });
  }

  // 5. Ending Quality Evaluation (Part 27, 58)
  const lastShot = shots[shots.length - 1];
  const endingJudgment = editorialJudgments[lastShot?.id] || editorialJudgments[lastShot?.storyboardShotId] || {};
  if (endingJudgment.classification === 'WRONG' || endingJudgment.classification === 'ACCIDENTAL') {
    warnings.push({
      code: 'weak_ending_visual',
      severity: 'error',
      detail: `Ending payoff shot visual match classified as ${endingJudgment.classification}`,
      shotId: lastShot?.id,
    });
  }

  const totalShots = Math.max(1, shots.length);
  const directMatchRatio = Number((directCount / totalShots).toFixed(2));
  const contextualMatchRatio = Number((contextualCount / totalShots).toFixed(2));
  const metaphoricalMatchRatio = Number((metaphoricalCount / totalShots).toFixed(2));
  const genericStockRatio = Number((genericStockCount / totalShots).toFixed(2));
  const layeredMediaRatio = Number((layeredCount / totalShots).toFixed(2));

  // Determine overall sequence verdict (Sections 28, 29, 39, 41)
  const hasErrors = warnings.some((w) => w.severity === 'error') || wrongCount > 0 || accidentalCount > 0 || distractingAssetCount > 0;
  const isStrong = !hasErrors && warnings.filter((w) => w.severity === 'error').length === 0 &&
    directMatchRatio >= 0.50 &&
    editorialWeaknessCount === 0 &&
    maxLowInfoGainRun < 3 &&
    genericStockRatio <= 0.30;
  const isAcceptable = !hasErrors && (directMatchRatio + contextualMatchRatio >= 0.70) && weakCriticalShotCount === 0;

  const verdict = hasErrors ? 'FAILED' : isStrong ? 'STRONG' : isAcceptable ? 'ACCEPTABLE' : 'WEAK';

  return {
    verdict,
    totalShots,
    assignedRoles,
    transitions,
    metrics: {
      directMatchCount: directCount,
      contextualMatchCount: contextualCount,
      metaphoricalMatchCount: metaphoricalCount,
      metaphoricalCount,
      consecutiveMetaphoricalShots: maxMetaphorRun,
      accidentalRejectedCount: accidentalCount,
      wrongRejectedCount: wrongCount,
      directMatchRatio,
      contextualMatchRatio,
      metaphoricalMatchRatio,
      genericStockCount,
      genericStockRatio,
      genericStockRun: maxGenericStockRun,
      lowInformationGainRun: maxLowInfoGainRun,
      semanticRedundancyCount,
      editorialWeaknessCount,
      distractingAssetCount,
      weakCriticalShotCount,
      layeredMediaCount: layeredCount,
      layeredMediaRatio,
      videoAssetCount: videoCount,
      imageAssetCount: imageCount,
      maxRoleRun,
      maxMetaphorRun,
      maxLayeredRun,
      roleDistribution,
    },
    warnings,
    summary: `Sequence reviewed across ${totalShots} shots: ${directCount} direct, ${contextualCount} contextual, ${metaphoricalCount} metaphorical. Editorial weaknesses: ${editorialWeaknessCount}, generic stock: ${genericStockCount}. Verdict: ${verdict}`,
  };
}
