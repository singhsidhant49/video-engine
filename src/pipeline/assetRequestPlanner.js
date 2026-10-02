import { AssetRequestListSchema } from '../models/assetRequest.schema.js';

const unique = (items) => [...new Set(items.map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

function preferredSource(shot, mediaEditorial = false) {
  if (shot.mediaPreference === 'procedural' && !mediaEditorial) return 'procedural';
  if (shot.mediaPreference === 'real') {
    if (['action', 'atmosphere'].includes(shot.assetIntent) && shot.motionPreference === 'energetic') return 'video';
    return 'image';
  }
  return 'auto';
}

function semanticConcept(shot) {
  const visual = String(shot.visualConcept || '').trim();
  const entityOnly = shot.entities?.some((entity) => visual.toLowerCase() === entity.toLowerCase());
  if (!entityOnly) return visual;
  const specific = (shot.searchConcepts || [])
    .filter((candidate) => candidate.split(/\s+/).length > visual.split(/\s+/).length)
    .sort((a, b) => b.length - a.length)[0];
  return specific || visual;
}

function exclusionsFor(shot, concept) {
  const exclusions = ['watermark', 'collage', 'low resolution', 'diagram', 'mindmap', 'flowchart', 'infographic', 'green screen', 'mockup', 'abandoned', 'ruins'];
  if (shot.entities.length || ['entity', 'product', 'evidence', 'document'].includes(shot.assetIntent)) {
    exclusions.push('generic office', 'unrelated employees', 'logo-only image');
  }
  if (/machine|system|device|equipment|product/i.test(concept)) {
    exclusions.push('corporate headquarters', 'executive portrait');
  }
  if (shot.assetIntent === 'document') exclusions.push('decorative paper mockup');
  return unique(exclusions);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
  'how', 'what', 'why', 'when', 'where', 'which', 'who', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'started',
]);

/**
 * Milestone 17 (Requirements 3, 4, 10, 12, 14, 15, 16, 17):
 * Map abstract/technical concepts to real visible actions
 */
export function mapActionToVisibleQueries(concept = '') {
  const lower = concept.toLowerCase();
  // Hook / URL navigation / Browser start
  if (/url|address\s+bar|typing|page\s+load|fast\s+page|enter\b|navigate|navigation|search\s+bar|hook\b/i.test(lower)) {
    return [
      'person typing url on computer keyboard',
      'web browser address bar on screen',
      'fast webpage loading in browser',
      'computer screen web browser opening',
      'typing on keyboard laptop screen',
    ];
  }
  // HTTP / Server / Datacenter / Network
  if (/http|request|response|server|datacenter|data\s+center|network\s+request|backend|packet/i.test(lower)) {
    return [
      'browser developer tools network tab',
      'modern datacenter server rack lights',
      'server rack fiber optic patch panel',
      'network switch ethernet cables datacenter',
      'web developer checking http request',
    ];
  }
  // DOM / HTML / Parse / Parsing / Elements
  if (/dom|parse|parsing|html|element|document\s+object\s+model|tree/i.test(lower)) {
    return [
      'html code editor browser',
      'browser developer tools elements inspector',
      'web developer html source code',
      'html code editor syntax dark mode',
      'rendered webpage layout in browser',
    ];
  }
  // JavaScript / Execution / Event Loop
  if (/javascript|script|execution|execute|v8|event\s+loop|cpu|compute|code/i.test(lower)) {
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
  // TCP / TLS / Handshake / Connection
  if (/tcp|tls|handshake|connection|round-trip/i.test(lower)) {
    return [
      'datacenter network equipment',
      'server rack fiber optic patch panel',
      'network switch cables',
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
  // Finance / Crash / Crisis (supporting financial explainer)
  if (/crisis|crash|financial|stock\s+market|subprime|mortgage|wall\s+street|lehman|traders?/i.test(lower)) {
    return [
      'wall street financial stock exchange floor',
      'stock market crash ticker display',
      'newspaper financial crisis headline',
      'traders reacting stock exchange panic',
    ];
  }
  return [];
}

function sanitizeEditorialQuery(q) {
  const mapped = mapActionToVisibleQueries(q);
  if (mapped.length) return mapped[0];

  return String(q || '')
    .replace(/\b(html\s+dom\s+tree\s+diagram|dom\s+tree\s+diagram|dom\s+tree)\b/gi, 'browser developer tools elements inspector')
    .replace(/\b(http\s+request\s+response\s+diagram|request\s+response\s+protocol\s+diagram)\b/gi, 'modern datacenter server rack lights')
    .replace(/\b(video\s+streaming\s+icons?|streaming\s+icons?|data\s+speed\s+infographic)\b/gi, 'high speed fiber optic network data')
    .replace(/\b(diagram|mindmap|mind map|infographic|flowchart|flow chart|schema|icons?|symbols?|clipart)\b/gi, 'network data')
    .replace(/\b(duga-1|abandoned|ruins)\b/gi, 'datacenter')
    .replace(/\b(green screen|chroma key)\b/gi, 'screen')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Requirement 4: Semantic Query Ladder
 * SPECIFIC_ACTION -> SPECIFIC_SUBJECT -> CONTEXTUAL_ACTION -> BROADER_CONTEXT
 */
function stagedQueries(shot, concept, mediaEditorial = false) {
  const cleanConcept = mediaEditorial ? sanitizeEditorialQuery(concept) : concept;
  const actionQueries = mediaEditorial ? mapActionToVisibleQueries(concept) : [];
  const entities = unique(shot.entities || []);
  
  const entityConcepts = entities.map((entity) => cleanConcept.toLowerCase().includes(entity.toLowerCase())
    ? cleanConcept
    : `${entity} ${cleanConcept}`);

  // 1. SPECIFIC ACTION (highest priority)
  const specificAction = unique([
    ...actionQueries,
    ...entityConcepts,
    cleanConcept,
  ]);

  // 2. SPECIFIC SUBJECT
  const specificSubject = unique([
    ...entities.map((e) => `${e} screen`),
    ...(shot.searchConcepts || []),
  ]);

  // 3. CONTEXT & 4. BROADER TOPIC
  const rawWords = String(cleanConcept || '').replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  const words = rawWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const context = [];
  if (words.length >= 2) {
    context.push(words.slice(0, 3).join(' '));
    if (words.length > 3) context.push(words.slice(-2).join(' '));
  } else if (rawWords.length >= 2) {
    context.push(rawWords.slice(-2).join(' '));
  }

  const rawSpecific = [...specificAction, ...specificSubject];
  const specific = unique(mediaEditorial ? rawSpecific.map(sanitizeEditorialQuery) : rawSpecific);

  const rawFallback = [
    ...context,
    ...entities,
  ];
  const fallback = unique(mediaEditorial ? rawFallback.map(sanitizeEditorialQuery) : rawFallback)
    .map((q) => q.replace(/^(entity|atmosphere|action|context|evidence|subject|establishing|detail)\s+/i, '').trim())
    .filter((query) => query.length > 2 && !specific.includes(query) && !STOP_WORDS.has(query.toLowerCase()));

  return {
    specific: specific.slice(0, 12),
    fallback: fallback.slice(0, 12),
    ladder: {
      specificAction: specificAction.slice(0, 4),
      specificSubject: specificSubject.slice(0, 4),
      context: context.slice(0, 3),
      broaderTopic: fallback.slice(0, 4),
    },
  };
}

/** Compile one provider-independent request for every canonical storyboard shot. */
export function planAssetRequests(storyboard, { format = storyboard.format, visualPolicy = null } = {}) {
  const orientation = format === 'shorts' ? 'portrait' : 'landscape';
  const requests = [];
  for (const section of storyboard.sections) {
    for (const scene of section.scenes) {
      for (const shot of scene.shots) {
        const concept = semanticConcept(shot);
        requests.push({
          id: `asset_${shot.id}`,
          storyboardShotId: shot.id,
          sceneId: scene.id,
          concept,
          searchConcepts: unique(shot.searchConcepts || []),
          preferredSource: preferredSource(shot, visualPolicy?.useMediaEditorial === true),
          evidenceRequired: shot.evidenceRequirement === 'required',
          entities: unique(shot.entities || []),
          stagedQueries: stagedQueries(shot, concept, visualPolicy?.useMediaEditorial === true),
          constraints: {
            orientation,
            // Match the actual render canvas. Provider metadata is only a
            // promise; materialization re-checks the downloaded dimensions.
            minWidth: orientation === 'portrait' ? 1080 : 1920,
            minHeight: orientation === 'portrait' ? 1920 : 1080,
            durationHint: shot.durationHint,
          },
          exclusions: exclusionsFor(shot, concept),
          continuityKey: shot.entities?.[0] ? `entity:${shot.entities[0].toLowerCase()}` : `${section.id}:${shot.assetIntent}`,
          assetIntent: shot.assetIntent,
        });
      }
    }
  }
  return AssetRequestListSchema.parse(requests);
}
