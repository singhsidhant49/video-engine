/**
 * Visual Coverage Diagnostics & Perceptual Quality Engine.
 * 
 * Audits every scene and shot in the final timeline:
 * 1. Categorizes visual representation quality: DIRECT, SUPPORTIVE, WEAK, or UNRESOLVED.
 * 2. Detects perceptually blank frames (frames where background texture exists but no meaningful content).
 * 3. Enforces text safe area fitting and content grounding.
 * 4. Tracks explanatory primitive distribution.
 */

export const COVERAGE_STATUS = {
  DIRECT: 'DIRECT',           // Visual directly explains / demonstrates the concept (Code, Diagram, Chart, Map, Compare, Doc, Subject Media)
  SUPPORTIVE: 'SUPPORTIVE',   // Visual reinforces context or tone (Atmospheric Media, Structured List)
  WEAK: 'WEAK',               // Generic typography card or floating isolated noun
  UNRESOLVED: 'UNRESOLVED',   // Missing data, empty canvas, or plain ground
};

/**
 * Evaluates the visual coverage quality of every clip and shot in the timeline.
 * 
 * @param {Object} timeline - Compiled Remotion timeline
 * @param {Array<Object>} [coveragePlan] - Authored VisualCoveragePlan
 * @returns {Object} Comprehensive visual coverage diagnostics
 */
export function buildVisualCoverageDiagnostics(timeline, coveragePlan = []) {
  const clips = timeline.clips || [];
  const fps = timeline.fps || 30;

  const sceneEvaluations = [];
  let directCount = 0;
  let supportiveCount = 0;
  let weakCount = 0;
  let unresolvedCount = 0;
  let perceptuallyBlankFrames = 0;

  const representationCounts = {
    media: 0,
    diagram: 0,
    code: 0,
    ui: 0,
    chart: 0,
    map: 0,
    timeline: 0,
    document: 0,
    comparison: 0,
    typography: 0,
    unresolved: 0,
  };

  const textOverflowWarnings = [];
  const textGroundingWarnings = [];
  const subjectOcclusionWarnings = [];
  const fallbackReasonDistribution = {};

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const family = clip.family || '';
    const variant = clip.variant || '';
    const overlay = clip.overlay || {};
    const hasMedia = Boolean(clip.shots?.some((s) => s.asset?.src));
    const coverageItem = coveragePlan.find((c) => c.sceneId === clip.sceneId);

    // Track recasts / fallback reasons
    if (clip.recasts?.length) {
      for (const r of clip.recasts) {
        fallbackReasonDistribution[r] = (fallbackReasonDistribution[r] || 0) + 1;
      }
    }

    let status = COVERAGE_STATUS.DIRECT;
    let repType = 'typography';

    if (family === 'image' || family === 'montage') {
      repType = 'media';
      representationCounts.media++;
      status = hasMedia ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.WEAK;
      // Check subject occlusion if text is rendered directly over hero photo
      if (hasMedia && overlay.headline && variant === 'full') {
        subjectOcclusionWarnings.push({
          sceneId: clip.sceneId,
          warning: 'Headline over full-frame image may partially occlude focal subject; verify negative space',
        });
      }
    } else if (family === 'code') {
      repType = 'code';
      representationCounts.code++;
      status = overlay.code ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'ui') {
      repType = 'ui';
      representationCounts.ui++;
      status = (overlay.fileTree || overlay.title) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'diagram') {
      repType = 'diagram';
      representationCounts.diagram++;
      status = (overlay.nodes?.length >= 2) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'map') {
      repType = 'map';
      representationCounts.map++;
      status = (overlay.regions?.length >= 2) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'chart' || family === 'stat') {
      repType = 'chart';
      representationCounts.chart++;
      status = (overlay.values?.length || overlay.value) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'timeline') {
      repType = 'timeline';
      representationCounts.timeline++;
      status = (overlay.events?.length) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'compare' || family === 'comparison') {
      repType = 'comparison';
      representationCounts.comparison++;
      status = (overlay.left && overlay.right) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'process') {
      repType = 'diagram';
      representationCounts.diagram++;
      status = (overlay.steps?.length || overlay.nodes?.length) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'document') {
      repType = 'document';
      representationCounts.document++;
      status = (overlay.headline || hasMedia) ? COVERAGE_STATUS.DIRECT : COVERAGE_STATUS.UNRESOLVED;
    } else if (family === 'list') {
      repType = 'diagram';
      representationCounts.diagram++;
      status = (overlay.items?.length >= 2) ? COVERAGE_STATUS.SUPPORTIVE : COVERAGE_STATUS.WEAK;
    } else if (family === 'ground') {
      repType = 'unresolved';
      representationCounts.unresolved++;
      status = COVERAGE_STATUS.UNRESOLVED;
      perceptuallyBlankFrames += clip.durationInFrames;
    } else {
      // Typography (statement, chapter, quote)
      repType = 'typography';
      representationCounts.typography++;
      if (coverageItem?.informationType === 'emphasis') {
        status = COVERAGE_STATUS.SUPPORTIVE;
      } else {
        // Fallback typography card where explanatory visual was expected
        status = COVERAGE_STATUS.WEAK;
      }
    }

    // Text fitting validation: check headline length and line limits (Requirement 22)
    if (overlay.headline && overlay.headline.length > 80) {
      textOverflowWarnings.push({
        sceneId: clip.sceneId,
        length: overlay.headline.length,
        text: overlay.headline,
        warning: 'Headline exceeds 80 characters (max 2 lines safe budget); risk of visual clipping',
      });
    }

    // Text grounding validation: check if on-screen text corresponds to scene narration (Requirement 23 & 24)
    const onScreenText = overlay.headline || (overlay.words || []).join(' ') || overlay.title || '';
    const narrationText = (clip.narration || coverageItem?.narration || '').toLowerCase();
    if (onScreenText && narrationText) {
      const textWords = onScreenText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
      if (textWords.length > 0) {
        const matches = textWords.filter((w) => narrationText.includes(w));
        // If none of the substantial words match narration text, flag for review
        if (matches.length === 0 && !narrationText.includes(onScreenText.toLowerCase())) {
          textGroundingWarnings.push({
            sceneId: clip.sceneId,
            onScreenText,
            narrationSnippet: narrationText.slice(0, 60),
            sourceType: 'unmatched_phrase',
            warning: `On-screen text "${onScreenText}" has no lexical match with current scene narration`,
          });
        }
      }
    }

    if (status === COVERAGE_STATUS.DIRECT) directCount++;
    else if (status === COVERAGE_STATUS.SUPPORTIVE) supportiveCount++;
    else if (status === COVERAGE_STATUS.WEAK) weakCount++;
    else unresolvedCount++;

    sceneEvaluations.push({
      sceneId: clip.sceneId,
      family,
      variant,
      representation: repType,
      coverageStatus: status,
      durationSec: Number((clip.durationInFrames / fps).toFixed(2)),
      hasMedia,
    });
  }

  const totalScenes = clips.length;
  const directRatio = totalScenes > 0 ? Number((directCount / totalScenes).toFixed(2)) : 0;
  const weakRatio = totalScenes > 0 ? Number((weakCount / totalScenes).toFixed(2)) : 0;

  // Exact shape required by Requirement 40
  const representationDistribution = {
    ...representationCounts,
    diagramCount: representationCounts.diagram,
    chartCount: representationCounts.chart,
    uiCount: representationCounts.ui,
    codeCount: representationCounts.code,
    mediaCount: representationCounts.media,
    documentCount: representationCounts.document,
    typographyCount: representationCounts.typography,
  };

  return {
    totalScenes,
    directCoverageCount: directCount,
    supportiveCoverageCount: supportiveCount,
    weakCoverageCount: weakCount,
    unresolvedCount,
    directRatio,
    weakRatio,
    perceptuallyBlankFrames,
    perceptuallyBlankSeconds: Number((perceptuallyBlankFrames / fps).toFixed(2)),
    representationDistribution,
    sceneEvaluations,
    textOverflowWarnings,
    textGroundingWarnings,
    subjectOcclusionWarnings,
    fallbackReasonDistribution,
    isProductionReady: unresolvedCount === 0 && perceptuallyBlankFrames < fps * 2 && weakRatio <= 0.40,
  };
}
