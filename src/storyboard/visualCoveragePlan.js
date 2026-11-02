/**
 * Visual Coverage Plan & Explanatory Representation Engine.
 * 
 * Answers the core editorial question:
 * "WHAT SHOULD THE VIEWER SEE TO UNDERSTAND THIS IDEA?"
 * 
 * Replaces the naive "no media -> StatementShot" default with semantic, content-driven
 * explanatory primitives: Code, UI/Repository, Process Diagrams, Node/Relationship Graphs,
 * Geopolitical Maps, Split Comparisons, Timelines, Authentic Documents, and Charts.
 */

import { VisualCoveragePlanSchema } from '../models/visualCoveragePlan.schema.js';
import { flattenStoryboardScenes } from './storyboardDiagnostics.js';
import { buildVisualProposition } from './visualProposition.js';
import { routeRepresentation } from './representationRouter.js';
import { resolveVisualPolicy } from '../config/visualMode.js';

export const INFORMATION_TYPES = {
  CODE: 'code',
  INTERFACE: 'interface',
  PROCESS: 'process',
  COMPARISON: 'comparison',
  RELATIONSHIP: 'relationship',
  TIMELINE: 'timeline',
  LOCATION: 'location',
  DATA: 'data',
  EVIDENCE: 'evidence',
  ENTITY: 'entity',
  EMOTION: 'emotion',
  ATMOSPHERE: 'atmosphere',
  EMPHASIS: 'emphasis',
};

export const REPRESENTATIONS = {
  MEDIA: 'media',
};

/**
 * Classifies the information type of a content beat or scene based on narration,
 * intent, entities, and keywords.
 * 
 * @param {Object} scene - Storyboard scene or plan beat
 * @returns {string} One of INFORMATION_TYPES
 */
export function classifyInformationType(scene) {
  const text = `${scene.narration || ''} ${scene.purpose || ''} ${scene.visualConcept || ''} ${scene.visual || ''} ${scene.text?.headline || ''} ${scene.text?.kicker || ''} ${scene.focus || ''}`.toLowerCase();
  const entities = (scene.entities || []).map((e) => (typeof e === 'string' ? e : e.name || '')).join(' ').toLowerCase();
  const combined = `${text} ${entities}`;

  // 1. Evidence / Study / Archival Document (check high-priority scientific evidence before general keywords)
  if (/\b(marshmallow test|stanford|experiment|research paper|study|published|patent|court document|headline|article|quote|archives)\b/i.test(combined)
    || scene.kind === 'document' || scene.kind === 'quote' || scene.evidenceRequirement === 'required') {
    return INFORMATION_TYPES.EVIDENCE;
  }

  // 2. Code / Software Engineering
  if (/\b(codebase|syntax|function|functions|unit tests?|run tests?|tests? pass|test runner|failed tests?|test fail\w*|repo|repos|repository|repositories|git|diff|patch|tool calls?|function calls?|bash|compile|debug|refactor|pull request|npm|python|javascript|script)\b/i.test(combined)
    || (/\btests?\b/i.test(combined) && /\b(agent|run|fail|pass|code|build|recover)\b/i.test(combined))
    || (/\bterminal\b/i.test(combined) && /\b(command line|cli|bash|console|code|script|prompt|run|shell|developer)\b/i.test(combined))
    || scene.kind === 'code') {
    return INFORMATION_TYPES.CODE;
  }

  // 3. Interface / App / Workflow
  if (/\b(interface|ui|window|search bar|context window|prompt|input|editor|file tree|query|queries|retrieve|retrieval|dashboard|feed|notification)\b/i.test(combined)
    || /\bdatabase\s+(console|dashboard|screen|interface|client)\b/i.test(combined)
    || scene.kind === 'ui') {
    return INFORMATION_TYPES.INTERFACE;
  }

  // 3. Process / Multi-stage flow / Loops
  if (/\b(loop|step|first|then|finally|cycle|pipeline|pathway|fires|phase|stages|mechanism|trigger.*spike|how it works)\b/i.test(combined)
    || scene.kind === 'process') {
    return INFORMATION_TYPES.PROCESS;
  }

  // 4. Comparison / Contrast / A vs B
  if (/\b(competes|versus|vs|contrast|unlike|differs|opposite|on the other hand|while.*tries|two systems|alternative|choice)\b/i.test(combined)
    || scene.kind === 'comparison' || scene.visualIntent === 'compare') {
    return INFORMATION_TYPES.COMPARISON;
  }

  // 5. Relationship / Architecture / Multi-component networks
  if (/\b(limbic.*prefrontal|prefrontal cortex|neural network|architecture|interact|connects|system.*competes|governs|hierarchy|nodes)\b/i.test(combined)) {
    return INFORMATION_TYPES.RELATIONSHIP;
  }

  // 6. Timeline / Chronological Progression
  if (/\b(history|decades|evolution|chronology|day 1|year 1|milestones|centuries|timeline|over time|gradually|started in|by \d{4})\b/i.test(combined)
    || scene.kind === 'timeline') {
    return INFORMATION_TYPES.TIMELINE;
  }

  // 7. Location / Geography / Global Distribution
  if (/\b(taiwan|netherlands|silicon valley|geography|geopolitical|shipping routes|trade routes|chokepoint map|concentrated in|factories in|shipped from)\b/i.test(combined)
    || (/\b(map|worldwide|across the globe)\b/i.test(combined) && /\b(route|supply|chokepoint|factory|geopolitical|travel|hub)\b/i.test(combined))
    || scene.kind === 'map') {
    return INFORMATION_TYPES.LOCATION;
  }

  // 8. Data / Quantitative / Charts
  if (/\b(percent|%|drops|value drops|discounting|curve|statistics|billion|million|ratio|metric|survey|data points|growth)\b/i.test(combined)
    || scene.kind === 'statistic' || scene.kind === 'chart' || scene.visualIntent === 'quantify') {
    return INFORMATION_TYPES.DATA;
  }

  // 9. Concrete physical entity (machine, person, device, building, artifact)
  if (entities.length > 0 && !/\b(brain|mind|thought|skill|decision|future)\b/i.test(entities)) {
    return INFORMATION_TYPES.ENTITY;
  }
  if (scene.kind === 'subject' || scene.role === 'subject' || scene.role === 'establishing' || scene.role === 'context' || scene.role === 'detail') {
    return INFORMATION_TYPES.ENTITY;
  }

  // 11. Emotion / Atmosphere / Concrete scene
  if (scene.kind === 'atmosphere' || scene.visualIntent === 'humanize' || scene.visualIntent === 'contextualize' || (scene.visualConcept && !scene.emphasis && scene.kind !== 'statement')) {
    return INFORMATION_TYPES.ATMOSPHERE;
  }

  // 12. Pure rhetorical emphasis
  return INFORMATION_TYPES.EMPHASIS;
}
/**
 * Builds a deterministic VisualCoveragePlan for the storyboard.
 * Maps every shot to its primary representation and an ordered non-statement fallback chain.
 * 
 * @param {Object} storyboard - Canonical storyboard
 * @returns {Array<Object>} List of VisualCoverageItem
 */
export function buildVisualCoveragePlan(storyboard, { visualPolicy = null } = {}) {
  const items = [];
  const canonical = Array.isArray(storyboard.sections);
  const scenes = canonical ? flattenStoryboardScenes(storyboard) : (storyboard.scenes || []);
  const sectionByScene = new Map(canonical
    ? storyboard.sections.flatMap((section) => section.scenes.map((scene) => [scene.id, section.id]))
    : scenes.map((scene) => [scene.id, scene.sectionId || 'legacy']));

  resolveVisualPolicy(visualPolicy || {});

  for (const scene of scenes) {
    const shots = scene.shots || [scene];

    for (const shot of shots) {
      const infoType = classifyInformationType({ ...scene, ...shot, narration: scene.narration });
      let primary = REPRESENTATIONS.MEDIA;
      const fallbacks = [REPRESENTATIONS.MEDIA];

      const visualProposition = buildVisualProposition({
        shot,
        scene,
        topic: storyboard.topic || storyboard.title || '',
      });
      const representationDecision = routeRepresentation(visualProposition, {
        shotId: shot.id || `${scene.id}_shot_01`, primaryRepresentation: primary, fallbackRepresentations: fallbacks,
      }, { visualPolicy });
      primary = representationDecision.selectedRepresentation;
      items.push({
        sectionId: sectionByScene.get(scene.id) || 'legacy',
        sceneId: scene.id,
        shotId: shot.id || `${scene.id}_shot_01`,
        informationType: infoType,
        primaryRepresentation: primary,
        fallbackRepresentations: fallbacks,
        semanticPayload: {
          communicationObjective: scene.visualIntent || scene.purpose || 'explain',
          visualConcept: shot.visualConcept || scene.visual || '',
          entities: (shot.entities || scene.entities || []).map((entity) => typeof entity === 'string' ? entity : entity.name).filter(Boolean),
          role: shot.role || 'graphic',
        },
        evidenceRequirements: {
          level: shot.evidenceRequirement || scene.evidenceRequirement || 'conceptual_allowed',
          authenticSourceRequired: (shot.evidenceRequirement || scene.evidenceRequirement) === 'required',
        },
        mediaConstraints: {
          preference: shot.mediaPreference === 'real' ? 'real' : 'auto',
          orientation: storyboard.format === 'shorts' ? 'portrait' : 'landscape',
          focalPointHint: shot.focalPointHint || null,
          motionPreference: shot.motionPreference || null,
        },
        confidence: 0.92,
        rationale: `Shot classified as "${infoType}"; preferred explanatory channel is "${primary}".`,
        coverageStatus: 'UNRESOLVED',
        visualProposition,
        representationDecision,
      });
    }
  }

  return VisualCoveragePlanSchema.parse(items);
}
