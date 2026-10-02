const STOP = new Set([
  'the', 'a', 'an', 'of', 'for', 'with', 'and', 'in', 'on', 'at', 'to', 'from',
  'by', 'image', 'photo', 'video', 'showing', 'shows', 'picture', 'shot', 'footage',
  'close', 'up', 'animation', 'animated', 'diagram', 'illustration', 'infographic',
  'chart', 'graph', 'drawing', 'render', 'rendering', 'vector', 'icon', 'graphic',
  'graphics', 'clip', 'clips', 'background', 'screenshot',
]);

const MODIFIERS = new Set([
  'euv', 'gpu', 'ai', 'historic', 'historical', 'modern', 'ancient', 'launch',
  'official', 'semiconductor', 'react', 'cleanroom', 'high-na', 'keynote', 'original', 'roman',
]);

const STEM_MAP = {
  lithography: 'lithograph',
  lithographic: 'lithograph',
  photolithography: 'lithograph',
  scanners: 'scanner',
  scanning: 'scanner',
  machines: 'machine',
  machinery: 'machine',
  computers: 'computer',
  processors: 'processor',
  accelerators: 'accelerator',
  headquarters: 'headquarter',
  buildings: 'building',
  offices: 'office',
  chips: 'chip',
  networking: 'network',
  networks: 'network',
  packets: 'packet',
  servers: 'server',
  browsers: 'browser',
  rendering: 'render',
  browsing: 'browser',
  routing: 'route',
};

export const terms = (text) => String(text || '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  .filter((term) => term && !STOP.has(term))
  .map((term) => {
    if (STEM_MAP[term]) return STEM_MAP[term];
    if (term.length > 3 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
    if (term.length > 3 && term.endsWith('s') && !term.endsWith('ss')) return term.slice(0, -1);
    return term;
  });

const unique = (items) => [...new Set(items.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

const CLASS_BY_INTENT = {
  entity: 'ENTITY',
  product: 'PRODUCT',
  historical: 'HISTORICAL',
  location: 'LOCATION',
  evidence: 'EVIDENCE',
  document: 'EVIDENCE',
  interface: 'INTERFACE',
  action: 'ACTION',
  concept: 'CONCEPT',
  atmosphere: 'ATMOSPHERE',
  data: 'DATA',
  background: 'ATMOSPHERE',
};

const KNOWN_VARIANTS = [
  {
    test: /\basml\b.*\blithograph|\beuv\b.*\blithograph|\basml\b.*\bmachine\b|\btwinscan\b/i,
    aliases: ['ASML EUV scanner', 'ASML Twinscan machine', 'ASML EUV system', 'ASML semiconductor lithography equipment', 'TWINSCAN NXE', 'High-NA EUV lithography machine'],
    values: ['ASML EUV lithography machine', 'ASML EUV scanner', 'ASML Twinscan machine', 'ASML EUV system', 'ASML semiconductor lithography equipment'],
  },
  {
    test: /\bnvidia\b.*\bh100\b|\bh100\b.*\bgpu\b|\bhopper\b.*\bh100\b/i,
    aliases: ['NVIDIA H100 Tensor Core GPU', 'NVIDIA H100 accelerator card', 'NVIDIA Hopper H100', 'H100 SXM5 GPU'],
    values: ['NVIDIA H100 GPU', 'NVIDIA H100 Tensor Core GPU', 'NVIDIA H100 accelerator card'],
  },
  {
    test: /\bsteve jobs\b.*\biphone\b|\biphone\b.*\blaunch\b/i,
    aliases: ['Steve Jobs Macworld 2007 keynote', 'Steve Jobs iPhone announcement', 'Steve Jobs 2007 iPhone presentation'],
    values: ['Steve Jobs introducing iPhone', 'Steve Jobs iPhone launch 2007', 'Macworld 2007 iPhone keynote'],
  },
  {
    test: /\bcolosseum\b|\bcolosseo\b|\bflavian amphitheatre\b/i,
    aliases: ['Flavian Amphitheatre Rome', 'Colosseo Roma', 'Colosseum amphitheatre ruins Rome'],
    values: ['Roman Colosseum', 'Colosseum Rome exterior', 'Flavian Amphitheatre Rome'],
  },
  {
    test: /\breact\b.*\bcode\b|\bdeveloper\b.*\breact\b/i,
    aliases: ['developer coding React component', 'programmer writing React JSX code', 'frontend engineer typing code in editor'],
    values: ['software developer writing React code', 'programmer coding React application', 'developer typing JavaScript code in editor'],
  },
];

function targetSubject(request) {
  const entityTerms = new Set((request.entities || []).flatMap(terms));
  return terms(request.concept).filter((term) => !entityTerms.has(term) && !MODIFIERS.has(term));
}

function extractAliases(request, matchedVariants) {
  const fromVariants = matchedVariants.flatMap((item) => item.aliases || []);
  const fromConcepts = (request.searchConcepts || []).filter((item) => item.toLowerCase() !== request.concept.toLowerCase());
  return unique([...fromVariants, ...fromConcepts]);
}

function specificity(request, subjectTerms, modifierTerms, requestClass = 'CONCEPT') {
  let score = 0.15;
  if (request.entities?.length) score += 0.25;
  if (['PRODUCT', 'HISTORICAL', 'LOCATION', 'EVIDENCE'].includes(requestClass)) score += 0.20;
  score += Math.min(0.35, subjectTerms.length * 0.12);
  score += Math.min(0.15, modifierTerms.length * 0.075);
  if (request.evidenceRequired) score += 0.1;
  return Number(Math.min(1, score).toFixed(2));
}

function inferredExclusions(request, requestClass) {
  const base = [...(request.exclusions || [])];
  const concept = String(request.concept || '').toLowerCase();
  const isProduct = requestClass === 'PRODUCT'
    || /machine|device|product|hardware|system|chip|gpu|equipment|scanner|stepper/i.test(concept);
  const isPerson = requestClass === 'ENTITY'
    && (/\b(person|founder|ceo|executive|author|president|director|steve jobs|jensen huang)\b/i.test(concept)
      || !isProduct);

  if (isProduct) {
    base.push('corporate headquarters', 'office building', 'executive portrait', 'company employee', 'logo-only image');
  } else if (isPerson) {
    base.push('company logo', 'corporate headquarters', 'modern building');
  } else if (requestClass === 'LOCATION') {
    base.push('generic office', 'unrelated employees');
  }
  return unique(base);
}

function queryLadder(request, context) {
  const exact = unique([
    request.concept,
    ...context.aliases,
    ...(request.stagedQueries?.specific || []),
  ]).slice(0, 8);

  const subject = context.targetSubject.join(' ');
  const entity = context.primaryEntity || '';
  const specificVariant = unique([
    ...exact.slice(1),
    entity && subject ? `${entity} ${subject}` : '',
    entity && context.modifiers.length ? `${entity} ${context.modifiers.join(' ')} ${subject}` : '',
    ...context.aliases.map((alias) => entity && !alias.toLowerCase().includes(entity.toLowerCase()) ? `${entity} ${alias}` : alias),
  ]).slice(0, 8);

  const entitySubject = unique([
    entity && subject ? `${entity} ${subject}` : '',
    ...(request.stagedQueries?.fallback || []),
  ]).slice(0, 8);

  const conceptual = unique([
    subject,
    context.modifiers.length && subject ? `${context.modifiers.join(' ')} ${subject}` : '',
  ]).slice(0, 5);

  return [
    { id: 'EXACT', queries: exact },
    { id: 'SPECIFIC_VARIANT', queries: specificVariant },
    { id: 'ENTITY_SUBJECT', queries: entitySubject },
    { id: 'CONCEPTUAL_FALLBACK', queries: conceptual },
  ].filter((stage) => stage.queries.length);
}

export function analyzeAssetRequest(request) {
  const requestClass = CLASS_BY_INTENT[request.assetIntent] || 'CONCEPT';
  const subjectTerms = targetSubject(request);
  const modifierTerms = terms(request.concept).filter((term) => MODIFIERS.has(term));
  const matchedVariants = KNOWN_VARIANTS.filter((item) => item.test.test(request.concept)
    || (request.entities || []).some((ent) => item.test.test(ent)));
  const aliases = extractAliases(request, matchedVariants);
  const excludedSubjects = inferredExclusions(request, requestClass);

  const warnings = [];
  if (terms(request.concept).length < 2 && !(request.entities || []).length) warnings.push('query_too_generic');
  if (['ENTITY', 'PRODUCT'].includes(requestClass) && !(request.entities || []).length) warnings.push('missing_entity');
  if (['PRODUCT', 'ACTION', 'LOCATION', 'HISTORICAL'].includes(requestClass) && !subjectTerms.length) warnings.push('missing_subject');
  if ((request.exclusions || []).some((item) => terms(item).some((term) => terms(request.concept).includes(term)))) {
    warnings.push('conflicting_exclusions');
  }

  const context = {
    requestClass,
    primaryEntity: request.entities?.[0] || null,
    targetSubject: subjectTerms,
    modifiers: modifierTerms,
    era: terms(request.concept).find((term) => /^(?:18|19|20)\d{2}$/.test(term)) || null,
    location: request.assetIntent === 'location' ? request.concept : null,
    aliases,
    excludedSubjects,
  };

  return {
    ...context,
    specificity: specificity(request, subjectTerms, modifierTerms, requestClass),
    queryLadder: queryLadder(request, context),
    requestQualityWarnings: warnings,
  };
}
