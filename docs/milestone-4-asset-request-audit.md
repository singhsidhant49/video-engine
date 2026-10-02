# Milestone 4 asset request audit

Date: 2026-09-27

## Boundary

Milestone 4 changes how asset needs are represented and routed. It does not change storyboard structure, shot timing, visual realization, ranking policy, or Remotion behavior.

## Before

- `storyboardCompatibility` flattened shot search concepts into scene-level `imageQueries`.
- `assetDirector` read those legacy queries and directly invoked Wikipedia, Commons, Pexels, Brave, Pixabay, local-bank, video, generic, and generated-candidate functions.
- Provider results used several similar but implicit shapes.
- Selection reports were scene-level, so a chosen asset could not be traced to the canonical shot request that caused the search.
- The preliminary `AssetRequest` schema was not used by runtime execution and did not match the approved Milestone 4 contract.

## After

`assetRequestPlanner` emits exactly one validated request for every canonical storyboard shot. Requests contain:

- stable request, storyboard-shot, and scene IDs;
- semantic concept and original search concepts;
- `video`, `image`, `procedural`, `generated`, or `auto` source preference;
- entities and evidence requirement;
- specific and fallback query stages;
- orientation, minimum dimensions, and duration hint;
- exclusions and a continuity key;
- the canonical asset intent.

The compatibility execution plan no longer contains `imageQueries`. Presentation behavior that previously inspected them now reads canonical shot search concepts directly.

## Provider boundary

Providers implement:

```js
{
  id,
  supports(assetRequest),
  search(assetRequest),
  normalize(providerResult),
}
```

The registry currently wraps:

- persistent local image bank;
- Wikipedia lead images;
- Wikimedia Commons;
- Pexels images;
- Brave image search;
- Pixabay images;
- Pexels video;
- the existing generic library for non-entity, non-evidence fallbacks.

Every result is normalized and validated as `AssetCandidate` before the Asset Director can license-check, materialize, score, or select it. Provider-specific search functions are isolated behind adapters; storyboard, timeline, and Remotion do not import them.

No generated provider is registered. A `generated` preference is representable for the future, but `directAssets` rejects `allowGenerated: true` and the default registry cannot produce generated media.

## ASML case

The canonical scene produces two shot requests. An entity-only visual label is enriched from its more precise canonical search concept, so both requests now center the object requirement rather than the company name:

```json
{
  "concept": "ASML lithography machine",
  "entities": ["ASML"],
  "stagedQueries": {
    "specific": ["ASML lithography machine", "ASML", "semiconductor cleanroom"],
    "fallback": ["entity ASML lithography machine"]
  },
  "exclusions": [
    "generic office",
    "unrelated employees",
    "logo-only image",
    "corporate headquarters",
    "executive portrait"
  ]
}
```

This does not claim the current ranker will select the ideal machine image. It guarantees that providers and later ranking milestones receive the correct semantic requirement.

## Persisted evidence

Every run now writes `asset-requests.json`, validated with `AssetRequestListSchema`. `assets.json` records, per request, eligible provider IDs, normalized candidate count, selected provider/candidate ID, tier/type/label, and bounded rejection details.

## Deferred deliberately

- query expansion and entity-aware search strategy: Milestone 5;
- semantic versus presentation ranking, cliché penalties, and source/concept memory: Milestone 6;
- full-video asset continuity: Milestone 7;
- generated provider implementation: post-V1 extension.
