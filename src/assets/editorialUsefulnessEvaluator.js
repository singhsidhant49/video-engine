/**
 * Editorial Usefulness Evaluator — Human-Editor Quality Gating Layer
 * 
 * Evaluates whether an asset candidate is EDITORIALLY WORTH SHOWING,
 * distinguishing "semantically related" from "genuinely useful to the viewer".
 * 
 * Schema:
 * interface EditorialUsefulness {
 *   communicationValue: number;   // 0..1
 *   specificity: number;          // 0..1
 *   explanatoryValue: number;     // 0..1
 *   evidenceValue: number;        // 0..1
 *   narrativeValue: number;       // 0..1
 *   emotionalValue: number;       // 0..1
 * 
 *   genericness: number;          // 0..1
 *   distractionRisk: number;      // 0..1
 *   ambiguityRisk: number;        // 0..1
 * 
 *   viewerGain: string;
 * 
 *   verdict:
 *     | 'ESSENTIAL'
 *     | 'STRONG'
 *     | 'USEFUL'
 *     | 'ATMOSPHERIC'
 *     | 'WEAK'
 *     | 'DISTRACTING';
 * 
 *   reasons: string[];
 *   rolePass: boolean;
 *   isWeakSearchHit: boolean;
 * }
 */

// 1. Generic Stock Detection Patterns
const GENERIC_STOCK_PATTERNS = [
  {
    type: 'generic_scientist',
    regex: /\b(?:smiling\s+scientist|scientist\s+with\s+clipboard|clipboard|lab\s+coat\s+smiling|holding\s+test\s+tube|generic\s+laboratory|chemistry\s+glassware\s+stock)\b/i,
    penalty: 0.65,
    description: 'generic scientist in lab posing with clipboard/glassware',
  },
  {
    type: 'generic_programmer',
    regex: /\b(?:generic\s+programmer|hoodie\s+typing|typing\s+in\s+dark|hands\s+on\s+laptop\s+keyboard|coder\s+silhouette|generic\s+developer|hacker\s+hoodie)\b/i,
    penalty: 0.60,
    description: 'generic programmer or dark hoodie typing on laptop',
  },
  {
    type: 'generic_office',
    regex: /\b(?:business\s+meeting|boardroom|handshake|smiling\s+coworkers|colleagues\s+around\s+laptop|corporate\s+team|businesspeople\s+discussing|office\s+workers)\b/i,
    penalty: 0.75,
    description: 'generic corporate office team or handshake',
  },
  {
    type: 'generic_server_room',
    regex: /\b(?:generic\s+server\s+room|blue\s+lit\s+hallway|abstract\s+datacenter\s+stock|corridor\s+of\s+servers)\b/i,
    penalty: 0.45,
    description: 'generic server room aisle without specific system context',
  },
  {
    type: 'abstract_technology',
    regex: /\b(?:abstract\s+technology|plexus\s+background|floating\s+digital|meaningless\s+lines|cyber\s+grid|abstract\s+data\s+mesh|digital\s+particles)\b/i,
    penalty: 0.70,
    description: 'abstract technology background with meaningless floating lines/particles',
  },
  {
    type: 'generic_city',
    regex: /\b(?:generic\s+city\s+skyline|city\s+traffic\s+blur|urban\s+downtown\s+stock|skyscrapers\s+neutral)\b/i,
    penalty: 0.50,
    description: 'generic city skyline or neutral traffic',
  },
  {
    type: 'generic_warning_sign',
    regex: /\b(?:wet\s+floor\s+sign|yellow\s+caution\s+triangle|traffic\s+sign|road\s+sign|no\s+entry\s+sign|street\s+sign)\b/i,
    penalty: 0.65,
    description: 'generic street or hazard warning sign used metaphorically',
  },
  {
    type: 'generic_neon',
    regex: /\b(?:chinatown\s+neon|restaurant\s+neon|bar\s+neon|decorative\s+neon\s+sign|neon\s+led\s+face|random\s+neon\s+typography)\b/i,
    penalty: 0.70,
    description: 'unrelated neon signage or decorative typography',
  },
];

// 2. Distraction / Unrelated UI / Brand Patterns
const DISTRACTION_PATTERNS = [
  {
    type: 'video_editing_ui',
    regex: /\b(?:filmora|premiere|final\s+cut|davinci|video\s+editor|split\s+screen\s+effect|split\s+screen\s+template|timeline\s+tracks|edit\s+single\s+clip|video\s+editing\s+software|editing\s+timeline)\b/i,
    risk: 0.85,
    description: 'video editing software interface or split-screen tool screenshot',
  },
  {
    type: 'unrelated_neon_or_sign',
    regex: /\b(?:chinatown|cocktail|restaurant|josebru|ghost\s+face|king\s+boo|storefront\s+sign|billboard|bar\s+sign|open\s+24\s+hours)\b/i,
    risk: 0.80,
    description: 'unrelated commercial storefront, restaurant or bar neon signage',
  },
  {
    type: 'unrelated_brand_logo',
    regex: /\b(?:nvidia|geforce|intel|amd|apple|samsung|toyota|bmw|coca\s+cola|pepsi|nike|adidas)\b/i,
    risk: 0.75,
    description: 'commercial brand logo or product branding unrelated to narration',
  },
  {
    type: 'stock_watermark_or_badge',
    regex: /\b(?:watermark|istock|shutterstock|dreamstime|depositphotos|getty\s+images|stock\s+vector)\b/i,
    risk: 0.90,
    description: 'visible stock watermark, logo or provider badge',
  },
];

/**
 * Tokenize and clean text for overlap evaluation
 */
function tokenize(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Calculate overlap ratio between candidate tokens and target concept list
 */
function calculateConceptOverlap(candidateTokens, targetConcepts = []) {
  if (!targetConcepts.length || !candidateTokens.length) return 0;
  const candidateSet = new Set(candidateTokens);
  let bestOverlap = 0;

  for (const concept of targetConcepts) {
    const conceptTokens = tokenize(concept);
    if (!conceptTokens.length) continue;
    const matches = conceptTokens.filter((t) => candidateSet.has(t));
    const ratio = matches.length / conceptTokens.length;
    if (ratio > bestOverlap) bestOverlap = ratio;
  }

  return bestOverlap;
}

/**
 * Evaluates the Editorial Usefulness of a candidate visual asset.
 * 
 * @param {Object} params
 * @param {Object} params.candidate - Candidate asset metadata
 * @param {Object} params.inspection - Visual inspection output
 * @param {Object} params.visibleNeed - VisibleNeed specification
 * @param {string} params.targetFormat - 'landscape' | 'shorts'
 * @param {Object} params.editorialMatch - Output from classifyVisualMatch
 * @returns {EditorialUsefulness}
 */
export function evaluateEditorialUsefulness({
  candidate = {},
  inspection = {},
  visibleNeed = {},
  targetFormat = 'landscape',
  editorialMatch = null,
}) {
  const reasons = [];
  if (candidate.isDeliberateReuse) {
    return {
      communicationValue: 0.70,
      specificity: 0.65,
      explanatoryValue: 0.65,
      evidenceValue: 0.60,
      narrativeValue: 0.80,
      emotionalValue: 0.60,
      genericness: 0.10,
      distractionRisk: 0.05,
      ambiguityRisk: 0.10,
      viewerGain: candidate.deliberateReuseReason || 'Maintains established scene continuity and narrative world grounding with detail framing.',
      verdict: 'USEFUL',
      reasons: ['deliberate_reuse: verified narrative continuity asset'],
      rolePass: true,
      isWeakSearchHit: false,
    };
  }
  const candidateText = `${candidate.label || ''} ${candidate.title || ''} ${candidate.description || ''} ${(candidate.tags || []).join(' ')} ${inspection.primarySubject || ''} ${inspection.sceneSummary || ''}`.toLowerCase();
  const candidateTokens = tokenize(candidateText);

  const narrationText = String(visibleNeed.narrationText || '').toLowerCase();
  const subject = String(visibleNeed.subject || '').toLowerCase();
  const action = String(visibleNeed.action || '').toLowerCase();
  const primaryConcept = String(visibleNeed.primaryConcept || '').toLowerCase();
  const visualRole = visibleNeed.visualRole || 'CONTEXT';
  const matchClass = editorialMatch?.classification || 'CONTEXTUAL';

  const requiredConcepts = visibleNeed.requiredConcepts || (visibleNeed.primaryConcept ? [visibleNeed.primaryConcept] : []);
  const acceptableAlternatives = visibleNeed.acceptableSemanticAlternatives || visibleNeed.acceptableAlternatives || [];
  const searchExperiments = visibleNeed.searchExperiments || [];

  // --- 1. Compute Genericness ---
  let genericness = 0.05;
  for (const pattern of GENERIC_STOCK_PATTERNS) {
    if (pattern.regex.test(candidateText)) {
      // If the candidate is specifically demanded by the narration (e.g. "a scientist works in lab"), reduce genericness penalty
      const isDemanded = pattern.type === 'generic_scientist' && /scientist|researcher|physicist|chemist/i.test(narrationText);
      const penalty = isDemanded ? pattern.penalty * 0.4 : pattern.penalty;
      genericness = Math.max(genericness, penalty);
      reasons.push(`generic_stock_detected: ${pattern.description}`);
    }
  }

  // --- 2. Compute Distraction Risk ---
  let distractionRisk = 0.05;
  const ocrText = String(inspection.ocrText || candidate.ocrText || '').trim();

  for (const pattern of DISTRACTION_PATTERNS) {
    if (pattern.regex.test(candidateText) || pattern.regex.test(ocrText)) {
      // Check if topic explicitly calls for this entity
      const isTopicRelevant = pattern.type === 'unrelated_brand_logo' && narrationText.includes(candidateText.match(pattern.regex)?.[0] || '');
      if (!isTopicRelevant) {
        distractionRisk = Math.max(distractionRisk, pattern.risk);
        reasons.push(`distraction_risk: ${pattern.description}`);
      }
    }
  }

  // Visible unrelated OCR text evaluation
  if (ocrText.length > 5) {
    const ocrTokens = tokenize(ocrText);
    const narrationTokens = tokenize(narrationText);
    const topicOverlap = ocrTokens.filter((t) => narrationTokens.includes(t) || candidateTokens.includes(t)).length / Math.max(1, ocrTokens.length);
    if (topicOverlap < 0.20 && ocrTokens.length >= 3) {
      distractionRisk = Math.max(distractionRisk, 0.65);
      reasons.push(`unrelated_visible_text: on-screen text "${ocrText.slice(0, 40)}" does not corroborate narration`);
    }
  }

  // --- 3. Compute Specificity ---
  // How specifically does this asset match THIS exact narration beat vs broad topic?
  const requiredOverlap = calculateConceptOverlap(candidateTokens, requiredConcepts);
  const alternativeOverlap = calculateConceptOverlap(candidateTokens, acceptableAlternatives);
  const searchExpOverlap = calculateConceptOverlap(candidateTokens, searchExperiments);

  let specificity = 0.30;
  if (matchClass === 'DIRECT') {
    specificity = Math.max(0.75, Math.max(requiredOverlap, alternativeOverlap));
  } else if (matchClass === 'CONTEXTUAL') {
    specificity = Math.min(0.65, Math.max(0.40, requiredOverlap * 0.7 + alternativeOverlap * 0.5));
  } else if (matchClass === 'METAPHORICAL') {
    specificity = Math.min(0.45, Math.max(0.25, requiredOverlap * 0.5));
  } else {
    specificity = 0.10;
  }

  // If candidate only matched search experiment but does not meaningfully represent required concept:
  const isWeakSearchHit = searchExpOverlap >= 0.40 && requiredOverlap < 0.25 &&
    (alternativeOverlap < 0.40 || distractionRisk >= 0.60 || matchClass === 'ACCIDENTAL' || matchClass === 'METAPHORICAL');
  if (isWeakSearchHit) {
    specificity = Math.min(specificity, 0.25);
    reasons.push('weak_search_hit: candidate matches search phrase but does not meaningfully represent required concept');
  }

  // --- 4. Compute Explanatory & Evidence Value ---
  let explanatoryValue = 0.30;
  let evidenceValue = 0.20;

  if (matchClass === 'DIRECT') {
    explanatoryValue = 0.85;
    evidenceValue = 0.85;
    if (inspection.visibleAction && action && inspection.visibleAction.toLowerCase().includes(action)) {
      explanatoryValue = 0.95;
    }
  } else if (matchClass === 'CONTEXTUAL') {
    explanatoryValue = 0.55;
    evidenceValue = 0.45;
  } else if (matchClass === 'METAPHORICAL') {
    explanatoryValue = 0.35;
    evidenceValue = 0.15;
  } else {
    explanatoryValue = 0.10;
    evidenceValue = 0.05;
  }

  // Diagrams, cutaways, code views, memory graphs, spacetime graphs give high explanatory & evidence value
  if (/diagram|architecture|graph|terminal|code|memory\s+close|network\s+map|family\s+tree|spacetime|branching|schematic|chart|simulation|relativity|quantum|light\s+cone|curve/i.test(candidateText)) {
    explanatoryValue = Math.min(1.0, explanatoryValue + 0.20);
    evidenceValue = Math.min(1.0, evidenceValue + 0.30);
  }

  // --- 5. Compute Narrative & Emotional Value ---
  let narrativeValue = 0.50;
  let emotionalValue = 0.40;

  if (visualRole === 'HOOK' || visualRole === 'PAYOFF') {
    if (matchClass === 'DIRECT' || matchClass === 'CONTEXTUAL') {
      narrativeValue = 0.85;
      emotionalValue = 0.80;
    }
  }

  // --- 6. Compute Communication Value ---
  // Core aggregate: does this visual effectively communicate the concept?
  const communicationValue = Number((
    (matchClass === 'DIRECT' ? 0.90 : matchClass === 'CONTEXTUAL' ? 0.65 : matchClass === 'METAPHORICAL' ? 0.45 : 0.10) * 0.40 +
    specificity * 0.30 +
    explanatoryValue * 0.20 +
    (1 - genericness) * 0.10 -
    distractionRisk * 0.25
  ).toFixed(2));

  // --- 7. Synthesize Concrete viewerGain ---
  let viewerGain = '';
  if (distractionRisk >= 0.60) {
    viewerGain = `Presents high visual distraction due to unrelated text/branding with negative comprehension value.`;
  } else if (genericness >= 0.70) {
    viewerGain = `Provides only generic visual filler without clarifying the underlying mechanism.`;
  } else if (isWeakSearchHit) {
    viewerGain = `Matches surface search keywords but fails to illustrate the actual narration concept.`;
  } else if (matchClass === 'DIRECT') {
    const dominant = inspection.primarySubject || candidate.label || subject;
    const cleanAction = inspection.visibleAction || action || 'operation';
    viewerGain = `Visually demonstrates ${dominant} during ${cleanAction}, making the core causal relationship clear to the viewer.`;
  } else if (matchClass === 'CONTEXTUAL') {
    viewerGain = `Establishes authentic domain context for ${subject || primaryConcept}, grounding the narrative setting.`;
  } else if (matchClass === 'METAPHORICAL') {
    viewerGain = `Offers a symbolic analogy for ${subject || primaryConcept}, but does not provide direct explanatory proof.`;
  } else {
    viewerGain = `Negligible comprehension gain; visual content does not support the narration beat.`;
  }

  // --- 8. Determine Editorial Usefulness Verdict ---
  let verdict = 'USEFUL';

  if (distractionRisk >= 0.60 || matchClass === 'WRONG' || matchClass === 'ACCIDENTAL') {
    verdict = 'DISTRACTING';
    reasons.push('distracting_asset: high distraction risk or wrong subject matter');
  } else if (visualRole === 'ATMOSPHERE' && communicationValue >= 0.30) {
    verdict = 'ATMOSPHERIC';
  } else if (communicationValue < 0.45 || specificity < 0.30 || genericness >= 0.75) {
    verdict = 'WEAK';
    reasons.push('weak_editorial_usefulness: low communication value, low specificity, or high genericness');
  } else if (matchClass === 'METAPHORICAL' && communicationValue >= 0.40) {
    verdict = 'ATMOSPHERIC';
  } else if (communicationValue >= 0.80 && specificity >= 0.70 && genericness <= 0.30 && distractionRisk <= 0.20) {
    verdict = 'STRONG';
    if (explanatoryValue >= 0.85 || evidenceValue >= 0.85) {
      verdict = 'ESSENTIAL';
    }
  } else if (communicationValue >= 0.55 && specificity >= 0.40) {
    verdict = 'USEFUL';
  } else {
    verdict = 'WEAK';
  }

  // --- 9. Role-Specific Acceptance Policy ---
  let rolePass = true;

  switch (visualRole) {
    case 'HOOK':
      // communicationValue >= 0.65, specificity >= 0.45, DIRECT or strong CONTEXTUAL, EditorialUsefulness >= USEFUL/STRONG/ESSENTIAL
      if (communicationValue < 0.65 || specificity < 0.45 || (verdict !== 'STRONG' && verdict !== 'ESSENTIAL' && verdict !== 'USEFUL') || distractionRisk >= 0.30) {
        rolePass = false;
        reasons.push(`hook_role_rejection: hook requires communicationValue >= 0.65 and specificity >= 0.45 with acceptable verdict (got comm:${communicationValue}, spec:${specificity}, verdict:${verdict})`);
      }
      break;

    case 'ACTION':
      // communicationValue >= 0.70, actionMatch >= 0.60
      if (communicationValue < 0.65 || (editorialMatch?.actionMatch || 0) < 0.55) {
        rolePass = false;
        reasons.push(`action_role_rejection: action shot requires clear visible action and communicationValue >= 0.65 (got comm:${communicationValue})`);
      }
      break;

    case 'DETAIL':
      // specificity >= 0.65
      if (specificity < 0.65 || genericness >= 0.55) {
        rolePass = false;
        reasons.push(`detail_role_rejection: detail shot requires high specificity >= 0.65 (got spec:${specificity})`);
      }
      break;

    case 'EVIDENCE': {
      // evidenceValue >= 0.65, DIRECT evidence or exceptionally strong contextual proof
      const isDirectEvidence = matchClass === 'DIRECT' && evidenceValue >= 0.65;
      const isStrongContextualProof = matchClass === 'CONTEXTUAL' && (evidenceValue >= 0.40 || (editorialMatch?.evidenceMatch || 0) >= 0.50 || explanatoryValue >= 0.50 || communicationValue >= 0.60);
      if ((!isDirectEvidence && !isStrongContextualProof) || matchClass === 'METAPHORICAL' || genericness >= 0.50) {
        rolePass = false;
        reasons.push(`evidence_role_rejection: evidence shot requires direct authentic evidence or strong technical proof (got evidence:${evidenceValue}, class:${matchClass})`);
      }
      break;
    }

    case 'CONTEXT':
      // communicationValue >= 0.50
      if (communicationValue < 0.50 || verdict === 'WEAK' || verdict === 'DISTRACTING') {
        rolePass = false;
        reasons.push(`context_role_rejection: context shot requires communicationValue >= 0.50 without weak/distracting verdict`);
      }
      break;

    case 'ATMOSPHERE':
      // communicationValue >= 0.30
      if (communicationValue < 0.30 || verdict === 'DISTRACTING') {
        rolePass = false;
        reasons.push(`atmosphere_role_rejection: atmosphere shot requires communicationValue >= 0.30`);
      }
      break;

    case 'PAYOFF':
      // communicationValue >= 0.55, narrativeValue >= 0.55
      if (communicationValue < 0.55 || (narrativeValue < 0.55 && communicationValue < 0.70) || verdict === 'WEAK' || verdict === 'DISTRACTING') {
        rolePass = false;
        reasons.push(`payoff_role_rejection: payoff shot requires strong narrative and communication value (got comm:${communicationValue}, narrative:${narrativeValue})`);
      }
      break;

    default:
      if (verdict === 'DISTRACTING' || (verdict === 'WEAK' && communicationValue < 0.40)) {
        rolePass = false;
        reasons.push(`default_role_rejection: asset is distracting or excessively weak`);
      }
      break;
  }

  return {
    communicationValue: Math.max(0, Math.min(1, communicationValue)),
    specificity: Math.max(0, Math.min(1, Number(specificity.toFixed(2)))),
    explanatoryValue: Math.max(0, Math.min(1, Number(explanatoryValue.toFixed(2)))),
    evidenceValue: Math.max(0, Math.min(1, Number(evidenceValue.toFixed(2)))),
    narrativeValue: Math.max(0, Math.min(1, Number(narrativeValue.toFixed(2)))),
    emotionalValue: Math.max(0, Math.min(1, Number(emotionalValue.toFixed(2)))),
    genericness: Math.max(0, Math.min(1, Number(genericness.toFixed(2)))),
    distractionRisk: Math.max(0, Math.min(1, Number(distractionRisk.toFixed(2)))),
    ambiguityRisk: Math.max(0, Math.min(1, Number((matchClass === 'METAPHORICAL' ? 0.4 : 0.1).toFixed(2)))),
    viewerGain,
    verdict,
    reasons,
    rolePass,
    isWeakSearchHit,
  };
}
