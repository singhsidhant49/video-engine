const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Content-aware duration bands (in seconds) by shot/content type. */
export const DURATION_BANDS = {
  establishing: { min: 2.5, ideal: 3.8, max: 5.5 },
  important_photo: { min: 3.0, ideal: 4.2, max: 6.5 },
  detail: { min: 1.8, ideal: 2.6, max: 3.5 },
  document_evidence: { min: 3.0, ideal: 4.5, max: 6.5 },
  chart: { min: 4.0, ideal: 5.5, max: 8.0 },
  process: { min: 4.0, ideal: 5.5, max: 8.0 },
  hero_stat: { min: 2.5, ideal: 3.8, max: 5.5 },
  kinetic_headline: { min: 1.8, ideal: 2.5, max: 3.5 },
  emotional_hold: { min: 3.0, ideal: 4.8, max: 7.0 },
  montage_cut: { min: 0.8, ideal: 1.4, max: 2.0 },
};

const ACTION_VERBS = /\b(sends?|requests?|responds?|receives?|processes|parses?|builds?|calculates?|renders?|paints?|draws?|executes?|composites?|translates?|connects?|travels?|moves?|converts?|transforms?|scales?|concentrates?|records?|makes?|runs?|appears?)\b/i;
const LOCATION_TERMS = /\b(server\s+rack|data\s+center|datacenter|browser|network|cloud|motherboard|screen|room|exchange|wall\s+street|globe|city|borders?|infrastructure)\b/i;
const EVIDENCE_TERMS = /\b(claims?|records?|statistics?|numbers?|data|documents?|paper|proof|audit|filings?|contracts?)\b/i;
const EXAMPLE_TERMS = /\b(for\s+example|for\s+instance|such\s+as|like\s+[a-z0-9_.-]+|example\.com)\b/i;
const DETAIL_TERMS = /\b(close\s*up|detail|sub-beat|node|pixel|layer|spec|syntax|byte|chip|die|register)\b/i;
const STATE_TERMS = /\b(turns?\s+into|became|becomes|changed?|moves?\s+from|from\s+.+\s+to\s+|snaps?\s+to|loading|stuck|complete)\b/i;
const EMOTIONAL_TERMS = /\b(but\s+what|marvel|risk|danger|suddenly|shocking|actually|hidden|reveals?)\b/i;

function deriveSemanticBeatLabel(clause = '') {
  const c = clause.toLowerCase();
  if (/typing\s+url|address\s+bar|browser\s+url/i.test(c)) return 'URL_ENTRY';
  if (/webpage\s+appears|page\s+appears|fast\s+page\s+load/i.test(c)) return 'PAGE_LOAD';
  if (/(?:browser|client|web)\s+requests?|sends?\s+(?:an?\s+)?(?:http\s+)?request|http\s+request/i.test(c)) return 'REQUEST';
  if (/server\s+responds|responds?\s+with\s+html|returns?\s+html/i.test(c)) return 'RESPONSE';
  if (/deadlock|circular\s+wait|lock\s+contention|thread\s+waiting|mutex\b/i.test(c)) return 'LOCK_CONTENTION';
  if (/database|sql\b|postgres|mysql|sqlite|query\s+planner|acid\b/i.test(c)) return 'DB_QUERY';
  if (/(?:database|sql|db)\s+(?:transaction|commit|rollback)|\b(acid\s+transaction|transaction\s+isolation)\b/i.test(c)) return 'DB_TRANSACTION';
  if (/datacenter|server\s+rack|modern\s+server|infrastructure|server\s+hardware|server\s+room/i.test(c)) return 'SERVER';
  if (/html\s+parse|parses?\s+html|dom\s+tree|parse\s+html/i.test(c)) return 'HTML_PARSE';
  if (/css\s+applied|css\s+parse|cssom|styles?\s+computed|css\b/i.test(c)) return 'CSS_PARSE';
  if (/javascript|interactive|interactivity|js\b|event\s+loop/i.test(c)) return 'JAVASCRIPT';
  if (/render\s+tree|combines?\s+dom/i.test(c)) return 'RENDER_TREE';
  if (/layout|geometry|coordinates/i.test(c)) return 'LAYOUT';
  if (/composite|gpu\s+draws|gpu\b|60\s+frames|smooth\s+frames/i.test(c)) return 'COMPOSITING';
  if (/paint|fills?\s+in\s+pixels/i.test(c)) return 'PAINT';
  if (/dns\s+lookup|translates?\s+names|ip\s+address/i.test(c)) return 'DNS_LOOKUP';
  if (/\b(?:tcp\s+handshake|tls\s+handshake|three-way\s+handshake|network\s+handshake)\b/i.test(c)) return 'TCP_HANDSHAKE';
  return 'VISUAL_BEAT';
}

/**
 * Segment a narration scene into semantic visual sub-beats.
 * Only identifies real semantic shifts:
 * NEW_ENTITY, NEW_ACTION, NEW_LOCATION, NEW_EVIDENCE, NEW_EXAMPLE, DETAIL_SHIFT, STATE_CHANGE, EMOTIONAL_SHIFT.
 */
export function segmentVisualBeats(narration = '', entities = []) {
  if (!narration || typeof narration !== 'string') return [];
  const text = narration.trim();

  // Split along clause boundaries, transitional conjunctions, or internal list/action clauses
  const rawClauses = text.split(/(?<=[.?!;])\s+|(?<=\s[-–—]\s+)|\b(?:then|meanwhile|next|finally|first)\b\s*/i)
    .flatMap((c) => {
      const sub = c.split(/\s*,\s*and\s+/i);
      if (sub.length > 1 && sub.slice(1).some((p) => ACTION_VERBS.test(p))) {
        return sub;
      }
      return [c];
    })
    .map((c) => c.replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim())
    .filter((c) => c.length > 6);

  if (rawClauses.length <= 1) {
    // Check if the single clause has an internal action shift via 'and' or comma
    const subParts = text.split(/\s*,\s*and\s+|\s+and\s+(?:the\s+)?/i)
      .map((c) => c.replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim())
      .filter((c) => c.length > 6);
    if (subParts.length > 1 && subParts.slice(1).some((c) => ACTION_VERBS.test(c) || (entities || []).some((e) => c.toLowerCase().includes(e.toLowerCase())))) {
      return subParts.map((clause, idx) => {
        const label = deriveSemanticBeatLabel(clause);
        const shift = idx === 0 ? 'ESTABLISH' : ACTION_VERBS.test(clause) ? 'NEW_ACTION' : 'NEW_ENTITY';
        return { clause, label, shift, entities: entities.filter((e) => clause.toLowerCase().includes(e.toLowerCase())) };
      });
    }
    return [{ clause: text, label: deriveSemanticBeatLabel(text), shift: 'ESTABLISH', entities }];
  }

  const beats = [];
  for (let i = 0; i < rawClauses.length; i++) {
    const clause = rawClauses[i];
    let shift = 'NEW_ACTION';
    if (i === 0) {
      shift = 'ESTABLISH';
    } else if (STATE_TERMS.test(clause)) {
      shift = 'STATE_CHANGE';
    } else if (EXAMPLE_TERMS.test(clause)) {
      shift = 'NEW_EXAMPLE';
    } else if (EVIDENCE_TERMS.test(clause)) {
      shift = 'NEW_EVIDENCE';
    } else if (LOCATION_TERMS.test(clause) && !LOCATION_TERMS.test(rawClauses[i - 1])) {
      shift = 'NEW_LOCATION';
    } else if (DETAIL_TERMS.test(clause)) {
      shift = 'DETAIL_SHIFT';
    } else if (EMOTIONAL_TERMS.test(clause)) {
      shift = 'EMOTIONAL_SHIFT';
    } else if (ACTION_VERBS.test(clause)) {
      shift = 'NEW_ACTION';
    } else {
      const prevEntities = new Set((entities || []).filter((e) => rawClauses[i - 1].toLowerCase().includes(e.toLowerCase())));
      const curEntities = (entities || []).filter((e) => clause.toLowerCase().includes(e.toLowerCase()));
      if (curEntities.some((e) => !prevEntities.has(e))) {
        shift = 'NEW_ENTITY';
      } else {
        shift = 'DETAIL_SHIFT';
      }
    }
    beats.push({
      clause,
      label: deriveSemanticBeatLabel(clause),
      shift,
      entities: entities.filter((e) => clause.toLowerCase().includes(e.toLowerCase())),
    });
  }
  return beats;
}

/** Content-aware visual beat demand derived from narration semantics rather than duration thresholds alone. */
export function estimateShotDemand(scene, strategy) {
  const isMediaEditorial = Boolean(strategy?.useMediaEditorial || strategy?.mediaEditorial || scene.mediaEditorial);
  const primaryKind = scene.preferredPresentation;
  const isShorts = strategy?.format === 'shorts' || scene.format === 'shorts';

  // Complex graphics and data kinds MUST hold stable for the whole explanation in procedural mode
  if (!isMediaEditorial) {
    if (['statistic', 'chart', 'process', 'timeline', 'comparison', 'quote', 'document', 'code', 'ui'].includes(primaryKind)) {
      return 1;
    }
    if (scene.visualIntent === 'quantify' || scene.visualIntent === 'emphasize') return 1;
    if (scene.visualChangeTolerance === 'low') return 1;
  }

  const narration = scene.narration || scene.sourceScenes?.[0]?.narration || '';
  const beats = segmentVisualBeats(narration, scene.entities || []);
  const duration = scene.durationHint || 4.0;

  // Stale visual warning condition:
  // Long duration does NOT automatically force a new shot; it triggers a stale visual risk warning
  const staleThreshold = isShorts ? 5.0 : 6.8;
  const staleRisk = duration > staleThreshold;
  scene.staleVisualRisk = staleRisk ? {
    risk: true,
    duration,
    threshold: staleThreshold,
    repairOptions: ['new_semantic_asset', 'detail_crop', 'annotation', 'camera_adjustment', 'keep_static'],
  } : null;

  if (isMediaEditorial) {
    const configuredMinHold = Number(strategy?.pacing?.minimumShotSeconds);
    const configuredMaxHold = Number(strategy?.pacing?.maximumStillSeconds);
    const profileMinHold = Number.isFinite(configuredMinHold) ? configuredMinHold : (isShorts ? 2.8 : 4.2);
    const profileMaxHold = Number.isFinite(configuredMaxHold) ? configuredMaxHold : (isShorts ? 6.0 : 7.0);
    // Dynamic purpose-aware pacing: hooks cut slightly faster, conclusions/payoffs hold longer for dramatic impact.
    const minHoldSec = scene.purpose === 'hook' && scene.energy >= 4
      ? Math.max(isShorts ? 2.2 : 3.4, profileMinHold * 0.82)
      : (scene.purpose === 'conclusion' || scene.purpose === 'payoff')
        ? Math.max(profileMinHold * 1.15, profileMinHold)
        : profileMinHold;

    // A strong shot may hold through a short single thought, but landscape
    // stills should change only when the selected channel profile calls for it.
    if (beats.length <= 1) {
      // In Shorts, high-energy/density scenes split at >= 5.0s to avoid static hold on mobile
      const energeticSplitThreshold = Number.isFinite(configuredMinHold) ? Math.max(4.5, minHoldSec * 2) : 5.0;
      if (isShorts && duration >= energeticSplitThreshold && (scene.energy >= 4 || scene.informationDensity >= 4)) return 2;
      if (duration >= profileMaxHold) return clamp(Math.ceil(duration / profileMaxHold), 2, isShorts ? 4 : 3);
      return 1;
    }

    // Comfortable editorial pacing: semantic clauses do not each earn a cut.
    // The production profile limits shot demand before assets are requested.
    const maxSemShots = Math.floor(duration / minHoldSec);
    if (maxSemShots <= 1) return 1;

    // Filter beats to meaningful shifts
    const holdDrivenShots = Math.ceil(duration / profileMaxHold);
    const meaningfulShots = Math.min(Math.max(beats.length, holdDrivenShots), maxSemShots);
    return clamp(meaningfulShots, 1, isShorts ? 4 : 3);
  }

  // Legacy procedural path fallback
  if (duration >= 4.8 && duration < 8.0) {
    if ((scene.purpose === 'hook' || scene.purpose === 'contrast') && scene.energy >= 4) return 2;
    if (scene.informationDensity >= 4 && strategy?.visualDensity >= 0.7) return 2;
    return 1;
  }
  if (duration >= 8.0) {
    return duration >= 11.0 ? 3 : 2;
  }
  return 1;
}

const ROLE_SEQUENCES = {
  establish: ['establishing', 'context', 'detail', 'subject'],
  identify: ['establishing', 'subject', 'detail', 'context'],
  demonstrate: ['context', 'subject', 'detail', 'reaction'],
  explain: ['context', 'graphic', 'detail', 'subject'],
  compare: ['context', 'subject', 'graphic', 'detail'],
  quantify: ['graphic', 'evidence', 'context', 'detail'],
  prove: ['context', 'evidence', 'detail', 'subject'],
  locate: ['establishing', 'context', 'detail', 'subject'],
  contextualize: ['context', 'evidence', 'detail', 'transition'],
  humanize: ['subject', 'detail', 'reaction', 'context'],
  emphasize: ['graphic', 'context', 'detail', 'transition'],
  summarize: ['graphic', 'context', 'transition', 'detail'],
};

const CHANGE_REASONS = {
  establishing: 'newIdea',
  context: 'newIdea',
  subject: 'newEntity',
  detail: 'detail',
  graphic: 'reveal',
  evidence: 'newEvidence',
  reaction: 'emphasis',
  transition: 'sectionTransition',
};

const INTENT_BY_KIND = {
  atmosphere: 'atmosphere', subject: 'entity', statistic: 'data', comparison: 'data', list: 'data',
  process: 'concept', timeline: 'historical', chart: 'data', quote: 'evidence', document: 'document',
  chapter: 'background', statement: 'concept', ui: 'interface', code: 'interface',
};

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Plans occasionally put a historical period or economic condition into the
// `entity` field. Those are searchable topics, not literal objects that can be
// verified in pixels. Treating them as named entities makes valid archival
// photos impossible to approve (for example, a gas line cannot literally
// contain the entity "1970s inflation").
export function isAbstractEventEntity(value = '') {
  const text = clean(value);
  if (!text) return false;
  const eventOrCondition = /\b(inflation|deflation|recession|depression|economic\s+(?:boom|downturn|crisis)|cost\s+of\s+living|unemployment|energy\s+crisis|oil\s+crisis|financial\s+crisis|market\s+crash|pandemic|epidemic|war|revolution|era|period)\b/i.test(text);
  const temporal = /\b(?:18|19|20)\d{2}s?\b|\b(?:nineteenth|twentieth|twenty-first)\s+century\b/i.test(text);
  return eventOrCondition && (temporal || !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(text));
}

const entityMentioned = (narration, entity) => {
  const spoken = normalized(narration);
  const full = normalized(entity);
  if (!full) return false;
  if (spoken.includes(full)) return true;
  const distinctive = full.split(' ').filter((token) => token.length >= 4);
  return distinctive.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(spoken));
};

function sourceConcepts(scene, topic) {
  const narrationKey = normalized(scene.narration);
  const concepts = [];
  const isTechnicalTopic = /database|software|code|tech|computer|concurrency|deadlock|backend/i.test(topic || '');
  const requiresEntityEvidence = scene.evidenceRequirement === 'required';
  for (const entity of scene.entities) {
    if (!isAbstractEventEntity(entity) && (requiresEntityEvidence || entityMentioned(scene.narration, entity))) concepts.push(entity);
  }
  for (const source of scene.sourceScenes) {
    if (source.entity?.wikipedia && (requiresEntityEvidence || entityMentioned(scene.narration, source.entity.name || source.entity.wikipedia))) concepts.push(clean(source.entity.wikipedia));
    for (const query of source.imageQueries || []) {
      if (normalized(query) && normalized(query) !== narrationKey) {
        if (isTechnicalTopic && /chain\s+lock|padlock|chain\s+and\s+lock|shatter|broken\s+glass|tug\s+of\s+war|rewind\s+button|hand\s+holding\s+key|holding\s+key|keys?(\s+and|\s+or|\s+in)|\bkey\b|\bkeys\b|handcuff|jail|prison/i.test(query)) {
          continue;
        }
        let cleaned = clean(query);
        if (isTechnicalTopic) {
          cleaned = cleaned
            .replace(/\b(database\s+table\s+rows?\s+diagram|database\s+table\s+rows?|database\s+table)\b/gi, 'database query sql editor screen')
            .replace(/\b(circular\s+arrow\s+diagram|database\s+lock\s+cycle|cycle\s+diagram)\b/gi, 'computer screen code terminal dark mode')
            .replace(/\b(database\s+engine\s+diagram|graph\s+cycle\s+detection|server\s+algorithm\s+visualization)\b/gi, 'database server terminal screen')
            .replace(/\b(diagram|flowchart|flow\s+chart|infographic|icons?|symbols?)\b/gi, 'screen monitor')
            .replace(/\s+/g, ' ')
            .trim();
        }
        if (/\b(minimal\s+title\s+card|dark\s+editorial\s+title\s+card|title\s+card|chapter\s+card|editorial\s+title\s+card|clean\s+typography|neutral\s+background|stark\s+black\s+frame|black\s+frame|chapter\s+title|kinetic\s+type|serif\s+type|sans-serif\s+type|clean\s+type|single\s+sentence\s+appears|large,\s+clean\s+type|words?\s+appear|sentence\s+appears)\b/i.test(cleaned)) {
          cleaned = scene.entities?.[0] ? `${scene.entities[0]} research desk` : 'open book on library wooden desk';
        }
        concepts.push(cleaned);
      }
    }
    if (source.visual && normalized(source.visual) !== narrationKey) {
      if (isTechnicalTopic && /chain\s+lock|padlock|chain\s+and\s+lock|shatter|broken\s+glass|tug\s+of\s+war|hand\s+holding\s+key|holding\s+key|keys?(\s+and|\s+or|\s+in)|\bkey\b|\bkeys\b|handcuff|jail|prison/i.test(source.visual)) {
        continue;
      }
      let cleanedVis = clean(source.visual);
      if (isTechnicalTopic) {
        cleanedVis = cleanedVis
          .replace(/\b(database\s+table\s+rows?\s+diagram|database\s+table\s+rows?|database\s+table)\b/gi, 'database query sql editor screen')
          .replace(/\b(circular\s+arrow\s+diagram|database\s+lock\s+cycle|cycle\s+diagram)\b/gi, 'computer screen code terminal dark mode')
          .replace(/\b(database\s+engine\s+diagram|graph\s+cycle\s+detection|server\s+algorithm\s+visualization)\b/gi, 'database server terminal screen')
          .replace(/\b(diagram|flowchart|flow\s+chart|infographic|icons?|symbols?)\b/gi, 'screen monitor')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (/\b(minimal\s+title\s+card|dark\s+editorial\s+title\s+card|title\s+card|chapter\s+card|editorial\s+title\s+card|clean\s+typography|neutral\s+background|stark\s+black\s+frame|black\s+frame|chapter\s+title|kinetic\s+type|serif\s+type|sans-serif\s+type|clean\s+type|single\s+sentence\s+appears|large,\s+clean\s+type|words?\s+appear|sentence\s+appears)\b/i.test(cleanedVis) || cleanedVis.includes('book desk')) {
        cleanedVis = scene.entities?.[0] ? `${scene.entities[0]} research desk` : 'open book on library wooden desk';
      }
      concepts.push(cleanedVis);
    }
    const years = String(source.narration || '').match(/\b(?:18|19|20)\d{2}\b/g) || [];
    for (const entity of scene.entities) for (const year of years) concepts.push(`${entity} ${year}`);
  }
  if (!concepts.length) {
    concepts.push(scene.preferredPresentation === 'chapter'
      ? (scene.entities?.[0] ? `${scene.entities[0]} research desk` : 'open book on library wooden desk')
      : `${(topic.split(':')[0] || topic).trim()} ${scene.visualIntent}`);
  }
  return [...new Set(concepts)].slice(0, 10);
}

function durationWeights(count, scene) {
  if (count === 1) return [1];
  if (count === 2) return [0.55, 0.45];
  if (count === 3) return [0.4, 0.3, 0.3];
  // Long scenes may need 4–6 media shots to respect the maximum still hold.
  // Keep the establishing shot slightly longer and normalize exactly to 1.
  const raw = Array.from({ length: count }, (_, index) => index === 0 ? 1.15 : 1);
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

export function authorShots(scene, strategy, topic) {
  const isMediaEditorial = Boolean(strategy?.useMediaEditorial || strategy?.mediaEditorial || scene.mediaEditorial);
  const count = estimateShotDemand(scene, strategy);
  const roles = ROLE_SEQUENCES[scene.visualIntent] || ROLE_SEQUENCES.establish;
  const concepts = sourceConcepts(scene, topic);
  const primaryKind = scene.preferredPresentation;
  const weights = durationWeights(count, scene);
  const narration = scene.narration || scene.sourceScenes?.[0]?.narration || '';
  // An LLM may attach a source entity as background context even when the
  // narration never identifies it. Do not turn that metadata into a mandatory
  // portrait/entity lock; use the grounded action/query concepts instead.
  const searchableEntities = (scene.entities || []).filter((entity) =>
    !isAbstractEventEntity(entity) && (scene.evidenceRequirement === 'required' || entityMentioned(narration, entity)));
  const hasAbstractHistoricalEntity = (scene.entities || []).some(isAbstractEventEntity);
  const beats = segmentVisualBeats(narration, searchableEntities);
  const sceneOrdinal = Number(String(scene.id || '').match(/(\d+)(?!.*\d)/)?.[1] || 1);

  return Array.from({ length: count }, (_, index) => {
    const role = roles[index] || roles[roles.length - 1];
    const procedural = !isMediaEditorial && (role === 'graphic' || ['statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'ui', 'code'].includes(primaryKind));
    const beat = beats[index];
    let visualConcept = concepts[Math.min(index, concepts.length - 1)];

    // Assign shot-specific entities: only assign scene entities to this shot if the beat clause
    // or the visual concept actually mentions the entity, preventing conceptual B-roll from false entity locks.
    const isPhysicalObjectOrBroll = /mouse|keyboard|screen|hand\b|shelf|shelves|aisle|cart|food|cereal|jam|jars|book\s+desk|desk|document|tv|television|tablet|phone|smartphone|pile|waste|scrap|garbage|junkyard|recycl/i.test(visualConcept);
    const shotEntities = (beat?.entities && beat.entities.length > 0 && !isPhysicalObjectOrBroll)
      ? beat.entities
      : searchableEntities.filter((e) => visualConcept.toLowerCase().includes(e.toLowerCase()) || (index === 0 && count === 1 && !isPhysicalObjectOrBroll && (primaryKind === 'subject' || role === 'subject' || role === 'establishing')));

    const assetIntent = role === 'evidence' && scene.evidenceRequirement !== 'conceptual_allowed' && !/interface|screen|tv|app|website|software/i.test(visualConcept)
      ? primaryKind === 'document' ? 'document' : primaryKind === 'timeline' ? 'historical' : 'evidence'
      : (shotEntities.length ? 'entity' : (INTENT_BY_KIND[primaryKind] === 'entity'
        ? (hasAbstractHistoricalEntity ? 'historical' : 'concept')
        : INTENT_BY_KIND[primaryKind])) || (/interface|screen|tv|app/i.test(visualConcept) ? 'interface' : 'concept');
    if (beat && beat.label && beat.label !== 'VISUAL_BEAT') {
      const labelMap = {
        URL_ENTRY: 'typing url in browser address bar',
        PAGE_LOAD: 'fast webpage loading in browser',
        REQUEST: 'browser devtools http network request',
        SERVER: 'modern datacenter server rack lights',
        RESPONSE: 'server response html css data packets',
        LOCK_CONTENTION: 'computer screen code terminal dark mode',
        DB_QUERY: 'database query sql editor screen',
        DB_TRANSACTION: 'database server terminal screen',
        HTML_PARSE: 'browser html code parsing elements',
        CSS_PARSE: 'browser developer tools elements inspector',
        JAVASCRIPT: 'javascript code execution in browser',
        RENDER_TREE: 'rendered webpage layout in browser',
        LAYOUT: 'rendered webpage layout in browser',
        PAINT: 'gpu rendering pixels on screen',
        COMPOSITING: 'smooth 60fps browser compositing animation',
        DNS_LOOKUP: 'dns server lookup datacenter',
        TCP_HANDSHAKE: 'datacenter network equipment',
      };
      visualConcept = labelMap[beat.label] || concepts[Math.min(index, concepts.length - 1)];
    } else if (isMediaEditorial && index > 0 && visualConcept === concepts[0]) {
      if (role === 'detail') visualConcept = `${visualConcept} closeup detail`;
      else if (role === 'action' || role === 'reaction') visualConcept = `${visualConcept} screen interaction`;
      else visualConcept = `${visualConcept} detail`;
    }

    let changeReason = index === 0
      ? (scene.startsSection ? 'sectionTransition' : 'newIdea')
      : (CHANGE_REASONS[role] || (scene.purpose === 'reveal' ? 'reveal' : 'detail'));
    
    if (beat?.shift && beat.shift !== 'ESTABLISH') {
      const shiftMap = {
        NEW_ACTION: 'newAction',
        NEW_ENTITY: 'newEntity',
        NEW_LOCATION: 'newLocation',
        NEW_EVIDENCE: 'newEvidence',
        NEW_EXAMPLE: 'newExample',
        DETAIL_SHIFT: 'detail',
        STATE_CHANGE: 'detailChange',
        EMOTIONAL_SHIFT: 'emotionalShift',
      };
      if (shiftMap[beat.shift]) changeReason = shiftMap[beat.shift];
    }

    // If scene has 1 shot: apply subtle camera move to maintain gentle visual vitality throughout the hold
    // Media motion is selected only after the real asset, its focal point,
    // orientation, duration, and neighbouring shots are known. Persisting a
    // blind push/pull alternation here made unrelated shots move identically
    // and prevented subject-aware pans. Legacy procedural rendering keeps its
    // deterministic hint for backwards compatibility.
    const cameraMove = isMediaEditorial
      ? 'auto'
      : (count === 1
        ? (sceneOrdinal % 2 === 0 ? 'subtlePull' : 'subtlePush')
        : (role === 'detail' ? 'detailCrop' : (index % 2 === 0 ? 'subtlePush' : 'static')));

    return {
      id: `${scene.id}_shot_${String(index + 1).padStart(2, '0')}`,
      role,
      durationHint: Number((scene.durationHint * weights[index]).toFixed(3)),
      visualConcept,
      assetIntent,
      changeReason,
      mediaPreference: procedural ? 'procedural' : scene.evidenceRequirement === 'required' ? 'real' : 'auto',
      searchConcepts: [...new Set([visualConcept, ...shotEntities, ...concepts.slice(index, index + 2)])].slice(0, 6),
      entities: shotEntities,
      motionPreference: primaryKind === 'quote' || primaryKind === 'statistic' ? 'stable' : scene.energy >= 4 ? 'active' : 'slow',
      textOverlay: index === 0 ? scene.sourceScenes.find((source) => source.text)?.text || null : null,
      evidenceRequirement: (role === 'graphic' || role === 'atmosphere' || role === 'transition' || assetIntent === 'concept')
        ? 'conceptual_allowed'
        : scene.evidenceRequirement,
      presentation: { cameraMove },
      staleVisualRisk: scene.staleVisualRisk || null,
      semanticSubBeat: beat || null,
    };
  });
}
