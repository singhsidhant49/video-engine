# Milestone 5: Asset Intelligence Layer

**Version:** 1.0.0  
**Status:** Complete  
**Date:** 2026-09-27  

---

## 1. Executive Summary

Milestone 5 establishes an **Asset Intelligence Layer** that enforces the principle:
> **SEMANTIC CORRECTNESS > VISUAL BEAUTY**  
> A high-resolution, beautifully graded, or authoritative wrong image (e.g. an ASML corporate headquarters campus or an executive headshot) must **NEVER** outrank an authentic, semantically correct subject image (e.g. an ASML EUV lithography machine), regardless of technical resolution, crop fitness, or source authority.

The system replaces flat, unstructured query matching with an intelligent multi-stage evaluation pipeline:
1. **Search Context Analysis:** Transforms `AssetRequest` into structured semantics (request class, primary entity, target subject, modifiers, aliases, era, location, specificity, and inferred exclusions).
2. **Staged Query Ladder:** Executes search in discrete stages (`EXACT`, `SPECIFIC_VARIANT`, `ENTITY_SUBJECT`, `CONCEPTUAL_FALLBACK`) with early-stopping when high-quality authentic candidates are found.
3. **Semantic Gating:** Enforces hard disqualifiers (`subject_mismatch`, `building_false_match`, `logo_false_match`, `portrait_false_match`, `evidence_source_mismatch`, `watermark_risk`, `license_unusable`).
4. **Independent Presentation & Diversity Scoring:** Evaluates crop fitness, resolution, aspect ratio, and technical integrity independently from semantic correctness.
5. **Video Asset Memory:** Tracks asset usage, semantic concept keys, and provider repetition across the video to eliminate repetitive loops and exact asset re-use.
6. **Detailed Traceability & Diagnostics:** Outputs `asset-quality-diagnostics.json` alongside `assets.json` to make every selection and rejection transparent.

---

## 2. Architecture & Pipeline Flow

```
AssetRequest (from Storyboard Shot)
       │
       ▼
1. Search Context Extraction (assetSearchContext.js)
   ├── Request Class ('PRODUCT' | 'ENTITY' | 'HISTORICAL' | 'LOCATION' | 'ACTION' | etc.)
   ├── Target Subject Tokens & Inferred Exclusions
   ├── Domain Aliases & Specificity [0, 1]
   └── Staged Query Ladder (EXACT ➔ SPECIFIC_VARIANT ➔ ENTITY_SUBJECT ➔ CONCEPTUAL_FALLBACK)
       │
       ▼
2. Provider Routing (providerRegistry.js)
   ├── Historical/Entity: Wikipedia / Commons / Local Bank
   ├── Product/Machine: Wikipedia / Commons / Brave / Pexels (staged)
   ├── Action/Atmosphere: Pexels Video / Pexels Photo / Pixabay
   └── Early Termination when QualityRank >= threshold
       │
       ▼
3. Multi-Factor Scoring (assetIntelligenceScorer.js)
   ├── Semantic Score: subjectMatch, entityMatch, modifierMatch, contextMatch, intentMatch
   ├── Hard Semantic Gates: building_false_match, logo_false_match, portrait_false_match
   ├── Presentation Score: resolution, cropFitness, subjectPlacement, safeAreaFitness
   ├── Credibility Score: licenseConfidence, sourceAuthority, metadataConfidence
   └── Diversity Score: assetReusePenalty, conceptReusePenalty, neighborSimilarityPenalty
       │
       ▼
4. Video-Level Memory & Selection (videoAssetMemory.js & assetDirector.js)
   ├── Disqualified candidates (QualityRank = 0) cannot win
   ├── CLIP visual similarity used ONLY as secondary tie-breaker
   ├── Cross-shot deduplication & concept re-use tracking
   └── Output: assets.json + asset-quality-diagnostics.json
```

---

## 3. Core Components

### 3.1 Search Context & Staged Query Ladder (`src/assets/assetSearchContext.js`)
Transforms high-level shot concepts into structured semantic parameters:
- **`requestClass`**: Identifies whether the asset is a `PRODUCT`, `ENTITY`, `HISTORICAL`, `LOCATION`, `EVIDENCE`, `INTERFACE`, `ACTION`, `CONCEPT`, `ATMOSPHERE`, or `DATA`.
- **Automatic Negative Exclusions (`inferredExclusions`)**: For `PRODUCT` and machine requests, automatically injects exclusions for corporate headquarters, office buildings, executive portraits, staff, and logos.
- **`targetSubject`**: Isolates the core subject noun tokens separate from entity names and modifiers.
- **Domain Synonyms & Aliases**: Matches technical aliases (e.g. `ASML EUV scanner`, `Twinscan`, `H100 Tensor Core GPU`, `Flavian Amphitheatre`).
- **`queryLadder`**: 4 discrete stages to prevent premature fallback to generic concepts.

### 3.2 Semantic Gating & False Match Protection (`src/assets/assetIntelligenceScorer.js`)
Prevents beautiful but semantically incorrect assets from winning:
- **`building_false_match`**: Disqualifies headquarters, office towers, and corporate campuses when a product or machine is requested.
- **`portrait_false_match`**: Disqualifies executive portraits (e.g. Jensen Huang or Peter Wennink) when a hardware product or machine is requested.
- **`logo_false_match`**: Disqualifies brand logos and 2D vectors when a physical product, machine, or historical scene is requested.
- **`subject_mismatch`**: Disqualifies assets missing the primary subject tokens for high-specificity requests.
- **Contextual Cliché Detection**: Penalizes stock clichés (handshakes, smiling office teams, stressed workers holding head, generic laptops) when used as an irrelevant substitute.

### 3.3 Quality Ranking Hierarchy
Candidates are classified into discrete quality ranks:
- **`excellent` (Rank 4):** Semantic score $\ge 0.80$, presentation score $\ge 0.62$, no gates.
- **`good` (Rank 3):** Semantic score $\ge 0.68$, presentation score $\ge 0.48$, no gates.
- **`acceptable` (Rank 2):** Semantic score $\ge 0.48$, no hard disqualifiers.
- **`weak` (Rank 1):** Low semantic match or minor gate violation.
- **`unusable` (Rank 0):** Hard semantic gate triggered (`building_false_match`, `logo_false_match`, `portrait_false_match`, `license_unusable`, `watermark_risk`).

In candidate comparison (`compareCandidateScores`):
```javascript
export function compareCandidateScores(a, b) {
  return b.score.qualityRank - a.score.qualityRank
    || b.score.semantic.overall - a.score.semantic.overall
    || b.score.credibility.overall - a.score.credibility.overall
    || b.score.presentation.overall - a.score.presentation.overall
    || b.score.diversity.overall - a.score.diversity.overall
    || a.candidate.id.localeCompare(b.candidate.id);
}
```
**An unusable candidate (Rank 0) can NEVER beat an acceptable candidate (Rank 2–4).**

### 3.4 Video Asset Memory (`src/assets/videoAssetMemory.js`)
Tracks:
- Exact asset IDs and file hashes across the entire video.
- Concept keys (`${requestClass}:${targetSubject}`) to detect conceptual repetition.
- Provider streaks to prevent monopolization by a single source.
- Immediate neighbor similarity to prevent consecutive identical framings.

---

## 4. Regression Fixtures & Verification

The test suite in `tests/assetIntelligence.test.js` covers 6 deterministic fixtures:
1. **Fixture A (ASML Lithography Machine):** An authentic cleanroom ASML EUV scanner ranks #1 above ASML headquarters building, ASML vector logo, Peter Wennink CEO portrait, and generic semiconductor office team.
2. **Fixture B (NVIDIA H100 GPU):** An authentic H100 SXM5 compute board ranks #1 above Jensen Huang CEO headshot, NVIDIA headquarters campus, and NVIDIA logo.
3. **Fixture C (Steve Jobs Introducing iPhone):** Authentic 2007 Macworld keynote photo ranks #1 above modern 5th Ave Apple Store and generic smartphone stock.
4. **Fixture D (Roman Colosseum):** Authentic ancient Colosseum photo ranks #1 above generic Rome streetscape.
5. **Fixture E (Developer Writing React Code):** Authentic stock action coding photo is accepted for conceptual/action requests.
6. **Fixture F (Video Asset Memory):** Re-using the same asset ID in subsequent scenes triggers an 80% diversity penalty.

All 26 tests in the test suite pass with 100% success rate.
