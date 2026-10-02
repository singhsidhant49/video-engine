import { getStyle, buildPalette } from '../shared/styles.js';
import { buildCaptionChunks, tokenizeScript } from '../services/alignmentService.js';
import { resolveShotTiming } from './shotTimingResolver.js';
import { createPresentationMemory, realizeSceneShots } from './visualRealizationDirector.js';
import { generateDuckingEnvelope } from '../audio/duckingEngine.js';
import { authorSoundDesign } from '../audio/soundDesign.js';
import { synthesizeProceduralData } from '../storyboard/visualCoveragePlan.js';
import { compileSolvedProcessShot } from '../composition/compileSolvedProcessShot.js';
import { compileSolvedComparisonShot } from '../composition/compileSolvedComparisonShot.js';
import { compileSolvedChartShot } from '../composition/compileSolvedChartShot.js';
import { compileSolvedMediaShot } from '../composition/compileSolvedMediaShot.js';
import { buildMediaCompositionDiagnostics } from '../qc/mediaCompositionDiagnostics.js';
import { createFormatLayoutContext } from '../composition/layout/formatContext.js';
import { continuityCompatibility } from '../qc/editorialVisualQualityGate.js';
import { resolveVisualPolicy } from '../config/visualMode.js';
import { createEditorialVisualBeat, createMediaShotPlan } from './mediaEditorialPlanner.js';
import { analyzeSubtitleContrast } from '../composition/mediaSceneSpec.js';

/**
 * Timeline Director: plan + Visual Director specs + timed words + assets →
 * timeline (the edit decision list).
 *
 * The Visual Director has already chosen family, variant, camera language and
 * treatment per scene; this stage turns those decisions into frames:
 * absolute clip ranges (transition overlap compensated so picture and voice
 * never drift), camera paths per sub-shot, image sequences cut on phrase
 * boundaries, word-anchored reveal frames, caption chunks and when captions
 * yield, SFX placement and music ducking. Remotion just draws timeline.json.
 */

// Families that are drawn over a full-frame photograph when one is available.
// Families whose on-screen text is large enough that captions should step aside.
const CAPTION_YIELD = new Set(['statement', 'chapter', 'quote', 'stat', 'process', 'timeline', 'list', 'compare', 'code', 'ui', 'diagram', 'map', 'document']);

// burn (film light leak) and iris (circle reveal) are adapted from the MIT-licensed RVE templates.
const TRANSITION_FRAMES = { cut: 0, dissolve: 14, push: 12, whip: 9, zoom: 12, wipe: 12, dip: 14, flash: 6, burn: 24, iris: 16 };
const OVERLAY_TRANSITIONS = new Set(['dip', 'flash', 'burn']);
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'at', 'by', 'or', 'is', 'are', 'was', 'its', 'it', 'this', 'that']);

const TRANSITION_REASON = Object.freeze({
  NEW_IDEA: 'newIdea', NEW_EVIDENCE: 'newEvidence', NEW_ENTITY: 'newEntity', COMPARISON_PIVOT: 'comparisonPivot',
  REVEAL: 'reveal', SECTION_CHANGE: 'sectionChange', DETAIL_CHANGE: 'detailChange', CONTINUATION: 'continuation',
});

function transitionReasonFor(scene, previous) {
  if (!previous) return TRANSITION_REASON.NEW_IDEA;
  if (scene.section) return TRANSITION_REASON.SECTION_CHANGE;
  if (scene.purpose === 'evidence') return TRANSITION_REASON.NEW_EVIDENCE;
  if (scene.purpose === 'contrast' || scene.kind === 'comparison') return TRANSITION_REASON.COMPARISON_PIVOT;
  if (scene.purpose === 'reveal' || scene.purpose === 'payoff') return TRANSITION_REASON.REVEAL;
  const entity = scene.entity?.name, previousEntity = previous.entity?.name;
  if (entity && previousEntity && entity !== previousEntity) return TRANSITION_REASON.NEW_ENTITY;
  if (scene.continuity === 'continue') return TRANSITION_REASON.CONTINUATION;
  if (scene.sourceSceneIds?.some((id) => previous.sourceSceneIds?.includes(id))) return TRANSITION_REASON.DETAIL_CHANGE;
  return TRANSITION_REASON.NEW_IDEA;
}

function transitionAnchorFor(scene, previous) {
  if (!previous) return null;
  const entity = scene.entity?.name, previousEntity = previous.entity?.name;
  if (entity && entity === previousEntity) return { type: 'entity', value: entity };
  const currentConcepts = new Set((scene.storyboardShots || []).flatMap((shot) => significantTokens(shot.visualConcept || '')));
  const shared = (previous.storyboardShots || []).flatMap((shot) => significantTokens(shot.visualConcept || '')).find((token) => currentConcepts.has(token));
  return shared ? { type: 'concept', value: shared } : null;
}

function transitionPolicyFor(type, anchor) {
  // Requirement 27 & 28: Require identifiable anchor; broad concept token does not qualify.
  const validMatchMoveAnchor = anchor && ['entity', 'subject', 'detail', 'screen_region', 'location'].includes(anchor.type);
  if (validMatchMoveAnchor && type === 'cut') return 'MATCH_MOVE';
  return ({ cut: 'CUT', dissolve: 'SHORT_DISSOLVE', push: 'PUSH', wipe: 'WIPE' })[type] || 'CUT';
}

function imageBehaviorFor(shot, asset) {
  if (shot.family === 'montage') return 'MONTAGE';
  if (shot.family !== 'image') return null;
  if (asset?.type === 'video') return 'STATIC';
  const move = shot.presentation?.cameraMove || shot.move?.type || 'static';
  if (move === 'detailCrop') return 'DETAIL_CROP';
  if (move === 'pan') return 'FOCAL_PAN';
  if (move === 'subtlePush' || move === 'push') return 'SUBTLE_PUSH';
  if (move === 'subtlePull' || move === 'pull') return 'SUBTLE_PULL';
  return 'STATIC';
}

function captionPolicyFor(shot, captionGeometry, viewport) {
  const integrated = shot.renderMode === 'solved' && shot.family === 'process';
  const lowerSubject = shot.family === 'image' && (shot.asset?.focal?.y ?? 0) > 0.6;
  const busy = ['diagram', 'chart', 'stat', 'compare', 'timeline', 'ui', 'code', 'map', 'document'].includes(shot.family);
  const mode = integrated ? 'INTEGRATED' : busy ? 'COMPACT' : 'NORMAL';
  const raised = lowerSubject || busy;
  let raisedY = captionGeometry.y - Math.round(captionGeometry.height * 0.72);
  if (lowerSubject) raisedY = Math.min(raisedY, shot.asset.focal.y * viewport.height - captionGeometry.height - 24);
  const geometry = raised ? { ...captionGeometry, y: Math.max(0, Math.round(raisedY)) } : captionGeometry;
  return { mode, geometry, equivalentOnScreenText: integrated, reason: integrated
    ? 'Process labels and support copy express the narrated semantic stages.'
    : busy ? 'Compact subtitles preserve narration without covering dense visual content.'
      : lowerSubject ? 'Caption raised to avoid a lower-frame focal subject.' : 'Standard phrase subtitle.' };
}

const SOLVED_COMPILERS = Object.freeze({
  process: compileSolvedProcessShot,
  comparison: compileSolvedComparisonShot,
  chart: compileSolvedChartShot,
  media: compileSolvedMediaShot,
});

function solvedRepresentationFor(presentation, editorialPlan) {
  const selected = editorialPlan?.selectedRepresentation;
  if (selected === 'comparison' || selected === 'compare') return 'comparison';
  if (selected === 'chart' || selected === 'process') return selected;
  if (presentation.family === 'compare') return 'comparison';
  if (presentation.family === 'chart' || presentation.family === 'process') return presentation.family;
  if (presentation.family === 'image' || presentation.family === 'montage') return 'media';
  return null;
}

function solvedFamilyEnabled(representation) {
  if (process.env.USE_SOLVED_COMPOSITION === 'false') return false;
  const key = `USE_SOLVED_${representation.toUpperCase()}_COMPOSITION`;
  return process.env[key] !== 'false';
}

function backgroundForSolvedFamily(representation, recent) {
  const choices = representation === 'comparison' ? ['softRadial', 'charcoal']
    : representation === 'chart' ? ['neutralDark', 'subtleTexture']
      : representation === 'media' ? ['charcoal', 'neutralDark'] : ['technicalGrid', 'charcoal'];
  return recent.slice(-2).every((item) => item === choices[0]) ? choices[1] : choices[0];
}

export function rngFrom(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Map each scene to its [firstWord, lastWord] index range in the full script word list. */
export function sceneWordRanges(scenes) {
  const ranges = [];
  let cursor = 0;
  for (const s of scenes) {
    const n = tokenizeScript(s.narration).length;
    ranges.push([cursor, cursor + n - 1]);
    cursor += n;
  }
  return ranges;
}

function significantTokens(text) {
  return tokenizeScript(text).flatMap((w) => w.norm).filter((t) => !STOPWORDS.has(t));
}

/** Frame (absolute) at which `text` starts being spoken inside `words`, searching from `afterIndex`. */
function anchorFrame(words, text, afterIndex = 0) {
  const target = significantTokens(text);
  if (!target.length) return null;
  for (let i = afterIndex; i < words.length; i++) {
    const toks = words[i].norm;
    if (toks.some((t) => target.slice(0, 2).includes(t))) return { frame: words[i].startFrame, index: i };
  }
  return null;
}

// ─── Camera paths ──────────────────────────────────────────────────────────

/**
 * A move is a focus path through the image (normalised image coords) plus a
 * zoom curve. The renderer keeps the focus point centred (clamped so the
 * image always covers the frame), so pans genuinely travel across the photo.
 */

// ─── Bed (A-roll) shots inside one clip ────────────────────────────────────

/* Legacy scene-level bed splitting is intentionally disabled by Milestone 3.
function planBedShots({ clipFrom, clipDur, words, assets, spec, style, rng, state, fps, splitAt = null }) {
  const primary = assets?.primary;
  if (!primary) return null;
  const pool = [primary, ...(assets.alternates || [])];
  const maxHold = Math.round(style.pacing.maxHoldSec * fps);
  const minShot = Math.round(style.pacing.minShotSec * fps);
  // Motion footage holds longer than a still before it needs a cut.
  const hold = primary.type === 'video' ? maxHold * 1.6 : maxHold;
  const count = splitAt ? 1 : Math.max(1, Math.min(4, Math.ceil(clipDur / hold)));

  // Cut points snapped to word starts near even divisions, preferring phrase ends.
  const cuts = [];
  for (let k = 1; k < count; k++) {
    const ideal = clipFrom + (clipDur * k) / count;
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const f = words[i].startFrame;
      if (f - clipFrom < minShot || clipFrom + clipDur - f < minShot) continue;
      const cost = Math.abs(f - ideal) - (words[i - 1].endsPhrase ? fps * 0.6 : 0);
      if (!best || cost < best.cost) best = { f, cost };
    }
    if (best && (!cuts.length || best.f - cuts[cuts.length - 1] >= minShot)) cuts.push(best.f - 2);
  }
  const bounds = [clipFrom, ...cuts, clipFrom + clipDur];

  const shots = [];
  const used = new Map(); // asset index → seconds of footage already used
  for (let k = 0; k < bounds.length - 1; k++) {
    const dur = bounds[k + 1] - bounds[k];
    // Image sequence: cycle through distinct assets; with a single still, later shots are reframes.
    const idx = k % pool.length;
    const asset = pool[idx];
    const repeat = k >= pool.length;
    let type;
    if (asset.type === 'video') type = 'push';
    else if (repeat) type = 'reframe';
    else {
      const moves = spec.camera.moves;
      type = moves[(state.moveCursor++) % moves.length];
      if (type === state.lastMove && moves.length > 1) type = moves[(state.moveCursor++) % moves.length];
      // Honour the requested behaviour, but never the same move three times running.
      const h = state.history || [];
      if (h.length >= 2 && h[h.length - 1] === type && h[h.length - 2] === type) {
        const alt = style.motion.moves.find((m) => m !== type) || 'drift';
        type = type === 'push' ? (alt === 'pull' ? 'drift' : alt) : alt;
      }
    }
    state.history = [...(state.history || []), type].slice(-4);
    if (type === 'pan' || type === 'tilt' || type === 'drift') state.flip = !state.flip;
    state.lastMove = type;
    const shot = {
      from: bounds[k] - clipFrom,
      durationInFrames: dur,
      type: asset.type || 'image',
      src: asset.src,
      width: asset.width,
      height: asset.height,
      source: asset.source,
      tier: asset.tier,
      generic: asset.generic,
      focal: asset.focal,
      focusBox: asset.focusBox || null,
      move: asset.type === 'video'
        ? { type: 'push', scale: [1.0, +(1 + spec.camera.magnitude * 0.5).toFixed(4)], focus: [[0.5, 0.5], [0.5, 0.48]] }
        : cameraMove(type, asset.focal, spec.camera.magnitude, rng, state.flip, spec.camera.baseScale),
    };
    if (asset.type === 'video') {
      const offset = used.get(idx) || 0;
      const room = Math.max(0, asset.duration - dur / fps - 0.2);
      shot.clipStart = +Math.min(offset, room).toFixed(3);
      used.set(idx, shot.clipStart + dur / fps);
    }
    shots.push(shot);
  }
  return shots;
}
*/

// ─── Family-specific overlay props (reveal frames relative to clip start) ──

function overlayFor(family, scene, ctx) {
  const { words, clipFrom, clipDur, fps, assets } = ctx;
  const rel = (abs) => Math.max(0, Math.min(clipDur - 1, abs - clipFrom));
  const emphasisAt = scene.emphasis ? anchorFrame(words, scene.emphasis) : null;
  const settle = Math.round(fps * 0.35);

  const sequential = (texts, lockToVoice = false) => {
    // Reveal each item when it is spoken; otherwise distribute across the first 70% of the clip.
    let after = 0;
    const found = texts.map((t) => {
      const a = anchorFrame(words, t, after);
      if (a) after = a.index + 1;
      return a ? rel(a.frame) - 3 : null;
    });
    // Function words ("the", "a") have nothing to anchor to: they arrive with the next anchored word.
    for (let k = found.length - 2; k >= 0; k--) {
      if (found[k] == null && !significantTokens(texts[k]).length && found[k + 1] != null) found[k] = found[k + 1];
    }
    const n = texts.length;
    const lo = settle, hi = Math.max(lo + n, Math.round(clipDur * 0.7));
    let last = -Infinity;
    return found.map((f, i) => {
      const fallback = Math.round(lo + ((hi - lo) * i) / Math.max(1, n - 1 || 1));
      // The first item is on screen almost immediately so a graphic never opens empty.
      // Lists/processes open with their first item on screen; kinetic statements stay locked to the voice.
      const at = i === 0 && !lockToVoice ? Math.min(f ?? settle, settle + 6) : Math.max(f ?? fallback, i === 0 ? 0 : last + (found[i] === found[i - 1] && f != null ? 0 : Math.round(fps * 0.3)));
      last = at;
      return at;
    });
  };

  const entityLabel = scene.entity?.name && scene.kind === 'subject' ? scene.entity.name : null;
  switch (family) {
    case 'image': {
      const focusAt = scene.focus ? anchorFrame(words, scene.focus) : null;
      return {
        variant: ctx.spec.variant,
        kicker: scene.text?.kicker || entityLabel || null,
        headline: ctx.spec.treatment === 'quiet' ? null : scene.text?.headline || null,
        kickerAt: settle,
        headlineAt: emphasisAt ? rel(emphasisAt.frame) : settle + 8,
        // Annotated variant: ring the focal subject when it is named (or shortly after the cut).
        label: ctx.spec.label,
        annotateAt: focusAt ? rel(focusAt.frame) : settle + Math.round(fps * 0.5),
        secondAt: Math.round(clipDur * 0.42),
        // Photo stack: each print lands on a phrase boundary where possible.
        stackAts: [settle, ...[0.34, 0.62].map((f) => {
          const target = clipFrom + clipDur * f;
          const w = words.find((x, k) => k > 0 && words[k - 1].endsPhrase && Math.abs(x.startFrame - target) < fps * 0.8);
          return rel(w ? w.startFrame : target);
        })],
      };
    }
    case 'stat': {
      const data = scene.data?.value ? scene.data : synthesizeProceduralData(scene, 'chart');
      const numAt = data.value ? anchorFrame(words, String(data.value)) : null;
      const at = rel((numAt || emphasisAt)?.frame ?? clipFrom + settle) - 4;
      return { ...data, variant: ctx.spec.variant, at: Math.max(4, at), countFrames: Math.round(fps * 0.9), kicker: scene.text?.kicker || null };
    }
    case 'statement': {
      const rawText = scene.text?.headline || scene.emphasis || scene.entity?.name || '';
      const tokens = rawText.split(/\s+/).filter(Boolean).slice(0, 7);
      const ats = sequential(tokens, true);
      return { words: tokens, ats, kicker: scene.text?.kicker || null };
    }
    case 'list': {
      const data = scene.data?.items ? scene.data : { title: scene.text?.headline || 'Key Principles', items: ['Analysis', 'Execution', 'Verification'] };
      return { title: data.title, items: data.items, ats: sequential(data.items, true) };
    }
    case 'process': {
      const data = scene.data?.steps ? scene.data : { steps: [{ title: 'Analyze' }, { title: 'Execute' }, { title: 'Verify' }] };
      return { steps: data.steps, ats: sequential(data.steps.map((s) => s.title), true) };
    }
    case 'timeline': {
      const data = scene.data?.events ? scene.data : { events: [{ date: 'Phase 1', label: 'Initiation' }, { date: 'Phase 2', label: 'Scale' }] };
      return { events: data.events, ats: sequential(data.events.map((e) => `${e.date} ${e.label}`)) };
    }
    case 'chart': {
      const data = scene.data?.values ? scene.data : synthesizeProceduralData(scene, 'chart');
      const arrive = emphasisAt ? rel(emphasisAt.frame) + 6 : Math.round(clipDur * 0.6);
      const drawFrames = Math.round(Math.max(fps * 1.2, Math.min(arrive - settle, clipDur * 0.75)));
      return { ...data, at: settle, drawFrames };
    }
    case 'compare': {
      const data = scene.data?.left && scene.data?.right ? scene.data : synthesizeProceduralData(scene, 'comparison');
      const rightAt = data.right?.title ? anchorFrame(words, data.right.title) : null;
      return { ...data, leftAt: 2, rightAt: rightAt ? Math.max(14, rel(rightAt.frame) - 3) : Math.round(clipDur * 0.4), withImage: Boolean(assets?.primary) };
    }
    case 'quote': {
      const wordsArr = (scene.data?.quote || scene.narration || '').split(/\s+/).slice(0, 14);
      return { ...scene.data, at: settle, authorAt: settle + Math.round(fps * 0.8), words: wordsArr, wordAts: sequential(wordsArr, true) };
    }
    case 'document': {
      const data = scene.data?.headline ? scene.data : synthesizeProceduralData(scene, 'document');
      return { ...data, at: 0, highlightAt: emphasisAt ? rel(emphasisAt.frame) : Math.round(clipDur * 0.35) };
    }
    case 'chapter':
      return { ...scene.data, at: settle };
    case 'ui': {
      const data = scene.data?.fileTree ? scene.data : synthesizeProceduralData(scene, 'ui');
      return { ...data, at: settle };
    }
    case 'code': {
      const data = scene.data?.code ? scene.data : synthesizeProceduralData(scene, 'code');
      return { ...data, at: settle, from: settle, to: Math.round(clipDur * 0.75) };
    }
    case 'diagram': {
      const data = scene.data?.nodes ? scene.data : synthesizeProceduralData(scene, 'diagram');
      return { ...data, at: settle };
    }
    case 'map': {
      const data = scene.data?.regions ? scene.data : synthesizeProceduralData(scene, 'map');
      return { ...data, at: settle };
    }
    default:
      return {};
  }
}

/** Typographic recast of a photo scene that had no acceptable image. */
function titleOverlay(scene) {
  const text = scene.text?.headline || scene.entity?.name || scene.text?.kicker || scene.emphasis || '';
  const words = text.split(/\s+/).slice(0, 6);
  return { words, ats: words.map((_, k) => 8 + k * 4), kicker: scene.text?.headline && scene.entity?.name ? scene.entity.name : scene.text?.kicker && scene.text?.kicker !== text ? scene.text.kicker : null };
}

// ─── Transitions ───────────────────────────────────────────────────────────

function chooseTransitions(plan, specs, style, fps, totalFrames, visualPolicy) {
  const minutes = totalFrames / fps / 60;
  let budget = Math.max(1, Math.ceil(Math.min(3, style.transitions.perMinute) * Math.max(minutes, 0.5)));
  const out = plan.scenes.map(() => 'cut');
  if (visualPolicy?.useMediaEditorial) return out;
  // Designed transitions are semantic punctuation, not decoration.
  plan.scenes.forEach((s, i) => {
    if (i === 0 || budget <= 0) return;
    const reason = transitionReasonFor(s, plan.scenes[i - 1]);
    if (reason === TRANSITION_REASON.SECTION_CHANGE) {
      out[i] = 'wipe';
      budget--;
    } else if (reason === TRANSITION_REASON.COMPARISON_PIVOT) {
      out[i] = 'push';
      budget--;
    }
  });
  // A reflective continuation can dissolve; same-subject/new-angle remains a cut.
  plan.scenes.forEach((s, i) => {
    if (i === 0 || out[i] !== 'cut' || budget <= 0) return;
    const bothPhotos = specs[i].family === 'image' && specs[i - 1].family === 'image';
    const soft = ['somber', 'reflective'].includes(s.tone) || s.treatment === 'quiet';
    const reason = transitionReasonFor(s, plan.scenes[i - 1]);
    if (bothPhotos && soft && s.intensity <= 3 && reason === TRANSITION_REASON.CONTINUATION) {
      out[i] = 'dissolve';
      budget--;
    }
  });
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function buildTimeline({ plan, specs, narration, assets, sfx, bgm, videoId, format, fps, audioSrc, coveragePlan = [], editorialVisualPlan = [], visualPolicy: suppliedVisualPolicy = null }) {
  const timelineStartedAt = performance.now();
  // Direct compiler callers retain the regression-compatible path; the production
  // pipeline always passes its centrally resolved (MEDIA_EDITORIAL by default) policy.
  const visualPolicy = suppliedVisualPolicy || resolveVisualPolicy({ visualMode: 'LEGACY_PROCEDURAL' });
  const style = getStyle(plan.style);
  const palette = buildPalette(plan.style, plan.hue);
  const durationSec = narration.durationInSeconds ?? narration.duration ?? narration.durationSec ?? (narration.words?.[narration.words.length - 1]?.end || 0);
  const totalFrames = narration.totalFrames ?? Math.ceil(durationSec * fps);
  const width = format === 'shorts' ? 1080 : 1920;
  const height = format === 'shorts' ? 1920 : 1080;
  const formatLayout = createFormatLayoutContext({ width, height, format, captionsEnabled: true });
  const coverageByShot = new Map(coveragePlan.map((item) => [item.shotId, item]));
  const editorialByShot = new Map(editorialVisualPlan.map((item) => [item.shotId, item]));
  const sceneCompositions = {};
  const comparisonSpecs = {};
  const chartSpecs = {};
  const mediaSceneSpecs = {};
  const editorialVisualBeats = {};
  const mediaShotPlans = {};
  const solvedScenes = {};
  const motionPlans = {};
  const visualQualityReviews = {};
  const frameStatePreflight = {};
  const compositionFallbacks = [];
  const mediaPerformance = [];
  const recentSolvedBackgrounds = [];
  const words = narration.words;
  const ranges = sceneWordRanges(plan.scenes);
  if (ranges.length && ranges[ranges.length - 1][1] !== words.length - 1) {
    throw new Error(`Script/word mismatch: scenes cover ${ranges[ranges.length - 1][1] + 1} words, narration has ${words.length}`);
  }

  // Cut points: in the pause before each sentence, a few frames before the voice starts.
  const cuts = plan.scenes.map((_, i) => {
    if (i === 0) return 0;
    const prevEnd = words[ranges[i - 1][1]].endFrame;
    const nextStart = words[ranges[i][0]].startFrame;
    return Math.max(prevEnd, Math.min(nextStart - 3, Math.round((prevEnd + nextStart) / 2)));
  });
  cuts.push(totalFrames);

  const transitions = chooseTransitions(plan, specs, style, fps, totalFrames, visualPolicy);
  const transitionQuality = transitions.map((type, index) => {
    const reason = transitionReasonFor(plan.scenes[index], plan.scenes[index - 1]);
    const anchor = transitionAnchorFor(plan.scenes[index], plan.scenes[index - 1]);
    const policy = transitionPolicyFor(type, anchor);
    const duration = TRANSITION_FRAMES[type] || 0;
    const anchorRequired = ['MATCH_MOVE', 'PUSH'].includes(policy);
    const valid = type === 'cut' || (Boolean(reason) && (!anchorRequired || Boolean(anchor)) && duration >= 6 && duration <= 24);
    if (!valid) transitions[index] = 'cut';
    return {
      requested: type.toUpperCase(), applied: valid ? policy : 'CUT', semanticReason: reason,
      anchor, durationInFrames: valid ? duration : 0, importantTextStable: true, captionStable: true,
      motionDirectionCompatible: valid, passed: valid, replacedWithCut: !valid,
      warnings: valid ? [] : [anchorRequired && !anchor ? 'missing_transition_anchor' : 'transition_quality_failure'],
    };
  });
  const presentationMemory = createPresentationMemory();
  const clips = [];
  const cutOverlays = visualPolicy.useMediaEditorial ? [] : [{ type: 'fadeIn', frame: 0, frames: Math.round(fps * 0.4) }, { type: 'fadeOut', frame: totalFrames, frames: Math.round(fps * 0.6) }];

  plan.scenes.forEach((scene, i) => {
    const spec = specs[i];
    const tin = transitions[i];
    const tout = transitions[i + 1] || 'cut';
    const overlapIn = OVERLAY_TRANSITIONS.has(tin) ? 0 : TRANSITION_FRAMES[tin];
    const overlapOut = OVERLAY_TRANSITIONS.has(tout) ? 0 : TRANSITION_FRAMES[tout];
    const from = cuts[i] - Math.floor(overlapIn / 2);
    const to = cuts[i + 1] + Math.ceil(overlapOut / 2);
    const clipDur = Math.max(1, Math.min(totalFrames, to) - Math.max(0, from));
    const clipFrom = Math.max(0, from);
    const sceneWords = words.slice(ranges[i][0], ranges[i][1] + 1);
    const sceneAssets = assets[scene.id] || { primary: null, alternates: [] };
    const transitionReason = transitionReasonFor(scene, plan.scenes[i - 1]);
    const transitionAnchor = transitionAnchorFor(scene, plan.scenes[i - 1]);
    const transitionPolicy = transitionPolicyFor(tin, transitionAnchor);

    const authoredShots = scene.storyboardShots || [];
    const timings = resolveShotTiming({
      scene,
      shots: authoredShots,
      alignedWords: sceneWords,
      sceneStart: clipFrom,
      sceneEnd: clipFrom + clipDur,
      fps,
    });
    const realized = realizeSceneShots({
      scene,
      spec,
      sceneAssets,
      timings,
      sectionId: scene.sectionId,
      memory: presentationMemory,
      coverageByShot,
      visualPolicy,
      format,
    });
    const texture = sceneAssets?.primary ? {
      src: sceneAssets.primary.src,
      type: sceneAssets.primary.type,
      width: sceneAssets.primary.width,
      height: sceneAssets.primary.height,
      focal: sceneAssets.primary.focal,
    } : null;
    const shots = realized.map((realizedShot) => {
      let { presentation, timing, asset } = realizedShot;
      const shotWords = sceneWords.filter((word) => word.startFrame < timing.endFrame && word.endFrame > timing.startFrame);
      const overlay = presentation.overlayMode === 'none'
        ? {}
        : presentation.family === 'statement' && presentation.variant === 'title'
          ? titleOverlay(scene)
          : overlayFor(presentation.family, scene, {
            words: shotWords.length ? shotWords : sceneWords,
            clipFrom: timing.startFrame,
            clipDur: timing.durationInFrames,
            fps,
            assets: sceneAssets,
            spec: { ...spec, variant: presentation.variant },
          });
      const timelineShot = {
        id: realizedShot.storyboardShotId,
        storyboardShotId: realizedShot.storyboardShotId,
        sceneId: realizedShot.sceneId,
        sectionId: realizedShot.sectionId,
        from: timing.startFrame - clipFrom,
        startFrame: timing.startFrame,
        endFrame: timing.endFrame,
        durationInFrames: timing.durationInFrames,
        role: realizedShot.role,
        visualIntent: realizedShot.visualIntent,
        visualConcept: realizedShot.visualConcept,
        mediaPreference: realizedShot.mediaPreference,
        evidenceRequirement: realizedShot.evidenceRequirement,
        family: presentation.family,
        variant: presentation.variant,
        layout: presentation.layout,
        presentation,
        asset: asset ? { ...asset } : null,
        assets: realizedShot.assets,
        move: realizedShot.move,
        overlay,
        renderMode: 'legacy',
        solvedSceneId: null,
        motionPlanId: null,
        visualQualityReviewId: null,
        mediaSceneSpecId: null,
        compositionFallback: null,
        transitionReason,
        transitionAnchor,
        transitionPolicy,
        imageBehavior: null,
        captionPolicy: null,
        continuityCompatibility: null,
      };
      const editorialPlan = editorialByShot.get(realizedShot.storyboardShotId);
      const visualBeat = visualPolicy.useMediaEditorial ? createEditorialVisualBeat({ shot: { ...timelineShot, entities: authoredShots.find((item) => item.id === timelineShot.storyboardShotId)?.entities || [] }, scene, timing, alignedWords: shotWords, visualChangeReason: transitionReason }) : null;
      if (visualBeat) editorialVisualBeats[visualBeat.id] = visualBeat;
      if (visualPolicy.useMediaEditorial && !asset) {
        timelineShot.unresolvedMedia = true;
        asset = {
          type: 'image',
          src: 'assets/unresolved_media.png',
          width,
          height,
          focal: { x: 0.5, y: 0.5 },
          label: `[UNRESOLVED_MEDIA] ${timelineShot.visualConcept || timelineShot.storyboardShotId}`,
          unresolved: true,
          tier: 'unresolved',
        };
        timelineShot.asset = asset;
      }
      const solvedRepresentation = visualPolicy.useMediaEditorial ? 'media' : solvedRepresentationFor(presentation, editorialPlan);
      if (solvedRepresentation && solvedFamilyEnabled(solvedRepresentation) && (editorialPlan || solvedRepresentation === 'media')) {
        const compiler = SOLVED_COMPILERS[solvedRepresentation];
        if (visualPolicy.useMediaEditorial && scene.kind === 'chapter') overlay.chapter = true;
        if (visualPolicy.useMediaEditorial && scene.kind === 'statistic' && scene.data?.value != null) {
          overlay.stat = String(scene.data.value);
          overlay.label = scene.data.label || scene.data.units || null;
        }
        let failureStage = `${solvedRepresentation}_compile`;
        try {
          const compiled = compiler({
            editorialPlan,
            overlay,
            alignedWords: shotWords.length ? shotWords : sceneWords,
            timing,
            format,
            width,
            height,
            styleId: plan.style,
            captionsEnabled: true,
            shot: timelineShot,
            asset,
            supportingAssets: realizedShot.assets || [],
            visualPolicy,
          });
          if (compiled.performance) mediaPerformance.push(compiled.performance);
          failureStage = 'frame_state_preflight';
          compiled.solvedScene.backgroundSelection = backgroundForSolvedFamily(solvedRepresentation, recentSolvedBackgrounds);
          recentSolvedBackgrounds.push(compiled.solvedScene.backgroundSelection);
          sceneCompositions[compiled.composition.shotId] = compiled.composition;
          if (compiled.comparisonSpec) comparisonSpecs[compiled.comparisonSpec.shotId] = compiled.comparisonSpec;
          if (compiled.chartSpec) chartSpecs[compiled.chartSpec.shotId] = compiled.chartSpec;
          if (compiled.mediaSceneSpec) mediaSceneSpecs[compiled.mediaSceneSpec.shotId] = compiled.mediaSceneSpec;
          solvedScenes[compiled.solvedScene.id] = compiled.solvedScene;
          motionPlans[compiled.motionPlan.id] = compiled.motionPlan;
          const qualityId = compiled.visualQuality ? `quality_${compiled.solvedScene.id}` : null;
          if (qualityId) visualQualityReviews[qualityId] = compiled.visualQuality;
          frameStatePreflight[compiled.preflight.shotId] = { ...compiled.preflight, visualQualityReviewId: qualityId, measurementCache: compiled.measurementCache };
          const qualityPassed = !compiled.visualQuality || compiled.visualQuality.publishable;
          if (compiled.preflight.passed && qualityPassed) {
            timelineShot.renderMode = 'solved';
            timelineShot.solvedSceneId = compiled.solvedScene.id;
            timelineShot.motionPlanId = compiled.motionPlan.id;
            timelineShot.visualQualityReviewId = qualityId;
            timelineShot.mediaSceneSpecId = compiled.mediaSceneSpec?.shotId || null;
            if (visualBeat && compiled.mediaSceneSpec) {
              const mediaShotPlan = createMediaShotPlan({ beat: visualBeat, mediaSceneSpec: compiled.mediaSceneSpec, solvedScene: compiled.solvedScene, shot: timelineShot, rejectedAlternatives: realizedShot.rejectedAlternatives, visualQuality: compiled.visualQuality });
              mediaShotPlans[mediaShotPlan.shotId] = mediaShotPlan;
            }
          } else {
            const first = compiled.preflight.hardFailures[0] || compiled.visualQuality?.warnings[0] || { code: 'unknown_preflight_failure' };
            failureStage = compiled.preflight.passed ? 'visual_quality_gate' : 'frame_state_preflight';
            const fallback = {
              shotId: realizedShot.storyboardShotId,
              representation: solvedRepresentation,
              failureStage,
              constraint: first.code,
              fallbackRenderer: solvedRepresentation === 'media' ? 'PhotoShot' : presentation.family === 'compare' ? 'CompareShot' : presentation.family === 'chart' ? 'ChartShot' : 'ProcessShot',
              reason: first.detail || (compiled.preflight.passed
                ? `Solved ${solvedRepresentation} failed editorial publishability: ${first.code}`
                : `Solved ${solvedRepresentation} failed hard preflight: ${first.code}`),
            };
            timelineShot.compositionFallback = fallback;
            compositionFallbacks.push(fallback);
            frameStatePreflight[compiled.preflight.shotId].legacyFallbackUsed = true;
            if (visualPolicy.useMediaEditorial) {
              timelineShot.unresolvedMedia = true;
              timelineShot.renderMode = 'solved';
              timelineShot.solvedSceneId = compiled.solvedScene.id;
              timelineShot.motionPlanId = compiled.motionPlan.id;
              timelineShot.visualQualityReviewId = qualityId;
              timelineShot.mediaSceneSpecId = compiled.mediaSceneSpec?.shotId || null;
            }
          }
        } catch (error) {
          const fallback = {
            shotId: realizedShot.storyboardShotId,
            representation: solvedRepresentation,
            failureStage,
            constraint: error?.issues?.[0]?.path?.join('.') || 'composition_compile_failure',
            fallbackRenderer: solvedRepresentation === 'media' ? 'PhotoShot' : presentation.family === 'compare' ? 'CompareShot' : presentation.family === 'chart' ? 'ChartShot' : 'ProcessShot',
            reason: error.message,
          };
          timelineShot.compositionFallback = fallback;
          compositionFallbacks.push(fallback);
          frameStatePreflight[realizedShot.storyboardShotId] = {
            shotId: realizedShot.storyboardShotId,
            passed: false,
            hardFailures: [{ code: 'composition_compile_failure', severity: 'hard', detail: error.message }],
            issues: [{ code: 'composition_compile_failure', severity: 'hard', detail: error.message }],
            legacyFallbackUsed: true,
            fallback,
          };
          if (visualPolicy.useMediaEditorial) {
            timelineShot.unresolvedMedia = true;
          }
        }
      }
      timelineShot.imageBehavior = imageBehaviorFor(timelineShot, asset);
      timelineShot.captionPolicy = captionPolicyFor(timelineShot, formatLayout.captionRegion, { width, height });
      if (timelineShot.renderMode === 'solved' && timelineShot.mediaSceneSpecId) {
        const solvedCaption = solvedScenes[timelineShot.solvedSceneId].captionBox;
        const spec = mediaSceneSpecs[timelineShot.mediaSceneSpecId];
        const contrastStyle = spec ? analyzeSubtitleContrast(spec.assets?.[0], format) : (format === 'landscape' ? 'CLEAN_TEXT' : 'CLEAN_TEXT');
        timelineShot.captionPolicy = {
          ...timelineShot.captionPolicy,
          style: contrastStyle,
          mode: contrastStyle === 'COMPACT_CAPSULE' ? 'COMPACT' : 'NORMAL',
          geometry: solvedCaption,
          reason: 'Solved media caption geometry avoids protected subject and Shorts UI regions.'
        };
      }
      return timelineShot;
    });
    const firstShot = shots[0];

    const layoutConstraints = {
      caption: {
        allowedRegions: format === 'shorts' ? ['bottom_center', 'bottom_left'] : ['bottom_left', 'bottom_center'],
        avoidRegions: format === 'shorts' ? ['center'] : ['center_right'],
        maxWidth: format === 'shorts' ? 920 : 1500,
      },
      headline: {
        allowedRegions: format === 'shorts' ? ['top_center', 'center'] : ['top_left', 'center_left'],
        maxLines: 2,
        maxCharactersPerLine: format === 'shorts' ? 18 : 28,
      },
    };

    clips.push({
      id: `c${String(i + 1).padStart(2, '0')}`,
      sceneId: scene.id,
      sectionId: scene.sectionId,
      kind: scene.kind,
      family: firstShot.family,
      variant: firstShot.variant,
      treatment: spec.treatment,
      recasts: spec.recasts,
      accents: spec.accents,
      stack: null,
      intensity: scene.intensity,
      from: clipFrom,
      durationInFrames: clipDur,
      cutAt: cuts[i] - clipFrom,
      enter: { type: overlapIn ? tin : 'cut', frames: overlapIn },
      exit: { type: overlapOut ? tout : 'cut', frames: overlapOut },
      transitionReason,
      transitionAnchor,
      transitionPolicy,
      bed: null,
      bedB: null,
      texture,
      overlay: firstShot.overlay,
      shots,
      layoutConstraints,
      narration: scene.narration,
      transitionQuality: transitionQuality[i],
    });
  });

  const allRealizedShots = clips.flatMap((clip) => clip.shots);
  allRealizedShots.forEach((shot, index) => {
    shot.continuityCompatibility = continuityCompatibility(allRealizedShots[index - 1], shot, { solvedScenes, motionPlans });
  });

  // Captions.
  const captionMode = visualPolicy.useMediaEditorial ? 'phrase' : format === 'landscape' && style.captions.mode === 'highlight' ? 'phrase' : style.captions.mode;
  const capLimits = format === 'shorts'
    ? (captionMode === 'highlight' ? { maxWords: 3, maxChars: 20 } : { maxWords: 5, maxChars: 30 })
    : { maxWords: 8, maxChars: 44 };
  const chunks = buildCaptionChunks(words, fps, capLimits).map((c) => ({ ...c, endFrame: Math.min(c.endFrame, totalFrames) }));
  const captionPolicies = clips.flatMap((clip) => clip.shots.map((shot) => ({
    shotId: shot.storyboardShotId,
    startFrame: clip.from + shot.from,
    endFrame: clip.from + shot.from + shot.durationInFrames,
    ...shot.captionPolicy,
  })));
  const captionsHidden = clips.flatMap((clip) => clip.shots
    .filter((shot) => ['INTEGRATED', 'HIDDEN'].includes(shot.captionPolicy?.mode))
    .map((shot) => [clip.from + shot.from, clip.from + shot.from + shot.durationInFrames]));

  // ─── Milestone 9 Dynamic BGM Ducking & Sound Design ───
  const bgmConfig = bgm ? {
    src: bgm.src,
    synthetic: bgm.synthetic,
    base: bgm.synthetic ? 0.12 : 0.18,
    ducked: bgm.synthetic ? 0.04 : 0.06,
  } : null;

  const duckingResult = generateDuckingEnvelope({
    words,
    clips,
    totalFrames,
    fps,
    bgm: bgmConfig || undefined,
  });

  const soundDesignResult = authorSoundDesign({
    clips,
    transitions,
    sfxPaths: sfx,
    fps,
    format,
  });

  // Speech intervals for backward compatibility / fallback
  const speech = [];
  for (const w of words) {
    const last = speech[speech.length - 1];
    if (last && w.startFrame - last[1] < fps * 0.5) last[1] = w.endFrame;
    else speech.push([w.startFrame, w.endFrame]);
  }

  const timeline = {
    version: 3,
    videoId,
    title: plan.title,
    format,
    fps,
    width,
    height,
    durationInFrames: totalFrames,
    style: plan.style,
    palette,
    visualMode: visualPolicy.visualMode,
    visualPolicy,
    artDirection: {
      palette,
      typeSystem: { display: style.fonts.display, text: style.fonts.text, mono: style.fonts.mono, displayWeight: style.display.weight, labelWeight: style.label.weight },
      spacing: formatLayout.spacingScale,
      surfaceTreatment: 'flat-editorial-fields',
      ruleStyle: { color: palette.line, accent: palette.accent, weight: style.chart?.stroke || 3 },
      accentBehavior: 'single-semantic-accent',
      backgroundLanguage: ['neutralDark', 'softRadial', 'subtleTexture', 'charcoal'],
      motionTemperament: { energy: style.motion.energy, reveal: style.motion.reveal, density: 'LOW_TO_MEDIUM' },
      captionStyle: { mode: style.captions.mode, weight: style.captions.weight, scale: style.captions.scale },
      typography: { display: style.fonts.display, text: style.fonts.text, mono: style.fonts.mono },
      accent: palette.accent,
      baseTone: palette.bg,
      textTreatment: 'minimal-over-media',
      chapterStyle: 'media-background-simple-type',
      annotationStyle: 'direct-evidence-pointer',
      transitionTemperament: 'cuts-first',
      mediaTreatment: 'natural-minimal-normalization',
    },
    clips,
    realizedShots: allRealizedShots,
    solvedScenes,
    motionPlans,
    visualQualityReviews,
    mediaSceneSpecs,
    editorialVisualBeats,
    mediaShotPlans,
    cutOverlays,
    captions: { mode: captionMode, chunks, hidden: captionsHidden, policies: captionPolicies, geometry: formatLayout.captionRegion },
    audio: {
      narration: audioSrc,
      bgm: bgmConfig,
      duckingEnvelope: duckingResult.envelope,
      sfx: soundDesignResult.events,
      speech,
      pauses: duckingResult.pauses,
      duckingDiagnostics: duckingResult.diagnostics,
      sfxDiagnostics: soundDesignResult.diagnostics,
    },
    compositionDiagnostics: {
      solvedProcessShotCount: Object.values(solvedScenes).filter((scene) => scene.topology === 'horizontal' || scene.topology === 'vertical').length,
      solvedComparisonCount: Object.values(solvedScenes).filter((scene) => ['dual-field', 'shared-baseline', 'spectrum', 'before-after', 'two-column-editorial', 'stacked-vertical'].includes(scene.topology)).length,
      solvedChartCount: Object.values(solvedScenes).filter((scene) => scene.chartCoordinateSystem != null).length,
      solvedMediaCount: Object.values(solvedScenes).filter((scene) => Object.keys(scene.mediaGeometry || {}).length > 0).length,
      legacyProcessFallbackCount: compositionFallbacks.filter((item) => item.representation === 'process').length,
      legacyComparisonFallbackCount: compositionFallbacks.filter((item) => item.representation === 'comparison').length,
      legacyChartFallbackCount: compositionFallbacks.filter((item) => item.representation === 'chart').length,
      legacyMediaFallbackCount: compositionFallbacks.filter((item) => item.representation === 'media').length,
      fallbackReasons: compositionFallbacks,
    },
    mediaCompositionDiagnostics: buildMediaCompositionDiagnostics({ shots: allRealizedShots, mediaSceneSpecs, visualQualityReviews, compositionFallbacks }),
    performance: {
      planningTimeMs: Number((performance.now() - timelineStartedAt).toFixed(3)),
      mediaSolveTimeMs: Number(mediaPerformance.reduce((sum, item) => sum + item.mediaSolveMs, 0).toFixed(3)),
      cameraSolveTimeMs: Number(mediaPerformance.reduce((sum, item) => sum + item.cameraSolveMs, 0).toFixed(3)),
      preflightTimeMs: Number(mediaPerformance.reduce((sum, item) => sum + item.preflightMs, 0).toFixed(3)),
      renderOverheadMs: null,
    },
  };
  Object.defineProperty(timeline, '_compositionArtifacts', {
    enumerable: false,
    value: { sceneCompositions, comparisonSpecs, chartSpecs, mediaSceneSpecs, editorialVisualBeats, mediaShotPlans, solvedScenes, motionPlans, visualQualityReviews, frameStatePreflight, compositionFallbacks, mediaCompositionDiagnostics: timeline.mediaCompositionDiagnostics },
  });
  return timeline;
}
