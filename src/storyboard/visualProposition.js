import { z } from 'zod-api';

export const VisualPropositionSchema = z.object({
  version: z.literal(1),
  shotId: z.string().min(1),
  sceneId: z.string().min(1),
  domain: z.string().min(1),
  conceptSense: z.string().min(1),
  viewerNeedsToUnderstand: z.string().min(1),
  requiredVisibleEntities: z.array(z.string()),
  requiredVisibleRelationships: z.array(z.string()),
  requiredVisibleActions: z.array(z.string()),
  usefulContext: z.array(z.string()),
  negativeConfusers: z.array(z.string()),
  positiveDescriptions: z.array(z.string()),
  representationNeed: z.enum([
    'REAL_VIDEO', 'REAL_IMAGE', 'ARCHIVAL_IMAGE', 'ARCHIVAL_VIDEO', 'DOCUMENT',
    'SCREENSHOT', 'UI', 'CODE', 'CHART', 'PROCESS', 'DIAGRAM', 'COMPARISON',
    'TIMELINE', 'TEXT_STAT', 'MEDIA_REUSE_DETAIL', 'GENERATED_IMAGE',
  ]),
  literalness: z.enum(['DIRECT', 'CONTEXTUAL_ALLOWED', 'METAPHOR_ALLOWED']),
  evidenceStrength: z.enum(['required', 'preferred', 'contextual']),
  source: z.enum(['STRUCTURED_PLAN', 'DETERMINISTIC_REPAIR']),
});

const unique = (values) => [...new Set(values.map((value) => String(value || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

function domainAndSense(text, kind) {
  if (/database deadlock|\bdeadlock\b|circular wait|mutual exclusion|hold and wait|no preemption|mutex|lock ordering|thread[^.]{0,40}\block\b|transaction[^.]{0,40}\block\b/i.test(text)) {
    return ['software engineering', 'CONCURRENCY_DEADLOCK'];
  }
  if (/grandfather paradox|time travel|causal(?:ity| loop)|parallel universe|many-worlds|branching timeline/i.test(text)) {
    if (/grandfather|grandmother|ancestor|family|generation|never be born/i.test(text)) return ['time travel / causality', 'ANCESTRAL_CAUSALITY'];
    if (/branch|parallel|many-worlds|alternate realit/i.test(text)) return ['time travel / causality', 'TIMELINE_BRANCHING'];
    return ['time travel / causality', 'CAUSAL_TIMELINE'];
  }
  if (/\b(?:memory leak|heap|garbage collect(?:ion|or)?|retained reference|ram)\b/i.test(text)) return ['software engineering', 'SOFTWARE_MEMORY'];
  if (/\b(?:cloud comput(?:ing)?|aws|azure|server cluster|datacenter)\b/i.test(text)) return ['cloud computing', 'COMPUTING_CLOUD'];
  if (/\b(?:dns|tcp|packet|network|http|server request)\b/i.test(text)) return ['computer networking', 'NETWORK_PROTOCOL'];
  const sanitizedText = text
    .replace(/\bstock\s*(?:footage|photo|video|image|clip|media|asset|library)s?\b/gi, '')
    .replace(/\b(?:river|snow|image|media|memory)\s+bank\b/gi, '');
  if (/\b(?:bank run|banking panic|stock market|financial market|wall street|depositor|insolvency|mortgage|credit score|cryptocurrency|portfolio|bonds? and stocks?)\b/i.test(sanitizedText)
    || (/\b(?:finance|financial|banking)\b/i.test(sanitizedText) && !/\b(?:river bank)\b/i.test(sanitizedText))) {
    return ['finance', 'FINANCIAL_SYSTEM'];
  }
  if (/\b(?:dubai|burj\s+khalifa|uae|emirates|marina)\b/i.test(text)) {
    return ['geography and travel', 'LOCATION_LANDMARK'];
  }
  if (/\b(?:roman\s+empire|ancient\s+rome|ancient\s+roman|roman\s+forum|colosseum|pompeii|ancient\s+greece|ancient\s+egypt|ottoman\s+empire|mesopotamia|persian\s+empire)\b/i.test(text)) {
    return ['history and civilizations', 'HISTORICAL_CIVILIZATION'];
  }
  if (/\b(?:runner|running|athlete|athletics|sprint|marathon|jogging|track and field|workout|fitness|gym|training session)\b/i.test(sanitizedText)) {
    return ['sports and fitness', 'ATHLETIC_TRAINING'];
  }
  if (kind === 'timeline') return ['history', 'HISTORICAL_TIMELINE'];
  if (kind === 'code' || kind === 'ui') return ['software engineering', kind === 'code' ? 'SOURCE_CODE' : 'SOFTWARE_INTERFACE'];
  return ['general', String(kind || 'subject').toUpperCase()];
}

function confusersFor(sense) {
  const values = {
    LOCATION_LANDMARK: ['generic modern office meeting', 'stock business team', 'unrelated city skyline without landmark'],
    HISTORICAL_CIVILIZATION: ['modern office building', 'contemporary skyscrapers', 'digital abstract mesh', 'generic modern traffic'],
    ATHLETIC_TRAINING: [
      'office desk paperwork', 'computer keyboard laptop', 'stock chart graphs',
      'corporate boardroom meeting', 'circuit board motherboard', 'car traffic jam',
    ],
    ANCESTRAL_CAUSALITY: ['botanical trees', 'man walking in a park', 'forest scenery', 'family lifestyle stock photo'],
    CAUSAL_TIMELINE: ['video editing timeline', 'project management roadmap', 'railway route map', 'fishbone defect diagram'],
    TIMELINE_BRANCHING: ['botanical tree branches', 'video editing timeline', 'project roadmap', 'microscope cells', 'abstract glowing background'],
    SOFTWARE_MEMORY: ['human memories', 'water pipe leak', 'municipal garbage collector', 'generic programmer portrait'],
    COMPUTING_CLOUD: ['weather clouds', 'blue sky', 'storm clouds'],
    NETWORK_PROTOCOL: ['postal parcel', 'fishing net', 'generic office meeting'],
    FINANCIAL_SYSTEM: ['river bank', 'chemical bond', 'people jogging'],
    CONCURRENCY_DEADLOCK: [
      'traffic gridlock', 'fiber optic cables', 'glowing strands',
      'literal chain and padlock stock photo', 'locked door', 'movie poster',
      'people waiting in a physical queue',
      'valet parking sign', 'bring your car', 'please wait here',
      'credit card', 'bitcoin', 'cryptocurrency',
      'wooden dining table', 'paper checklist',
      'physical key', 'hand holding keys', 'handcuffs', 'prison break', 'jail',
    ],
  };
  return values[sense] || [];
}

function representationNeed(scene, shot, sense, text) {
  const kind = scene.preferredPresentation || scene.kind || scene.presentationSource?.kind;
  if (shot.mediaPreference === 'procedural') {
    if (shot.assetIntent === 'interface') return 'UI';
    if (shot.assetIntent === 'data') return 'DIAGRAM';
    return 'DIAGRAM';
  }
  if (kind === 'code') return 'CODE';
  if (kind === 'ui') return 'UI';
  if (kind === 'chart' || kind === 'statistic') return kind === 'statistic' ? 'TEXT_STAT' : 'CHART';
  if (kind === 'comparison') return 'COMPARISON';
  if (kind === 'timeline') return 'TIMELINE';
  if (kind === 'process') return 'PROCESS';
  if (kind === 'document' || kind === 'quote') return 'DOCUMENT';
  if (shot.assetIntent === 'historical') return 'ARCHIVAL_IMAGE';
  if (kind === 'statement' || kind === 'chapter') return 'TEXT_STAT';
  if (['ANCESTRAL_CAUSALITY', 'CAUSAL_TIMELINE', 'TIMELINE_BRANCHING', 'SOFTWARE_MEMORY', 'NETWORK_PROTOCOL', 'CONCURRENCY_DEADLOCK'].includes(sense)) {
    if (sense === 'ANCESTRAL_CAUSALITY' || sense.includes('TIMELINE')) return 'TIMELINE';
    return 'DIAGRAM';
  }
  if (/connects?|flows?|causes?|depends?|cycle|loop|mechanism|branch/i.test(text)) return 'DIAGRAM';
  const hasDynamicMotion = shot.assetIntent === 'action'
    || ['NEW_ACTION', 'NEW_LOCATION', 'STATE_CHANGE'].includes(shot.semanticSubBeat?.shift)
    || /\b(walks?|runs?|drives?|flies?|moves?|builds?|opens?|closes?|types?|writes?|works?|operates?|travels?|crosses?|launches?|falls?|rises?|crowd|traffic|factory|assembly line|waves?|burns?|flows?|storm|blizzard|winds?|ocean|sailing|rowing|crushing|struggle|workout|training|sprint|marathon)\b/i.test(text);
  if (hasDynamicMotion && shot.assetIntent !== 'document' && shot.role !== 'graphic') {
    return 'REAL_VIDEO';
  }
  if (shot.entities?.length || scene.entities?.length) return scene.evidenceRequirement === 'required' ? 'ARCHIVAL_IMAGE' : 'REAL_IMAGE';
  return 'REAL_IMAGE';
}

/**
 * Converts the already structured LLM plan/storyboard into a validated semantic
 * proposition. The plan is the structured semantic source; deterministic logic
 * repairs unsafe or ambiguous fields without treating search terms as truth.
 */
export function buildVisualProposition({ shot, scene, topic = '' }) {
  const narration = String(shot.narrationSegment || scene.narration || '').trim();
  const concept = String(shot.visualConcept || scene.presentationSource?.visual || scene.visualIntent || '').trim();
  const kind = scene.preferredPresentation || scene.presentationSource?.kind || 'subject';
  const combined = `${narration} ${concept}`;
  // Short beats are often ambiguous in isolation ("it waits in a queue").
  // The authored video topic is semantic context, not visible copy, and must
  // participate in sense disambiguation so a database lock wait cannot become
  // a literal door, poster, or line of people.
  const semanticContext = `${topic} ${combined}`.trim();
  const [domain, conceptSense] = domainAndSense(semanticContext, kind);
  const entities = Array.isArray(shot.entities) && shot.entities.length > 0
    ? unique(shot.entities)
    : (shot.assetIntent === 'entity' ? unique(scene.entities || []) : []);
  const representationNeedValue = representationNeed(scene, shot, conceptSense, semanticContext);
  const relations = [];
  if (conceptSense === 'ANCESTRAL_CAUSALITY') relations.push('grandparents -> parent -> descendant');
  if (conceptSense === 'CAUSAL_TIMELINE') relations.push('cause -> time travel intervention -> contradiction');
  if (conceptSense === 'TIMELINE_BRANCHING') relations.push('original timeline -> divergence -> alternate reality');
  if (conceptSense === 'SOFTWARE_MEMORY') relations.push('retained reference -> unreleased heap memory -> memory growth');
  if (conceptSense === 'NETWORK_PROTOCOL') relations.push('client -> network infrastructure -> server response');
  if (conceptSense === 'CONCURRENCY_DEADLOCK') relations.push('thread A holds lock 1 and waits for lock 2; thread B holds lock 2 and waits for lock 1');

  const viewerNeedsToUnderstand = relations.length
    ? `The visible structure must communicate ${relations.join('; ')}.`
    : `The visual must specifically communicate: ${concept || narration}`;
  const action = shot.semanticSubBeat?.clause && shot.semanticSubBeat.shift === 'NEW_ACTION'
    ? [shot.semanticSubBeat.clause]
    : [];
  const isAbstractOrConceptual = shot.assetIntent === 'concept'
    || shot.role === 'graphic'
    || shot.role === 'atmosphere'
    || /abstract|ambient|background|texture|metaphor/i.test(concept);
  const isDocumentOrHistoricalEvidence = (scene.evidenceRequirement === 'required' || shot.evidenceRequirement === 'required')
    && (shot.assetIntent === 'document' || shot.assetIntent === 'historical' || /document|paper|receipt|certificate|contract|court|record/i.test(concept));
  const isLocationOrCivilization = conceptSense === 'LOCATION_LANDMARK' || conceptSense === 'HISTORICAL_CIVILIZATION'
    || shot.assetIntent === 'location' || shot.assetIntent === 'historical';
  const isSpecificNamedEntity = (shot.assetIntent === 'entity' || isLocationOrCivilization)
    && (shot.entities?.length > 0 || /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(concept) || isLocationOrCivilization);
  const literalness = !isAbstractOrConceptual && (isDocumentOrHistoricalEvidence || isSpecificNamedEntity || isLocationOrCivilization)
    ? 'DIRECT'
    : (shot.role === 'atmosphere' || /abstract|background/i.test(concept)) ? 'METAPHOR_ALLOWED' : 'CONTEXTUAL_ALLOWED';
  const domainSpecificPositives = [];
  if (conceptSense === 'CONCURRENCY_DEADLOCK') {
    domainSpecificPositives.push(
      'software engineer debugging code multi monitor',
      'computer screen code terminal dark mode',
      'database query terminal log monitor',
      'modern server rack data center glowing lights',
    );
  } else if (conceptSense === 'ATHLETIC_TRAINING') {
    domainSpecificPositives.push(
      'athlete runner training outdoor',
      'running track stadium athlete',
      'runner shoes pavement dawn sunrise',
      'determined runner sprinting',
    );
  } else if (conceptSense === 'LOCATION_LANDMARK') {
    domainSpecificPositives.push(
      'Dubai Burj Khalifa modern skyline',
      'Dubai Marina aerial view',
      'Downtown Dubai skyscrapers cityscape',
      'Dubai modern architecture drone shot',
    );
  } else if (conceptSense === 'HISTORICAL_CIVILIZATION') {
    domainSpecificPositives.push(
      'Roman Colosseum ancient ruins Rome',
      'Roman Forum ancient marble architecture ruins',
      'Ancient Roman architecture columns aerial',
      'Ancient Roman statue and temple marble',
    );
  }
  let searchConcepts = shot.searchConcepts || [];
  if (conceptSense === 'CONCURRENCY_DEADLOCK') {
    searchConcepts = searchConcepts.filter((c) => !/padlock|chain|key|keys|handcuff|prison|jail|escape/i.test(c));
  }
  const positiveDescriptions = unique([
    concept,
    ...relations,
    ...domainSpecificPositives,
    ...searchConcepts,
    ...entities.map((entity) => `authentic visual of ${entity}`),
  ]).slice(0, 8);

  return VisualPropositionSchema.parse({
    version: 1,
    shotId: shot.id,
    sceneId: scene.id,
    domain,
    conceptSense,
    viewerNeedsToUnderstand,
    requiredVisibleEntities: entities,
    requiredVisibleRelationships: relations,
    requiredVisibleActions: action,
    usefulContext: unique([domain, scene.purpose, scene.visualIntent]),
    negativeConfusers: confusersFor(conceptSense),
    positiveDescriptions,
    representationNeed: representationNeedValue,
    literalness,
    evidenceStrength: scene.evidenceRequirement === 'required' ? 'required' : scene.evidenceRequirement === 'preferred' ? 'preferred' : 'contextual',
    source: 'STRUCTURED_PLAN',
  });
}
