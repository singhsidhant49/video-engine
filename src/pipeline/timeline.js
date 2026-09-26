import { getStyle, buildPalette } from '../shared/styles.js';
import { buildCaptionChunks, tokenizeScript } from '../services/alignmentService.js';

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
const BED_FAMILIES = new Set(['image', 'stat', 'statement', 'quote', 'chapter', 'ui', 'compare']);
// Families whose on-screen text is large enough that captions should step aside.
const CAPTION_YIELD = new Set(['statement', 'chapter', 'quote']);

// burn (film light leak) and iris (circle reveal) are adapted from the MIT-licensed RVE templates.
const TRANSITION_FRAMES = { cut: 0, dissolve: 14, push: 12, whip: 9, zoom: 12, wipe: 12, dip: 14, flash: 6, burn: 24, iris: 16 };
const OVERLAY_TRANSITIONS = new Set(['dip', 'flash', 'burn']);
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'at', 'by', 'or', 'is', 'are', 'was', 'its', 'it', 'this', 'that']);

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
function cameraMove(type, focal, magnitude, rng, flip, base = 1) {
  const m = rawMove(type, focal, magnitude, rng, flip);
  return { ...m, scale: m.scale.map((v) => +(v * base).toFixed(4)) };
}

function rawMove(type, focal, magnitude, rng, flip) {
  const f = focal || { x: 0.5, y: 0.45 };
  const d = 0.1 + magnitude * 0.6; // pan travel in image space
  const dir = flip ? -1 : 1;
  switch (type) {
    case 'pull':
      return { type, scale: [1 + magnitude * 1.1, 1.0], focus: [[f.x, f.y], [f.x, f.y]] };
    case 'pan':
      return { type, scale: [1 + magnitude * 0.5, 1 + magnitude * 0.7], focus: [[f.x - d * dir, f.y], [f.x + d * dir, f.y]] };
    case 'tilt':
      return { type, scale: [1 + magnitude * 0.5, 1 + magnitude * 0.7], focus: [[f.x, f.y + d * 0.7 * dir], [f.x, f.y - d * 0.7 * dir]] };
    case 'drift':
      return { type, scale: [1 + magnitude * 0.3, 1 + magnitude * 0.9], focus: [[f.x - d * 0.4 * dir, f.y + d * 0.2], [f.x + d * 0.3 * dir, f.y - d * 0.15]] };
    case 'reframe':
      return { type, scale: [1.28 + magnitude * 0.4, 1.28 + magnitude], focus: [[f.x, f.y], [f.x + (rng() - 0.5) * 0.04, f.y]] };
    case 'push':
    default:
      return { type: 'push', scale: [1.0, 1 + magnitude * 1.1], focus: [[f.x, Math.min(0.62, f.y + 0.03)], [f.x, f.y]] };
  }
}

// ─── Bed (A-roll) shots inside one clip ────────────────────────────────────

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
      const numAt = anchorFrame(words, scene.data.value);
      const at = rel((numAt || emphasisAt)?.frame ?? clipFrom + settle) - 4;
      return { ...scene.data, variant: ctx.spec.variant, at: Math.max(4, at), countFrames: Math.round(fps * 0.9), kicker: scene.text?.kicker || null };
    }
    case 'statement': {
      const tokens = scene.text.headline.split(/\s+/);
      const ats = sequential(tokens, true);
      return { words: tokens, ats, kicker: scene.text?.kicker || null };
    }
    case 'list':
      return { title: scene.data.title, items: scene.data.items, ats: sequential(scene.data.items) };
    case 'process':
      return { steps: scene.data.steps, ats: sequential(scene.data.steps.map((s) => s.title)) };
    case 'timeline':
      return { events: scene.data.events, ats: sequential(scene.data.events.map((e) => `${e.date} ${e.label}`)) };
    case 'chart': {
      // Draw from the start of the clip and arrive on the emphasised figure.
      const arrive = emphasisAt ? rel(emphasisAt.frame) + 6 : Math.round(clipDur * 0.6);
      const drawFrames = Math.round(Math.max(fps * 1.2, Math.min(arrive - settle, clipDur * 0.75)));
      return { ...scene.data, at: settle, drawFrames };
    }
    case 'compare': {
      const rightAt = anchorFrame(words, scene.data.right.title);
      return { ...scene.data, leftAt: settle, rightAt: rightAt ? Math.max(settle + 12, rel(rightAt.frame) - 3) : Math.round(clipDur * 0.4), withImage: Boolean(assets?.primary) };
    }
    case 'quote': {
      // The quote is spoken verbatim: each word brightens as the narrator reaches it.
      const words = scene.data.quote.split(/\s+/);
      return { ...scene.data, at: settle, authorAt: settle + Math.round(fps * 0.8), words, wordAts: sequential(words, true) };
    }
    case 'document':
      return { ...scene.data, at: 0, highlightAt: emphasisAt ? rel(emphasisAt.frame) : Math.round(clipDur * 0.35) };
    case 'chapter':
      return { ...scene.data, at: settle };
    case 'ui':
      return { ...scene.data, at: settle };
    case 'code':
      return { ...scene.data, from: settle, to: Math.round(clipDur * 0.75) };
    default:
      return {};
  }
}

/** Typographic recast of a photo scene that had no acceptable image. */
function titleOverlay(scene) {
  const text = scene.text?.headline || scene.entity?.name || scene.text?.kicker || scene.emphasis;
  const words = text.split(/\s+/).slice(0, 6);
  return { words, ats: words.map((_, k) => 8 + k * 4), kicker: scene.text?.headline && scene.entity?.name ? scene.entity.name : scene.text?.kicker && scene.text?.kicker !== text ? scene.text.kicker : null };
}

// ─── Transitions ───────────────────────────────────────────────────────────

function chooseTransitions(plan, specs, style, fps, totalFrames) {
  const minutes = totalFrames / fps / 60;
  let budget = Math.max(1, Math.ceil(style.transitions.perMinute * Math.max(minutes, 0.5)));
  const out = plan.scenes.map(() => 'cut');
  // Priority 1: section breaks.
  plan.scenes.forEach((s, i) => {
    if (i > 0 && s.section && budget > 0) {
      // Alternate the film burn with a dip so the same designed transition doesn't repeat every chapter.
      const sections = out.filter((t) => t === 'burn' || t === 'dip').length;
      out[i] = style.transitions.section === 'burn' && sections % 2 === 1 ? 'dip' : style.transitions.section;
      budget--;
    }
  });
  // Priority 2: climaxes get the accent transition.
  plan.scenes.forEach((s, i) => {
    if (i > 0 && out[i] === 'cut' && s.intensity >= 5 && budget > 0) { out[i] = style.transitions.accent; budget--; }
  });
  // Priority 3: continuation between photographs, and reflective moments, get the soft transition.
  plan.scenes.forEach((s, i) => {
    if (i === 0 || out[i] !== 'cut' || budget <= 0) return;
    const bothPhotos = specs[i].family === 'image' && specs[i - 1].family === 'image';
    const soft = s.continuity === 'continue' || ['somber', 'reflective'].includes(s.tone) || s.treatment === 'quiet';
    if (bothPhotos && soft && s.intensity <= 3) {
      out[i] = style.transitions.continuation !== 'cut' ? style.transitions.continuation : 'dissolve';
      budget--;
    }
  });
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function buildTimeline({ plan, specs, narration, assets, sfx, bgm, videoId, format, fps, audioSrc }) {
  const style = getStyle(plan.style);
  const palette = buildPalette(plan.style, plan.hue);
  const rng = rngFrom(videoId);
  const totalFrames = narration.totalFrames;
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

  const transitions = chooseTransitions(plan, specs, style, fps, totalFrames);
  const state = { moveCursor: Math.floor(rng() * 8), lastMove: null, flip: rng() > 0.5 };
  const clips = [];
  const cutOverlays = [{ type: 'fadeIn', frame: 0, frames: Math.round(fps * 0.4) }, { type: 'fadeOut', frame: totalFrames, frames: Math.round(fps * 0.6) }];

  plan.scenes.forEach((scene, i) => {
    const spec = specs[i];
    const family = spec.family;
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

    if (OVERLAY_TRANSITIONS.has(tin)) cutOverlays.push({ type: tin, frame: cuts[i], frames: TRANSITION_FRAMES[tin] });

    const isSplit = family === 'image' && spec.variant === 'split';
    // An annotation tracks one subject in one photograph: no sequence, no alternates.
    const single = isSplit || (family === 'image' && spec.variant === 'annotated');
    const bed = BED_FAMILIES.has(family)
      ? planBedShots({ clipFrom, clipDur, words: sceneWords, assets: single ? { primary: sceneAssets.primary, alternates: [] } : sceneAssets, spec, style, rng, state, fps, splitAt: single ? true : null })
      : null;
    if (bed?.length && spec.accents?.focusPull) bed[0].reveal = 'focus';
    // Split variant: the second panel is its own camera shot of the second image.
    const bedB = isSplit && sceneAssets.alternates?.[0]
      ? planBedShots({ clipFrom, clipDur, words: sceneWords, assets: { primary: sceneAssets.alternates[0], alternates: [] }, spec, style, rng, state, fps, splitAt: true })
      : null;
    // Graphic families use their photo only as a faint texture for continuity.
    const texture = !bed && sceneAssets?.primary ? { src: sceneAssets.primary.src, width: sceneAssets.primary.width, height: sceneAssets.primary.height, focal: sceneAssets.primary.focal } : null;

    clips.push({
      id: `c${String(i + 1).padStart(2, '0')}`,
      sceneId: scene.id,
      kind: scene.kind,
      family,
      variant: spec.variant,
      treatment: spec.treatment,
      recasts: spec.recasts,
      accents: spec.accents,
      stack: family === 'image' && spec.variant === 'stack' ? [sceneAssets.primary, ...(sceneAssets.alternates || [])].filter(Boolean).map((a) => ({ src: a.src, width: a.width, height: a.height, focal: a.focal })) : null,
      intensity: scene.intensity,
      from: clipFrom,
      durationInFrames: clipDur,
      cutAt: cuts[i] - clipFrom,
      enter: { type: overlapIn ? tin : 'cut', frames: overlapIn },
      exit: { type: overlapOut ? tout : 'cut', frames: overlapOut },
      bed,
      bedB,
      texture,
      overlay: family === 'statement' && spec.variant === 'title' ? titleOverlay(scene) : overlayFor(family, scene, { words: sceneWords, clipFrom, clipDur, fps, assets: sceneAssets, spec }),
      narration: scene.narration,
    });
  });

  // Captions.
  const capLimits = format === 'shorts'
    ? (style.captions.mode === 'highlight' ? { maxWords: 3, maxChars: 20 } : { maxWords: 5, maxChars: 30 })
    : { maxWords: 8, maxChars: 44 };
  const chunks = buildCaptionChunks(words, fps, capLimits).map((c) => ({ ...c, endFrame: Math.min(c.endFrame, totalFrames) }));
  const captionsHidden = clips.filter((c) => CAPTION_YIELD.has(c.family)).map((c) => [c.from + c.cutAt, c.from + c.durationInFrames]);

  // Speech intervals for ducking the music bed.
  const speech = [];
  for (const w of words) {
    const last = speech[speech.length - 1];
    if (last && w.startFrame - last[1] < fps * 0.5) last[1] = w.endFrame;
    else speech.push([w.startFrame, w.endFrame]);
  }

  // Sparse, event-driven SFX.
  const minGap = fps * (format === 'shorts' ? 5 : 8);
  const sfxEvents = [];
  const addSfx = (name, frame, volume) => {
    if (!sfx?.[name] || frame < 0) return;
    const last = sfxEvents[sfxEvents.length - 1];
    if (last && frame - last.from < minGap) return;
    sfxEvents.push({ src: sfx[name], from: frame, volume });
  };
  clips.forEach((c, i) => {
    const t = transitions[i];
    if (['push', 'whip', 'zoom'].includes(t)) addSfx('whoosh', c.from + c.cutAt - 6, 0.28);
    if (c.family === 'stat' && c.intensity >= 4) addSfx('impact_boom', c.from + c.overlay.at, 0.4);
    if (c.family === 'document') addSfx('paper_slam', c.from + c.cutAt + 2, 0.35);
    if (c.family === 'ui') addSfx('click', c.from + c.overlay.at, 0.4);
  });

  return {
    version: 2,
    videoId,
    title: plan.title,
    format,
    fps,
    width: format === 'shorts' ? 1080 : 1920,
    height: format === 'shorts' ? 1920 : 1080,
    durationInFrames: totalFrames,
    style: plan.style,
    palette,
    clips,
    cutOverlays,
    captions: { mode: style.captions.mode, chunks, hidden: captionsHidden },
    audio: {
      narration: audioSrc,
      bgm: bgm ? { src: bgm.src, synthetic: bgm.synthetic, base: bgm.synthetic ? 0.1 : 0.16, ducked: bgm.synthetic ? 0.035 : 0.05 } : null,
      sfx: sfxEvents,
      speech,
    },
  };
}
