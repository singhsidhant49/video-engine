import { createSceneComposition } from './sceneComposition.js';

const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'it', 'then', 'next', 'first', 'finally']);
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((word) => word && !STOP.has(word));
const slug = (value, index) => normalize(value).slice(0, 3).join('_') || `stage_${index + 1}`;

export function phrasesFromAlignedWords(words = [], shotStartFrame = 0) {
  const phrases = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    if (word.endsPhrase || word.endsSentence) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);
  return phrases.map((phrase, index) => ({
    id: `phrase_${String(index + 1).padStart(3, '0')}`,
    text: phrase.map((word) => word.text).join(' '),
    tokens: phrase.flatMap((word) => word.norm || normalize(word.text)),
    startFrame: Math.max(0, phrase[0].startFrame - shotStartFrame),
    endFrame: Math.max(1, phrase.at(-1).endFrame - shotStartFrame),
  }));
}

function bindStepsToPhrases(steps, phrases, durationInFrames) {
  const unused = new Set(phrases.map((phrase) => phrase.id));
  return steps.map((step, index) => {
    const tokens = normalize(`${step.title || step.label} ${step.detail || step.desc || ''}`);
    let best = null;
    for (const phrase of phrases) {
      if (!unused.has(phrase.id)) continue;
      const matches = tokens.filter((token) => phrase.tokens.includes(token)).length;
      const score = tokens.length ? matches / tokens.length : 0;
      if (!best || score > best.score) best = { phrase, score };
    }
    const phrase = best?.score > 0 ? best.phrase : phrases[Math.min(index, Math.max(0, phrases.length - 1))];
    if (phrase) unused.delete(phrase.id);
    return {
      id: `event_step_${index + 1}`,
      type: index === steps.length - 1 ? 'resultIntroduced' : 'stepIntroduced',
      targetId: `step_${slug(step.title || step.label, index)}`,
      phraseId: phrase?.id || null,
      frame: Math.min(durationInFrames - 1, Math.max(0, phrase?.startFrame ?? Math.round((index / Math.max(1, steps.length)) * durationInFrames))),
    };
  });
}

function textElement(id, role, importance, text, parentId, style) {
  return {
    id,
    kind: 'text',
    semanticRole: role,
    importance,
    content: String(text || ''),
    intrinsic: {},
    constraints: { maxLines: role === 'stage-label' ? 2 : 3, parentId, protected: true },
    styleTokenRefs: style,
  };
}

export function compileProcessComposition({ editorialPlan, steps: rawSteps, alignedWords, shotStartFrame, durationInFrames, formatContext, font }) {
  let steps = (rawSteps || []).map((step) => typeof step === 'string' ? { title: step } : step);
  if (steps.length < 2) throw new Error(`Process composition ${editorialPlan.shotId} requires at least two stages`);
  const maximumVisibleStages = formatContext.orientation === 'vertical' ? 4 : 6;
  if (steps.length > maximumVisibleStages) {
    const hidden = steps.length - maximumVisibleStages + 1;
    steps = [
      ...steps.slice(0, maximumVisibleStages - 1),
      { title: `${hidden} MORE STAGES`, detail: 'Grouped continuation' },
    ];
  }
  const phrases = phrasesFromAlignedWords(alignedWords, shotStartFrame);
  const semanticEvents = bindStepsToPhrases(steps, phrases, durationInFrames);
  const elements = [];
  const relationships = [];
  const readingOrder = [];

  elements.push(textElement('process_title', 'title', 'secondary', editorialPlan.textBlocks.title || 'PROCESS', null, {
    fontFamily: font.display,
    fontWeight: 700,
    color: 'accent',
  }));

  steps.forEach((step, index) => {
    const groupId = semanticEvents[index].targetId;
    const shapeId = `${groupId}_shape`;
    const labelId = `${groupId}_label`;
    const supportId = `${groupId}_support`;
    elements.push({
      id: groupId, kind: 'group', semanticRole: 'process-stage', importance: index === 0 || index === steps.length - 1 ? 'primary' : 'secondary',
      content: { stageIndex: index, totalStages: steps.length }, intrinsic: {}, constraints: { protected: true }, styleTokenRefs: { frame0Emphasis: 0.4 },
    });
    elements.push({
      id: shapeId, kind: 'shape', semanticRole: 'stage-container', importance: 'structural', content: { shape: 'band' }, intrinsic: {},
      constraints: { parentId: groupId, protected: true }, styleTokenRefs: { fill: 'bgRaised', stroke: 'line', activeStroke: 'accent' },
    });
    elements.push(textElement(labelId, 'stage-label', 'primary', step.title || step.label || `Stage ${index + 1}`, groupId, {
      fontFamily: font.display, fontWeight: 700, color: 'text', activeColor: 'text',
    }));
    if (step.detail || step.desc) {
      elements.push(textElement(supportId, 'stage-support', 'supporting', step.detail || step.desc, groupId, {
        fontFamily: font.text, fontWeight: 500, color: 'muted',
      }));
      relationships.push({ type: 'contains', from: groupId, to: supportId });
    }
    relationships.push({ type: 'contains', from: groupId, to: shapeId }, { type: 'contains', from: groupId, to: labelId });
    readingOrder.push(groupId);
    if (index > 0) relationships.push({ type: 'connects', from: readingOrder[index - 1], to: groupId });
  });

  return createSceneComposition({
    version: 1,
    shotId: editorialPlan.shotId,
    format: formatContext.format,
    objective: editorialPlan.communicationObjective || 'Explain a process sequence',
    regions: [
      { id: 'title', role: 'title', constraints: formatContext.titleRegion },
      { id: 'primary', role: 'process', constraints: formatContext.primaryVisualRegion },
      { id: 'captions', role: 'caption-reserve', constraints: formatContext.captionRegion },
    ],
    elements,
    relationships,
    readingOrder,
    captionPolicy: {
      mode: 'INTEGRATED',
      regionId: 'captions',
      equivalentTextElementIds: elements.filter((element) => element.kind === 'text').map((element) => element.id),
    },
    backgroundIntent: { mode: 'technicalGrid', texture: null },
    motionIntent: { vocabulary: ['emphasize', 'draw', 'highlight'], frame0Emphasis: 0.4 },
    complexityBudget: {
      level: steps.length <= 2 ? 'LOW' : steps.length <= 3 ? 'MEDIUM' : 'HIGH', mainTargets: 1,
      supportElements: elements.filter((element) => element.importance === 'supporting').length,
      relationships: relationships.filter((relationship) => relationship.type === 'connects').length,
    },
    semanticEvents,
  });
}
