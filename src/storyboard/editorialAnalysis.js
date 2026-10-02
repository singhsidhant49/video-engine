import { tokenizeScript } from '../services/alignmentService.js';

const PURPOSE_MAP = {
  hook: 'hook', setup: 'setup', context: 'context', explain: 'explanation', explanation: 'explanation',
  evidence: 'evidence', contrast: 'contrast', escalate: 'escalation', escalation: 'escalation',
  reveal: 'reveal', payoff: 'payoff', transition: 'transition', conclusion: 'conclusion',
  list: 'explanation', process: 'explanation', quote: 'evidence', chapter: 'transition',
};

const VISUAL_INTENT_BY_KIND = {
  atmosphere: 'establish', subject: 'identify', statistic: 'quantify', comparison: 'compare',
  list: 'explain', process: 'explain', timeline: 'contextualize', chart: 'quantify', quote: 'prove',
  document: 'prove', chapter: 'summarize', statement: 'emphasize', ui: 'demonstrate', code: 'explain',
};

const DENSE_KINDS = new Set(['statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'document', 'ui', 'code']);
const STRONG_BOUNDARY_PURPOSES = new Set(['hook', 'contrast', 'escalation', 'reveal', 'payoff', 'transition', 'conclusion']);
const WEAK_WORDS = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'into', 'about', 'were', 'was', 'are', 'for', 'but', 'not', 'you', 'its']);

const clamp5 = (value) => Math.max(1, Math.min(5, Math.round(Number(value) || 3)));
const wordsOf = (text) => tokenizeScript(text).map((word) => word.norm[0]).filter((word) => word && word.length > 2 && !WEAK_WORDS.has(word));

export function normalizePurpose(value) {
  return PURPOSE_MAP[value] || 'explanation';
}

export function analyzePlanScene(scene, index, durationHint = 3.5) {
  const purpose = normalizePurpose(scene.purpose);
  const importance = clamp5(scene.importance || scene.intensity);
  const energy = clamp5(scene.intensity || (purpose === 'hook' ? 5 : 3));
  const wordCount = tokenizeScript(scene.narration).length;
  const densityBase = DENSE_KINDS.has(scene.kind) ? 4 : wordCount / Math.max(1, durationHint) > 3.1 ? 4 : 3;
  const informationDensity = clamp5(densityBase + (scene.data?.items?.length >= 4 || scene.data?.steps?.length >= 4 ? 1 : 0));
  const evidenceRequirement = scene.kind === 'document' || purpose === 'evidence'
    ? 'required'
    : ['statistic', 'quote', 'timeline'].includes(scene.kind) || scene.entity
      ? 'preferred'
      : 'conceptual_allowed';

  return {
    sourceIndex: index,
    sourceSceneId: scene.id,
    narration: scene.narration,
    durationHint,
    purpose,
    visualIntent: VISUAL_INTENT_BY_KIND[scene.kind] || (purpose === 'contrast' ? 'compare' : purpose === 'evidence' ? 'prove' : 'demonstrate'),
    importance,
    energy,
    informationDensity,
    evidenceRequirement,
    entities: scene.entity?.name ? [scene.entity.name] : [],
    topicTokens: new Set(wordsOf(`${scene.entity?.name || ''} ${scene.visual || ''} ${(scene.imageQueries || []).join(' ')}`)),
    startsSection: Boolean(scene.section) || scene.kind === 'chapter',
    complexity: clamp5(scene.complexity || (DENSE_KINDS.has(scene.kind) ? 4 : 2)),
    emotionalWeight: clamp5(scene.emotionalWeight || scene.intensity || 3),
    requiredComprehensionTime: Number(scene.requiredComprehensionTime) || (DENSE_KINDS.has(scene.kind) ? 5.0 : 3.0),
    visualChangeTolerance: scene.visualChangeTolerance || 'moderate',
    pauseAfterSec: Number(scene.pauseAfterSec) || 0,
    source: scene,
  };
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return common / Math.min(a.size, b.size);
}

function shouldStartScene(group, next) {
  if (!group.length) return true;
  const prev = group[group.length - 1];
  const totalDuration = group.reduce((sum, item) => sum + item.durationHint, 0);

  // Section breaks always force a new scene
  if (next.startsSection) return true;

  // Keep scene durations bounded to editorial sweet spot (~4.5s to 8.5s)
  if (totalDuration + next.durationHint > 9.5) return true;

  // Evidence requirements or explicit primary graphics force boundaries
  if (next.evidenceRequirement === 'required' || prev.evidenceRequirement === 'required') return true;
  if (next.entities.length && prev.entities.length && next.entities[0] !== prev.entities[0]) return true;

  // Procedural structured graphic -> photo switch requires boundary
  const prevIsDense = DENSE_KINDS.has(prev.source?.kind);
  const nextIsDense = DENSE_KINDS.has(next.source?.kind);
  if (prevIsDense !== nextIsDense) return true;

  // Micro-scenes (< 4.2s) should be aggressively merged into coherent content beats
  const isMicroLead = totalDuration < 4.2;
  const isMicroNext = next.durationHint < 4.2;

  // Hook + Context merge into a unified Hook Beat
  if (prev.purpose === 'hook' && ['setup', 'context', 'explanation'].includes(next.purpose)) {
    return !isMicroLead; // merge if the hook was short
  }

  // Reveal / Contrast + Explanation merge if explaining the same beat
  if (['reveal', 'contrast'].includes(prev.purpose) && next.purpose === 'explanation' && isMicroLead) {
    return false;
  }

  // Payoff + Conclusion merge
  if (['payoff', 'conclusion'].includes(prev.purpose) && ['payoff', 'conclusion'].includes(next.purpose) && totalDuration + next.durationHint <= 8.5) {
    return false;
  }

  if (STRONG_BOUNDARY_PURPOSES.has(next.purpose) && !isMicroNext) return true;
  if (STRONG_BOUNDARY_PURPOSES.has(prev.purpose) && !isMicroLead) return true;

  const compatiblePurpose = next.purpose === prev.purpose
    || (['setup', 'context', 'explanation'].includes(next.purpose) && ['setup', 'context', 'explanation'].includes(prev.purpose));
  const sameEntity = next.entities.length && prev.entities.length && next.entities[0] === prev.entities[0];
  const semanticLink = overlap(prev.topicTokens, next.topicTokens) >= 0.15;

  return !(compatiblePurpose && (sameEntity || semanticLink || isMicroLead));
}

function mergeGroup(group, sceneIndex) {
  const primary = [...group].sort((a, b) => b.importance - a.importance || b.informationDensity - a.informationDensity)[0];
  const durationHint = group.reduce((sum, item) => sum + item.durationHint, 0);
  const narration = group.map((item) => item.narration).join(' ');
  const startWord = group[0].scriptStartWord;
  const endWord = group[group.length - 1].scriptEndWord;
  const evidence = group.some((item) => item.evidenceRequirement === 'required')
    ? 'required'
    : group.some((item) => item.evidenceRequirement === 'preferred') ? 'preferred' : 'conceptual_allowed';

  return {
    id: `scene_${String(sceneIndex + 1).padStart(3, '0')}`,
    sourceSceneIds: group.map((item) => item.sourceSceneId),
    narration,
    scriptRange: { startWord, endWord },
    durationHint: Number(durationHint.toFixed(3)),
    purpose: primary.purpose,
    visualIntent: primary.visualIntent,
    importance: Math.max(...group.map((item) => item.importance)),
    energy: Math.round(group.reduce((sum, item) => sum + item.energy * item.durationHint, 0) / durationHint),
    informationDensity: Math.max(...group.map((item) => item.informationDensity)),
    complexity: Math.max(...group.map((item) => item.complexity || 2)),
    emotionalWeight: Math.max(...group.map((item) => item.emotionalWeight || 3)),
    requiredComprehensionTime: Number(group.reduce((sum, item) => sum + (item.requiredComprehensionTime || 3.0), 0).toFixed(2)),
    visualChangeTolerance: group.some((item) => item.visualChangeTolerance === 'low') ? 'low' : group.some((item) => item.visualChangeTolerance === 'high') ? 'high' : 'moderate',
    pauseAfterSec: Math.max(...group.map((item) => item.pauseAfterSec || 0)),
    evidenceRequirement: evidence,
    entities: [...new Set(group.flatMap((item) => item.entities))],
    startsSection: group[0].startsSection,
    sourceScenes: group.map((item) => item.source),
  };
}

/** Convert normalized plan units into editorial scenes; adjacent related units may merge. */
export function analyzeEditorialScenes(plan, { sceneSeconds = [] } = {}) {
  let wordCursor = 0;
  const analyzed = plan.scenes.map((scene, index) => {
    const item = analyzePlanScene(scene, index, sceneSeconds[index] || 3.5);
    const wordCount = tokenizeScript(scene.narration).length;
    item.scriptStartWord = wordCursor;
    item.scriptEndWord = wordCursor + Math.max(0, wordCount - 1);
    wordCursor += wordCount;
    return item;
  });

  const groups = [];
  for (const item of analyzed) {
    const current = groups[groups.length - 1];
    if (!current || shouldStartScene(current, item)) groups.push([item]);
    else current.push(item);
  }
  return groups.map(mergeGroup);
}
