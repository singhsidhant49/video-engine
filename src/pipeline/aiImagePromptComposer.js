import crypto from 'node:crypto';

const clean = (value, fallback = '') => String(value ?? fallback).replace(/\s+/g, ' ').trim();

function normalizeBibleEntries(values, prefix) {
  return (Array.isArray(values) ? values : []).map((value, index) => {
    if (typeof value === 'string') return { id: `${prefix}_${index + 1}`, name: '', description: clean(value) };
    if (!value || typeof value !== 'object') return null;
    return {
      id: clean(value.id, `${prefix}_${index + 1}`),
      name: clean(value.name || value.label),
      description: clean(value.description || value.visualDescription || value.appearance),
      wardrobe: clean(value.wardrobe || value.clothing),
      attributes: clean(value.attributes || value.distinguishingFeatures),
    };
  }).filter((entry) => entry && (entry.name || entry.description));
}

export function normalizeContinuityBible(value = {}) {
  const bible = value && typeof value === 'object' ? value : {};
  return {
    characters: normalizeBibleEntries(bible.characters, 'character'),
    locations: normalizeBibleEntries(bible.locations, 'location'),
    chronology: clean(bible.chronology),
    recurringMotifs: (Array.isArray(bible.recurringMotifs) ? bible.recurringMotifs : []).map((item) => clean(item)).filter(Boolean),
    visualStyleSignature: clean(bible.visualStyleSignature || bible.styleSignature),
  };
}

export function deterministicImageSeed(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? {});
  const prefix = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 12);
  return (Number.parseInt(prefix, 16) % 900000000) + 100000000;
}

function relevantEntries(entries, text) {
  const haystack = clean(text).toLowerCase();
  const explicit = entries.filter((entry) => [entry.id, entry.name].filter(Boolean)
    .some((name) => name.length > 2 && haystack.includes(name.toLowerCase())));
  if (explicit.length) return explicit;
  const stop = new Set(['with', 'from', 'that', 'this', 'into', 'young', 'older', 'wearing', 'small', 'large']);
  const scored = entries.map((entry) => {
    const tokens = clean(`${entry.name} ${entry.description}`).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    const score = [...new Set(tokens)].filter((token) => !stop.has(token) && haystack.includes(token)).length;
    return { entry, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length) return scored.filter((item) => item.score === scored[0].score).slice(0, 2).map((item) => item.entry);
  return entries.length === 1 ? entries : [];
}

const describeEntry = (entry) => [entry.name, entry.description, entry.wardrobe, entry.attributes].filter(Boolean).join(': ');

function shotComposition(scene, req, format) {
  const role = clean(req?.visibleNeed?.visualRole || req?.visualRole).toUpperCase();
  const scale = clean(scene?.shot, 'medium').toLowerCase();
  let framing = 'cinematic eye-level medium composition with intentional subject hierarchy';
  if (scale === 'wide' || role === 'ESTABLISHING') framing = 'wide expansive establishing composition that clearly locates the subject in the environment';
  else if (scale === 'detail' || role === 'EVIDENCE' || role === 'INSERT') framing = 'precise close detail composition centered on the important object or evidence';
  else if (scale === 'close' || role === 'REACTION') framing = 'tight dramatic close-up with readable natural emotion and intentional subject separation';
  const safety = format === 'shorts'
    ? 'vertical 9:16 aspect ratio, principal action inside the centered mobile safe zone, useful depth above and below the subject'
    : 'cinematic 16:9 composition with purposeful foreground, middle ground, and background';
  return `${framing}; ${safety}`;
}

function motivatedLighting(tone) {
  const normalized = clean(tone, 'neutral').toLowerCase();
  if (['tense', 'urgent'].includes(normalized)) return 'motivated dramatic chiaroscuro lighting with controlled shadows';
  if (['somber', 'reflective'].includes(normalized)) return 'soft subdued practical light appropriate to the location and time';
  if (['hopeful', 'triumphant'].includes(normalized)) return 'warm golden hour illumination with restrained highlights';
  if (normalized === 'curious') return 'layered natural light that reveals depth and invites examination';
  return 'coherent natural or practical lighting motivated by the environment';
}

function contextSummary(item) {
  if (!item) return '';
  return clean(item.shotConcept || item.visibleNeed?.primaryConcept || item.concept || item.narration || item.scene?.narration).slice(0, 180);
}

export function createImagePromptSpec({ scene = {}, req = {}, shotConcept = '', previous = null, next = null, continuityBible = {}, format = 'landscape', style = null, index = 0, contentType = '' } = {}) {
  const bible = normalizeContinuityBible(continuityBible);
  const narration = clean(scene.narration || req?.visibleNeed?.narrationText);
  const authoredPrompt = clean(scene.imagePrompt || scene.visual);
  const primaryConcept = clean(shotConcept || req?.shotConcept || req?.visualProposition?.positiveDescriptions?.[0] || req?.visibleNeed?.primaryConcept || req?.visibleNeed?.viewerNeedsToSee || req?.concept || authoredPrompt || narration, 'a concrete story moment');
  const subject = clean(req?.visibleNeed?.subject || req?.visibleNeed?.requiredEntities?.[0] || scene.focus || primaryConcept);
  const action = clean(req?.visibleNeed?.action || authoredPrompt || primaryConcept);
  const environment = clean(req?.visibleNeed?.environment || scene.location || 'the specific environment implied by the narration');
  const continuityText = `${narration} ${authoredPrompt} ${primaryConcept}`;

  return {
    version: 1,
    shotId: req.storyboardShotId || req.id || `shot_${index + 1}`,
    sceneId: req.sceneId || scene.id || null,
    narration,
    editorialPurpose: clean(req?.visibleNeed?.viewerNeedsToSee || `Show ${primaryConcept} because this shot must ${clean(scene.purpose, 'explain the current narration')}`),
    role: clean(req?.visibleNeed?.visualRole || req?.visualRole || scene.purpose, 'explain').toUpperCase(),
    subject,
    action,
    environment,
    importantContext: clean(authoredPrompt && primaryConcept !== authoredPrompt ? `${authoredPrompt}, focusing on ${primaryConcept}` : authoredPrompt || primaryConcept),
    composition: shotComposition(scene, req, format),
    lighting: motivatedLighting(scene.tone),
    style: clean(style?.prompt || style?.label || style?.id || bible.visualStyleSignature),
    contentType: clean(contentType || scene.kind || req?.visibleNeed?.editorialMode),
    aspectRatio: format === 'shorts' ? '9:16' : '16:9',
    continuity: {
      mode: clean(scene.continuity, 'new'),
      characters: relevantEntries(bible.characters, continuityText).map(describeEntry),
      locations: relevantEntries(bible.locations, continuityText).map(describeEntry),
      chronology: bible.chronology,
      recurringMotifs: bible.recurringMotifs,
      visualStyleSignature: bible.visualStyleSignature,
    },
    sequence: { previous: contextSummary(previous), next: contextSummary(next) },
    forbiddenElements: [...(Array.isArray(req?.visibleNeed?.avoidVisuals) ? req.visibleNeed.avoidVisuals : []), 'written text', 'letters', 'watermark', 'logo', 'collage layout', 'duplicated limbs', 'malformed prominent hands', 'irrelevant background objects']
      .map((item) => clean(item))
      .filter(Boolean)
      .filter((item) => !(style?.id === 'stickman' && /\b(?:stickman|stick figure|cartoon clipart)\b/i.test(item))),
  };
}

export function composeImagePrompt(spec = {}) {
  const continuity = [...(spec.continuity?.characters || []), ...(spec.continuity?.locations || []), spec.continuity?.chronology, spec.continuity?.visualStyleSignature].filter(Boolean);
  const sequence = [
    spec.sequence?.previous ? `continue logically from the previous shot showing ${spec.sequence.previous}` : '',
    spec.sequence?.next ? `prepare naturally for the next shot showing ${spec.sequence.next}` : '',
  ].filter(Boolean);
  return [
    `${spec.subject}. ${spec.action}.`,
    `Environment: ${spec.environment}.`,
    spec.importantContext ? `Specific narrative context: ${spec.importantContext}.` : '',
    `Editorial purpose: ${spec.editorialPurpose}.`,
    `Composition: ${spec.composition}.`,
    `Lighting and mood: ${spec.lighting}.`,
    spec.style ? `Visual style: ${spec.style}, applied consistently across the sequence.` : '',
    continuity.length ? `Continuity is mandatory: ${continuity.join('; ')}.` : '',
    sequence.length ? `Sequence relationship: ${sequence.join('; ')}.` : '',
    `Create one coherent ${spec.aspectRatio} frame with natural anatomy, faces, object relationships, and a clear visual hierarchy.`,
    spec.forbiddenElements?.length ? `Exclude: ${[...new Set(spec.forbiddenElements)].join(', ')}; zero text, zero letters, zero logos, no watermark.` : '',
  ].filter(Boolean).join(' ');
}
