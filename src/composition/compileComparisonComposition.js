import { createSceneComposition } from './sceneComposition.js';
import { phrasesFromAlignedWords } from './compileProcessComposition.js';
import { selectComparisonGrammar } from './comparisonSpec.js';

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

function phraseFor(text, phrases, fallbackIndex) {
  const tokens = normalize(text);
  let best = null;
  phrases.forEach((phrase) => {
    const score = tokens.filter((token) => phrase.tokens.includes(token)).length;
    if (!best || score > best.score) best = { phrase, score };
  });
  return best?.score ? best.phrase : phrases[Math.min(fallbackIndex, Math.max(0, phrases.length - 1))] || null;
}

function element({ id, kind = 'text', role, importance, content, parentId = null, style = {}, binding = null, textVariants }) {
  return {
    id, kind, semanticRole: role, importance, content, intrinsic: {},
    constraints: { parentId, protected: ['text', 'annotation', 'group'].includes(kind), maxLines: kind === 'text' || kind === 'annotation' ? 3 : undefined },
    styleTokenRefs: style, semanticBinding: binding, ...(textVariants ? { textVariants } : {}),
  };
}

export function compileComparisonComposition({ editorialPlan, comparisonSpec, alignedWords, shotStartFrame, durationInFrames, formatContext, font }) {
  const grammar = selectComparisonGrammar(comparisonSpec, formatContext.format);
  const phrases = phrasesFromAlignedWords(alignedWords, shotStartFrame);
  const phraseA = phraseFor(`${comparisonSpec.subjectA.label} ${comparisonSpec.subjectA.description}`, phrases, 0);
  const phraseB = phraseFor(`${comparisonSpec.subjectB.label} ${comparisonSpec.subjectB.description}`, phrases, 1);
  const phraseDifference = phraseFor(comparisonSpec.keyDifference, phrases, Math.max(0, phrases.length - 1));
  const events = [
    { id: 'event_compare_a', type: 'stepIntroduced', targetId: 'comparison_side_a', phraseId: phraseA?.id || null, frame: phraseA?.startFrame ?? 0 },
    { id: 'event_comparison_pivot', type: 'comparisonPivot', targetId: 'comparison_side_b', phraseId: phraseB?.id || null, frame: phraseB?.startFrame ?? Math.round(durationInFrames * 0.42) },
    { id: 'event_key_difference', type: 'conclusion', targetId: 'comparison_difference', phraseId: phraseDifference?.id || null, frame: phraseDifference?.startFrame ?? Math.round(durationInFrames * 0.68) },
  ].map((event) => ({ ...event, frame: Math.max(0, Math.min(durationInFrames - 1, event.frame)) }));
  const elements = [
    element({ id: 'comparison_title', role: 'title', importance: 'secondary', content: editorialPlan.textBlocks.title || 'COMPARISON', style: { fontFamily: font.display, fontWeight: 700, color: 'accent' } }),
    element({ id: 'comparison_root', kind: 'group', role: 'comparison-root', importance: 'structural', content: { grammar, comparisonType: comparisonSpec.comparisonType }, style: {} }),
  ];
  const relationships = [];
  for (const [side, subject] of [['a', comparisonSpec.subjectA], ['b', comparisonSpec.subjectB]]) {
    const groupId = `comparison_side_${side}`;
    elements.push(
      element({ id: groupId, kind: 'group', role: `comparison-side-${side}`, importance: comparisonSpec.emphasizedSide === side.toUpperCase() ? 'primary' : 'secondary', content: { subjectId: subject.id }, parentId: 'comparison_root', style: { frame0Emphasis: 0.58 }, binding: { type: 'comparisonSubject', value: subject.id } }),
      element({ id: `${groupId}_field`, kind: 'shape', role: 'comparison-field', importance: 'structural', content: { shape: 'field', side }, parentId: groupId, style: { fill: side === 'a' ? 'neutralField' : 'accentField', stroke: 'line' } }),
      element({ id: `${groupId}_label`, role: 'comparison-label', importance: 'primary', content: subject.label, parentId: groupId, style: { fontFamily: font.display, fontWeight: 750, color: 'text' }, binding: { type: 'comparisonSubject', value: subject.id } }),
      element({ id: `${groupId}_description`, role: 'comparison-description', importance: 'supporting', content: subject.description || subject.textVariants.short, parentId: groupId, style: { fontFamily: font.text, fontWeight: 500, color: 'muted' }, textVariants: subject.textVariants }),
    );
    if (subject.metricValue) elements.push(element({ id: `${groupId}_metric`, role: 'comparison-metric', importance: 'primary', content: subject.metricValue, parentId: groupId, style: { fontFamily: font.display, fontWeight: 800, color: side === 'b' ? 'accent' : 'text' } }));
    comparisonSpec.dimensions.slice(0, 2).forEach((dimension, index) => {
      const value = side === 'a' ? dimension.valueA : dimension.valueB;
      elements.push(element({
        id: `${groupId}_dimension_${index + 1}`, role: 'comparison-dimension', importance: dimension.importance,
        content: `${dimension.label}: ${value}`, parentId: groupId,
        style: { fontFamily: font.text, fontWeight: 600, color: 'muted' },
        textVariants: { full: `${dimension.label}: ${value}`, short: value, labelOnly: value },
      }));
      relationships.push({ type: 'contains', from: groupId, to: `${groupId}_dimension_${index + 1}` });
    });
    relationships.push({ type: 'contains', from: 'comparison_root', to: groupId }, { type: 'contains', from: groupId, to: `${groupId}_field` }, { type: 'contains', from: groupId, to: `${groupId}_label` }, { type: 'contains', from: groupId, to: `${groupId}_description` });
    if (subject.metricValue) relationships.push({ type: 'contains', from: groupId, to: `${groupId}_metric` });
  }
  elements.push(
    element({ id: 'comparison_divider', kind: 'shape', role: 'comparison-divider', importance: 'secondary', content: { shape: grammar === 'BEFORE_AFTER' ? 'arrow' : 'rule' }, parentId: 'comparison_root', style: { fill: 'accent' } }),
    element({ id: 'comparison_difference', kind: 'annotation', role: 'key-difference', importance: 'primary', content: comparisonSpec.keyDifference, style: { fontFamily: font.text, fontWeight: 700, color: 'text', accentRule: true }, textVariants: comparisonSpec.keyDifferenceVariants, binding: { type: 'keyDifference', value: comparisonSpec.keyDifference, phraseId: phraseDifference?.id || null } }),
  );
  relationships.push({ type: 'connects', from: 'comparison_side_a', to: 'comparison_side_b' }, { type: 'labels', from: 'comparison_difference', to: 'comparison_root' });
  return createSceneComposition({
    version: 1, shotId: comparisonSpec.shotId, format: formatContext.format, objective: comparisonSpec.objective,
    regions: [
      { id: 'title', role: 'title', constraints: formatContext.titleRegion },
      { id: 'primary', role: 'comparison', constraints: formatContext.primaryVisualRegion },
      { id: 'captions', role: 'caption-reserve', constraints: formatContext.captionRegion },
    ],
    elements, relationships, readingOrder: ['comparison_side_a', 'comparison_side_b', 'comparison_difference'],
    captionPolicy: { mode: 'COMPACT', regionId: 'captions', equivalentTextElementIds: [] },
    backgroundIntent: { mode: 'softRadial', texture: null },
    motionIntent: { vocabulary: ['emphasize', 'highlight', 'fade'], frame0Emphasis: 0.58 },
    complexityBudget: { level: comparisonSpec.dimensions.length > 2 ? 'HIGH' : 'MEDIUM', mainTargets: 2, supportElements: 3 + comparisonSpec.dimensions.length, relationships: 1 },
    semanticEvents: events,
  });
}
