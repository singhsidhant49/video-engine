export function routeRepresentation(proposition, coverage = null) {
  const requested = proposition?.representationNeed || 'REAL_IMAGE';
  return {
    version: 1,
    shotId: proposition?.shotId || coverage?.shotId,
    requestedRepresentation: requested,
    selectedRepresentation: 'media',
    searchable: true,
    preferredSource: requested.includes('VIDEO') ? 'auto' : 'image',
    reason: `${requested} is fulfilled with relevant authentic image/video coverage.`,
    fallbackRepresentations: [],
  };
}
