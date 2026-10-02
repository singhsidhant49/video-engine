`asset-requests.json` is a first-class run artifact. `assets.json` contains request-level routing and selection traceability. The execution compatibility adapter no longer projects `imageQueries`; any presentation heuristic needing search availability reads canonical shot fields.

The default registry contains no generated provider. The request enum retains `generated` solely as an extension point, and V1 runtime calls reject generated-media enablement.

## Transitional duplication

The canonical scene currently retains `presentationSource` plus source-scene snapshots so the adapter can populate legacy fields such as `kind`, `data`, `text`, and `treatment`. Visual specs still contain derived `family`, `variant`, camera, and media-need objects. This is intentional compatibility debt:

- plan owns original content and source metadata;
- storyboard owns editorial and shot planning;
- visual specs own deterministic presentation decisions;
- timeline owns exact frames.

Milestones 3 and 4 have now removed shot-timing adaptation and the execution plan's `imageQueries` projection from runtime ownership. Remaining duplication is limited to source presentation fields needed by legacy family components; those fields are derived, never separately authored.

## Asset intelligence flow after Milestone 5

```text
canonical StoryboardShot
  -> AssetRequest planner
  -> AssetRequest schema validation
  -> analyzeAssetRequest (Search Context, aliases, inferred exclusions, specificity)
  -> Staged Query Ladder (EXACT -> SPECIFIC_VARIANT -> ENTITY_SUBJECT -> CONCEPTUAL_FALLBACK)
  -> providers routed by requestClass and supports(request)
  -> provider search(request) -> provider normalize(result)
  -> scoreAssetCandidate:
       - semantic score (subject, entity, modifier, context, intent)
       - hard semantic gates (building_false_match, logo_false_match, portrait_false_match, subject_mismatch)
       - presentation score (resolution, crop, aspect, safe area)
       - credibility score (authority, metadata confidence, license)
       - diversity penalties (asset reuse, concept reuse, neighbor similarity)
  -> QualityRank sorting (4=excellent down to 0=unusable)
  -> Materialization & perceptual hash deduplication
  -> VideoAssetMemory tracking & diagnostics compilation
  -> asset-quality-diagnostics.json artifact
```

The system strictly enforces `SEMANTIC CORRECTNESS > VISUAL BEAUTY`. An authentic low-resolution subject image wins over an authoritative, high-resolution false match (such as a corporate headquarters or executive portrait).

## Future AI image extension point

No AI image or video integration is part of V1. A future `GeneratedImageProvider` can implement the same provider interface, consume requests whose `preferredSource` is `generated`, and return normal candidates with local normalized media plus continuity metadata. It must not require changes to storyboard, timeline, or Remotion contracts. Milestone 2 explicitly disables the repository's pre-existing direct Pollinations fallback and filters previously banked generated sources for V1 runs.

