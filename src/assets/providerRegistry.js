import {
  wikipediaLeadImage, commonsSearch, pexelsSearch, braveImageSearch, pixabaySearch,
  pexelsVideoSearch, genericCandidates,
} from '../services/freeMediaService.js';
import { searchImageBank } from '../services/imageBank.js';
import { createProvider } from './providerAdapter.js';
import { searchCache } from '../core/cache/cacheManager.js';

const queries = (request, max = 5) => [...new Set(request.activeQueries || [
  ...request.stagedQueries.specific,
  ...request.stagedQueries.fallback,
])].slice(0, max);

const searchQueries = async (request, fn, providerId = 'default', max = 5) => {
  const queryList = queries(request, max);
  const results = await Promise.all(queryList.map(async (query) => {
    // Check search cache (Milestone 12)
    const cached = await searchCache.get({ provider: providerId, query });
    if (cached.hit && cached.data) {
      return cached.data.map((r) => ({ ...r, query, queryStage: request.activeQueryStage, cached: true }));
    }
    if (request.offline) {
      return [];
    }
    const fresh = await fn(query);
    if (fresh && fresh.length > 0) {
      await searchCache.set({ provider: providerId, query }, fresh);
    }
    return fresh.map((result) => ({ ...result, query, queryStage: request.activeQueryStage }));
  }));
  return results.flat();
};

const mediaRequest = (request) => !['procedural', 'generated'].includes(request.preferredSource);
const stillRequest = (request) => mediaRequest(request) && request.preferredSource !== 'video';

export const localAssetProvider = createProvider({
  id: 'local-bank',
  supports: mediaRequest,
  search: async (request) => searchQueries(request, (query) => searchImageBank(query, { limit: 2 }), 'local-bank'),
});

export const wikipediaProvider = createProvider({
  id: 'wikipedia',
  supports: (request) => stillRequest(request) && request.entities.length > 0,
  search: async (request) => searchQueries(request, wikipediaLeadImage, 'wikipedia', 3),
});

export const commonsProvider = createProvider({
  id: 'commons',
  supports: stillRequest,
  search: async (request) => searchQueries(request, (query) => commonsSearch(query, request.entities[0]), 'commons'),
});

export const pexelsImageProvider = createProvider({
  id: 'pexels-image',
  supports: stillRequest,
  search: async (request) => searchQueries(request, (query) => pexelsSearch(query, request.constraints.orientation), 'pexels-image', 4),
});

export const braveImageProvider = createProvider({
  id: 'brave-image',
  supports: stillRequest,
  search: async (request) => searchQueries(request, (query) => braveImageSearch(query, request.constraints.orientation), 'brave-image', 4),
});

export const pixabayImageProvider = createProvider({
  id: 'pixabay-image',
  supports: stillRequest,
  search: async (request) => searchQueries(request, (query) => pixabaySearch(query, request.constraints.orientation), 'pixabay-image', 4),
});

export const pexelsVideoProvider = createProvider({
  id: 'pexels-video',
  supports: (request) => mediaRequest(request) && ['video', 'auto'].includes(request.preferredSource),
  search: async (request) => searchQueries(request, (query) => pexelsVideoSearch(query, request.constraints.orientation, request.constraints.durationHint || 4), 'pexels-video', 3),
});

export const genericLibraryProvider = createProvider({
  id: 'generic-library',
  supports: (request) => stillRequest(request) && !request.entities.length && !request.evidenceRequired,
  search: async (request) => genericCandidates(request.concept, 0),
});

// Generated media is an architectural extension point only. No generated
// provider is registered for V1 Milestone 4.
export const defaultAssetProviders = [
  localAssetProvider,
  wikipediaProvider,
  commonsProvider,
  pexelsImageProvider,
  braveImageProvider,
  pixabayImageProvider,
  pexelsVideoProvider,
  genericLibraryProvider,
];

const ROUTES = {
  ENTITY: ['local-bank', 'wikipedia', 'commons', 'brave-image', 'pexels-image', 'pixabay-image', 'pexels-video'],
  PRODUCT: ['local-bank', 'wikipedia', 'commons', 'brave-image', 'pexels-image', 'pixabay-image'],
  HISTORICAL: ['local-bank', 'wikipedia', 'commons', 'brave-image'],
  LOCATION: ['local-bank', 'wikipedia', 'commons', 'brave-image', 'pexels-image', 'pixabay-image'],
  EVIDENCE: ['local-bank', 'commons', 'wikipedia', 'brave-image'],
  INTERFACE: ['local-bank', 'commons', 'brave-image', 'pexels-image', 'pixabay-image', 'pexels-video', 'generic-library'],
  ACTION: ['local-bank', 'pexels-video', 'pexels-image', 'pixabay-image', 'brave-image'],
  CONCEPT: ['local-bank', 'commons', 'brave-image', 'pexels-image', 'pixabay-image', 'pexels-video', 'generic-library'],
  ATMOSPHERE: ['local-bank', 'pexels-video', 'pexels-image', 'pixabay-image', 'brave-image', 'generic-library'],
  // DATA requests are procedural only when the request itself says so. In
  // MEDIA_EDITORIAL the request planner deliberately changes those shots to
  // `auto`, so route them through real-media providers like other concepts.
  DATA: ['local-bank', 'commons', 'brave-image', 'pexels-image', 'pixabay-image', 'pexels-video', 'generic-library'],
};

export function routeAssetProviders(request, context, providers = defaultAssetProviders, queryStage = 'EXACT') {
  const route = ROUTES[context.requestClass] || ROUTES.CONCEPT;
  const eligible = providers.filter((provider) => provider.supports(request));
  return route
    .filter((id) => queryStage === 'CONCEPTUAL_FALLBACK' || id !== 'generic-library')
    .map((id, priority) => ({ provider: eligible.find((item) => item.id === id), priority: priority + 1 }))
    .filter((item) => item.provider);
}

export async function searchAssetProviderStage(request, context, stage, providers = defaultAssetProviders) {
  const routed = routeAssetProviders(request, context, providers, stage.id);
  const activeRequest = { ...request, activeQueries: stage.queries, activeQueryStage: stage.id };
  const calls = [];
  const candidates = [];
  for (const { provider, priority } of routed) {
    const started = Date.now();
    try {
      const found = await provider.search(activeRequest);
      candidates.push(...found.map((candidate) => ({ ...candidate, providerPriority: priority })));
      calls.push({ providerId: provider.id, priority, queryStage: stage.id, queries: stage.queries, candidateCount: found.length, durationMs: Date.now() - started, status: 'ok' });
    } catch (error) {
      calls.push({ providerId: provider.id, priority, queryStage: stage.id, queries: stage.queries, candidateCount: 0, durationMs: Date.now() - started, status: 'error', error: error.message });
    }
  }
  return { candidates, calls };
}

export async function searchAssetProviders(request, providers = defaultAssetProviders) {
  const eligible = providers.filter((provider) => provider.supports(request));
  const batches = await Promise.all(eligible.map(async (provider) => ({
    providerId: provider.id,
    candidates: await provider.search(request),
  })));
  return {
    providerIds: eligible.map((provider) => provider.id),
    candidates: batches.flatMap((batch) => batch.candidates),
  };
}
