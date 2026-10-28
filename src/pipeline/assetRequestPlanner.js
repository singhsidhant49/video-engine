import { AssetRequestListSchema } from '../models/assetRequest.schema.js';
import { buildVisibleNeed } from '../storyboard/visibleNeed.js';
import { buildVisualProposition } from '../storyboard/visualProposition.js';
import { routeRepresentation } from '../storyboard/representationRouter.js';
import { isAbstractEventEntity } from '../storyboard/shotPlanner.js';

const unique = (items) => [...new Set(items.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

function normalizeHistoricalEventShot(shot, scene) {
  const abstractEntities = (shot.entities || []).filter(isAbstractEventEntity);
  if (shot.assetIntent !== 'entity' || !abstractEntities.length) return shot;
  const wikipediaSubjects = (scene.sourceScenes || [])
    .map((source) => source.entity?.wikipedia)
    .filter(Boolean);
  const concreteSearches = (shot.searchConcepts || []).filter((query) => !abstractEntities.includes(query));
  const archivalConcept = wikipediaSubjects[0] || concreteSearches[0] || shot.visualConcept;
  return {
    ...shot,
    visualConcept: archivalConcept,
    assetIntent: 'historical',
    entities: (shot.entities || []).filter((entity) => !isAbstractEventEntity(entity)),
    searchConcepts: unique([...wikipediaSubjects, ...concreteSearches, ...(shot.searchConcepts || [])]),
  };
}

function preferredSource(shot, mediaEditorial = false, representationDecision = null, editorialMode = 'TECHNICAL_EXPLAINER') {
  const motionFriendly = ['action', 'atmosphere', 'transition', 'establishing'].includes(shot.assetIntent)
    || ['action', 'atmosphere', 'transition', 'establishing'].includes(shot.role);
  // Content type does not restrict visuals. Any motion-friendly shot
  // searches both video and still providers via 'auto', preserving a
  // safe image fallback when suitable footage is unavailable.
  if (representationDecision?.preferredSource) {
    if (representationDecision.preferredSource === 'image' && motionFriendly) return 'auto';
    return representationDecision.preferredSource;
  }
  if (shot.mediaPreference === 'procedural' && !mediaEditorial) return 'procedural';
  if (shot.mediaPreference === 'video' || shot.motionPreference === 'energetic') return 'video';
  if (motionFriendly) return 'auto';
  if (shot.mediaPreference === 'real') {
    return 'image';
  }
  return 'auto';
}

function semanticConcept(shot, mediaEditorial = false) {
  const visual = String(shot.visualConcept || '').trim();
  const cleanVisual = (mediaEditorial && /\b(diagram|flowchart|infographic|mindmap|flow\s+chart|database\s+table\s+rows?\s+diagram)\b/i.test(visual))
    ? sanitizeEditorialQuery(visual)
    : visual;
  const entityOnly = shot.entities?.some((entity) => cleanVisual.toLowerCase() === entity.toLowerCase());
  if (!entityOnly) return cleanVisual;
  const specific = (shot.searchConcepts || [])
    .map((candidate) => (mediaEditorial && /\b(diagram|flowchart|infographic|mindmap|flow\s+chart|database\s+table\s+rows?\s+diagram)\b/i.test(candidate)) ? sanitizeEditorialQuery(candidate) : candidate)
    .filter((candidate) => candidate.toLowerCase().includes(cleanVisual.toLowerCase()) && candidate.split(/\s+/).length > cleanVisual.split(/\s+/).length)
    .sort((a, b) => b.length - a.length)[0];
  return specific || cleanVisual;
}

function exclusionsFor(shot, concept, visibleNeed = null) {
  const exclusions = ['watermark', 'collage', 'low resolution', 'diagram', 'mindmap', 'flowchart', 'infographic', 'green screen', 'mockup'];
  if (/\b(?:deadlock|concurrency|database|software|transaction|thread|tech|server|datacenter|cloud|computer|code|terminal|screen|app|ui)\b/i.test(concept)) {
    exclusions.push('abandoned', 'ruins', 'padlock', 'chain', 'keys', 'key', 'handcuffs', 'handcuff', 'jail', 'prison', 'valet parking', 'dining table', 'credit card');
  }
  if (shot.entities.length || ['entity', 'product', 'evidence', 'document'].includes(shot.assetIntent)) {
    exclusions.push('generic office', 'unrelated employees', 'logo-only image');
  }
  if (/machine|system|device|equipment|product/i.test(concept)) {
    exclusions.push('corporate headquarters', 'executive portrait');
  }
  if (shot.assetIntent === 'document') exclusions.push('decorative paper mockup');
  if (visibleNeed?.avoidVisuals?.length) {
    exclusions.push(...visibleNeed.avoidVisuals);
  }
  return unique(exclusions).slice(0, 20);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'started',
]);

/**
 * Milestone 17 & 21:
 * Map abstract/technical concepts to real visible actions
 */
export function mapActionToVisibleQueries(concept = '') {
  const lower = concept.toLowerCase();
  // Database Concurrency / Deadlocks / Thread Locks / Race Conditions / Mutex
  if (/deadlock|concurrency|circular\s+wait|race\s+condition|mutex|thread\s+lock|lock\s+contention|two-phase\s+locking/i.test(lower)) {
    return [
      'software engineer debugging code multi monitor',
      'computer screen code terminal dark mode',
      'database query terminal log monitor',
      'modern server rack data center glowing lights',
      'software developer programming workstation',
      'server terminal logs running code',
    ];
  }
  // Database / SQL / Relational Engine / DBMS / Transactions / ACID
  if (/database|sql\b|postgres|mysql|sqlite|relational|dbms|acid\b|transaction|query\s+planner|database\s+index/i.test(lower)) {
    return [
      'database query sql editor screen',
      'computer screen code terminal dark mode',
      'server terminal logs running code',
      'modern server rack data center glowing lights',
      'software engineer writing backend code',
    ];
  }
  // Browser navigation / URL entry
  if (/address\s+bar|typing\s+url|page\s+load|fast\s+page|webpage\s+loading|navigate\s+to|browser\s+search/i.test(lower)) {
    return [
      'person typing url on computer keyboard',
      'web browser address bar on screen',
      'fast webpage loading in browser',
      'computer screen web browser opening',
      'typing on keyboard laptop screen',
    ];
  }
  // HTTP / Server / Datacenter / Network
  if (/http|network\s+request|server|datacenter|data\s+center|backend|packet/i.test(lower)) {
    if (/http|browser|network\s+tab/i.test(lower)) {
      return [
        'browser developer tools network tab',
        'modern datacenter server rack lights',
        'server rack fiber optic patch panel',
        'network switch ethernet cables datacenter',
        'web developer checking http request',
      ];
    }
    return [
      'modern datacenter server rack lights',
      'server rack fiber optic patch panel',
      'network switch ethernet cables datacenter',
      'datacenter server room rows of racks',
      'web developer checking http request',
    ];
  }
  // DOM / HTML / Parse / Parsing / Elements
  if (/\b(?:dom\s+tree|html\s+code|html\s+parse|parse\s+html|document\s+object\s+model)\b/i.test(lower)) {
    return [
      'html code editor browser',
      'browser developer tools elements inspector',
      'web developer html source code',
      'html code editor syntax dark mode',
      'rendered webpage layout in browser',
    ];
  }
  // JavaScript / Execution / Event Loop
  if (/\b(?:javascript|v8\s+engine|event\s+loop|execute\s+code|source\s+code)\b/i.test(lower)) {
    return [
      'javascript code syntax dark mode screen',
      'browser developer tools console',
      'software engineer writing javascript',
      'computer screen code execution terminal',
    ];
  }
  // GPU / Rendering / Compositing / Paint / Pixels
  if (/gpu|render|rendering|composite|compositing|paint|pixels|raster|graphics\s+chip/i.test(lower)) {
    return [
      'computer GPU graphics card close up',
      'graphics processor silicon die microchip',
      'smooth browser 60fps web animation',
      'motherboard computer graphics hardware',
    ];
  }
  // Jank / Performance / Smooth / Scroll
  if (/jank|lag|stutter|frame\s+drop|fps|scroll|scrolling|performance|bottleneck/i.test(lower)) {
    return [
      'laptop screen scrolling webpage smoothly',
      'browser developer tools performance profile',
      'laptop computer screen scrolling webpage',
      'developer inspecting web performance',
    ];
  }
  // TCP / TLS / Network Handshake / Connection
  if (/\b(?:tcp|tls|ssl|three-way\s+handshake|network\s+handshake)\b/i.test(lower) || (/handshake/i.test(lower) && /network|server|packet|protocol/i.test(lower))) {
    return [
      'datacenter network equipment',
      'server rack fiber optic patch panel',
      'network switch cables',
    ];
  }
  // Job interview / Business handshake / Professional agreement
  if (/\b(?:interview|job\s+offer|handshake|business\s+handshake)\b/i.test(lower)) {
    return [
      'job interview handshake office',
      'two professionals shaking hands office',
      'business interview handshake professional',
      'colleagues handshake workplace',
    ];
  }
  // DNS / IP
  if (/dns|ip\s+address|lookup|domain\s+name/i.test(lower)) {
    return [
      'server rack data center',
      'network engineer workstation',
      'datacenter infrastructure',
    ];
  }
  // Undersea Cables / Submarine Cables / Ocean Floor / Deep Sea / Fiber Optic
  if (/undersea|submarine\s+cable|subsea|ocean\s+floor|sea\s+floor|cables?\s+under/i.test(lower)) {
    return [
      'undersea cable ocean floor',
      'submarine telecommunications cable ship',
      'fiber optic cable glowing strands light',
      'deep ocean submarine cable installation',
      'underwater fiber optic internet cable',
    ];
  }
  // Retirement / Personal Finance Paperwork / Savings / Forms
  if (/retirement|savings\s+form|financial\s+paperwork|pension|401k|enrollment\s+form/i.test(lower)) {
    return [
      'older worker reviewing financial paperwork',
      'person reviewing documents at desk',
      'filling out financial paperwork with pen',
      'retirement savings paperwork on desk',
    ];
  }
  // Finance / Crash / Crisis (supporting financial explainer)
  if (/(financial\s+(?:crisis|crash|panic|collapse)|stock\s+market|subprime|mortgage|wall\s+street|lehman|traders?)/i.test(lower)) {
    return [
      'wall street financial stock exchange floor',
      'stock market crash ticker display',
      'newspaper financial crisis headline',
      'traders reacting stock exchange panic',
    ];
  }
  // Dubai / Burj Khalifa / Dubai Marina
  if (/\bdubai\b/i.test(lower)) {
    return [
      'Dubai Burj Khalifa modern skyline',
      'Dubai Marina aerial view',
      'Downtown Dubai skyscrapers cityscape',
      'Dubai modern architecture drone shot',
    ];
  }
  // Ancient Rome / Roman Empire / Colosseum / Roman Forum
  if (/\b(roman\s+empire|ancient\s+rome|ancient\s+roman|colosseum|flavian\s+amphitheatre)\b/i.test(lower)) {
    return [
      'Roman Colosseum ancient ruins Rome',
      'Roman Forum ancient marble architecture ruins',
      'Ancient Roman architecture columns aerial',
      'Ancient Roman statue and temple marble',
    ];
  }
  return [];
}

function sanitizeEditorialQuery(q) {
  const mapped = mapActionToVisibleQueries(q);
  if (mapped.length) return mapped[0];

  const lower = String(q || '').toLowerCase();
  const isTechOrHardware = /\b(html|dom|http|request|response|database|sql|table|schema|engine|deadlock|concurrency|server|datacenter|duga|network|code|terminal|query|software)\b/i.test(lower);

  let res = String(q || '')
    .replace(/\b(html\s+dom\s+tree\s+diagram|dom\s+tree\s+diagram|dom\s+tree)\b/gi, 'browser developer tools elements inspector')
    .replace(/\b(http\s+request\s+response\s+diagram|request\s+response\s+protocol\s+diagram)\b/gi, 'modern datacenter server rack lights')
    .replace(/\b(video\s+streaming\s+icons?|streaming\s+icons?|data\s+speed\s+infographic)\b/gi, 'high speed fiber optic network data')
    .replace(/\b(database\s+table\s+rows?\s+diagram|database\s+table\s+rows?|database\s+table)\b/gi, 'database query sql editor screen')
    .replace(/\b(database\s+schema\s+diagram|database\s+schema)\b/gi, 'database query sql editor screen')
    .replace(/\b(database\s+engine\s+diagram|graph\s+cycle\s+detection|server\s+algorithm\s+visualization)\b/gi, 'database server terminal screen')
    .replace(/\b(circular\s+arrow\s+diagram|database\s+lock\s+cycle|cycle\s+diagram)\b/gi, 'computer screen code terminal dark mode')
    .replace(/\b(deadlock\s+diagram|deadlock\s+graph|resource\s+allocation\s+graph)\b/gi, 'computer screen code terminal dark mode')
    .replace(/\b(hand\s+holding\s+keys?|holding\s+keys?|physical\s+keys?|handcuffs?|prison\s+break|jail)\b/gi, 'computer screen code terminal dark mode')
    .replace(/\b(diagram|mindmap|mind map|infographic|flowchart|flow chart|icons?|symbols?|clipart)\b/gi, 'screen monitor')
    .replace(/\b(minimal\s+title\s+card|dark\s+editorial\s+title\s+card|clean\s+editorial\s+title\s+card|editorial\s+title\s+card|title\s+card|chapter\s+card|title\s+screen|clean\s+typography\s+on\s+a\s+neutral\s+background)\b/gi, 'thoughtful person reading book desk')
    .replace(/\b(green screen|chroma key)\b/gi, 'screen');

  if (isTechOrHardware) {
    res = res.replace(/\b(duga-1|abandoned|ruins)\b/gi, 'datacenter');
  }

  return res.replace(/\s+/g, ' ').trim();
}

/**
 * 5-Level Editorial Query Ladder:
 * LEVEL 1: SPECIFIC VISIBLE ACTION
 * LEVEL 2: SPECIFIC SUBJECT + ACTION
 * LEVEL 3: SUBJECT + ENVIRONMENT
 * LEVEL 4: CONTEXTUAL EVIDENCE
 * LEVEL 5: BROADER TOPIC FALLBACK
 */
function stagedQueries(shot, concept, mediaEditorial = false, visibleNeed = null, visualProposition = null) {
  const cleanConcept = mediaEditorial ? sanitizeEditorialQuery(concept) : concept;
  const actionQueries = mediaEditorial ? mapActionToVisibleQueries(concept) : [];
  const entities = unique(shot.entities || []);

  const entityConcepts = entities.map((entity) => cleanConcept.toLowerCase().includes(entity.toLowerCase())
    ? cleanConcept
    : `${entity} ${cleanConcept}`);

  // Level 1: Specific Visible Action
  const level1 = unique([
    ...(visualProposition?.positiveDescriptions || []),
    ...actionQueries,
    ...entityConcepts,
    visibleNeed?.action ? `${visibleNeed.subject} ${visibleNeed.action}` : null,
    cleanConcept,
  ].filter(Boolean));

  // Level 2: Specific Subject + Action
  const level2 = unique([
    ...entities.map((e) => `${e} in action`),
    ...entities.map((e) => `${e} screen`),
    ...(shot.searchConcepts || []),
  ]);

  // Level 3: Subject + Environment
  const level3 = unique([
    visibleNeed?.environment ? `${visibleNeed.subject} ${visibleNeed.environment}` : null,
    ...entities.map((e) => `${e} environment`),
  ].filter(Boolean));

  // Level 4: Contextual Evidence
  const rawWords = String(cleanConcept || '').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  const words = rawWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const level4 = [];
  if (words.length >= 2) {
    level4.push(words.slice(0, 3).join(' '));
    if (words.length > 3) level4.push(words.slice(-2).join(' '));
  } else if (rawWords.length >= 2) {
    level4.push(rawWords.slice(-2).join(' '));
  }

  // Level 5: Broader Topic Fallback
  const rawFallback = [
    ...level4,
    ...entities,
  ];
  const level5 = unique(mediaEditorial ? rawFallback.map(sanitizeEditorialQuery) : rawFallback)
    .map((q) => q.replace(/^(entity|atmosphere|action|context|evidence|subject|establishing|detail)\s+/i, '').trim())
    .filter((query) => query.length > 2 && !STOP_WORDS.has(query.toLowerCase()));

  const specific = unique([
    ...level1,
    ...level2,
    ...level3,
  ]).map(mediaEditorial ? sanitizeEditorialQuery : (x) => x).slice(0, 12);

  const fallback = unique([
    ...level4,
    ...level5,
  ]).filter((q) => !specific.includes(q)).slice(0, 12);

  return {
    specific,
    fallback,
    ladder: {
      level1SpecificAction: level1.slice(0, 4),
      level2SubjectAction: level2.slice(0, 4),
      level3SubjectEnvironment: level3.slice(0, 4),
      level4ContextualEvidence: level4.slice(0, 3),
      level5BroaderTopic: level5.slice(0, 4),
      // Legacy compatibility alias keys:
      specificAction: level1.slice(0, 4),
      specificSubject: level2.slice(0, 4),
      context: level4.slice(0, 3),
      broaderTopic: level5.slice(0, 4),
    },
  };
}

/** Compile one provider-independent request for every canonical storyboard shot. */
export function planAssetRequests(storyboard, { format = storyboard.format, visualPolicy = null, coveragePlan = [], editorialMode = 'TECHNICAL_EXPLAINER' } = {}) {
  const orientation = format === 'shorts' ? 'portrait' : 'landscape';
  const requests = [];
  const coverageByShot = new Map((coveragePlan || []).map((item) => [item.shotId, item]));
  for (const section of storyboard.sections) {
    for (const scene of section.scenes) {
      for (const shot of scene.shots) {
        // Also normalize persisted storyboards so a failed run can resume at
        // the asset stage without regenerating its script or narration.
        const requestShot = normalizeHistoricalEventShot(shot, scene);
        const concept = semanticConcept(requestShot, visualPolicy?.useMediaEditorial === true);
        const coverage = coverageByShot.get(shot.id) || null;
        const videoTopic = storyboard.topic || storyboard.title || '';
        const visualProposition = buildVisualProposition({ shot: requestShot, scene, topic: videoTopic });
        // Recompute from the current policy. A resumed run may contain a
        // coverage artifact written by an older router; preserving that stale
        // decision would make `--resume --from assets` fail repeatedly.
        const representationDecision = routeRepresentation(
          visualProposition,
          coverage,
          coverage ? { visualPolicy } : {},
        );
        const visibleNeed = buildVisibleNeed({
          shot: requestShot,
          scene,
          narration: requestShot.narrationSegment || scene.narration,
          format,
          editorialMode,
          visualProposition,
          videoTopic,
        });
        const queryResult = stagedQueries(requestShot, concept, visualPolicy?.useMediaEditorial === true, visibleNeed, visualProposition);
        requests.push({
          id: `asset_${shot.id}`,
          storyboardShotId: shot.id,
          sceneId: scene.id,
          concept,
          searchConcepts: unique(requestShot.searchConcepts || []),
          preferredSource: preferredSource(requestShot, visualPolicy?.useMediaEditorial === true, representationDecision, editorialMode),
          evidenceRequired: (requestShot.evidenceRequirement === 'required' || visibleNeed.evidenceRequirement === 'required')
            && requestShot.role === 'evidence'
            && requestShot.assetIntent !== 'concept'
            && requestShot.assetIntent !== 'interface'
            && !/tv|television|screen|remote|streaming|tablet|phone|app/i.test(concept)
            && (requestShot.assetIntent === 'document' || requestShot.assetIntent === 'historical' || /document|paper|receipt|certificate|contract|court|record/i.test(concept)),
          entities: unique(requestShot.entities || []),
          stagedQueries: {
            specific: queryResult.specific,
            fallback: queryResult.fallback,
          },
          queryLadder: queryResult.ladder,
          visibleNeed,
          visualProposition,
          representationDecision,
          constraints: {
            orientation,
            minWidth: orientation === 'portrait' ? 1080 : 1920,
            minHeight: orientation === 'portrait' ? 1920 : 1080,
            durationHint: requestShot.durationHint,
          },
          exclusions: unique([...exclusionsFor(requestShot, concept, visibleNeed), ...(visualProposition.negativeConfusers || [])]).slice(0, 20),
          continuityKey: requestShot.entities?.[0] ? `entity:${requestShot.entities[0].toLowerCase()}` : `${section.id}:${requestShot.assetIntent}`,
          assetIntent: requestShot.assetIntent,
        });
      }
    }
  }
  return AssetRequestListSchema.parse(requests);
}

/**
 * Builds diagnostic telemetry for asset queries (Part 3).
 */
export function buildAssetQueryDiagnostics(assetRequests = [], providerCalls = []) {
  return assetRequests.map((req) => ({
    shotId: req.storyboardShotId,
    sceneId: req.sceneId,
    visibleNeed: req.visibleNeed || null,
    requiredConcepts: req.visibleNeed?.requiredConcepts || (req.visibleNeed?.primaryConcept ? [req.visibleNeed.primaryConcept] : []),
    acceptableSemanticAlternatives: req.visibleNeed?.acceptableSemanticAlternatives || req.visibleNeed?.acceptableAlternatives || [],
    searchExperiments: req.visibleNeed?.searchExperiments || [],
    queryIntent: req.assetIntent,
    queryLadder: req.queryLadder || req.stagedQueries,
    literalnessRequirement: req.visibleNeed?.literalnessRequirement || 'DIRECT',
    avoidTerms: req.exclusions,
    specificQueriesCount: req.stagedQueries?.specific?.length || 0,
    fallbackQueriesCount: req.stagedQueries?.fallback?.length || 0,
  }));
}
