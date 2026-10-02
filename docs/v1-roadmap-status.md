# V1 roadmap status

Updated: 2026-09-27

## Milestone 1 — Data foundation: COMPLETE

Files changed:

- `package.json`, `package-lock.json`
- `src/models/*.schema.js`, `src/models/index.js`
- `src/core/jobs/jobContext.js`
- `src/core/checkpoints/checkpointManifest.js`
- `src/pipeline/videoGeneratorPipeline.js`
- `src/pipeline/visualStoryboardDirector.js`
- `tests/contracts.test.js`
- `docs/v1-current-state.md`, `docs/v1-architecture.md`, `docs/v1-roadmap-status.md`

Validation:

- Zod contracts import successfully.
- Node syntax checks pass for changed pipeline/context modules.
- Contract tests pass through normalized plan → canonical storyboard → visual direction → deterministic timeline → timeline QC.
- Job/checkpoint persistence test verifies completed and skipped stage state.
- A real saved-plan/saved-audio `--no-render` run completed through pre-render QC with generated imagery disabled. It produced a complete project/manifest and explicitly skipped render stages. External searches were unavailable in the sandbox (131 warnings), so cached licensed assets supplied the run.

Remaining issues intentionally deferred:

- Manifest state exists, but `--resume` and artifact invalidation do not.
- Provider-independent asset requests and final frame ownership remain later milestones.

## Milestone 2 — Storyboard V2: COMPLETE

Architecture before:

- Normalized LLM scenes independently drove `visualDirector`, assets, and timeline compilation.
- `visualStoryboardDirector` produced an advisory artifact with a separate scene/shot interpretation.
- Scene count normally matched normalized plan units and shot demand used a landscape-duration branch.

Creative-path audit:

| Decision before migration | Previous owner | Milestone 2 disposition |
| --- | --- | --- |
| Scene boundaries | `aiDirectorService.normalizePlan` preserved LLM scene units | Storyboard editorial analysis groups source units; storyboard owns final boundaries. |
| Shot count | Advisory storyboard duration branch plus timeline hold splitting | Storyboard `estimateShotDemand`; timeline only adapts realization until Milestone 3. |
| Scene family | `visualDirector` mapped normalized `kind` | `visualDirector` maps canonical presentation/intent into a family. |
| Media need | `visualDirector` inferred role/count from family/layout/duration | Canonical shot media preferences/count constrain the derived need. |
| Search queries | LLM `imageQueries`, then asset search cleanup | Storyboard authors semantic concepts; provider fallback expansion remains Milestone 5. |
| Duplicate fields | purpose/kind/importance/intensity/visual/queries existed across plan, storyboard, and specs | Plan fields are source metadata; storyboard values are authoritative; specs contain derived presentation only. |
| Conflicts | Storyboard shots could disagree with plan-driven specs/timeline | One-way storyboard compatibility projection removes independent downstream planning. |
| Decisions migrated | None; storyboard was diagnostic | Boundaries, normalized purpose/intent, scores, evidence need, shot count/roles/concepts/search/media hints. |

Architecture after:

- `editorialAnalysis` normalizes purpose/intent and groups semantically related source units.
- `visualStrategySelector` derives a validated strategy from this video's content, style, format, channel defaults, and explicit overrides.
- Canonical sections/scenes/shots own editorial boundaries and semantic visual planning.
- `visualDirector` accepts the canonical storyboard and only derives deterministic presentation choices.
- `storyboardCompatibility` projects canonical scenes into the legacy asset/timeline shape until Milestones 3 and 4.
- The `beats` field is deprecated and derived directly from canonical sections.
- Generated candidates and old generated image-bank entries are disabled for V1 pipeline calls.
- Extracted AI-director claims now use `asserted`, not the misleading `verified` status.

Files changed:

- `src/storyboard/editorialAnalysis.js`
- `src/storyboard/shotPlanner.js`
- `src/storyboard/visualStrategySelector.js`
- `src/storyboard/storyboardDiagnostics.js`
- `src/pipeline/visualStoryboardDirector.js`
- `src/pipeline/storyboardCompatibility.js`
- `src/pipeline/visualDirector.js`
- `src/pipeline/assetDirector.js`
- `src/pipeline/videoGeneratorPipeline.js`
- `src/models/storyboard.schema.js`
- `src/services/aiDirectorService.js`
- `tests/contracts.test.js`, `tests/storyboard-v2.test.js`
- `docs/v1-architecture.md`, `docs/v1-roadmap-status.md`

Tests and validation:

- 12 Node tests pass, including all requested shot-demand, per-video strategy, semantic grouping, section boundary, search concept, entity preservation, and derived-beats cases.
- Deterministic normalized-plan → storyboard → visual direction → compatibility plan → timeline → pre-render QC test passes.
- Real landscape `--no-render` run `video-2026-09-27T11-22-19` completed pre-render QA with Storyboard schema v2, 99% alignment, 10 scenes, 14 shots, 0 generated assets, and no QC errors.

Dry-run storyboard diagnostics:

- sections: 1
- scenes: 10
- shots: 14
- average shots/scene: 1.4
- average scene duration: 4.02 seconds
- average shot duration hint: 2.87 seconds
- purposes: context 2, evidence 1, explanation 4, hook 1, payoff 1, reveal 1
- visual intents: compare 1, emphasize 2, establish 1, explain 1, identify 3, quantify 2
- media preferences: auto 6, procedural 8

Compatibility debt recorded at Milestone 2 (the first two items are now resolved):

- Resolved in Milestone 3: canonical shots now own final frame ranges.
- Resolved in Milestone 4: provider-independent requests replaced the `imageQueries` execution projection.
- Canonical scenes retain source snapshots and `presentationSource` fields for safe legacy projection.
- The real dry run reported 53 external search failures in the restricted environment and reused cached assets; improving semantic asset selection belongs to Milestones 4–6.

## Milestone 3 — Timeline support: COMPLETE

Canonical storyboard shots now compile one-to-one into narration-aligned deterministic frame ranges. The timeline preserves authored order and IDs, resolves a shot-level presentation contract, and emits exact repetition/rhythm diagnostics.

Delivered:

- phrase-aware, gap-free timing with energy-aware minimum holds;
- shot-level realization and video-wide presentation memory;
- explicit timeline v3 realized-shot trace fields;
- per-shot Remotion family, layout, asset, crop, overlay, camera, and density execution;
- controlled real-media `DynamicMontage`;
- shot-aware QC, diagnostics, and a preflight contact sheet;
- restrained transitions and deterministic offline font stacks;
- three 18-second golden MP4 fixtures and contact sheets;
- an inspected, repaired 66.69-second landscape render with no generated media;
- 15 passing tests covering mapping, timing, realization, and diagnostics.

Evidence: `docs/milestone-3-visual-audit.md` and `docs/milestone-3-quality-review.md`.

## Milestone 4 — Asset request system: COMPLETE

Every canonical storyboard shot now produces one validated, provider-independent `AssetRequest`. The legacy scene-level `imageQueries` projection has been removed from the execution adapter.

Delivered:

- strict AssetRequest schema with shot trace, semantic concept, staged queries, source preference, evidence flag, constraints, exclusions, and continuity key;
- deterministic shot-to-request planner, including object-specific enrichment for entity-only concepts;
- common `supports` / `search` / `normalize` provider contract;
- adapters for local bank, Wikipedia, Commons, Pexels image/video, Brave, Pixabay, and generic library;
- normalized `AssetCandidate` validation before selection/materialization;
- per-request provider and selection trace in `assets.json`;
- validated `asset-requests.json` run artifact and manifest entry;
- generated source represented as an extension point but unregistered and hard-disabled;
- 20 passing tests plus a real 66.6-second saved-plan/saved-audio no-render validation.

See `docs/milestone-4-asset-request-audit.md`.

## Milestone 5 — Search & Asset Intelligence: COMPLETE

- Structured search context analysis (`src/assets/assetSearchContext.js`) with request class, aliases, and automatic negative exclusions.
- Staged query ladders (`EXACT` -> `SPECIFIC_VARIANT` -> `ENTITY_SUBJECT` -> `CONCEPTUAL_FALLBACK`) with early-stopping.
- Hard semantic gating (`building_false_match`, `logo_false_match`, `portrait_false_match`, `subject_mismatch`) preventing wrong-subject assets from winning on visual quality or authority.
- Hard regression test passes for ASML lithography machine, Nvidia H100 GPU, Steve Jobs keynote, and Roman Colosseum.
- VideoAssetMemory tracking exact asset usage and conceptual runs across the video.
- Real pipeline validation completed for ASML, Nvidia, and Nuclear Fusion with `asset-quality-diagnostics.json` output.
- Full 82-second 1080p landscape render validated with zero blank or frozen frames.
- See `docs/milestone-5-asset-intelligence.md` and `docs/milestone-5-asset-quality-review.md`.

## Milestone 6 — Final Visual Quality & Redesign: COMPLETE

The generated videos were completely overhauled from automated slideshows/Canva-deck cards into broadcast-grade YouTube documentary/explainer quality (Vox / Bloomberg / Johnny Harris aesthetic).

Delivered:
- **Restrained Camera System & Deliberate Movement States:**
  - Introduced `STATIC`, `SUBTLE`, `ACTIVE` movement states.
  - Eliminated "every clip moves" continuous zoom-in; ~35% intentional static holds now anchor documentary pacing.
  - Camera vocabulary expanded to `static`, `subtlePush`, `subtlePull`, `pan`, and `detailCrop` with maximum consecutive run of 1.
- **Editorial Procedural Graphic Overhaul:**
  - Removed amateur Canva cards, heavy borders, and dark rounded container boxes.
  - Redesigned `HeroStat` with massive tabular typography, accent units, hairline architectural rules, and contextual descriptors.
  - Overhauled `ProcessFlow` into crisp technical stages with active step illumination, eliminating toy SaaS circle-dots.
  - Fixed `ListShot` empty-screen bug: all items render visible in a subdued 32% state, illuminating cleanly on spoken cues.
  - Redesigned `DocumentShot` / `StatementShot` / `KineticHeadline` with authentic broadsheet layout and SVG highlight wipes.
- **Media-First Compositions & Edge-to-Edge Layouts:**
  - Replaced floating 9:16 phone cards with `PortraitSplitPhoto` (razor-sharp 50/50 vertical architectural split) and focal full-bleed.
  - Eliminated 44% dead black voids in `EditorialPhoto` by dynamically falling back to clean full bleed when overlays are absent.
  - Added `FullBleedClean` and `DetailFocus` to let authentic archival and high-res imagery breathe without clutter.
- **Restrained Phrase Subtitles & Smart Caption Yielding:**
  - Shifted 16:9 landscape video default from chaotic word-by-word karaoke to clean, legible `phrase` subtitles.
  - Added smart alpha yielding (`yieldAlpha = 0`) to automatically suppress subtitles when primary on-screen graphics/stats are active.
- **Whole-Video Continuity & Visual Density Rhythm:**
  - `continuityDirector` monitors sliding windows of neighboring shots to prevent photo runs, zoom runs, and procedural fatigue.
  - Enforced `LOW` / `MEDIUM` / `HIGH` visual density rhythm across the timeline.
  - Transition restraint: default clean hard cuts, reserving dissolves and wipes exclusively for semantic transitions.
- **Diagnostics & Regression Fixtures:**
  - Added `visual-design-diagnostics.json` measuring camera, layout, family, movement, and density distributions.
  - Deterministic golden visual references created for Business Documentary, Tech Explainer, and Psychology Explainer (`fixtures/golden/*/`).
  - Full 82.4-second ASML documentary rendered to MP4 (`renders/video-2026-09-27T12-58-07-landscape.mp4`) and audited shot-by-shot in `docs/milestone-6-final-visual-review.md`.
  - All 26 unit and contract tests passing. AI generation remains disabled.

## Milestone 7 — Content Pacing & Editorial Timing: COMPLETE

Transformed video engine pacing from restless, sentence-by-sentence cutting and 2.36s shot churn into deliberate, YouTube-native documentary/explainer storytelling (Vox / Bloomberg style).

Delivered:
- **Audit & Diagnostics:**
  - Audited previous psychology explainer run in `docs/milestone-7-pacing-audit.md`.
  - Added `pacing-diagnostics.json` measuring average shot/scene duration, shot distribution, sliding window cuts/10s, photo runs, graphic comprehension holds, text readability, hook duration, and payoff duration.
  - Added `content-quality-diagnostics.json` validating hook tension, redundancy, and hook-to-payoff narrative closure.
- **Script Structure & Content Beats:**
  - Upgraded `aiDirectorService.js` to structure scripts around unified **Content Beats** (1–3 sentences per beat explaining a complete concept) following the 8-stage retention-aware framework (`HOOK`, `WHY IT MATTERS`, `OPEN QUESTION`, `EXPLANATION`, `EXAMPLE/CONTRAST`, `DEEPER MECHANISM`, `PAYOFF`, `MEMORABLE CONCLUSION`).
  - Authored script pacing metadata (`contentBeat`, `complexity`, `emotionalWeight`, `requiredComprehensionTime`, `visualChangeTolerance`, `pauseAfterSec`).
- **Content-Aware Duration Bands & Shot Demand:**
  - Introduced `DURATION_BANDS` in `shotPlanner.js` (`establishing` 2.5–5.5s, `chart/process` 4.0–8.0s, `hero_stat` 2.5–5.5s, `kinetic_headline` 1.8–3.5s, `emotional_hold` 3.0–7.0s, `montage_cut` 0.8–2.0s).
  - Enforced single stable holds on complex graphics (`process`, `chart`, `compare`, `stat`, `quote`, `document`), eliminating mid-explanation cutting.
  - Authored semantic `changeReason` on every canonical shot (`newIdea`, `newEvidence`, `newEntity`, `emphasis`, `comparison`, `reveal`, `detail`, `sectionTransition`).
- **Remotion Bug Fix:**
  - Resolved 3.3-second black void defect in `StatementShot` (`editorial.jsx`): all tokens now render visible with subdued baseline opacity (0.3) from frame 0 and brighten smoothly on spoken audio cues.
- **Timeline QC Pacing Rules:**
  - Added `pacing-average-shot` (≥ 1.8s in explainers), `pacing-rapid-cuts` (≤ 5 in 10s sliding window), `pacing-graphic-hold` (≥ 3.2s for complex graphics), and `pacing-text-readability` (≥ 2.0s for headlines).
- **Regression Verification:**
  - Re-rendered full 115.9s psychology explainer *"Why Your Brain Chooses Instant Gratification"* (`video-2026-09-27T15-59-24-landscape.mp4`).
  - Shot count dropped from 27 to 18; average shot duration increased from 2.36s to 6.44s (+173%); rapid cut windows reduced from 3 to 0; photo run reduced from 7 to 3; black void at 0:48 eliminated.
  - Authored detailed human scene-by-scene review in `docs/milestone-7-content-pacing-review.md`.
## Milestone 8 — Duration Budgeting, Duration Enforcement & Pacing Balance: COMPLETE

Transformed `--duration` into an authoritative creative budget that directly bounds script length, section length, scene count, shot budgeting, and hold durations before rendering. Resolved the Milestone 7 duration expansion regression (75s request generating 115.87s).

Delivered:
- **Duration Budget Allocator (`src/storyboard/durationBudget.js`):**
  - Upfront calculation of `targetDurationSec`, `allowedMinDuration` ($-5\%$), `allowedMaxDuration` ($+5\%$), `hardMinDuration` ($-10\%$), `hardMaxDuration` ($+10\%$).
  - Calibration of speech rates using observed Kokoro metrics (~2.60 words/sec or ~156 WPM) and derivation of `targetWords` (~181 words) and `maxWords` ceiling (~190 words).
  - Allocation of section budgets (`hook`, `why_it_matters`, `core_explanation`, `example_evidence`, `payoff_conclusion`) and pause time budgeting.
  - Creation of `duration-budget.json` diagnostics.
- **Two-Pass Script Generation (`src/services/aiDirectorService.js`):**
  - Pass 1 outlines content beats matching section duration constraints.
  - Pass 2 authors scenes strictly constrained to the outline and target word count.
- **Pre-TTS & Post-TTS Repair Loops (`src/pipeline/videoGeneratorPipeline.js`):**
  - Pre-TTS validation intercepts overlong scripts and triggers `compressPlanScript`.
  - Post-TTS validation compares actual speech audio duration against budget; automatically compresses script and re-synthesizes audio if over budget (up to 2 repair passes).
- **Semantic Fallback Routing & Typographic Run Repair (`src/pipeline/visualDirector.js`):**
  - Missing media routes semantically by intent and kind (`process`, `compare`, `stat`, `timeline`, `document`) rather than defaulting to `StatementShot`.
  - Repaired adjacent typographic runs ($\le 2$ consecutive text cards).
- **Pacing Diagnostics & QC Upgrades (`src/pipeline/continuityDirector.js` & `src/qc/timelineQc.js`):**
  - Percentiles (`min`, `p25`, `median`, `p75`, `max`) and duration distribution buckets (`<2s`, `2–3s`, `3–5s`, `5–7s`, `>7s`).
  - Sliding 10-second window analysis flagging `OVERACTIVE` ($>5$ cuts) and `UNDERACTIVE` (weak static holds $>5$s).
  - Visual hold quality classification (`STRONG_HOLD`, `ACCEPTABLE_HOLD`, `WEAK_HOLD`).
  - Hard timeline QC check on duration tolerance ($\pm 10\%$ error, $\pm 5\%$ warning).
- **Regression Verification:**
  - Re-rendered full psychology explainer *"Why Your Brain Chooses Instant Gratification"* (`video-2026-09-27T16-30-25`).
  - Duration dropped from 115.87s to **77.83s** (+3.77% of target, within the 71.25s–78.75s $\pm 5\%$ band).
  - Script words dropped from 308 to **190 words**.
  - Pacing preserved: 10 scenes, 11 shots, 0 rapid cut windows, 0 weak holds, average shot duration 7.08s.
  - All 34 tests passing cleanly. No AI-generated imagery used.

## Milestone 9 — Audio Layer Polish, Dynamic Ducking & Sound Design: COMPLETE

Elevated the video generator's audio mix to broadcast-quality YouTube standards with normalized narration, an asymmetrical Attack-Hold-Release ducking envelope, cognitive bed protection, restrained semantic SFX, and an authentic A/B benchmark render.

Delivered:
- **Audio Audit (`docs/milestone-9-audio-audit.md`):**
  - Audited Kokoro loudness, clipping risks, music pumping, SFX levels, and Remotion looping behavior.
- **Audio Mastering & Loudness Normalization (`src/audio/audioMastering.js`):**
  - ITU-R BS.1770 K-weighting pre-filter and RLB filter implementation in pure Node.js.
  - Gated block integration for integrated loudness measurement (LUFS) and true-peak calculation (dBFS).
  - Normalizes narration to **-16.04 LUFS** (+8.1 dB gain) with true-peak limited to **-1.5 dBFS** via quadratic soft-knee limiter.
  - Calibrates SFX library assets, clamping clipping transients (`impact_boom` clamped from 0.00 dBFS to -3.0 dBFS).
- **Dynamic BGM Ducking Engine (`src/audio/duckingEngine.js`):**
  - Continuous Attack-Hold-Release envelope (120ms attack, 600ms recovery hold, 900ms release).
  - Pause classification: `MICRO_PAUSE` (100–500ms), `NORMAL_PAUSE` (500ms–1.5s), `EDITORIAL_PAUSE` (>1.5s).
  - Micro-pause hold bridging: completely eliminates music pumping during short pauses (18 micro-pauses bridged in benchmark).
  - Cognitive bed protection: automatically attenuates music bed by an additional -2 to -4 dB under dense informational graphics (`chart`, `process`, `compare`).
  - Pre-roll entry (0.6s) and **2.0s payoff musical tail** after the final spoken word.
- **Sound Design Engine (`src/audio/soundDesign.js`):**
  - Enforces small semantic vocabulary (`whoosh`, `click`, `paper_slam`, `impact_boom`).
  - Restricts SFX frequency to minimum 6.0s spacing and volumes to 0.14–0.22, sitting comfortably beneath voiceover.
- **Audio Diagnostics & Timeline QC (`src/qc/timelineQc.js`):**
  - Persists `audio-diagnostics.json` tracking narration/master LUFS, true peak, ducking events, pause counts, and SFX peak.
  - Adds QC rules: `audio-loudness-target` (-14 to -18 LUFS), `audio-peak-headroom` (≤ -1.0 dBFS), `audio-pumping-risk`, and `audio-sfx-budget`.
- **A/B Benchmark Validation:**
  - Preserved exact visual timing and duration (77.83s, 2,335 frames, 10 scenes, 11 shots).
  - Rendered Before (`renders/audio-ab-before.mp4`, 19.12 MB) and After (`renders/audio-ab-after.mp4`, 19.31 MB).
  - Documented human listening review in `docs/milestone-9-audio-review.md`.
  - All 40 unit, contract, pacing, and audio tests passing. No AI-generated media used.

## Milestone 10 — Visual Coverage & Explanatory Graphics: COMPLETE

Eliminated generic typography and statement card fallbacks when real media is unavailable. Empowered the video engine to visually explain complex and abstract concepts using procedural code windows, repository UIs, relationship diagrams, supply chain maps, timelines, charts, comparisons, and authentic documents.

Delivered:
- **Visual Coverage Audit (`docs/milestone-10-visual-coverage-audit.md`):**
  - Audited psychology, AI coding agent, and ASML benchmark runs scene-by-scene.
  - Documented that missing media systematically degraded into 59% generic statement text cards.
- **Visual Coverage Plan (`src/storyboard/visualCoveragePlan.js`):**
  - Authored deterministic `classifyInformationType` across 12 semantic domains (`code`, `interface`, `process`, `comparison`, `relationship`, `timeline`, `location`, `data`, `evidence`, `entity`, `atmosphere`, `emphasis`).
  - Added `buildVisualCoveragePlan` mapping shots to primary representations and ordered non-statement fallback chains.
  - Added `synthesizeProceduralData` ensuring rich, grounded semantic payloads for procedural graphics.
- **New Explanatory Primitives (`src/remotion/families/diagrams.jsx` & `Video.jsx`):**
  - `ModernCodeShot`: Syntax-colored code window, active file tab, line numbers, line highlights, and terminal test drawer.
  - `ModernUiShot`: Workspace layout with active context search bar, file tree, and audit status.
  - `DiagramShot`: Multi-component node and relationship architecture diagram with directional SVG arrows.
  - `MapShot`: Global coordinate supply chain map with regional hubs and flight arcs.
  - Enhanced `ProcessShot`, `CompareShot`, `TimelineShot`, `ChartShot`, and `DocumentShot`.
- **Elimination of Fallback to Statement (`src/pipeline/visualDirector.js` & `src/pipeline/visualRealizationDirector.js`):**
  - Replaced blind statement fallback with semantic explanatory routing.
- **Visual Coverage Diagnostics & QC (`src/qc/visualCoverageDiagnostics.js` & `src/qc/timelineQc.js`):**
  - Persisted `visual-coverage-diagnostics.json` measuring direct/supportive/weak/unresolved coverage, blank frames, text overflow, and lexical text grounding.
  - Added pre-render hard error gating for unresolved coverage and perceptually blank frames (> 2.0s).
- **Benchmark Regressions:**
  - *"How AI Coding Agents Work"* (`video-2026-09-28T08-52-55`): Statement cards plummeted from **59% to 5%**; code visuals surged to **61%**, UI to **11%**, direct coverage rose to **85%**.
  - *"Why Your Brain Chooses Instant Gratification"* (`video-2026-09-28T09-01-31`): Statement cards **0%**; duration locked at **77.8s**; direct coverage **80%**.
- **Test Suite:**
  - 45 / 45 unit, contract, pacing, audio, and visual coverage tests pass. AI image generation remains strictly disabled.

See `docs/milestone-10-visual-coverage-review.md`.

## Milestone 11 — Creative QA Director & Automated Repair Loop: COMPLETE

Implemented automated editorial review and bounded repair loop before final rendering. The engine evaluates semantic relevance, representation quality and balance, representation fatigue, shot holds, composition, text readability, safe margins, caption yielding, and audio diagnostics, executing up to 2 repair passes while preserving strong/good shots.

Delivered:
- **Creative QA Director (`src/qc/creativeQaDirector.js`):**
  - Defines `SHOT_QUALITY_STATE` (`STRONG`, `GOOD`, `ACCEPTABLE`, `WEAK`, `FAILED`) and `ISSUE_SEVERITY` (`HARD`, `EDITORIAL`).
  - Separates hard blocking failures (`blank_frame`, `clipped_text`, `missing_visual`, `invalid_asset`, `audio_clipping_risk`) from editorial warnings (`representation_fatigue`, `weak_media`, `inappropriate_domain_ui`, `nearly_empty_screen`, `hold_too_long`, `rushed_graphic`, `caption_competition`).
  - Audits composition metrics (`emptyAreaRatio`, `meaningfulContentArea`, `safeMargins`).
  - Implements bounded repair priority (1: hard failures -> 2: semantic mismatches -> 3: perceptual blankness -> 4: text/layout -> 5: representation fatigue -> 6: pacing -> 7: stylistic repetition).
  - Maximum 2 repair passes strictly bounded; preserves `STRONG` and `GOOD` shots untouched.
- **Repair Actions Implemented:**
  - `REPLACE_ASSET`, `CHANGE_REPRESENTATION`, `CHANGE_LAYOUT`, `ADD_MICRO_PROGRESSION`, `SIMPLIFY_TEXT`, `HIDE_CAPTION`, `EXTEND_HOLD`, `SHORTEN_HOLD`.
- **Pipeline Integration (`src/pipeline/videoGeneratorPipeline.js`):**
  - Persists `creative-qa-before.json`, `creative-repairs.json`, and `creative-qa-after.json`.
  - Generates pre-repair and post-repair contact sheets (`preview/contact-pre-repair.png`, `preview/contact-post-repair.png`).
  - Production acceptance gate: Blocks rendering if hard failures or failed shots remain after 2 passes.
- **Benchmark Regressions:**
  - *"How AI Coding Agents Work"* (`video-2026-09-28T09-26-47`): Repaired 7 shot issues across 2 passes. Reduced code share from 61% to 42.8% by varying layout (terminal) and swapping redundant code runs with process loop and diagram.
  - *"Why Your Brain Chooses Instant Gratification"* (`video-2026-09-28T09-30-31`): Repaired 10 shot issues across 2 passes. Completely eliminated software developer repository UI from human brain scenes, replacing with neural conflict diagrams. Added micro-progression to long holds.
  - *"Why ASML is the World's Most Important Monopoly"* (`video-2026-09-28T09-36-38`): Preserved 100% asset semantic quality (8 cleanroom EUV assets). 0 unresolved shots, 0 blank frames, 100% direct explanatory coverage.
- **Test Suite:**
  - 53 / 53 deterministic unit, contract, pacing, audio, and creative QA tests passing. AI image generation remains strictly disabled.

See `docs/milestone-11-creative-qa-review.md`.

## Milestone 12 — Production Reliability, Resumability & Cache Architecture: COMPLETE

Formalized pipeline stage definitions with explicit dependencies, disk-backed multi-tier caching (TTS, Whisper, provider searches, media downloads with perceptual difference hashing), deterministic downstream invalidation, atomic stage commits, directory concurrency locking, run cloning, partial scene renders, and rapid contact-sheet-only iteration.

Delivered:
- **Formal Stage Model & Invalidation Graph (`src/core/checkpoints/stageRegistry.js` & `invalidationGraph.js`):**
  - Formalized stages: `request`, `plan`, `audio`, `alignment`, `visualStrategy`, `storyboard`, `assets`, `timeline`, `package`, `preRenderQa`, `render`, `postRenderQa` with canonical aliases (`topic-input`, `duration-budget`, `content-plan`, `script`, `tts`, `asset-search`, `visual-realization`, `direction`, `creative-qa`, `audio-mastering`, `preflight`, `post-qc`).
  - Strict transitive downstream invalidation: script changes invalidate TTS/alignment/storyboard/timeline/render; visual style changes invalidate visual strategy/assets/timeline/render without touching script/TTS/alignment; music changes invalidate audio mixing/render without invalidating visual stages.
  - Verification of physical output artifacts on disk before allowing reuse.
- **Disk-Backed Multi-Tier Caching (`src/core/cache/cacheManager.js`):**
  - Narration TTS Cache (`.cache/tts/`) keyed by `sha256(text|voice|speed|engine)`.
  - Whisper Alignment Cache (`.cache/alignment/`) keyed by `sha256(audioHash|scriptHash|model)`.
  - Media Download Cache (`.cache/media/`) preserving licensing, source URLs, content hashes, and 64-bit perceptual difference hashes (`dHash`) with Hamming distance deduplication.
  - Provider Search Cache (`.cache/searches/`) reducing redundant network queries.
  - Cumulative session metrics tracking (`cache-diagnostics.json`).
- **Resumability & Fast Iteration Modes (`src/pipeline/videoGeneratorPipeline.js` & `src/cli/generate.js`):**
  - `--resume <runId>`: Resumes from existing checkpoints, printing explicit resume diagnostics (`REUSED` vs `INVALIDATED`).
  - `--from <stage>`: Forces restart from a specific stage onward.
  - `--contact-sheet-only`: Generates preflight contact sheet in ~14s without waiting for video render (~10x speedup).
  - `--scene <sceneId>` & `--range <start:end>`: Frame-accurate partial renders via Remotion `frameRange` in seconds.
  - `--no-tts`: Iterates visual direction using cached narration and alignment.
  - `--offline`: Runs deterministically using local and cached media bank.
  - `--clone <targetId>`: Non-destructive run branching for variant testing.
- **Concurrency Locking & Atomic Writes (`src/core/locks/runLock.js` & `src/core/jobs/jobContext.js`):**
  - Atomic `.tmp.<timestamp>` artifact and manifest writes preventing corruption.
  - Directory `.lock` with stale PID detection.
  - Version & config snapshots (`config-snapshot.json`) capturing git commit, pipeline version (`1.0.0-m12`), schema version, and CLI overrides.
- **CLI Tooling:**
  - `npm run run:inspect -- --run <id>`
  - `npm run cache:stats`
  - `npm run cache:clean`
  - `npm run pipeline:stage -- --run <id> --stage <stage>`
- **Benchmark Validation:**
  - Verified on Psychology benchmark (`video-2026-09-28T09-30-31`): 100% reuse of plan, narration, alignment, and assets. Contact sheet generated in **14.2s** (~10x faster than 140s baseline).
- **Test Suite:**
  - 65 / 65 unit, contract, pacing, audio, creative QA, and resumability tests pass in ~500ms. AI image generation remains strictly disabled.

See `docs/milestone-12-production-reliability.md`.
