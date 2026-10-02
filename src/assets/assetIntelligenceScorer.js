import { analyzeCropFitness } from '../services/assetScorer.js';
import { terms } from './assetSearchContext.js';

const PORTRAIT_PATTERN = /\b(portrait|headshot|ceo|chief executive|founder|executive|employee|staff|person|man|woman)\b/i;
const LOGO_PATTERN = /\b(logo|logotype|brand mark|brandmark|wordmark|symbol|trademark|icon)\b/i;
const BUILDING_PATTERN = /\b(headquarters|headquarter|campus|office building|corporate building|facade|exterior of the building|corporate office|offices)\b/i;
const WATERMARK_PATTERN = /\b(watermark|alamy|shutterstock|getty images|dreamstime|stock photo|vector|preview)\b/i;
const RUIN_OR_ABANDONED_PATTERN = /\b(abandoned|derelict|ruins?|damaged|chernobyl|duga-1|decay|demolished|graffiti|decrepit)\b/i;
const MOCKUP_OR_GREENSCREEN_PATTERN = /\b(green screen|chroma key|mockup|blank screen|empty screen|isolated on white|placeholder)\b/i;
const DIAGRAM_IMAGE_PATTERN = /\b(mindmap|mind map|infographic|flowchart|flow chart|block diagram|architecture diagram|protocol diagram|screen time)\b/i;
const IRRELEVANT_CHURCH_PATTERN = /\b(church|cathedral|altar|medieval|stained\s+glass|chapel|monastery)\b/i;

const CLICHES = [
  ['smiling_office_team', /smiling.*(?:office|team)|office team/i],
  ['handshake', /handshake|shaking hands/i],
  ['stressed_worker', /stressed.*worker|holding.*head/i],
  ['generic_meeting', /meeting|whiteboard|conference room/i],
  ['generic_office_laptop_group', /(?:group of people|team|colleagues|coworkers|people|developers?).*(?:laptop|computer|office|setting)|(?:engage in|programming on a laptop in a modern office)|looking at laptop/i],
  ['generic_skyscraper', /skyscraper|city tower/i],
  ['generic_server_room', /server room|server rack|data center/i],
  ['cash_falling', /falling money|cash falling/i],
  ['generic_business_laptop', /businessman.*laptop|business person.*computer/i],
  ['fake_celebration', /celebrating team|office celebration/i],
];

const DOMAIN_SYNONYMS = {
  lithograph: ['scanner', 'stepper', 'twinscan', 'cleanroom', 'wafer', 'euv', 'photolithography', 'semiconductor', 'nanometer'],
  machine: ['scanner', 'stepper', 'system', 'equipment', 'tool', 'hardware', 'apparatus', 'device'],
  gpu: ['accelerator', 'graphics', 'processor', 'silicon', 'die', 'board', 'tensor', 'compute', 'cuda', 'card', 'sxm'],
  colosseum: ['amphitheatre', 'flavian', 'colosseo', 'arena', 'amphitheatrum'],
  code: ['coding', 'programming', 'developer', 'software', 'ide', 'editor', 'syntax', 'react', 'javascript', 'python', 'script'],
  developer: ['programmer', 'coder', 'engineer', 'coding', 'programming', 'laptop', 'software'],
  fast: ['speed', 'performance', 'quick'],
  loading: ['speed', 'performance', 'waiting'],
  website: ['web', 'browser', 'internet', 'computer', 'screen'],
  address: ['url', 'web', 'browser', 'internet'],
  bar: ['interface', 'browser', 'screen', 'url'],
  dom: ['html', 'code', 'web', 'browser', 'software'],
  tree: ['structure', 'hierarchy', 'node', 'diagram', 'code'],
  diagram: ['structure', 'hierarchy', 'node', 'code', 'screen'],
  revenue: ['earnings', 'financial', 'growth', 'sales', 'profit', 'chart', 'income', 'balance'],
  iphone: ['keynote', 'macworld', 'steve jobs', 'smartphone', 'apple launch'],
  network: ['networking', 'internet', 'web', 'connection', 'packet', 'server', 'data', 'traffic'],
  packet: ['packets', 'data', 'network', 'traffic', 'routing', 'tcp', 'ip', 'stream', 'networking'],
  server: ['datacenter', 'data center', 'rack', 'server room', 'cloud', 'hosting', 'network'],
};

const AUTHORITY = {
  wikipedia: 0.95,
  commons: 0.9,
  'local-bank': 0.82,
  'pexels-image': 0.72,
  'pexels-video': 0.72,
  'pixabay-image': 0.68,
  'brave-image': 0.55,
  'generic-library': 0.45,
};

const METADATA_CONFIDENCE = {
  wikipedia: 0.9,
  commons: 0.88,
  'local-bank': 0.78,
  'pexels-image': 0.68,
  'pexels-video': 0.65,
  'pixabay-image': 0.66,
  'brave-image': 0.52,
  'generic-library': 0.25,
};

const QUALITY_RANK = {
  excellent: 4,
  good: 3,
  acceptable: 2,
  weak: 1,
  unusable: 0,
};

const TRUSTED_EDITORIAL_HOSTS = new Set([
  'web.dev', 'developer.mozilla.org', 'developers.google.com', 'support.google.com',
  'learn.microsoft.com', 'developer.apple.com', 'docs.github.com', 'w3.org',
]);

export function trustedEditorialOrigin(candidate) {
  const urls = [candidate.license?.page, candidate.metadata?.pageTitle, candidate.sourceUrl].filter(Boolean);
  return urls.some((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
      return host.endsWith('.gov') || host.endsWith('.edu')
        || [...TRUSTED_EDITORIAL_HOSTS].some((trusted) => host === trusted || host.endsWith(`.${trusted}`));
    } catch {
      return false;
    }
  });
}

function traceableEditorialOrigin(candidate) {
  if (candidate.license?.nonFree) return false;
  try {
    const page = new URL(candidate.license?.page || candidate.license?.url || '');
    return ['http:', 'https:'].includes(page.protocol) && Boolean(page.hostname);
  } catch {
    return false;
  }
}

export const GLOBAL_INVALID_GATES = new Set([
  'license_unusable',
  'watermark_risk',
  'low_resolution_corrupted',
  'technical_integrity_missing',
  'format_incompatible_crop',
]);

export const CONTEXT_INVALID_GATES = new Set([
  'mockup_placeholder_match',
  'abandoned_mismatch',
  'irrelevant_church_mismatch',
  'diagram_image_rejected',
  'generic_office_cliche',
  'generic_stock_technical_mismatch',
  'subject_mismatch',
  'entity_mismatch',
  'building_false_match',
  'logo_false_match',
  'portrait_false_match',
  'evidence_source_mismatch',
]);

export const HARD_DISQUALIFIERS = new Set([
  ...GLOBAL_INVALID_GATES,
  ...CONTEXT_INVALID_GATES,
]);

const clamp = (value) => Math.max(0, Math.min(1, value));
const round = (value) => Number(clamp(value).toFixed(3));

const ratio = (needed, actual) => {
  if (!needed.length) return 1;
  const set = new Set(actual);
  return needed.filter((term) => set.has(term)).length / needed.length;
};

function metadataText(candidate) {
  const metadata = candidate.metadata || {};
  return [
    candidate.label,
    metadata.title,
    metadata.description,
    ...(metadata.tags || []),
    metadata.pageTitle,
    ...(metadata.categories || []),
    metadata.urlSlug,
    candidate.sourceUrl,
  ].filter(Boolean).join(' ');
}

function contextualCliche(text, request, context) {
  const requested = new Set([
    ...terms(request.concept),
    ...(request.searchConcepts || []).flatMap(terms),
    ...(context.aliases || []).flatMap(terms),
  ]);
  for (const [key, pattern] of CLICHES) {
    if (!pattern.test(text)) continue;
    const legitimate = (key === 'generic_meeting' && ['ACTION', 'ATMOSPHERE'].includes(context.requestClass) && (requested.has('meeting') || requested.has('whiteboard')))
      || (key === 'generic_server_room' && (requested.has('server') || requested.has('network') || requested.has('internet') || requested.has('data')))
      || (key === 'generic_office_laptop_group' && (requested.has('developer') || requested.has('programmer') || requested.has('coding') || requested.has('software') || requested.has('react')));
    if (!legitimate) return { key, penalty: 0.65 };
  }
  return { key: null, penalty: 0 };
}

function calculateSubjectMatch(subjectTerms, metadataTerms, candidateText, context, request) {
  if (!subjectTerms.length) return 1;
  const metaSet = new Set(metadataTerms);
  const textLower = candidateText.toLowerCase();

  const aliasMatch = (context.aliases || []).some((alias) => textLower.includes(alias.toLowerCase()));
  if (aliasMatch) return 0.95;

  let matches = 0;
  for (const term of subjectTerms) {
    if (metaSet.has(term)) {
      matches++;
      continue;
    }
    const synonyms = DOMAIN_SYNONYMS[term] || [];
    if (synonyms.some((syn) => metaSet.has(syn))) {
      matches++;
      continue;
    }
  }
  const tokenRatio = matches / subjectTerms.length;
  return Number(Math.min(1, Math.max(0, tokenRatio)).toFixed(3));
}

export function scoreAssetCandidate(candidate, request, context, memory = null) {
  const text = metadataText(candidate);
  const metadataTerms = terms(text);
  const entityTerms = (request.entities || []).flatMap(terms);
  const subjectTerms = context.targetSubject || [];
  const modifierTerms = context.modifiers || [];

  const textLower = text.toLowerCase();
  const entityExact = (request.entities || []).some((ent) => textLower.includes(ent.toLowerCase()));
  const entityMatch = entityExact ? 1.0 : ratio(entityTerms, metadataTerms);

  const subjectMatch = calculateSubjectMatch(subjectTerms, metadataTerms, text, context, request);
  const modifierMatch = ratio(modifierTerms, metadataTerms);
  const contextMatch = ratio(terms(request.concept), metadataTerms);
  const intentWords = terms(request.assetIntent);
  const intentMatch = Math.max(ratio(intentWords, metadataTerms), subjectMatch * 0.8);
  const sourceAuthority = AUTHORITY[candidate.providerId] ?? 0.5;
  const metadataConfidence = METADATA_CONFIDENCE[candidate.providerId] ?? 0.5;
  const evidenceMatch = request.evidenceRequired
    ? (['wikipedia', 'commons', 'local-bank'].includes(candidate.providerId)
      ? sourceAuthority
      : trustedEditorialOrigin(candidate)
        ? 0.78
        : traceableEditorialOrigin(candidate) ? 0.65 : 0.25)
    : Math.max(0.6, sourceAuthority);

  const conceptLower = String(request.concept || '').toLowerCase();
  const isProductOrMachine = ['PRODUCT', 'INTERFACE'].includes(context.requestClass)
    || /machine|device|product|hardware|system|chip|gpu|equipment|scanner|stepper|vehicle|car|aircraft|computer/i.test(conceptLower);

  const isPerson = context.requestClass === 'ENTITY'
    && (PORTRAIT_PATTERN.test(conceptLower) || /founder|ceo|executive|president|leader|author|director|steve jobs|jensen huang/i.test(conceptLower));

  const isLocation = ['LOCATION'].includes(context.requestClass)
    || /headquarters|building|campus|office|tower|monument|colosseum|pyramid|stadium|arena/i.test(conceptLower);

  const portraitFalseMatch = isProductOrMachine
    && PORTRAIT_PATTERN.test(text)
    && !/portrait|person|people|founder|executive/i.test(conceptLower);

  const logoFalseMatch = (isProductOrMachine || isPerson || isLocation)
    && LOGO_PATTERN.test(text)
    && !/logo/i.test(conceptLower);

  const buildingFalseMatch = (isProductOrMachine || isPerson)
    && BUILDING_PATTERN.test(text)
    && !/building|headquarters|office|campus|factory|headquarter/i.test(conceptLower);

  const cliche = contextualCliche(text, request, context);

  // Requirement 17: Semantic Match Model dimensions
  const actionTerms = ['type', 'typing', 'scroll', 'scrolling', 'load', 'loading', 'parse', 'parsing', 'render', 'rendering', 'paint', 'painting', 'send', 'request', 'response', 'connect', 'execute', 'calculate', 'compile'];
  const conceptActions = terms(request.concept).filter((t) => actionTerms.includes(t));
  const actionMatch = conceptActions.length ? ratio(conceptActions, metadataTerms) : 1.0;

  const envTerms = ['datacenter', 'data center', 'server', 'rack', 'motherboard', 'screen', 'monitor', 'laptop', 'desktop', 'keyboard', 'office', 'room', 'exchange'];
  const conceptEnvs = terms(request.concept).filter((t) => envTerms.includes(t));
  const environmentMatch = conceptEnvs.length ? ratio(conceptEnvs, metadataTerms) : 1.0;

  // Requirement 18: Generic Stock Context Penalty
  // Do not globally ban people/offices/laptops.
  // Penalize generic stock when the narration needs a specific technical action:
  const needsTechnicalAction = /request|response|parse|dom|tree|render|paint|layout|composite|gpu|tcp|tls|dns|handshake|packet|fiber/i.test(conceptLower);
  const isGenericStockCliché = cliche.key && ['generic_meeting', 'smiling_office_team', 'generic_office_laptop_group', 'generic_business_laptop'].includes(cliche.key);
  const genericStockPenalty = (needsTechnicalAction && isGenericStockCliché) ? 0.70 : 0;

  const semanticOverall = round(
    subjectMatch * 0.35 + entityMatch * 0.25 + modifierMatch * 0.10
    + contextMatch * 0.10 + intentMatch * 0.10 + evidenceMatch * 0.10
    - (cliche.penalty + genericStockPenalty) * 0.20
    - (portraitFalseMatch ? 0.40 : 0)
    - (logoFalseMatch ? 0.45 : 0)
    - (buildingFalseMatch ? 0.45 : 0)
  );

  const crop = analyzeCropFitness(candidate, request.constraints?.orientation === 'portrait' ? 'shorts' : 'landscape');
  const minWidth = request.constraints?.minWidth || 1;
  const minHeight = request.constraints?.minHeight || 1;
  const resolution = round(Math.min(candidate.width || 0, minWidth) / minWidth * 0.5 + Math.min(candidate.height || 0, minHeight) / minHeight * 0.5);
  const durationFitness = candidate.type !== 'video' ? 1 : round((candidate.durationSeconds || 0) / Math.max(1, request.constraints?.durationHint || 3));
  const watermarkRisk = WATERMARK_PATTERN.test(text) ? 1 : 0;
  const technicalIntegrity = candidate.sourceUrl || candidate.localPath ? 1 : 0;
  const presentationOverall = round(resolution * 0.25 + crop.cropScore * 0.32 + durationFitness * 0.12
    + technicalIntegrity * 0.2 + (1 - watermarkRisk) * 0.11);

  const licenseConfidence = candidate.license ? (candidate.license.nonFree ? 0 : 0.9) : 0.1;
  const credibilityOverall = round(licenseConfidence * 0.45 + sourceAuthority * 0.35 + metadataConfidence * 0.2);
  const diversity = memory?.penalties(candidate, request, context) || {
    assetReusePenalty: 0,
    conceptReusePenalty: 0,
    sourceRepetitionPenalty: 0,
    visualSimilarityPenalty: 0,
  };
  const diversityOverall = round(1 - diversity.assetReusePenalty - diversity.conceptReusePenalty
    - diversity.sourceRepetitionPenalty - diversity.visualSimilarityPenalty);

  const gates = [];
  const globalInvalid = [];
  const contextInvalid = [];
  const highSpecificity = context.specificity >= 0.50;

  if (watermarkRisk) {
    gates.push('watermark_risk');
    globalInvalid.push('watermark_risk');
  }
  if (!licenseConfidence) {
    gates.push('license_unusable');
    globalInvalid.push('license_unusable');
  }
  if (candidate.width && candidate.height && (candidate.width < 320 || candidate.height < 320)) {
    gates.push('low_resolution_corrupted');
    globalInvalid.push('low_resolution_corrupted');
  }
  if (request.constraints?.orientation === 'portrait' && crop.cropScore < 0.38) {
    gates.push('format_incompatible_crop');
    globalInvalid.push('format_incompatible_crop');
  }

  if (highSpecificity && subjectTerms.length > 0 && subjectMatch < 0.45) {
    gates.push('subject_mismatch');
    contextInvalid.push('subject_mismatch');
  }
  if ((request.entities || []).length && context.specificity >= 0.65 && entityMatch < 0.45 && context.requestClass !== 'CONCEPT') {
    gates.push('entity_mismatch');
    contextInvalid.push('entity_mismatch');
  }
  if (request.evidenceRequired && evidenceMatch < 0.65) {
    gates.push('evidence_source_mismatch');
    contextInvalid.push('evidence_source_mismatch');
  }
  if (portraitFalseMatch) {
    gates.push('portrait_false_match');
    contextInvalid.push('portrait_false_match');
  }
  if (logoFalseMatch) {
    gates.push('logo_false_match');
    contextInvalid.push('logo_false_match');
  }
  if (buildingFalseMatch) {
    gates.push('building_false_match');
    contextInvalid.push('building_false_match');
  }

  const isTechnicalTopic = /tech|server|datacenter|computer|software|browser|network|code|internet|data|dns|http|html|css|javascript|dom|gpu|connection|packet|traffic|hardware|developer|undersea|submarine|cable|ocean|optical|fiber/i.test(conceptLower);
  if (RUIN_OR_ABANDONED_PATTERN.test(text) && isTechnicalTopic) {
    gates.push('abandoned_mismatch');
    contextInvalid.push('abandoned_mismatch');
  }
  if (IRRELEVANT_CHURCH_PATTERN.test(text) && isTechnicalTopic) {
    gates.push('irrelevant_church_mismatch');
    contextInvalid.push('irrelevant_church_mismatch');
  }
  if (MOCKUP_OR_GREENSCREEN_PATTERN.test(text) && /animation|smooth|scroll|ui|render|interaction|performance|speed/i.test(conceptLower)) {
    gates.push('mockup_placeholder_match');
    contextInvalid.push('mockup_placeholder_match');
  }
  if (DIAGRAM_IMAGE_PATTERN.test(text)) {
    gates.push('diagram_image_rejected');
    contextInvalid.push('diagram_image_rejected');
  }
  if (cliche.key && ['generic_meeting', 'smiling_office_team', 'generic_office_laptop_group'].includes(cliche.key) && isTechnicalTopic) {
    gates.push('generic_office_cliche');
    contextInvalid.push('generic_office_cliche');
  }
  if (genericStockPenalty > 0) {
    gates.push('generic_stock_technical_mismatch');
    contextInvalid.push('generic_stock_technical_mismatch');
  }

  const hasHardDisqualifier = gates.some((gate) => HARD_DISQUALIFIERS.has(gate));
  let resolutionStatus = 'unusable';

  if (hasHardDisqualifier) {
    resolutionStatus = 'unusable';
  } else if (gates.length > 0) {
    resolutionStatus = semanticOverall >= 0.60 ? 'acceptable' : 'weak';
  } else {
    if (semanticOverall >= 0.80 && presentationOverall >= 0.62) {
      resolutionStatus = 'excellent';
    } else if (semanticOverall >= 0.65 && presentationOverall >= 0.48) {
      resolutionStatus = 'good';
    } else if (semanticOverall >= 0.45 && presentationOverall >= 0.35) {
      resolutionStatus = 'acceptable';
    } else if (semanticOverall >= 0.30) {
      resolutionStatus = 'weak';
    } else {
      resolutionStatus = 'unusable';
    }
  }

  const reasons = [];
  if (entityMatch >= 0.8) reasons.push('exact entity metadata match');
  if (subjectMatch >= 0.8) reasons.push('strong target-subject metadata match');
  if (modifierMatch >= 0.8 && modifierTerms.length) reasons.push('requested modifiers present');
  if (sourceAuthority >= 0.85) reasons.push('authoritative source metadata');
  if (resolution >= 0.9) reasons.push('meets requested resolution');
  if (crop.cropScore >= 0.85) reasons.push('strong crop fitness');
  if (gates.length) reasons.push(...gates.map((gate) => `gate: ${gate}`));

  return {
    resolutionStatus,
    qualityRank: QUALITY_RANK[resolutionStatus],
    semantic: {
      conceptMatch: round(contextMatch),
      entityMatch: round(entityMatch),
      actionMatch: round(actionMatch),
      environmentMatch: round(environmentMatch),
      evidenceMatch: round(evidenceMatch),
      compositionFitness: round(crop.cropScore),
      formatFitness: round(crop.cropScore),
      presentationQuality: round(presentationOverall),
      subjectMatch: round(subjectMatch),
      modifierMatch: round(modifierMatch),
      contextMatch: round(contextMatch),
      intentMatch: round(intentMatch),
      overall: semanticOverall,
    },
    presentation: {
      resolution,
      aspectRatioFitness: crop.cropScore,
      cropFitness: crop.cropScore,
      subjectVisibility: crop.cropScore,
      durationFitness,
      safeAreaFitness: crop.cropScore,
      watermarkRisk,
      technicalIntegrity,
      overall: presentationOverall,
    },
    diversity: { ...diversity, overall: diversityOverall },
    credibility: { licenseConfidence, sourceAuthority, metadataConfidence, overall: credibilityOverall },
    penalties: {
      cliche: cliche.penalty,
      clicheKey: cliche.key,
      genericStockPenalty,
      portraitFalseMatch,
      logoFalseMatch,
      buildingFalseMatch,
    },
    classification: {
      globalInvalid,
      contextInvalid,
    },
    gates,
    selectionReasons: reasons,
  };
}

export function compareCandidateScores(a, b, orientation = null) {
  if (b.score.qualityRank !== a.score.qualityRank) {
    return b.score.qualityRank - a.score.qualityRank;
  }
  const semanticDiff = b.score.semantic.overall - a.score.semantic.overall;
  if (Math.abs(semanticDiff) >= 0.20) {
    return semanticDiff;
  }

  // Format orientation preference (Requirement 9 & 24):
  // When candidates are semantically comparable, native format fitness takes precedence over minor credibility/authority.
  if (orientation === 'landscape' || orientation === 'portrait') {
    const isPortraitA = a.candidate.height && a.candidate.width && a.candidate.height > a.candidate.width * 1.15;
    const isPortraitB = b.candidate.height && b.candidate.width && b.candidate.height > b.candidate.width * 1.15;
    const isLandscapeA = a.candidate.width && a.candidate.height && a.candidate.width > a.candidate.height * 1.15;
    const isLandscapeB = b.candidate.width && b.candidate.height && b.candidate.width > b.candidate.height * 1.15;

    if (orientation === 'landscape' && isPortraitA !== isPortraitB) {
      return isPortraitA ? 1 : -1;
    }
    if (orientation === 'portrait' && isLandscapeA !== isLandscapeB) {
      return isLandscapeA ? 1 : -1;
    }
  }

  return (
    semanticDiff
    || b.score.presentation.overall - a.score.presentation.overall
    || b.score.credibility.overall - a.score.credibility.overall
    || b.score.diversity.overall - a.score.diversity.overall
    || a.candidate.id.localeCompare(b.candidate.id)
  );
}
