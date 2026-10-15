/**
 * Visible Need Specification — Enhanced Semantic Layer
 * Milestone — Production Hardening & Semantic Visual Understanding
 * 
 * Defines what the viewer should actually SEE before any asset search occurs.
 * Extracts:
 * - Semantic ambiguities (e.g. travel vs map, risk vs warning sign, memory vs pipe leak)
 * - Negative semantic constraints (avoidVisuals)
 * - Required visible objects, acceptable alternatives, and viewer expectations
 * - Literalness, evidence, role, and importance levels
 */

import { QualityTokens } from '../config/tokens/editorialTokens.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can', 'could',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'into', 'onto', 'about',
]);

const GENERIC_AVOID_VISUALS = [
  'generic smiling office team',
  'corporate handshake in boardroom',
  'abstract technology background with meaningless floating lines',
  'abandoned ruined concrete bunker',
  'decaying ruins',
  'blank green screen mockup phone',
  'cartoon clipart or 3D stickman',
  'stock photography watermark',
  'diagram or flowchart or chart card',
  'infographic with text bullet points',
  'schematic drawing or wireframe',
];

/**
 * Known lexical ambiguities in English technical / narrative terminology.
 */
const AMBIGUITY_RULES = [
  {
    term: 'travel',
    triggerRegex: /\btravel(?:ling|ed|ler|s)?\b/i,
    literalContextRegex: /\b(?:london|paris|rome|tokyo|new york|city|flight|train|miles|kilometers|journey across|map)\b/i,
    nonLiteralAvoid: ['geographic road map', 'highway road navigation', 'airport luggage passport', 'tourist brochure'],
    explanation: 'travel in narrative/time-travel beat is not geographical tourism or highway navigation',
  },
  {
    term: 'risk',
    triggerRegex: /\brisk(?:s|ing|ed)?\b/i,
    literalContextRegex: /\b(?:slippery|radiation|chemical|biohazard|hard hat|hazard|sign)\b/i,
    nonLiteralAvoid: ['wet floor warning sign', 'yellow caution triangle', 'construction hazard sign', 'toxic hazard symbol'],
    explanation: 'abstract decision or technical risk is not a physical slippery-floor or construction caution sign',
  },
  {
    term: 'cloud',
    triggerRegex: /\bcloud\b/i,
    literalContextRegex: /\b(?:weather|cumulus|rain|sky|storm|overcast|atmosphere)\b/i,
    nonLiteralAvoid: ['fluffy white cumulus cloud in blue sky', 'weather storm clouds', 'outdoor sky horizon'],
    explanation: 'cloud computing infrastructure is not atmospheric weather clouds',
  },
  {
    term: 'memory',
    triggerRegex: /\bmemory\b/i,
    literalContextRegex: /\b(?:childhood|nostalgia|remember|reminisc|brain|mind|dementia)\b/i,
    nonLiteralAvoid: ['childhood photo album', 'elderly person reminiscing', 'sepia nostalgia portrait'],
    explanation: 'computer RAM/memory allocation is not human psychological memory or nostalgia',
  },
  {
    term: 'leak',
    triggerRegex: /\bleak(?:s|ing|age)?\b/i,
    literalContextRegex: /\b(?:pipe|plumbing|faucet|water|oil|valve|bucket|sink)\b/i,
    nonLiteralAvoid: ['dripping water pipe', 'leaking plumbing faucet', 'puddle on floor from pipe', 'plumber fixing leak'],
    explanation: 'software memory leak is not a plumbing or dripping water pipe',
  },
  {
    term: 'packet',
    triggerRegex: /\bpacket(?:s)?\b/i,
    literalContextRegex: /\b(?:mail|post|parcel|cardboard|envelope|shipping|delivery|box)\b/i,
    nonLiteralAvoid: ['cardboard shipping box parcel', 'postal delivery package', 'bubble mailer envelope'],
    explanation: 'network data packet is not a physical postal package or delivery parcel',
  },
  {
    term: 'branch',
    triggerRegex: /\bbranch(?:es|ing|ed)?\b/i,
    literalContextRegex: /\b(?:tree|wood|foliage|forest|leaves|oak|pine|pruning)\b/i,
    nonLiteralAvoid: ['tree branch with green leaves', 'wooden stick in forest', 'birds on tree branch'],
    explanation: 'branch prediction or timeline branching is not a tree branch with foliage',
  },
  {
    term: 'thread',
    triggerRegex: /\bthread(?:s|ing|ed)?\b/i,
    literalContextRegex: /\b(?:sewing|needle|cotton|spool|textile|cloth|tailor)\b/i,
    nonLiteralAvoid: ['sewing thread on spool', 'needle and thread sewing', 'colorful textile yarn'],
    explanation: 'CPU multithreading or software thread is not textile sewing thread',
  },
  {
    term: 'kernel',
    triggerRegex: /\bkernel(?:s)?\b/i,
    literalContextRegex: /\b(?:corn|popcorn|maize|seed|cereal|nut)\b/i,
    nonLiteralAvoid: ['corn on cob with kernels', 'popcorn bowl snack', 'seed agriculture'],
    explanation: 'operating system kernel is not edible corn or popcorn kernels',
  },
  {
    term: 'network',
    triggerRegex: /\bnetwork(?:s|ing)?\b/i,
    literalContextRegex: /\b(?:fish|fishing|trawler|spider|web|mesh|wire fence)\b/i,
    nonLiteralAvoid: ['fishing net on boat', 'spider web in nature', 'people connected by silly drawn lines'],
    explanation: 'computer/telecom network is not a fishing net or generic people with connected lines',
  },
  {
    term: 'current',
    triggerRegex: /\bcurrent(?:s)?\b/i,
    literalContextRegex: /\b(?:river|ocean|water|tide|stream|rapids|swimming)\b/i,
    nonLiteralAvoid: ['rushing river water rapids', 'ocean tide current', 'swimmer in river'],
    explanation: 'electrical current or data transmission is not rushing river water current',
  },
  {
    term: 'bond',
    triggerRegex: /\bbond(?:s|ing)?\b/i,
    literalContextRegex: /\b(?:chemical|molecule|atom|covalent|ionic|chemistry)\b/i,
    nonLiteralAvoid: ['chemical molecular ball and stick model', 'handcuffs or rope bondage'],
    explanation: 'financial bond yield is not chemical atomic bonds or handcuffs',
  },
  {
    term: 'virus',
    triggerRegex: /\bvirus(?:es)?\b/i,
    literalContextRegex: /\b(?:flu|covid|pathogen|bacteria|illness|infection|medical|biology)\b/i,
    nonLiteralAvoid: ['biological spherical virus illustration with spikes', 'medical petri dish virus'],
    explanation: 'computer malware virus is not a biological viral illness pathogen',
  },
  {
    term: 'bank',
    triggerRegex: /\bbank(?:s|ing)?\b/i,
    literalContextRegex: /\b(?:river|lake|canal|shore|mud|grass)\b/i,
    nonLiteralAvoid: ['people jogging along grassy river bank', 'muddy river shore'],
    explanation: 'financial banking crisis or transaction is not a geographic river bank',
  },
  {
    term: 'deadlock',
    triggerRegex: /\bdeadlock(?:s)?\b/i,
    literalContextRegex: /\b(?:padlock|key|deadbolt|door|latch)\b/i,
    nonLiteralAvoid: ['brass padlock with key', 'door lock deadbolt hardware', 'highway traffic jam with cars gridlock', 'bumper to bumper vehicles'],
    explanation: 'software concurrency deadlock is not a hardware door padlock or traffic jam',
  },
  {
    term: 'transaction',
    triggerRegex: /\btransaction(?:s)?\b/i,
    literalContextRegex: /\b(?:credit\s+card|mastercard|visa|bitcoin|cash|checkout|retail|shopping|pos)\b/i,
    nonLiteralAvoid: ['credit cards and smartphones', 'bitcoin crypto display', 'shopping cart checkout', 'cash register payment'],
    explanation: 'database ACID transaction is not a retail credit card or cryptocurrency checkout',
  },
  {
    term: 'waiting',
    triggerRegex: /\bwait(?:ing|s)?\b/i,
    literalContextRegex: /\b(?:valet|parking|hospital|bus\s+stop|train\s+bench|lounge|restaurant)\b/i,
    nonLiteralAvoid: ['valet parking wait sign', 'hospital waiting room', 'bus stop bench', 'people waiting in line for food'],
    explanation: 'software thread waiting on lock is not valet parking or hospital waiting room',
  },
  {
    term: 'table',
    triggerRegex: /\btable(?:s)?\b/i,
    literalContextRegex: /\b(?:dining|wooden|kitchen|restaurant|furniture|tablecloth|chairs)\b/i,
    nonLiteralAvoid: ['wooden dining table', 'restaurant dinner table', 'kitchen furniture'],
    explanation: 'database relation table is not wooden dining furniture',
  },
  {
    term: 'cache',
    triggerRegex: /\bcache(?:s|d)?\b/i,
    literalContextRegex: /\b(?:register|cash|supermarket|money|checkout)\b/i,
    nonLiteralAvoid: ['supermarket cash register drawer', 'money coins and notes till'],
    explanation: 'CPU cache miss is not a supermarket cash register till',
  },
  {
    term: 'parallel universe',
    triggerRegex: /parallel\s+universe|multiverse/i,
    literalContextRegex: /\b(?:music|guitar|fender|pedal|stompbox)\b/i,
    nonLiteralAvoid: ['guitar pedal', 'musical stompbox', 'amplifier audio effect', 'electric guitar'],
    explanation: 'parallel universe physics concept is not an audio guitar effects pedal',
  },
];

/**
 * Extracts action verbs or state phrases from narration.
 */
function extractAction(text = '') {
  const lower = text.toLowerCase();
  if (/\b(?:send|sending|request|fetch|retrieve|get|ping)\b/i.test(lower)) return 'sending or requesting data';
  if (/\b(?:return|response|serve|serving|reply|deliver)\b/i.test(lower)) return 'returning data or response';
  if (/\b(?:parse|parsing|read|reading|inspect|analyze)\b/i.test(lower)) return 'parsing or inspecting structure';
  if (/\b(?:execute|executing|run|running|compute|calculat\w*)\b/i.test(lower)) return 'executing instructions or compute';
  if (/\b(?:render|rendering|paint|composite|draw|display)\b/i.test(lower)) return 'rendering or painting visuals';
  if (/\b(?:connect|connecting|link|transmit|flow|travel)\b/i.test(lower)) return 'connecting or transmitting';
  if (/\b(?:lay|laying|install|installing|bury|stretch)\b/i.test(lower)) return 'installing or stretching infrastructure';
  if (/\b(?:crash|drop|plummet|fall|collapse|deplete)\b/i.test(lower)) return 'crashing, failing, or declining rapidly';
  if (/\b(?:build|create|manufacture|produce|forge)\b/i.test(lower)) return 'manufacturing, fabricating, or constructing';
  if (/\b(?:breath|breathe|breathing|exhale|inhale)\b/i.test(lower)) return 'slow natural breathing';
  if (/\b(?:breeze|wind)\b/i.test(lower) && /\b(?:leaves|flowers?|grass|trees?|branches)\b/i.test(lower)) return 'leaves and flowers moving in a gentle breeze';
  if (/\b(?:cool|cooling|chill|refrigerat\w*|dissipat\w*)\b/i.test(lower)
    && /\b(?:heat|thermal|temperature|engine|chip|cpu|gpu|server|hardware|radiator|fan)\b/i.test(lower)) return 'cooling or heat dissipation';
  if (/\b(?:burn|combust|heat|flame|ignit\w*)\b/i.test(lower)) return 'extreme combustion, ignition, or glowing heat';
  if (/\b(?:leak|exhaust|overflow|corrupt)\b/i.test(lower)) return 'uncontrolled leaking or memory exhaustion';
  if (/\b(?:branch|split|diverg\w*|fork)\b/i.test(lower)) return 'branching or diverging paths';
  if (/\b(?:work|working|type|typing|write|writing|desk|office)\b/i.test(lower)) return 'working calmly at office desk';
  if (/\b(?:choose|choosing|choice|choices|decide|deciding|option|options|offer|offers|select|compare)\b/i.test(lower)) return 'evaluating, comparing, or choosing options';
  return 'active demonstration or relevant physical phenomenon';
}

/**
 * Extracts dominant physical environment from narration.
 */
function extractEnvironment(text = '') {
  const lower = text.toLowerCase();
  if (/ocean|sea|underwater|deep\s+sea|seabed|ocean\s+floor/i.test(lower)) return 'deep ocean seabed or underwater marine';
  if (/garden|jasmine|flowers?|leaves|moonlight/i.test(lower)) return 'peaceful natural garden at night';
  if (/forest|woods?|trees?|cabin/i.test(lower)) return 'quiet forest or woodland at night';
  if (/night|stars?|moon|evening|darkness/i.test(lower)) return 'peaceful nighttime landscape';
  if (/datacenter|data\s+center|server\s+room|rack/i.test(lower)) return 'modern datacenter, server hall, or clean server racks';
  if (/browser|devtools|screen|computer|desktop|laptop/i.test(lower)) return 'computer screen or web browser devtools interface';
  if (/wall\s+street|stock\s+exchange|trading\s+floor/i.test(lower)) return 'stock exchange trading floor';
  if (/factory|foundry|cleanroom|assembly|semiconductor/i.test(lower)) return 'semiconductor cleanroom or precision factory';
  if (/space|orbit|cosmos|universe|galaxy/i.test(lower)) return 'deep space, astrophysical cosmos, or orbit';
  if (/laboratory|lab|microscope|test rig|bench/i.test(lower)) return 'scientific laboratory or engineering test facility';
  if (/jet\s+engine|turbine|combustor|cockpit|aircraft|airplane/i.test(lower)) return 'aerospace engineering facility or aircraft in flight';
  if (/phone|smartphone|mobile|pocket/i.test(lower)) return 'smartphone device in use or silicon chip interior';
  return 'authentic real-world environment matching context';
}

/**
 * Extracts key physical subject nouns.
 */
function extractSubject(text = '', entities = []) {
  if (entities.length > 0) return entities.join(' and ');
  const lower = text.toLowerCase();
  if (/undersea\s+cables?|submarine\s+cables?|fiber\s+optic/i.test(lower)) return 'undersea fiber optic cable';
  if (/jet\s+engine|combustor|turbine\s+blade/i.test(lower)) return 'jet engine turbine blade and combustor';
  if (/quantum\s+tunneling|electron|barrier/i.test(lower)) return 'quantum electron tunneling through barrier';
  if (/memory\s+leak|ram|heap|allocation/i.test(lower)) return 'computer memory RAM allocation and consumption';
  if (/cloud\s+computing|servers?|aws|azure/i.test(lower)) return 'cloud computing server architecture';
  if (/packet\s+loss|tcp|router|network/i.test(lower)) return 'network data packet transmission';
  if (/branch\s+prediction|cpu|pipeline/i.test(lower)) return 'CPU branch prediction execution pipeline';
  if (/parallel\s+universe|multiverse|many\s+worlds/i.test(lower)) return 'branching parallel universes or multiverse cosmos';
  if (/browser|devtools/i.test(lower) && /server/i.test(lower)) return 'web browser and server communication';
  if (/browser|chrome|firefox|safari/i.test(lower)) return 'web browser interface';
  if (/server|datacenter/i.test(lower)) return 'datacenter server hardware';
  if (/gpu|graphics\s+card|microchip/i.test(lower)) return 'semiconductor microchip GPU';
  if (/transistor|gate|die|silicon/i.test(lower)) return 'nanometer silicon transistor gate';
  return text.split(/\s+/).filter((w) => !STOP_WORDS.has(w.toLowerCase())).slice(0, 3).join(' ') || 'core concept';
}

/**
 * Detects semantic ambiguities in the narration and generates negative constraints.
 */
export function detectSemanticAmbiguities(narrationText = '') {
  const ambiguities = [];
  const dynamicAvoids = [];

  for (const rule of AMBIGUITY_RULES) {
    if (rule.triggerRegex.test(narrationText)) {
      const isLiteral = rule.literalContextRegex.test(narrationText);
      if (!isLiteral) {
        ambiguities.push({
          term: rule.term,
          detectedContext: narrationText.slice(0, 80),
          avoidedDomains: rule.nonLiteralAvoid,
          explanation: rule.explanation,
        });
        dynamicAvoids.push(...rule.nonLiteralAvoid);
      }
    }
  }

  return {
    ambiguities,
    dynamicAvoids: [...new Set(dynamicAvoids)],
  };
}

/**
 * Derives legitimate semantic alternatives representing the SAME underlying concept.
 * Note: Never includes search experiment strings or noisy tool queries!
 */
export function deriveSemanticAlternatives(primaryConcept = '', subject = '', action = '', narrationText = '') {
  const text = `${primaryConcept} ${subject} ${action} ${narrationText}`.toLowerCase();
  const alternatives = [];

  if (/branching\s+timeline|split\s+reality|alternate\s+timeline|parallel\s+universe|multiverse/i.test(text)) {
    alternatives.push(
      'parallel worlds diverging',
      'causal branch',
      'spacetime divergence',
      'alternate history split',
      'multiverse branching graph',
      'diverging timeline diagram'
    );
  } else if (/grandfather\s+paradox|time\s+paradox|causal\s+loop|time\s+travel/i.test(text)) {
    alternatives.push(
      'temporal causal loop',
      'closed timelike curve',
      'retrocausality dilemma',
      'predestination paradox',
      'causality breakdown diagram'
    );
  } else if (/family\s+tree|lineage|ancestry|grandparent|ancestor/i.test(text)) {
    alternatives.push(
      'genealogical pedigree chart',
      'ancestral descent tree',
      'family lineage diagram',
      'genealogy chart'
    );
  } else if (/memory\s+leak|ram\s+exhaustion|heap|unreleased\s+pointer/i.test(text)) {
    alternatives.push(
      'heap memory consumption graph',
      'unreleased memory block allocation',
      'memory profile timeline',
      'virtual memory exhaustion monitor',
      'computer memory close up'
    );
  } else if (/garbage\s+collect|v8\s+engine|reclaim.*memory/i.test(text)) {
    alternatives.push(
      'mark and sweep algorithm visualization',
      'heap reference graph',
      'memory compaction diagram',
      'software architecture diagram',
      'runtime memory cycle graph'
    );
  } else if (/cloud\s+computing|data\s+center|server\s+rack/i.test(text)) {
    alternatives.push(
      'cloud server cluster',
      'data center rack row',
      'global telecom infrastructure',
      'interconnected server farm',
      'cloud storage cluster'
    );
  } else if (/deadlock|concurrency|mutex|lock\s+contention/i.test(text)) {
    alternatives.push(
      'software engineer debugging code multi monitor',
      'computer screen code terminal dark mode',
      'database query terminal log monitor',
      'modern server rack data center glowing lights',
      'software developer programming workstation'
    );
  } else if (/database|sql\b|postgres|mysql|sqlite|acid\b|transaction/i.test(text)) {
    alternatives.push(
      'database query sql editor screen',
      'computer screen code terminal dark mode',
      'server terminal logs running code',
      'modern server rack data center glowing lights',
      'software engineer writing backend code'
    );
  } else if (/branch\s+prediction|cpu\s+pipeline|speculative\s+execution/i.test(text)) {
    alternatives.push(
      'cpu instruction pipeline diagram',
      'speculative branch trace graph',
      'microprocessor execution units',
      'processor architecture schematic'
    );
  }

  if (subject) {
    alternatives.push(`authentic close up or detail of ${subject}`);
    const technicalContext = /\b(?:technical|engineering|laboratory|machine|hardware|chip|cpu|gpu|server|engine|thermal|microscopic)\b/i.test(text);
    if (technicalContext) {
      alternatives.push(
        `technical cutaway or microscopic cross section of ${subject}`,
        `laboratory or engineering test rig showing ${action || 'operation'}`
      );
    } else {
      alternatives.push(`authentic wide view of ${subject} in its natural environment`);
    }
  }

  return [...new Set(alternatives)];
}

/**
 * Builds an explicit VisibleNeed object.
 */
export function buildVisibleNeed(firstArg = {}, secondArg = {}) {
  const isPositional = firstArg && !firstArg.shot && (firstArg.id || firstArg.storyboardShotId || firstArg.concept || firstArg.visualConcept);
  const shot = isPositional ? firstArg : (firstArg.shot || {});
  const options = isPositional ? secondArg : firstArg;
  const scene = options.scene || null;
  const narration = options.narration || '';
  const format = options.format || 'landscape';
  const editorialMode = options.editorialMode || 'TECHNICAL_EXPLAINER';
  const visualProposition = options.visualProposition || null;
  const videoTopic = String(options.videoTopic || '').trim();

  const shotId = shot.id || shot.storyboardShotId || 'shot-01';
  const sceneId = scene?.id || shot.sceneId || 'scene-01';
  const narrationText = String(shot.narrationSegment || scene?.narration || narration || shot.narration || '').trim();
  const entities = Array.isArray(shot.entities) && shot.entities.length > 0
    ? shot.entities
    : (shot.assetIntent === 'entity' ? (scene?.entities || []) : []);
  const primaryConcept = String(shot.visualConcept || shot.title || shot.concept || scene?.title || entities[0] || 'core concept').trim();

  // Determine visual role
  let visualRole = (shot.visualRole || shot.role || 'CONTEXT').toUpperCase();
  if (shot.visualRole) {
    visualRole = shot.visualRole.toUpperCase();
  } else if (/abstract\s+background|ambient\s+texture|gradient\s+background|dark\s+abstract/i.test(primaryConcept) || shot.role === 'atmosphere' || shot.assetIntent === 'atmosphere') {
    visualRole = 'ATMOSPHERE';
  } else if (shot.role === 'hook' || shot.assetIntent === 'hook' || (scene?.purpose === 'hook' && shot.role !== 'atmosphere' && shot.role !== 'detail')) {
    visualRole = 'HOOK';
  } else if (shot.role === 'payoff' || shot.assetIntent === 'payoff' || ((scene?.purpose === 'payoff' || scene?.purpose === 'conclusion') && shot.role !== 'atmosphere' && shot.role !== 'detail' && shot.role !== 'graphic')) {
    visualRole = 'PAYOFF';
  } else if (shot.role === 'evidence' || shot.assetIntent === 'evidence' || (shot.evidenceRequirement === 'required' && shot.role !== 'graphic' && shot.assetIntent !== 'concept')) {
    visualRole = 'EVIDENCE';
  } else if (shot.role === 'action' || shot.assetIntent === 'action') {
    visualRole = 'ACTION';
  } else if (shot.role === 'detail' || shot.assetIntent === 'detail') {
    visualRole = 'DETAIL';
  } else if (shot.role === 'establishing' || shot.assetIntent === 'establishing') {
    visualRole = 'ESTABLISH';
  } else if (shot.role === 'transition' || shot.assetIntent === 'transition') {
    visualRole = 'TRANSITION';
  }

  // Importance
  let importance = 'MEDIUM';
  if (visualRole === 'HOOK' || visualRole === 'PAYOFF' || visualRole === 'EVIDENCE') {
    importance = 'CRITICAL';
  } else if (visualRole === 'ACTION' || visualRole === 'DETAIL' || visualRole === 'ESTABLISH') {
    importance = 'HIGH';
  } else if (visualRole === 'ATMOSPHERE') {
    importance = 'LOW';
  }

  // Literalness requirement
  let literalnessRequirement = 'DIRECT';
  if (visualRole === 'ATMOSPHERE' || /abstract|ambient|background|texture/i.test(primaryConcept)) {
    literalnessRequirement = 'METAPHOR_ALLOWED';
  } else if (['TECHNICAL_EXPLAINER', 'TUTORIAL', 'DOCUMENTARY'].includes(editorialMode)) {
    if ((visualRole === 'EVIDENCE' || visualRole === 'ACTION' || visualRole === 'DETAIL' || visualRole === 'HOOK') && shot.assetIntent !== 'concept' && shot.role !== 'graphic') {
      literalnessRequirement = 'DIRECT';
    } else {
      literalnessRequirement = 'CONTEXTUAL_ALLOWED';
    }
  } else if (['MOTIVATIONAL', 'STORY'].includes(editorialMode)) {
    literalnessRequirement = visualRole === 'ATMOSPHERE' ? 'METAPHOR_ALLOWED' : 'CONTEXTUAL_ALLOWED';
  } else {
    literalnessRequirement = visualRole === 'ATMOSPHERE' ? 'METAPHOR_ALLOWED' : 'CONTEXTUAL_ALLOWED';
  }

  const propositionEntities = (shot.assetIntent === 'entity' || (shot.entities && shot.entities.length > 0))
    ? (visualProposition?.requiredVisibleEntities || [])
    : (shot.entities || []);
  const propositionRelationships = visualProposition?.requiredVisibleRelationships || [];
  const propositionActions = visualProposition?.requiredVisibleActions || [];
  const subject = (propositionEntities.length > 0 ? propositionEntities[0] : null)
    || (primaryConcept && primaryConcept !== 'core concept'
      ? primaryConcept
      : (propositionRelationships.length
        ? visualProposition?.conceptSense.replace(/_/g, ' ').toLowerCase()
        : (entities.length > 0
          ? entities.join(' and ')
          : extractSubject(narrationText, entities))));
  const semanticText = `${narrationText} ${primaryConcept}`.trim();
  const action = propositionActions[0] || (propositionRelationships.length ? 'showing the required causal relationship' : extractAction(semanticText));
  const propositionDomain = String(visualProposition?.domain || '').trim();
  const environment = propositionDomain && propositionDomain.toLowerCase() !== 'general'
    ? propositionDomain
    : extractEnvironment(semanticText);

  // Ambiguity detection & negative constraints
  const { ambiguities, dynamicAvoids } = detectSemanticAmbiguities(`${videoTopic} ${narrationText}`.trim());

  const requiredVisibleObjects = [...propositionEntities];
  if (primaryConcept && primaryConcept !== 'core concept') {
    requiredVisibleObjects.push(primaryConcept);
  }
  if (entities.length > 0) {
    requiredVisibleObjects.push(...entities);
  } else if (subject && !requiredVisibleObjects.includes(subject)) {
    requiredVisibleObjects.push(subject);
  }

  // Section 7-10: Distinct separation of requiredConcepts, acceptableSemanticAlternatives, and searchExperiments
  const requiredConcepts = [...new Set([
    primaryConcept,
    ...(entities || []),
    subject,
    ...propositionRelationships,
  ].filter(Boolean))];

  const acceptableSemanticAlternatives = [...new Set([
    ...(visualProposition?.positiveDescriptions || []),
    ...deriveSemanticAlternatives(primaryConcept, subject, action, narrationText),
  ])];

  // Search experiments are candidate queries worth trying — NEVER proof of semantic relevance!
  const searchExperiments = [
    ...(shot.searchConcepts || []),
    ...(scene?.imageQueries || []),
  ].filter((c) => c && typeof c === 'string' && c.trim().length > 0 && !requiredConcepts.includes(c.trim()));

  const viewerNeedsToSee = `A visual clearly showing ${subject} during ${action} within ${environment}`;

  const avoidVisuals = [
    ...GENERIC_AVOID_VISUALS,
    ...dynamicAvoids,
    ...(visualProposition?.negativeConfusers || []),
  ];

  if (/machine|equipment|hardware|chip|cable|server|blade|engine/i.test(subject)) {
    avoidVisuals.push(
      'corporate headquarters exterior glass building',
      'executive portrait in business suit',
      'generic business people laughing at laptop',
      'generic office meeting handshake'
    );
  }

  return {
    shotId,
    sceneId,
    narrationText,
    narrationStart: Number(shot.startFrame ? (shot.startFrame / 30).toFixed(2) : 0),
    narrationEnd: Number(shot.endFrame ? (shot.endFrame / 30).toFixed(2) : 0),
    primaryConcept,
    subject,
    action,
    environment,
    viewerNeedsToSee,
    requiredVisibleObjects,
    requiredConcepts,
    requiredEntities: entities,
    entities,
    acceptableSemanticAlternatives,
    acceptableAlternatives: acceptableSemanticAlternatives, // backward-compatibility alias
    searchExperiments,
    avoidVisuals: [...new Set(avoidVisuals)],
    evidenceRequirement: shot.evidenceRequirement || (visualRole === 'EVIDENCE' ? 'required' : 'contextual'),
    visualRole,
    literalnessRequirement,
    importance,
    format: format === 'shorts' ? 'shorts' : 'landscape',
    semanticAmbiguities: ambiguities,
    visualProposition,
    videoTopic,
    editorialMode,
  };
}
