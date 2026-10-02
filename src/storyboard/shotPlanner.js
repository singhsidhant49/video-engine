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
  if (/url|typing|address\s+bar|enter\b/i.test(c)) return 'URL_ENTRY';
  if (/webpage\s+appears|page\s+appears|page\s+load|appears?\s+in/i.test(c)) return 'PAGE_LOAD';
  if (/sends?\s+(?:an?\s+)?(?:http\s+)?request|browser\s+requests?|http\s+request/i.test(c)) return 'REQUEST';
  if (/responds?\s+with|returns?\s+html|server\s+responds|response\b/i.test(c)) return 'RESPONSE';
  if (/datacenter|server\s+rack|modern\s+server|infrastructure|server\s+hardware|server\s+room/i.test(c)) return 'SERVER';
  if (/html\s+parse|parses?\s+html|dom\s+tree|parse\s+html/i.test(c)) return 'HTML_PARSE';
  if (/css\s+applied|css\s+parse|cssom|styles?\s+computed|css\b/i.test(c)) return 'CSS_PARSE';
  if (/javascript|interactive|interactivity|js\b|event\s+loop/i.test(c)) return 'JAVASCRIPT';
  if (/render\s+tree|combines?\s+dom/i.test(c)) return 'RENDER_TREE';
  if (/layout|geometry|coordinates/i.test(c)) return 'LAYOUT';
  if (/composite|gpu\s+draws|gpu\b|60\s+frames|smooth\s+frames/i.test(c)) return 'COMPOSITING';
  if (/paint|fills?\s+in\s+pixels/i.test(c)) return 'PAINT';
  if (/dns\s+lookup|translates?\s+names|ip\s+address/i.test(c)) return 'DNS_LOOKUP';
  if (/tcp\s+handshake|tls\s+setup|secure\s+connection/i.test(c)) return 'TCP_HANDSHAKE';
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
  const rawClauses = text.split(/(?<=[.?!;])\s+|(?<=\s[-–—]\s+)|\b(?:then|meanwhile|next|finally|first|while|but)\b\s*/i)
    .flatMap((c) => {
      const sub = c.split(/\s*,\s*(?:and|while)\s+/i);
      if (sub.length > 1 && sub.slice(1).some((p) => ACTION_VERBS.test(p))) {
        return sub;
      }
      return [c];
    })
    .map((c) => c.replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim())
    .filter((c) => c.length > 5);

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
    // If no semantic shift occurs in narration: ONE strong shot is valid even at 6 seconds!
    if (beats.length <= 1) {
      // In Shorts, high-energy/density scenes split at >= 5.0s to avoid static hold on mobile
      if (isShorts && duration >= 5.0 && (scene.energy >= 4 || scene.informationDensity >= 4)) return 2;
      if (isShorts && duration >= 6.8) return 2;
      if (!isShorts && duration >= 8.5 && scene.energy >= 4) return 2;
      return 1;
    }

    // When semantic shifts occur (NEW_ACTION, NEW_ENTITY, etc.), check if duration allows comfortable holds (>= 2.2s each)
    const maxSemShots = Math.floor(duration / (isShorts ? 2.2 : 2.6));
    if (maxSemShots <= 1) return 1;

    // Filter beats to meaningful shifts
    const meaningfulShots = Math.min(beats.length, maxSemShots);
    return clamp(meaningfulShots, 1, 3);
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

function sourceConcepts(scene, topic) {
  const narrationKey = normalized(scene.narration);
  const concepts = [];
  for (const entity of scene.entities) concepts.push(entity);
  for (const source of scene.sourceScenes) {
    for (const query of source.imageQueries || []) if (normalized(query) && normalized(query) !== narrationKey) concepts.push(clean(query));
    if (source.visual && normalized(source.visual) !== narrationKey) concepts.push(clean(source.visual));
    const years = String(source.narration || '').match(/\b(?:18|19|20)\d{2}\b/g) || [];
    for (const entity of scene.entities) for (const year of years) concepts.push(`${entity} ${year}`);
  }
  if (!concepts.length) concepts.push(`${topic} ${scene.visualIntent}`);
  return [...new Set(concepts)].slice(0, 10);
}

function durationWeights(count, scene) {
  if (count === 1) return [1];
  if (count === 2) return [0.55, 0.45];
  return [0.4, 0.3, 0.3];
}

export function authorShots(scene, strategy, topic) {
  const isMediaEditorial = Boolean(strategy?.useMediaEditorial || strategy?.mediaEditorial || scene.mediaEditorial);
  const count = estimateShotDemand(scene, strategy);
  const roles = ROLE_SEQUENCES[scene.visualIntent] || ROLE_SEQUENCES.establish;
  const concepts = sourceConcepts(scene, topic);
  const primaryKind = scene.preferredPresentation;
  const weights = durationWeights(count, scene);
  const narration = scene.narration || scene.sourceScenes?.[0]?.narration || '';
  const beats = segmentVisualBeats(narration, scene.entities || []);

  return Array.from({ length: count }, (_, index) => {
    const role = roles[index] || roles[roles.length - 1];
    const procedural = !isMediaEditorial && (role === 'graphic' || ['statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'ui', 'code'].includes(primaryKind));
    const assetIntent = role === 'evidence' && scene.evidenceRequirement !== 'conceptual_allowed'
      ? primaryKind === 'document' ? 'document' : primaryKind === 'timeline' ? 'historical' : 'evidence'
      : INTENT_BY_KIND[primaryKind] || (scene.entities.length ? 'entity' : 'concept');
    
    let visualConcept = concepts[Math.min(index, concepts.length - 1)];
    const beat = beats[index];
    if (beat && beat.label && beat.label !== 'VISUAL_BEAT') {
      const labelMap = {
        URL_ENTRY: 'typing url in browser address bar',
        PAGE_LOAD: 'fast webpage loading in browser',
        REQUEST: 'browser devtools http network request',
        SERVER: 'modern datacenter server rack lights',
        RESPONSE: 'server response html css data packets',
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

    // If scene has stale visual risk and count is 1: apply subtle camera move to maintain vitality without cutting
    const cameraMove = (count === 1 && scene.staleVisualRisk)
      ? 'subtlePush'
      : (role === 'detail' ? 'detailCrop' : 'static');

    return {
      id: `${scene.id}_shot_${String(index + 1).padStart(2, '0')}`,
      role,
      durationHint: Number((scene.durationHint * weights[index]).toFixed(3)),
      visualConcept,
      assetIntent,
      changeReason,
      mediaPreference: procedural ? 'procedural' : scene.evidenceRequirement === 'required' ? 'real' : 'auto',
      searchConcepts: [...new Set([visualConcept, ...(scene.entities || []), ...concepts.slice(index, index + 2)])].slice(0, 6),
      entities: scene.entities,
      motionPreference: primaryKind === 'quote' || primaryKind === 'statistic' ? 'stable' : scene.energy >= 4 ? 'active' : 'slow',
      textOverlay: index === 0 ? scene.sourceScenes.find((source) => source.text)?.text || null : null,
      evidenceRequirement: scene.evidenceRequirement,
      presentation: { cameraMove },
      staleVisualRisk: scene.staleVisualRisk || null,
      semanticSubBeat: beat || null,
    };
  });
}

