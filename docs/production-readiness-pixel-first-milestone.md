# Production Readiness Milestone: Pixel-First Visual Selection

Date: 2026-10-05  
Scope: executable faceless-video generation path, asset selection, representation routing, licensing, rendered-frame gates, tests, and six real MP4 benchmarks.

## 1. Executive summary

The engine now uses a fail-closed, hybrid visual pipeline. It first decides what a viewer needs to understand and which representation can communicate it. Search metadata only creates a shortlist. Searchable candidates must be materialized and inspected from their actual bytes before semantic approval. Abstract mechanisms can use purpose-built diagrams, processes, timelines, charts, comparisons, code, or UI instead of being forced into stock media.

Production mode is now the default. Missing assets, unverified licenses, missing pixel inspection, critical semantic mismatch, invalid video windows, identity drift, and unresolved placeholders block production. The complete test suite passes (240/240), six real MP4s were rendered, their actual output frames were reviewed, and each has zero hard QC errors.

This is materially safer for use, but “production-ready” is conditional: the 200-asset corpus is real but its labels are provisional rather than independently human-adjudicated, and the local semantic backend is CLIP-based rather than a full multimodal VLM. Those are the next calibration milestone, not facts hidden behind a passing score.

## 2. Root causes verified in runtime

The executable path confirmed these defects:

- semantic judging could happen before a network candidate was downloaded;
- failed CLIP evaluation returned a fake passing score of `0.28`;
- `MEDIA_EDITORIAL` converted nearly every shot to image/montage;
- computed editorial scores did not consistently control final ranking;
- Brave discovery metadata was treated too much like a usable license;
- the image bank stored request-derived descriptions as intrinsic truth;
- video selection lacked contrastive evidence across the chosen window;
- scene-level media leaked into sibling procedural shots;
- structured overlays could reuse unrelated scene data (finance text in a software video);
- “app freezes” matched the generic word `freeze` and generated a credit-market diagram;
- production defaults allowed development behavior too easily;
- post-render checks could validate technical output without checking asset approval state.

## 3. Files/functions changed

Primary runtime changes include:

- `src/storyboard/visualProposition.js`: proposition schema, domain/sense, positives, confusers, representation need.
- `src/storyboard/representationRouter.js`: representation selection and searchability.
- `src/storyboard/visualCoveragePlan.js`: proposition-aware coverage and grounded procedural synthesis.
- `src/storyboard/visibleNeed.js`: proposition-derived visible requirements.
- `src/pipeline/assetRequestPlanner.js`: request, proposition, confuser, and decision persistence.
- `src/pipeline/assetDirector.js`: shortlist -> materialize -> inspect -> judge -> rank -> select ordering.
- `src/assets/visualInspectionService.js`: byte-hash caching, pixel/frame inspection state, sampled video semantics.
- `src/assets/visualEditorialJudge.js`: normalized semantic/editorial judgments.
- `src/assets/assetIntelligenceScorer.js`: authoritative final ranking.
- `src/assets/videoWindowSelector.js`: contrastive frame/window scoring.
- `src/services/relevance.js`: fail-closed CLIP and contrastive margin.
- `src/services/imageBank.js`: verified intrinsic observations and legacy quarantine.
- `src/shared/licensing.js` and `src/services/freeMediaService.js`: discovery/license separation.
- `src/pipeline/visualRealizationDirector.js`, `src/pipeline/timeline.js`, and `src/remotion/engine/Video.jsx`: hybrid rendering and identity-safe binding.
- `src/qc/timelineQc.js`, `src/qc/creativeQaDirector.js`, and `src/tools/preview.js`: production gates and rendered-pixel preflight.
- `src/pipeline/videoGeneratorPipeline.js` and `src/cli/generate.js`: production defaults and artifacts.
- `tests/pixelFirstProduction.test.js` plus existing semantic/editorial suites: runtime regressions.

## 4. Production default changes

The public pipeline and CLI default to `PRODUCTION_RENDER` with fail-closed unresolved-media behavior. Development placeholders require explicit `--dev`. `--render-scale` is available for benchmark/debug renders without changing the production policy. Offline mode now truly restricts providers to local sources.

## 5. Score normalization changes

Editorial scores use `0..1` internally. `finalEditorialScore`, pixel confidence, usefulness, format fitness, CLIP similarity, and contrastive margins are compared on this scale. Percentages are presentation-only. A regression test asserts the canonical range.

## 6. Metadata-vs-pixel separation

Metadata fields remain retrieval evidence only. Inspection records now state `pixelInspected`, `semanticPixelInspected`, `inspectionBackend`, `inspectionConfidence`, and `inspectionSources`. A metadata-only candidate explicitly reports low confidence and `METADATA_FALLBACK`; it cannot masquerade as definitive visual understanding.

## 7. Pixel-first selection implementation

The production media path is:

`provider results -> license/dimension/dedupe filter -> metadata shortlist -> preview materialization -> actual-file inspection -> semantic judgment -> editorial usefulness -> format/quality -> final ranking -> selection`.

The final comparator uses valid pixel judgment, semantic class, editorial usefulness, quality, and crop fitness. Metadata is never final approval. When no candidate passes, the request changes representation or production fails.

## 8. Vision backend implementation

The local backend inspects decoded image pixels and sampled video frames, computes actual content hashes, records backend/version provenance, and produces semantic class evidence through local CLIP comparison. OCR/object/VLM fields are supported in the inspection contract, but a full general-purpose multimodal captioning backend is not bundled. Important-shot confidence therefore fails closed if the required semantic evidence is unavailable.

## 9. CLIP changes

CLIP is used after materialization. It compares positive descriptions against negative confusers and generic filler. Selection uses the positive-minus-strongest-negative margin. Backend failure yields `null` plus an unavailable diagnostic; it no longer returns a fabricated passing value.

## 10. `finalEditorialScore` ranking changes

The score is normalized and is now an authoritative component of `assetIntelligenceScorer`. Candidates rejected by pixel, license, semantic, or production gates cannot win through metadata popularity or provider ordering. Important/evidence shots require a `DIRECT` class; generic contextual media is rejected.

## 11. VisualProposition implementation

Every shot receives a validated proposition containing domain, concept sense, viewer need, visible entities/relations/actions, useful context, negative confusers, positive descriptions, representation need, literalness, evidence strength, and source. It is persisted as `visual-propositions.json`.

## 12. VisibleNeed improvements

VisibleNeed now consumes the structured proposition instead of treating regex-extracted narration fragments as semantic truth. Deterministic rules repair and validate the structured result. Required visible objects/actions and avoid-lists flow into the pixel judge.

## 13. Domain/sense disambiguation

Explicit senses cover causal timelines, ancestral causality, timeline branching, software memory, computing cloud, network protocol, finance, software interfaces, and concurrency deadlocks. Confusers distinguish cloud/weather, memory/human memory, packet/parcel, tree/genealogy, timeline/editor UI, and deadlock/fiber/traffic imagery. A regression specifically prevents application freezing from invoking a financial “credit freeze” graphic.

## 14. RepresentationRouter implementation

The router maps proposition needs to media, document, UI, code, chart, process, diagram, comparison, timeline, or typography. It marks only real/archival/document/screenshot types searchable. Decisions and fallback reasons are persisted and passed through coverage, asset acquisition, timeline realization, and rendering.

## 15. Hybrid production visual policy

`MEDIA_EDITORIAL` is now hybrid. Concrete entities/actions may use approved real media; abstract relationships and mechanisms use structured representations when those explain the narration better. An explicit procedural shot remains procedural even when no coverage record is supplied. Media-to-procedural fallback is recorded rather than silently hidden.

## 16. Structured visual families enabled/disabled

Enabled selectively: diagram, process, timeline, comparison, chart, UI, code, document, typography, image, montage. Generated imagery remains disabled by default. Procedural content must be grounded in current narration; stale scene data is discarded and regenerated. Remotion renders the approved family instead of blocking non-media families.

## 17. Query generation improvements

Queries originate from the proposition’s positive descriptions, required concepts, visible entities, and relationships. Search experiments remain separate from semantic proof. Provider calls are skipped entirely for non-searchable representations.

## 18. Negative confuser system

Each ambiguous sense can provide explicit confusers. Contrastive scoring rejects a candidate when a confuser is as strong as, or too close to, the positive description. Examples include botanical branches, editing timelines, weather clouds, human memories, traffic gridlock, fiber optics, and literal padlock stock.

## 19. EditorialUsefulness

Usefulness evaluates whether a visual explains, proves, locates, compares, demonstrates, or merely decorates the beat. It is persisted separately from semantic relevance. A beautiful but non-explanatory contextual image cannot displace a direct structured explanation on a critical shot.

## 20. Visual quality scoring

Quality combines materialized dimensions, crop safety, composition, busyness, subject bounds, distraction, format fitness, and resolution. Quality is evaluated only after semantic validity: aesthetic quality cannot rescue a wrong asset.

## 21. Video semantic inspection

Video candidates are sampled across multiple decoded frames. Inspection records frame evidence and aggregate semantic classes rather than trusting title/tags. Production requires semantic pixel evidence for selected video.

## 22. Video window selection

Candidate windows receive frame-level positive and confuser scores. The selected interval must contain the requested subject/action and maintain an acceptable contrastive margin. The existing regression confirms that a relevant middle interval beats an empty opening interval.

## 23. Local image bank changes

New records are verified only when actual pixels were inspected with adequate confidence. Intrinsic observations and inspection version are stored separately from request context. Search excludes unverified entries. The sanitizer reviewed 120 legacy records: 0 were trusted automatically and all 120 were quarantined for reinspection.

## 24. Brave/licensing changes

Brave results are discovery-only. Unknown commercial use or missing source license fails production. Editorial-only use requires an explicit editorial policy. A search result URL is not treated as asset authorization. Verified local-bank entries retain their recorded provenance.

## 25. Production gate changes

Hard blockers include unresolved media, placeholders, unknown/unverified license, missing pixel evidence for selected media, `WRONG` or `ACCIDENTAL` critical assets, weak critical visuals, invalid video windows, identity drift, ungrounded on-screen text, destroyed crop, and rendered-frame preflight failure.

## 26. Pre-render semantic review

The pipeline renders low-resolution contact frames before the final MP4, reads the actual output pixels, checks blank/near-blank output, unresolved or unapproved bindings, and combines that result with editorial and timeline QC in `pre-render-semantic-review.json`. This gate catches renderer/binding failures. Fine-grained VLM reclassification of the composited frame remains a next-milestone item.

## 27. New debug artifacts

New runs persist the requested stable artifact names: `visual-propositions.json`, `representation-decisions.json`, `asset-shortlists.json`, `pixel-inspections.json`, `semantic-judgments.json`, `editorial-usefulness.json`, `video-window-semantics.json`, `query-performance.json`, `provider-performance.json`, `license-verification.json`, `pre-render-semantic-review.json`, `final-selection-audit.json`, and `representation-fallbacks.json` when a fallback occurs. Existing equivalent names remain for compatibility.

## 28. Caching/versioning changes

Intrinsic visual caches use the actual file-byte content hash plus backend version. They may store pixel-derived observations but not narration-dependent approval. Contextual decisions retain proposition/role/policy context and are recomputed for unrelated narration.

## 29. New tests

New and updated coverage includes production defaults, hybrid routing, provider bypass for procedural shots, metadata-only inspection status, license rejection, normalized scores, CLIP failure, confuser/polysemy cases, real video-window selection, bank poisoning, identity binding, application-freeze/credit-freeze isolation, database-deadlock routing, and rendered production integrity.

## 30. Total test results

`npm test`: **240 passed, 0 failed, 0 skipped** on 2026-10-05. Focused production tests: **20 passed, 0 failed**. The recurring GLib diagnostic emitted by the local native image stack did not fail tests or renders, but is recorded as an environment warning.

## 31. Real candidate benchmark results

`benchmarks/pixel-first/candidate-dataset.json` contains 200 real pixel files and eight contact sheets. Current provisional distribution: 115 `DIRECT`, 42 `CONTEXTUAL`, 1 `ACCIDENTAL`, 42 `WRONG`; license-failure rate 31.5%. The set is imbalanced (153 tech/AI, 33 software, sparse other niches), so it is diagnostic data, not a calibrated production precision claim.

## 32. Human relevance metrics

The six accepted rendered contact sheets cover 56 timestamped shots. A single engineering review found 56/56 acceptable after two initially bad runs were rejected and replaced: the first Memory Leaks run exposed finance/psychology contamination, and the first Database Deadlocks run exposed fiber-optic media and stale finance text. This is a useful acceptance audit, not blinded multi-rater ground truth. Therefore `top1HumanRelevancePrecision`, `criticalRolePrecision`, and `falseExcellentRate` remain **not yet statistically certified**. No accepted benchmark contains unresolved frames, unknown-license selected media, `WRONG`/`ACCIDENTAL` runtime judgments, or hard QC errors.

## 33. Benchmark video paths

| Benchmark | MP4 | Resolution | Duration |
|---|---|---:|---:|
| Grandfather Paradox landscape | `renders/video-2026-10-05T15-05-49-landscape.mp4` | 1920x1080 | 34.79s |
| Grandfather Paradox Shorts | `renders/video-2026-10-05T15-40-18-shorts.mp4` | 540x960 | 37.72s |
| Memory Leaks landscape | `renders/video-2026-10-05T16-49-25-landscape.mp4` | 960x540 | 49.92s |
| Cloud Computing Shorts | `renders/video-2026-10-05T15-56-12-shorts.mp4` | 540x960 | 34.05s |
| Ship of Theseus landscape | `renders/video-2026-10-05T16-24-15-landscape.mp4` | 960x540 | 44.12s |
| Database Deadlocks landscape | `renders/video-2026-10-05T17-07-06-landscape.mp4` | 960x540 | 29.46s |

The first benchmark is full-resolution. The other five use 0.5 render scale to reduce acceptance-render time; semantic/timeline policy is unchanged.

## 34. Timestamped playback audits

`benchmarks/pixel-first/playback-audits.json` contains all 56 shot records with timestamp, narration, proposition, representation, provider/source, visible content, semantic class/confidence, usefulness, visual quality, license, crop, sequence contribution, verdict, and contact-sheet evidence. It is generated from the exact accepted timelines and then checked against rendered contact frames. It should not be presented as independent human labeling.

## 35. Contact sheet paths

Each accepted run has `renders/runs/<run-id>/contact-sheet.jpg` and `preview/contact-post-repair.png`. Candidate sheets are `benchmarks/pixel-first/candidate-contact-sheet-01.png` through `candidate-contact-sheet-08.png`.

## 36. Before/after failure table

| Failure | Before | After |
|---|---|---|
| Family tree | Person/literal trees could pass metadata overlap | Ancestral-causality proposition routes to genealogy/timeline; botanical trees are confusers |
| Causal loop | Generic fishbone/roadmap imagery | Purpose-built causal process/timeline |
| Protected timeline | Editing-timeline UI could win | `CAUSAL_TIMELINE` rejects editing/project timelines |
| Branching universe | Microscopy/abstract glow | Branch/divergence representation with botanical and generic confusers |
| Time-travel character | Unrelated branded/military media | Direct contextual evidence or structured fallback; no fill-at-all-costs |
| Memory leak | Human memory/sanitation/generic coder; one test render reused finance/psychology data | Heap/reference process, qualitative heap-growth chart, server/monitoring context |
| Cloud computing | Weather clouds | Computing-cloud sense, infrastructure/process representation |
| Database deadlock | Fiber optics and “credit transmission shock” | Thread/lock cycle diagrams; fiber/traffic/padlock confusers; finance trigger narrowed |
| Placeholder | Green unresolved production frame | Hard production failure or recorded procedural fallback |

## 37. Remaining limitations

- No bundled full multimodal VLM currently captions arbitrary finalists or recomputes the full composited-frame semantic class.
- The 200-asset corpus needs balanced niches and reviewed human labels; current automatic/provisional labels cannot certify the 95% target.
- Five benchmark outputs are half-resolution acceptance renders, not delivery masters.
- Benchmark narration length can be shorter than the requested target duration; QC warns rather than inventing content.
- Structured graphics can repeat layouts and occasionally have short holds; these are warnings, not relevance failures.
- Local native image tooling emits non-fatal GLib warnings on Windows.
- Old benchmark directories retain legacy artifact filenames; newly generated runs emit both legacy and required stable names.

## 38. Exact recommended next milestone

Build a **balanced, independently reviewed semantic calibration gate**:

1. rebalance the 200+ corpus across all seven niches with at least 25 assets per niche;
2. collect two human labels per candidate/shot and adjudicate disagreements;
3. add a real pixel-captioning VLM for only the top 3–6 finalists and low-resolution composited frames;
4. calibrate contrastive and editorial thresholds against held-out data;
5. report precision/recall, critical-role precision, false-excellent rate, and confidence intervals;
6. rerender the five scaled benchmarks at delivery resolution only after the target metrics are met.

Do not add providers, transitions, templates, or generated imagery during that milestone. The remaining risk is semantic calibration evidence, not missing visual effects.
