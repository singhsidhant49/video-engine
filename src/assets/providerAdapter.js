import crypto from 'node:crypto';
import { AssetCandidateSchema } from '../models/assetCandidate.schema.js';

export function normalizeProviderCandidate(providerId, result) {
  const sourceUrl = result.sourceUrl || result.url;
  const localPath = result.localPath;
  const identity = result.providerAssetId || sourceUrl || localPath || result.label || JSON.stringify(result);
  let urlSlug = null;
  try { urlSlug = sourceUrl ? decodeURIComponent(new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1) || '') : null; } catch { /* local path */ }
  const confidence = { wikipedia: 0.9, commons: 0.88, 'local-bank': 0.78, 'pexels-image': 0.68, 'pexels-video': 0.65, 'pixabay-image': 0.66, 'brave-image': 0.52, 'generic-library': 0.25 };
  const authority = { wikipedia: 0.95, commons: 0.9, 'local-bank': 0.82, 'pexels-image': 0.72, 'pexels-video': 0.72, 'pixabay-image': 0.68, 'brave-image': 0.55, 'generic-library': 0.45 };
  return AssetCandidateSchema.parse({
    id: `${providerId}_${crypto.createHash('sha1').update(String(identity)).digest('hex').slice(0, 16)}`,
    providerId,
    providerAssetId: result.providerAssetId,
    type: result.type,
    sourceUrl,
    localPath,
    width: result.width,
    height: result.height,
    durationSeconds: result.durationSeconds || result.duration,
    label: result.label || null,
    license: result.license || null,
    query: result.query,
    queryStage: result.queryStage,
    metadata: {
      title: result.title || result.label || null,
      description: result.description || null,
      tags: Array.isArray(result.tags) ? result.tags : typeof result.tags === 'string' ? result.tags.split(',').map((item) => item.trim()).filter(Boolean) : [],
      pageTitle: result.pageTitle || result.license?.page || null,
      categories: result.categories || [],
      urlSlug,
    },
    metadataConfidence: result.metadataConfidence ?? confidence[providerId] ?? 0.5,
    sourceAuthority: result.sourceAuthority ?? authority[providerId] ?? 0.5,
    stockClichePenalty: result.stockClichePenalty || 0,
    tier: result.tier || 'relevant',
    weight: result.weight || 0,
    generic: Boolean(result.generic),
    focal: result.focal,
  });
}

export function createProvider({ id, supports, search }) {
  return {
    id,
    supports,
    async search(request) {
      const raw = await search(request);
      return raw.map((result) => this.normalize(result));
    },
    normalize(result) {
      return normalizeProviderCandidate(id, result);
    },
  };
}
