export class VideoAssetMemory {
  constructor() {
    this.selections = [];
    this.assetIds = new Map();
    this.concepts = new Map();
    this.providers = new Map();
  }

  penalties(candidate, request, context) {
    const assetKey = candidate.providerAssetId || candidate.sourceUrl || candidate.localPath || candidate.id;
    const conceptKey = `${context.requestClass}:${context.targetSubject.join('_') || request.concept.toLowerCase()}`;
    const exact = this.assetIds.get(assetKey) || 0;
    const concept = this.concepts.get(conceptKey) || 0;
    const recent = this.selections.slice(-2);
    const immediateEntity = request.entities.length && recent.some((item) => item.entity === request.entities[0] && item.assetKey === assetKey);
    const sourceRun = this.selections.slice(-3).filter((item) => item.providerId === candidate.providerId).length;
    return {
      assetReusePenalty: Math.min(1, exact * 0.8 + (immediateEntity ? 0.2 : 0)),
      conceptReusePenalty: Math.min(1, concept * 0.22),
      sourceRepetitionPenalty: sourceRun >= 3 ? 0.18 : 0,
      visualSimilarityPenalty: 0,
      conceptKey,
      assetKey,
    };
  }

  remember(candidate, request, context, shotId, sceneId, hash = null) {
    const penalty = this.penalties(candidate, request, context);
    this.assetIds.set(penalty.assetKey, (this.assetIds.get(penalty.assetKey) || 0) + 1);
    this.concepts.set(penalty.conceptKey, (this.concepts.get(penalty.conceptKey) || 0) + 1);
    this.providers.set(candidate.providerId, (this.providers.get(candidate.providerId) || 0) + 1);
    this.selections.push({
      providerAssetId: candidate.providerAssetId || null,
      url: candidate.sourceUrl || null,
      hash,
      semanticSubjectKey: penalty.conceptKey,
      entity: request.entities[0] || null,
      visualConcept: request.concept,
      providerId: candidate.providerId,
      mediaType: candidate.type,
      usageCount: this.assetIds.get(penalty.assetKey),
      lastUsedScene: sceneId,
      lastUsedShot: shotId,
      assetKey: penalty.assetKey,
    });
  }
}
