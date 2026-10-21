const REPRESENTATION_MAP = Object.freeze({
  REAL_VIDEO: 'media', REAL_IMAGE: 'media', ARCHIVAL_IMAGE: 'media', ARCHIVAL_VIDEO: 'media',
  DOCUMENT: 'document', SCREENSHOT: 'ui', UI: 'ui', CODE: 'code', CHART: 'chart',
  PROCESS: 'process', DIAGRAM: 'diagram', COMPARISON: 'comparison', TIMELINE: 'timeline',
  TEXT_STAT: 'typography', MEDIA_REUSE_DETAIL: 'media', GENERATED_IMAGE: 'media',
});

const SEARCHABLE = new Set(['REAL_VIDEO', 'REAL_IMAGE', 'ARCHIVAL_IMAGE', 'ARCHIVAL_VIDEO', 'DOCUMENT', 'SCREENSHOT']);

export function routeRepresentation(proposition, coverage = null, { visualPolicy = null } = {}) {
  const allowProcedural = visualPolicy
    ? (visualPolicy.enableProceduralGraphics === true && !visualPolicy.useMediaEditorial)
    : true;
  const requested = proposition?.representationNeed || 'REAL_IMAGE';

  if (!allowProcedural) {
    return {
      version: 1,
      shotId: proposition?.shotId || coverage?.shotId,
      requestedRepresentation: requested,
      selectedRepresentation: 'media',
      searchable: true,
      // `auto` searches both motion and still providers. A hard `video` route
      // makes the shot unresolved whenever a video provider is unavailable.
      preferredSource: requested.includes('VIDEO') ? 'auto' : 'image',
      reason: `${requested} routes strictly to authentic image/video media.`,
      // MEDIA_EDITORIAL is deliberately media-only. AssetDirector may reuse
      // an already approved image/video, but it must never switch to a chart,
      // diagram, typography card, or another procedural composition.
      fallbackRepresentations: [],
    };
  }

  const coverageExplainsBetter = coverage?.primaryRepresentation
    && coverage.primaryRepresentation !== 'media'
    && ['REAL_IMAGE', 'REAL_VIDEO'].includes(requested);
  const selectedRepresentation = coverageExplainsBetter
    ? coverage.primaryRepresentation
    : (REPRESENTATION_MAP[requested] || coverage?.primaryRepresentation || 'media');
  const searchable = SEARCHABLE.has(requested) && selectedRepresentation === 'media';
  return {
    version: 1,
    shotId: proposition?.shotId || coverage?.shotId,
    requestedRepresentation: requested,
    selectedRepresentation,
    searchable,
    preferredSource: requested.includes('VIDEO') ? 'auto' : searchable ? 'image' : 'procedural',
    reason: searchable
      ? `${requested} is a concrete searchable representation.`
      : `${requested} communicates the proposition more directly than stock media.`,
    fallbackRepresentations: coverage?.fallbackRepresentations || (searchable ? ['diagram', 'typography'] : ['media', 'typography']),
  };
}
