# Milestone 5 Handoff Audit

**Date:** 2026-09-27  
**Branch:** `dev`  
**Auditor:** Antigravity (taking over from Codex)  
**Status:** In Progress / Resumed

---

## 1. Context & Objective
Milestones 1–4 are complete and their test suites pass. Milestone 5 introduces an **Asset Intelligence Layer** that enforces:
> **SEMANTIC CORRECTNESS > VISUAL BEAUTY**
> A high-resolution wrong image (e.g., corporate headquarters, executive headshot, or brand logo) must NEVER outrank an authentic, semantically correct subject image (e.g., an ASML EUV lithography machine), regardless of technical quality, authority, or crop score.

A previous coding agent began Milestone 5 and modified/created 8 files (+555 / -206 lines) before exhausting its budget limit. This audit examines the partial state of that work.

---

## 2. Assessment of Partially Implemented Files

### 2.1 `src/pipeline/visualRealizationDirector.js`
- **What was changed:** Introduced `assetPool(sceneAssets, shotId)` expecting `sceneAssets.byShot[shotId]`.
- **Bug Identified:** Legacy `sceneAssets` objects pass `{ primary: { ... }, alternates: [] }` without a `byShot` map (as seen in `tests/shotRealization.test.js`). This caused `assetPool` to return empty arrays, triggering an incorrect fallback to procedural `stat` family for real media shots and breaking `tests/shotRealization.test.js`.
- **Status / Remedy:** Fixed. `assetPool` now inspects `byShot[shotId]`, falling back to `primary` / `alternates`, and array pools. `tests/shotRealization.test.js` passes cleanly.

### 2.2 `src/assets/assetSearchContext.js`
- **What was implemented:**
  - `terms()` text normalizer and token extractor.
  - `CLASS_BY_INTENT` mapping (`ENTITY`, `PRODUCT`, `HISTORICAL`, `LOCATION`, `EVIDENCE`, `INTERFACE`, `ACTION`, `CONCEPT`, `ATMOSPHERE`, `DATA`).
  - Staged `queryLadder` generator (`EXACT`, `SPECIFIC_VARIANT`, `ENTITY_SUBJECT`, `CONCEPTUAL_FALLBACK`).
  - Request quality warnings (`query_too_generic`, `missing_entity`, `missing_subject`, `conflicting_exclusions`).
  - `specificity()` heuristic calculation.
- **Incomplete / Fragile Points:**
  - `aliases` property is missing from the returned context object.
  - Token matching in `terms()` lacks domain-aware semantic stemming (e.g., `lithography` vs `lithographic`, `photolithography`, `scanner`, `stepper`).
  - Known variants were hardcoded to a tiny regex list rather than pulling candidate search concepts or aliases from `AssetRequest`.
  - Excluded subjects were only passed through from `request.exclusions` without automatic inference of product vs. office/logo/headquarters boundaries.

### 2.3 `src/assets/assetIntelligenceScorer.js`
- **What was implemented:**
  - Clean architectural separation between `semantic` scores, `presentation` scores, `credibility` scores, and `diversity` penalties.
  - Detection patterns for `PORTRAIT`, `LOGO`, `BUILDING`, `WATERMARK`, and contextual `CLICHES`.
  - Quality rank classification: `excellent`, `good`, `acceptable`, `weak`, `unusable`.
- **Critical Flaws & Safety Gaps:**
  - **Weak Semantic Gate for False Matches:** `building_false_match`, `logo_false_match`, and `portrait_false_match` were penalized with point deductions, but were **not included** in the hard disqualifier gate for high-specificity requests (`gates.some(...)` only checked `subject_mismatch`, `evidence_source_mismatch`, `license_unusable`, `watermark_risk`). Consequently, an ASML headquarters or logo could still score as `acceptable` and beat a genuine machine candidate if the machine had lower resolution or less textual metadata!
  - **Strict Keyword Ratio Fragility:** `subjectMatch` used a strict intersection of `targetSubject` tokens. If a candidate uses industry synonyms (e.g., `EUV scanner`, `stepper`, `cleanroom wafer equipment`), `subjectMatch` would drop to 0, gating the actual product while a building with "lithography manufacturer" in its description matched the tokens.
  - Semantic gates must be hard gates: for `PRODUCT`/`MACHINE`, a building or logo must be gated to `unusable`/`weak` and disqualified from outranking authentic subject candidates.

### 2.4 `src/assets/videoAssetMemory.js`
- **What was implemented:**
  - Tracks asset identity reuse (`assetIds`), concept key reuse (`concepts`), and provider run count (`providers`).
  - Computes `assetReusePenalty`, `conceptReusePenalty`, `sourceRepetitionPenalty`.
- **Incomplete / Missing:**
  - Missing video-level cross-shot rebalancing pass to resolve repetitive sequences (e.g., 3 consecutive shots picking the same entity logo when valid alternates exist).
  - Missing neighbor similarity checks.

### 2.5 `src/assets/providerRegistry.js` & `providerAdapter.js`
- **What was implemented:**
  - Common `createProvider` wrapper producing validated `AssetCandidate` objects.
  - Staged search runner `searchAssetProviderStage(request, context, stage, providers)`.
  - Provider routing table `ROUTES` by request class.
- **Incomplete / Missing:**
  - `ROUTES.PRODUCT` only listed `['local-bank', 'wikipedia', 'commons', 'brave-image']`, completely excluding Pexels and Pixabay even for fallback stages.
  - Provider candidate count and call duration recording works, but aggregation into a global diagnostics object is incomplete.

### 2.6 `src/pipeline/assetDirector.js`
- **What was implemented:**
  - Multi-stage search loop with early-exit when high-quality candidates (`qualityRank >= threshold`) are found.
  - Candidate deduplication and normalization.
  - Media materialization and perceptual hash deduplication (hamming distance $\le 10$).
  - Generation of `report.requests` traceability entries.
- **Incomplete / Missing:**
  - `asset-quality-diagnostics.json` is not generated or written to disk.
  - Missing cross-shot diversity pass across the whole video.

---

## 3. Action Plan to Complete Milestone 5

1. **Fix Semantic Gates & Synonym Robustness in `assetIntelligenceScorer.js`:**
   - Add synonym/alias expansion for key technical and entity domains (e.g., lithography $\leftrightarrow$ scanner/stepper/cleanroom equipment; GPU $\leftrightarrow$ accelerator/compute card).
   - Make `building_false_match`, `logo_false_match`, and `portrait_false_match` **hard disqualifying gates** for high-specificity `PRODUCT`, `MACHINE`, and `HARDWARE` requests.
   - Ensure an ASML headquarters or logo candidate can **never** beat an actual ASML lithography machine.

2. **Complete Context & Exclusions in `assetSearchContext.js`:**
   - Export `aliases` on the context object.
   - Automatically infer negative/excluded terms for product requests (e.g., `['headquarters', 'building', 'office', 'executive', 'portrait', 'logo']`).

3. **Implement Cross-Shot Selection & Global Video Diversity in `assetDirector.js`:**
   - Add a post-materialization pass that detects consecutive duplicate concepts or unneeded logo runs and substitutes viable alternates.

4. **Add Asset Quality Diagnostics in `src/pipeline/assetDirector.js`:**
   - Compute the full diagnostics object (counts of excellent/good/acceptable/weak/unresolved, provider stats, stage stats, penalty counts, gate counts).
   - Write `asset-quality-diagnostics.json` into the run directory and export it in pipeline output.

5. **Build Exhaustive Regression Fixtures in `tests/assetIntelligence.test.js`:**
   - **Fixture A (ASML):** ASML lithography machine MUST outrank headquarters, logo, executive, and generic semiconductor stock.
   - **Fixture B (NVIDIA H100):** Real H100 GPU MUST outrank Jensen Huang portrait, Nvidia office, and logo.
   - **Fixture C (Steve Jobs):** Jobs keynote/iPhone announcement MUST outrank modern Apple store and random smartphones.
   - **Fixture D (Roman Colosseum):** Colosseum photo MUST outrank generic Rome street.
   - **Fixture E (Developer React code):** Conceptual developer coding allows quality stock.
   - **Fixture F (Financial stat / revenue growth):** Procedural chart route preferred over generic cash/finance stock.

6. **Validate Real Pipelines & Execute Golden Render:**
   - Run `--render false` runs for ASML, tech, and business topics.
   - Inspect `assets.json` and `asset-quality-diagnostics.json`.
   - Render a 60–90 second landscape video to confirm zero visual regression and verify final video quality.
