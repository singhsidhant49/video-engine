# Video Generation Engine: Complete Flow and Visual-Relevance Audit

**Audit date:** 2026-10-05  
**Repository:** `D:\projects\videogenerator`  
**Scope:** The executable generation path, storyboard and asset planning, image/video retrieval, candidate scoring, visual inspection, timeline construction, Remotion rendering, quality gates, recent run artifacts, and relevant provider/model documentation.

## Executive conclusion

The engine is a sophisticated, artifact-driven Remotion pipeline. It has good foundations: explicit intermediate JSON files, resumable stages, licensing metadata, provider routing, deterministic timelines, composition preflight, render QC, and an unusually extensive automated test suite.

The current visual-relevance problem is nevertheless real and reproducible. It is not mainly caused by Pexels, Commons, or the lack of search results. The central problem is that the engine frequently approves and ranks candidates **before it has inspected the downloaded pixels**, then treats metadata-derived guesses as visual understanding. Several later quality gates trust that earlier approval. In production's default `MEDIA_EDITORIAL` mode, the engine also forces every idea—including abstract mechanisms, timelines, causal processes, and comparisons—into stock/image/video media even when a diagram or generated explanatory visual would communicate the narration much better.

In the audited completed run `video-2026-10-05T08-15-48`, the engine marked 9 of 10 asset requests `excellent`, with an average reported semantic score of `0.875`. The rendered contact sheet visibly contains these mismatches:

| Narration/need | Selected visual | Engine result | Human result |
|---|---|---:|---|
| Family tree / erased ancestry | Man walking beside literal trees | `excellent`, `CONTEXTUAL`, accepted | Weak accidental word association |
| Causal loop | Fishbone defect diagram | `excellent`, accepted | Wrong explanatory structure |
| Protected timeline | Video-editing timeline UI | `excellent`, accepted | Polysemy collision on “timeline” |
| Branching universes | Generic microscopic image | `excellent`, accepted | Weak/ambiguous |
| Character example in time-travel story | Military vehicle / Terminator-related image | `excellent`, `DIRECT`, accepted | Wrong subject and scene |
| Final payoff | Unresolved green placeholder | Development render allowed | Not publishable |

This is a **false-confidence failure**: telemetry says the assets are excellent even when the actual sequence is visibly irrelevant. Fixing it requires changing the selection order and production policy, not adding more regular expressions to the current judge.

## 1. Actual end-to-end generation flow

The main orchestrator is `src/pipeline/videoGeneratorPipeline.js:createFacelessVideo()`.

```text
User request / Studio / CLI
        |
        v
1. Request + duration budget
        |
        v
2. LLM editorial plan (script + scene intent)
        |
        v
3. TTS or supplied narration -> normalized WAV
        |
        v
4. Word alignment -> timed words
        |
        v
5. Visual strategy + canonical storyboard
        |
        v
6. Asset requests + VisibleNeed + query ladders
        |
        v
7. Provider retrieval -> metadata scoring -> pre-download judgment
        |
        v
8. Materialization/download -> limited CLIP tie-break -> asset selection
        |
        v
9. Shot realization + media composition + deterministic timeline
        |
        v
10. Static QC + contact sheet
        |
        v
11. Remotion bundle and H.264 render
        |
        v
12. Render QC + rendered visual critic + package/thumbnail
```

Every major stage writes artifacts under `renders/runs/<videoId>/`. This is one of the strongest parts of the design because a bad result can be traced without rerunning the entire pipeline.

### 1.1 Input and run creation

Entry points:

- CLI: `src/cli/generate.js`
- Web studio: `src/server/studioServer.js`
- Orchestrator: `src/pipeline/videoGeneratorPipeline.js`

The pipeline accepts topic, niche, format, target duration, voice, optional audio/plan files, rendering flags, offline mode, visual mode, and resume controls. `JobContext` creates the run directory and checkpoint manifest. Resume validity is evaluated before stages are reused.

The first artifacts are:

- `request.json`
- `duration-budget.json`
- `project.json`
- `manifest.json`

### 1.2 Script and editorial plan

`src/services/aiDirectorService.js` calls DeepSeek first, or OpenAI if configured, and uses a built-in demo plan if no LLM key exists. For short videos it creates an outline, then a normalized scene plan.

Each planned scene carries:

- exact narration;
- story purpose and content beat;
- visual kind (`subject`, `process`, `chart`, `statement`, etc.);
- concrete visual description and search queries;
- optional real entity;
- tone, intensity, importance, camera, continuity, and treatment;
- typed data for charts, processes, comparisons, documents, quotes, and UI.

`normalizePlan()` validates the result and downgrades unsupported structured scenes to a subject/photo scene. It writes `plan.json` and content-quality diagnostics.

Important architectural tension: the LLM prompt asks for 75–85% cinematic footage, but the default production visual policy later converts **100% of representations to real media**. The structured kinds in the plan therefore often do not survive to the final visual grammar.

### 1.3 Narration, duration repair, and alignment

The engine obtains narration from:

- Kokoro TTS;
- a supplied audio file; or
- the development `say` synthesizer.

It normalizes loudness, analyzes the actual audio, and aligns script words to timestamps. If narration exceeds the duration budget, the script is compressed and re-synthesized, with a deterministic final trim fallback.

Artifacts:

- `public/narration.wav`
- `words.json`
- updated `plan.json` when compression occurs
- audio and duration diagnostics later in the pipeline

### 1.4 Storyboard creation

The storyboard path is:

1. `selectVideoVisualStrategy()` chooses global visual style parameters.
2. `analyzeEditorialScenes()` merges related plan units into content beats.
3. `authorShots()` estimates shot demand, segments semantic sub-beats, assigns roles, and chooses search concepts.
4. `buildStoryboard()` produces canonical sections, scenes, and shots.
5. `buildVisualCoveragePlan()` describes the intended representation and fallback options.

Artifacts:

- `visual-strategy.json`
- `storyboard.json`
- `storyboard-diagnostics.json`
- `visual-coverage-plan.json`

The storyboard is the authority for asset requests and timeline traceability. Shot IDs such as `scene_004_shot_01` are carried through retrieval, materialization, solved composition, and rendering.

### 1.5 VisibleNeed and query planning

For every storyboard shot, `planAssetRequests()` creates a provider-independent request. `buildVisibleNeed()` tries to describe what a viewer must literally see:

- primary concept;
- subject;
- visible action;
- environment;
- required objects;
- acceptable semantic alternatives;
- concepts that must be avoided;
- role (`HOOK`, `ACTION`, `EVIDENCE`, `PAYOFF`, etc.);
- required literalness and evidence strength.

The asset request planner then builds a five-level search ladder:

1. specific visible action;
2. subject + action;
3. subject + environment;
4. contextual evidence;
5. broad topic fallback.

Artifacts:

- `asset-requests.json`
- `visible-needs.json`
- `asset-query-diagnostics.json`

### 1.6 Image and video providers

`src/assets/providerRegistry.js` routes each request class to some combination of:

- local image bank;
- Wikipedia lead image;
- Wikimedia Commons;
- Pexels images;
- Brave Image Search;
- Pixabay images;
- Pexels videos;
- a generic Unsplash library.

Provider results are normalized into one `AssetCandidate` schema with source URL, dimensions, media type, label/description/tags, license, provider confidence, and authority.

Search is staged. Once metadata scoring finds a sufficiently strong pool, later query stages stop. This early stop is currently important because the “strong” decision is made before reliable pixel inspection.

### 1.7 Candidate scoring and selection as currently implemented

The actual order is:

```text
provider metadata
  -> license filter
  -> metadata semantic score
  -> inspectVisualCandidate(candidate without downloaded file)
  -> editorial judgment
  -> rank candidates
  -> download/materialize top viable candidates
  -> CLIP score images only
  -> rank primarily by old metadata score
  -> choose candidate
```

Metadata scoring (`assetIntelligenceScorer.js`) considers entity/subject/context token overlap, source authority, crop, resolution, license confidence, cliches, and hard-coded mismatch gates.

The semantic inspection layer (`visualInspectionService.js`) is intended to be narration-blind and pixel-aware. However, `assetDirector.js` calls it before materialization and does not pass a `filePath`. For network candidates there are no local pixels at that point. The service therefore builds its “inspection” primarily from candidate label/title/description/tags and generic pixel defaults.

The editorial judge compares that metadata-derived inspection to `VisibleNeed`. Accepted candidates receive a 0–100 editorial score, but that score is stored as `score.finalScore` and is not used by `compareCandidateScores()`. Candidate ordering still primarily follows the original quality rank and semantic metadata score.

After download:

- images receive a CLIP similarity against only `request.concept`;
- video does not receive CLIP semantic scoring;
- CLIP is only a final tie-break after the existing comparator;
- there is no calibrated unrelated threshold in the selection path;
- CLIP errors return `0.28`, described in code as a default good score, making failure look like success.

For selected videos, the window selector samples frames for brightness, contrast, black starts, and possible cuts. It does not confirm that the required action or subject is present in the selected window.

### 1.8 Timeline and composition

The engine builds scene direction, evaluates continuity, and realizes each authored shot. In default `MEDIA_EDITORIAL` mode:

- every shot family becomes `image` or occasionally `montage`;
- variants become full-frame media;
- procedural chart/process/diagram/comparison families are disabled;
- moving video remains camera-static;
- stills may receive a subtle camera move on sufficiently long shots.

`buildTimeline()` maps aligned word ranges to frame ranges, creates captions, audio ducking, SFX, transitions, and typed solved composition records. Media shots pass through `MediaSceneSpec`, layout solving, motion planning, and frame-state preflight.

Artifacts include:

- `direction.json`
- `editorial-visual-plan.json`
- `media-scene-specs.json`
- `editorial-visual-beats.json`
- `media-shot-plan.json`
- `solved-scenes.json`
- `motion-plans.json`
- `timeline.json`

### 1.9 Quality checks and rendering

Before render, the engine runs timeline QC, creative QA, visual coverage checks, composition quality checks, sequence review, contact-sheet generation, and production publishability checks.

Remotion is then bundled and receives the explicit timeline through `inputProps`. `DynamicShorts` or `LandscapeExplainer` is selected, and `renderMedia()` writes H.264 with BT.709 color, CRF 17, and 192 kbps audio. The engine can render a full video, scene, or time range.

Post-render checks look for duration mismatch, blank frames, frozen clips, and brightness. A thumbnail and packaging metadata are also produced.

## 2. Why the visuals are not relevant

### P0 — Network candidates are judged before their pixels exist

`evaluateAndJudgeCandidate()` calls `inspectVisualCandidate(item.candidate, {visibleNeed})` before `materializeCandidate()`. With Pexels, Commons, Pixabay, Brave, and remote video, `candidate.localPath` is absent. The semantic service cannot inspect the file and instead infers the visible subject from text metadata.

This makes the pipeline vulnerable to:

- ambiguous words (`timeline`, `tree`, `branch`, `terminal`, `cloud`);
- inaccurate stock captions;
- SEO-heavy page titles;
- characters or brands that share a query term;
- search results whose thumbnail content differs from the title.

This is the main root cause.

### P0 — Editorial score is calculated but not used to rank candidates

Accepted candidates receive `finalEditorialScore`, assigned to `item.score.finalScore`. `compareCandidateScores()` never reads `finalScore`. It sorts by quality rank, metadata semantic score, presentation, credibility, diversity, and ID. As a result, an editorial score cannot promote a genuinely useful asset above a weaker accepted asset.

### P0 — Default production mode forces real media for concepts that need explanation

`MEDIA_EDITORIAL` is the default. `buildEditorialVisualPlan()` selects `media` for every shot, and `realizeSceneShots()` chooses `image`/`montage` for every production shot.

Stock media works well for concrete entities, locations, actions, atmosphere, archive, and evidence. It is often incapable of literally showing:

- causal loops;
- branching timelines;
- packet flow;
- memory allocation;
- comparisons and processes;
- abstract economic mechanisms;
- counterfactual scenarios.

The engine already has process, diagram, chart, comparison, UI, code, statement, and timeline composition systems, but production disables them. The result is forced metaphor or accidental stock imagery.

### P0 — Development defaults allow placeholders and non-production output

The orchestrator defaults to:

- `unresolvedMediaMode = ALLOW_DEV_PLACEHOLDER`
- `publishMode = DEV_RENDER`

That permits an unresolved image to become a generated placeholder and permits weak editorial conditions to remain warnings. This is useful for development but dangerous as the normal user-facing default. The audited render ended with a bright green unresolved frame while static QC still passed the timeline.

### P1 — `VisibleNeed` extraction is brittle and domain-specific

The rules contain useful technical ambiguity handling, but generic text extraction frequently produces malformed subjects and actions. In a recent run, examples included:

- subject: `Imagine killing your`;
- subject: `One solution: many-worlds`;
- action: `manufacturing, fabricating, or constructing` for quantum branching;
- subject: `nanometer silicon transistor gate` for a time-travel narration;
- web/browser queries injected into unrelated science shots.

These errors come from broad regex triggers and first-three-content-word fallbacks. Once the `VisibleNeed` is wrong, retrieval and judgment optimize for the wrong target.

### P1 — The semantic judge has permissive fallbacks

For unrecognized roles such as `GRAPHIC`, the usefulness evaluator falls into a permissive default branch. A candidate explicitly diagnosed as a weak search hit can still be accepted. In the audited run:

- the fishbone diagram was accepted as `CONTEXTUAL (WEAK)`;
- a microscopic universe image was accepted as `DIRECT (WEAK)`.

The judge also promotes candidates to `DIRECT` when any one of several overlap measures crosses a threshold. Because the “visible” description is itself derived from search metadata, this can become circular: metadata matches the query, metadata is treated as visual content, then the visual is declared a direct match.

### P1 — CLIP is too late, too narrow, and fail-open

The engine's CLIP implementation is reasonable as one signal, but the integration is ineffective:

- only still images are scored;
- it compares against a short search concept, not a richer positive/negative prompt set;
- it is evaluated after candidates have already passed semantic approval;
- it is only used after the main comparator returns a tie;
- there is no rejection threshold;
- exceptions return a positive-looking constant.

CLIP should not be the only semantic judge. OpenAI's own CLIP documentation notes weaknesses on abstract/systematic and fine-grained tasks and sensitivity to wording. It is best used as a calibrated retrieval feature with hard negatives, not as proof that a visual explains a narration beat.

### P1 — Video semantics and video-window semantics are not actually verified

Remote videos are approved from metadata. After download, the window selector measures image statistics and favors mid-clip windows, but does not run multi-frame subject/action recognition. A professional video-editing timeline was therefore accepted for a fictional causality timeline.

The selector's comments promise action-aware selection, but runtime samples do not derive `actionPresent` or `subjectPresent` from pixels. Those fields exist only in a pure scoring helper/test path.

### P1 — Brave results are incorrectly treated as licensed media

`braveImageSearch()` assigns every discovered web image a synthetic license named `Web Editorial (Brave Search)` with `nonFree: false`. Brave explicitly states that its search API does not grant rights to third-party content and that users must comply with the source publisher's copyright terms.

This is a production/legal blocker. Brave should be a discovery source only. An image may be materialized only after a separate license-verification step identifies an allowed license from the source page. Unknown licensing must fail closed.

This also contaminates the local image bank: once selected, such an asset can be saved and later reused with the same invalid license assumption.

### P1 — Quality telemetry validates internal consistency, not human relevance

The run reported 9 `excellent` selections while visibly containing multiple mismatches. This occurs because:

- `resolutionStatus` comes from metadata scoring;
- semantic judgments use metadata-derived inspection;
- composition QC checks crop, occupancy, captions, camera, and layout more reliably than meaning;
- timeline QC trusts the attached judgment classification;
- contact-sheet creation does not itself run a strong multimodal review.

There is also a scale bug in `mediaVisualQualityGate.js`: `finalEditorialScore` is 0–100, but weak contextual matching checks `< 0.45`. That condition will effectively never fire for accepted results.

### P1 — The local image bank can amplify prior mistakes

The bank now avoids adding arbitrary query tokens, which is good. However, it stores `description: request.concept` for a selected asset. That description is not intrinsic to the asset; it is the request that happened to select it. A false selection can therefore be re-indexed under the wrong concept and become a high-authority local result in later runs.

The first audited shot demonstrates the risk: a Mickey Mouse time-machine cartoon from the local bank outranked fresh sources and was considered a direct, essential match. The bank needs verified intrinsic captions and quarantine/versioning, not request-derived descriptions.

### P2 — Provider search breadth is expensive but not necessarily diverse

The audited run made 60 provider calls and considered hundreds of candidates, yet selection stopped at the `EXACT` stage for 9 shots. Many query variants are near-duplicates. Search breadth without post-download semantic reranking increases latency and API use without improving relevance.

The latest incomplete run also showed repeated sanitized queries (`html code editor browser`) leaking into unrelated time-travel shots, indicating that `mapActionToVisibleQueries()` contains overly broad triggers such as `tree`, `render`, `code`, and `branch` without sufficient domain classification.

### P2 — All-photo production creates monotony even when relevance is acceptable

The audited QC correctly reported:

- image family share: 100%;
- longest photo/montage run: 10;
- family/layout/variant adjacent repetition: 100%;
- long static holds;
- several frozen clips.

This is a direct result of the default media-only policy, not a Remotion limitation.

### P2 — Passing unit tests do not represent real-provider behavior

All 234 tests pass. The suite includes many good adversarial examples, but most provide idealized candidate labels and handcrafted inspection data. They do not reproduce the actual runtime ordering in which a remote candidate is inspected without a downloaded file.

Missing regression coverage includes:

- provider result -> download -> pixel inspection -> judgment -> final rank;
- metadata/pixel disagreement;
- CLIP/model load failure;
- video multi-frame semantic mismatch;
- arbitrary Brave result with unknown copyright;
- contact-sheet-level semantic review;
- calibration of reported `excellent/good/weak` status against human labels.

## 3. Can relevance be made much better?

Yes. The engine already contains many required pieces. The key is to make pixel evidence authoritative, restore representation choice, and fail closed for uncertain critical shots.

## 4. Recommended target architecture

### 4.1 Choose representation before searching for assets

For each narration beat, first classify the communication need:

| Need | Best default representation |
|---|---|
| Named person/place/product/event | verified image/archive/video |
| Physical action | video first, then action photo sequence |
| Evidence/document | primary-source screenshot/document |
| Abstract causal mechanism | diagram/process animation |
| Comparison | comparison composition with optional supporting media |
| Numeric trend | chart with cited data |
| Counterfactual or impossible scene | generated visual with disclosure, or diagram |
| Mood/transition | atmospheric stock media |

Use stock media only when the narration has something realistically photographable. Do not ask stock search to explain an abstract mechanism.

### 4.2 Use a two-stage retrieval pipeline

**Stage A: cheap retrieval**

- provider search;
- license/provenance gate;
- metadata relevance;
- dimensions/orientation;
- deduplication;
- retain perhaps 8–16 candidates, not only metadata winners.

**Stage B: materialize and inspect**

- download thumbnails/proxies for the shortlist;
- compute real content hash;
- run image captioning or a vision-language model on pixels;
- OCR visible text;
- detect faces/logos/objects where relevant;
- for video, sample 5–9 frames or candidate windows;
- compare actual visual observations to `VisibleNeed`;
- reject mismatch before full-resolution download/render.

The sequence must be pixel inspection **before approval**, not after it.

### 4.3 Replace single-query CLIP scoring with contrastive scoring

For a candidate, compare the pixels to:

- a positive direct description;
- acceptable contextual alternatives;
- explicit negative/confuser descriptions;
- generic filler classes;
- domain collision classes.

Example for “branching timelines”:

- positive: “a scientific visualization of multiple causal timelines diverging”;
- contextual: “a physics diagram showing parallel realities”;
- negative: “tree branches”, “video editing timeline”, “project roadmap”, “railway map”;
- generic: “abstract glowing background”.

Use margins rather than raw absolute CLIP similarity. Reject when a negative class is close to or above the positive class. Calibrate thresholds on a labeled repository dataset.

On model errors, return `null`/`unavailable` and lower confidence. Never return a fabricated passing score.

### 4.4 Make critical-role policy genuinely strict

For `HOOK`, `ACTION`, `DETAIL`, `EVIDENCE`, and `PAYOFF`:

- require pixel-backed `DIRECT` or strong `CONTEXTUAL` evidence;
- reject `WEAK` regardless of role naming;
- reject high semantic distance;
- reject unknown inspection backend/confidence;
- reject unresolved media in every render intended for viewing/publishing;
- allow user/manual approval as an explicit override with an audit record.

For atmosphere and transitions, weaker thematic media may be acceptable.

### 4.5 Restore hybrid visuals

Change production mode from media-only to hybrid editorial:

- real media for concrete subjects/actions/evidence;
- procedural compositions for processes, comparisons, timelines, charts, and code/UI explanations;
- generated visuals only for impossible scenes or precise illustrative needs, with provider/license policy and labeling;
- typography only for intentional emphasis, not as a fallback for failed retrieval.

The repository already has most procedural renderers and layout solvers. The main work is changing the policy authority so `selectedRepresentation` follows the coverage plan instead of always becoming `media`.

### 4.6 Add an actual pre-render semantic gate

Render a low-resolution contact sheet or one/two frames per shot and run a second, independent review using:

- narration excerpt;
- `VisibleNeed`;
- rendered frame pixels;
- selected asset provenance;
- predicted subject/action/text;
- sequence context (previous and next shot).

This catches failures introduced by crop, overlay, wrong trim, or binding mistakes. It should be a blocking gate in production, not only a diagnostic artifact.

### 4.7 Fix provenance policy

- Treat Brave as discovery only.
- Require an allowed, verified license from the original page before use.
- Fail closed on unknown licenses.
- Store license snapshot, source page, author, and retrieval timestamp.
- Quarantine existing local-bank records derived from Brave/unknown sources.
- Store only intrinsic captions/tags in the bank; never use the selecting query as the asset description.

## 5. Prioritized implementation plan

### Phase 0 — Safety and truthfulness (1–2 days)

1. Make user-facing renders default to `PRODUCTION_RENDER`; keep development mode explicit.
2. Block unresolved placeholders unless the caller explicitly requests a debug render.
3. Disable Brave materialization until source licensing is verified.
4. Change CLIP/model exceptions from `0.28` to `null` plus a diagnostic failure.
5. Correct score scales (`finalEditorialScore < 45`, not `< 0.45`, or normalize everywhere to 0–1).
6. Stop calling any metadata-only result a visual inspection; persist backend type and `pixelInspected: false`.

### Phase 1 — Pixel-first selection (3–6 days)

1. Search and metadata-rank a shortlist.
2. Materialize low-resolution previews for the top candidates across multiple providers.
3. Call `inspectVisualCandidate()` with the actual file path.
4. Judge the real inspection.
5. Use `finalEditorialScore` in the final comparator.
6. Apply a calibrated unrelated threshold and positive-vs-negative margin.
7. For videos, inspect sampled frames and retain per-window semantic scores.
8. Download/copy the full selected asset only after approval.

### Phase 2 — Better planning and hybrid representation (4–8 days)

1. Replace regex-only `VisibleNeed` generation with structured LLM extraction plus deterministic validation.
2. Add explicit domain and sense fields, e.g. `timeline.sense = causality`, not video editing/project planning.
3. Make `selectedRepresentation` follow coverage/communication need.
4. Re-enable the existing process, diagram, comparison, chart, code, UI, and timeline families in production.
5. Add a generated-media provider for impossible/counterfactual scenes if desired, with commercial policy and disclosure.

### Phase 3 — Evaluation and calibration (3–5 days initially, then continuous)

1. Build a labeled set of at least 200 real provider candidates across niches.
2. Label subject match, action match, evidence value, distraction, license validity, and final accept/reject.
3. Measure precision at the selected top-1 asset; prioritize precision over recall for critical roles.
4. Add end-to-end tests that use saved provider responses and downloaded thumbnails.
5. Add regressions from every production failure.
6. Track human approval rate by provider, role, request class, and inspection backend.

## 6. Concrete code changes by file

| File | Recommended change |
|---|---|
| `src/pipeline/assetDirector.js` | Materialize shortlist before semantic judgment; pass actual file; make final editorial score part of final rank; reject unavailable pixel inspection on critical roles. |
| `src/assets/visualInspectionService.js` | Separate metadata inspection from pixel inspection in the schema; add real caption/OCR/object output; inspect sampled video frames. |
| `src/assets/visualEditorialJudge.js` | Remove circular metadata-as-vision acceptance; apply all critical-role rules consistently; gate on semantic distance and inspection backend. |
| `src/assets/assetIntelligenceScorer.js` | Keep metadata score as retrieval score only; do not label it final semantic quality. |
| `src/services/relevance.js` | Fail closed/unavailable; support positive and negative prompt sets; calibrate margins. |
| `src/assets/videoWindowSelector.js` | Score sampled frames for the required subject/action, not only luma and cuts. |
| `src/pipeline/mediaEditorialPlanner.js` | Stop forcing every selected representation to `media`; follow communication need. |
| `src/pipeline/visualRealizationDirector.js` | Restore hybrid families in production; media-only becomes an opt-in style. |
| `src/storyboard/visibleNeed.js` | Use structured extraction and domain sense; validate subject/action/environment instead of generic regex fallback. |
| `src/pipeline/assetRequestPlanner.js` | Narrow mapping rules; remove broad triggers that inject browser/code queries into unrelated domains. |
| `src/services/freeMediaService.js` | Treat Brave license as unknown/discovery-only; verify original source license. |
| `src/services/imageBank.js` | Store intrinsic descriptions only; quarantine low-confidence and unverified-license assets. |
| `src/qc/mediaVisualQualityGate.js` | Fix 0–100 vs 0–1 score mismatch; require pixel-backed semantic approval. |
| `src/pipeline/videoGeneratorPipeline.js` | Use production-safe defaults for user runs and add independent rendered-frame semantic review. |

## 7. Acceptance criteria

A repaired engine should meet measurable targets:

- zero unresolved frames in publish mode;
- zero unknown-license assets;
- every selected critical asset has `pixelInspected: true`;
- every selected video has multi-frame and selected-window semantic evidence;
- top-1 human relevance precision ≥95% for critical roles and ≥85% overall on the labeled benchmark;
- false `excellent` rate below 2%;
- no `WEAK` candidate accepted for a critical role;
- no more than three consecutive shots using the same visual family unless explicitly justified;
- abstract mechanisms use explanatory representations rather than unrelated stock;
- contact-sheet semantic review agrees with final selected asset IDs and hashes;
- model/backend failure decreases confidence and cannot silently pass.

## 8. Other current engine issues

### High priority

- **Copyright/provenance:** Brave search results are treated as freely usable although Brave grants no third-party content rights.
- **Misleading confidence:** metadata-based retrieval status is reported as final semantic quality.
- **Incomplete recent runs:** the two newest runs stopped before `assets.json`, indicating current generation attempts can stall/fail during asset processing. Their manifests/logs should be checked for the exact operational error.
- **Development defaults:** unresolved placeholders and warning-only policy are too easy to use accidentally.
- **Local-bank trust inflation:** prior false selections can be recycled and presented as authoritative local results.

### Medium priority

- **Visual monotony:** default 100% media mode creates slideshow/frozen-shot warnings.
- **Query pollution:** broad regex mappings generate unrelated technical search phrases.
- **Provider cost/latency:** dozens of calls and hundreds of candidates are made without a strong pixel reranker.
- **Video trim claims exceed implementation:** comments/tests describe action-aware selection, while production sampling is mostly visual stability.
- **Docs drift:** `README.md` links to `VISUAL_PIPELINE_AUDIT.md`, which is currently deleted/missing in the worktree. Existing architecture prose also describes relevance behavior more strongly than the current runtime provides.
- **Encoding:** several repository documents and console strings display mojibake, reducing operator readability.

### Low priority

- Test output contains GLib/GObject critical warnings even though tests pass; this should be isolated to avoid hiding future native-library failures.
- Search statistics are process-global, so numbers can accumulate across operations in a long-lived process unless reset per job.

## 9. What is already good and should be preserved

- Stable run artifacts and stage resumability.
- Canonical storyboard/shot IDs and identity-chain validation.
- Deterministic frame-level Remotion timeline.
- Audio normalization, word alignment, ducking, and duration repair.
- Provider abstraction and licensing fields.
- Crop, safe area, caption, layout, and frame-state preflight.
- Candidate reuse/deduplication memory.
- Contact sheets and rendered-frame extraction.
- Broad automated test coverage and adversarial fixture mindset.

The recommended work is a refactor of selection authority, not a rewrite of the rendering engine.

## 10. Validation performed during this audit

- Traced the executable pipeline and major supporting modules.
- Inspected recent run directories and artifacts.
- Audited the completed run `video-2026-10-05T08-15-48` at request, asset-report, judgment, timeline, QC, and contact-sheet levels.
- Compared selected assets against the narrated needs.
- Ran `npm test`: **234 passed, 0 failed**.
- Reviewed provider and model documentation relevant to current behavior.
- Did not modify engine code or user-owned in-progress changes; this report is the only new file.

## 11. Research references

- [OpenAI CLIP overview and limitations](https://openai.com/index/clip/): CLIP is useful for zero-shot semantic association but is sensitive to wording and weaker on abstract/systematic or fine-grained tasks.
- [OpenAI CLIP paper](https://cdn.openai.com/papers/Learning_Transferable_Visual_Models_From_Natural_Language.pdf): primary description of contrastive image-text training and retrieval evaluation.
- [Pexels API documentation](https://www.pexels.com/api/documentation/): official photo/video search endpoints, orientation filters, and API usage requirements.
- [Brave Search API](https://brave.com/search/api/): explicitly states that the API grants no rights to third-party content and users must comply with source publishers' copyright terms.
- [Brave Image Search documentation](https://api-dashboard.search.brave.com/app/documentation/image-search): describes image discovery, original URLs/proxy thumbnails, and warns about copyright/licensing.
- [MediaWiki search/discovery API](https://www.mediawiki.org/wiki/API%3ASearch_and_discovery): official search and generator behavior used for Wikimedia retrieval.
- [Remotion renderer API overview](https://www.remotion.dev/docs/api): offiacial renderer flow covering composition selection, `renderMedia()`, and `renderStill()`.

## Final recommendation

Do not spend the next iteration adding more isolated mismatch regexes. Implement pixel-first shortlist reranking, production-safe failure behavior, verified licensing, and hybrid representation selection. Those four changes address the structural causes and will improve relevance far more than expanding the current rule catalog.
