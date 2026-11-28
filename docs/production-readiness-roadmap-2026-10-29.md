# Production Readiness Roadmap — Video Generator

## Goal

Produce publishable faceless videos whose script, narration, visuals, timing, edits, audio, and
factual claims are correct for the selected content type. Authentic real images and footage remain
the default for visible reality. Structured graphics are used only when they communicate a
mechanism or relationship more accurately than stock media.

“Perfect” is treated as a measurable release standard, not a claim that failures are impossible.
The system is production-ready only after it passes the automated and human gates below.

## Production principles

1. Relevance before beauty: an attractive wrong image is rejected.
2. Real media before synthetic media for people, places, events, actions, environments, and
   evidence.
3. Explanation before decoration: diagrams, processes, timelines, charts, UI, and code are used
   when viewers must understand structure.
4. Native video before animated stills for action, motivation, and meditation.
5. Cuts follow meaning boundaries, not arbitrary time intervals.
6. Every factual claim is verified, qualified, or removed.
7. A production render fails closed when required quality cannot be achieved.

## Phase 0 — Critical architecture and policy

Status: implemented in the 2026-10-29 hardening pass; production benchmark rerun still required.

### 0.1 Content-aware hybrid visual routing

- [x] Add `HYBRID_EDITORIAL` mode and make it the default.
- [x] Keep explicit `MEDIA_EDITORIAL` for documentary-style media-only output.
- [x] Keep `LEGACY_PROCEDURAL` for compatibility.
- [x] Preserve authentic media for real people, places, objects, events, actions, documents, and
  environments.
- [x] Preserve process, comparison, timeline, chart, UI, code, diagram, and typography
  representations when they explain the narration more directly.
- [x] Persist the policy in the timeline schema and renderer.

Acceptance:

- A concrete documentary scene routes to real media.
- A causal mechanism routes to process/diagram.
- A numeric trend routes to a chart only when grounded data exists.
- Explicit media-only mode never emits procedural output.

### 0.2 Content-specific visual profiles

- [x] Add centralized profiles for documentary, explainer, motivational, meditation, story, and
  audiobook.
- [x] Define maximum still-image share, native-video requirements, photo-run limits, and dissolve
  ranges.
- [x] Make motivational action beats and meditation nature beats require native video.
- [x] Reject still-image fallbacks for native-motion-required beats.
- [x] Keep documentary historical/evidence beats image-friendly.

Acceptance:

- Motivation cannot publish as a rapid photo slideshow.
- Meditation cannot publish as Ken Burns motion over mostly still photos.
- Documentary can intentionally use archival stills without failing an arbitrary video quota.

### 0.3 Production quality gates

- [x] Add blocking content-profile checks for image share, video share, structured share, photo
  runs, and dissolve share.
- [x] Keep development diagnostics available as warnings.
- [x] Production continues to fail unresolved media, wrong/accidental matches, blank frames,
  broken captions, invalid duration, and missing audio.

Acceptance:

- A profile violation blocks `PRODUCTION_RENDER` and writes a specific diagnostic.
- The same issue remains inspectable in development mode without losing artifacts.

## Phase 1 — Script and scene direction

Status: prompt hardening implemented; evaluation and corrective generation pass remain.

### 1.1 High-engagement script contract

- [x] Require concrete hook tension in the first spoken sentence.
- [x] Require a meaningful development every 10–18 seconds.
- [x] Limit simultaneous curiosity gaps and require payoff closure.
- [x] Require causal bridges between scenes.
- [x] Forbid empty teaser language, filler, fake urgency, and generic conclusions.
- [x] Require a resolved closing image or insight connected to the opening.
- [x] Preserve truth and source requirements over engagement.
- [ ] Add a dedicated LLM critique/rewrite pass when the first plan fails engagement diagnostics.
- [ ] Store open-question IDs and the scene that resolves each question.
- [ ] Measure information gain between adjacent scenes.

Acceptance:

- No generic “Have you ever wondered” or “In this video” opening.
- No unresolved hook question.
- No adjacent scene repeats the same claim in different words.
- Human retention reviewers rate the first 30 seconds at least 4/5 on the locked benchmark.

### 1.2 Scene visual contract

- [x] Require one dominant visual proposition per scene.
- [x] Require concrete action/environment queries rather than topic keywords.
- [x] Require the correct representation for mechanisms, relationships, data, UI, and code.
- [x] Require continuity language for recurring characters, locations, wardrobe, time, and props.
- [ ] Extend the plan schema with explicit `visualProposition`, `changeReason`, `characterIds`,
  `locationId`, and `continuityState` fields instead of relying only on prose.
- [ ] Add a plan validator that rejects unfilmable or internally contradictory visual direction.

Acceptance:

- Every shot can answer: what must be visible, why it belongs now, and what changed from the prior
  shot.

## Phase 2 — Asset search, inspection, and selection

Status: pixel-first relevance is implemented; coverage and calibration work remain.

### 2.1 Query planning

- [x] Use visible subject, action, environment, required objects, and confusers.
- [x] Use staged specific-to-broad query ladders.
- [x] Preserve exact real entities and archival intent.
- [x] Route motion-required requests to video providers.
- [ ] Generate query alternatives with an LLM only after deterministic specific queries fail.
- [ ] Add provider/query success memory by domain without allowing cross-topic metadata pollution.
- [ ] Add multilingual entity aliases while keeping English visual descriptions.

### 2.2 Candidate inspection

- [x] Materialize before semantic approval.
- [x] Require pixel semantic inspection in production.
- [x] Use contrastive positive descriptions and negative confusers.
- [x] Inspect video windows, not only provider titles.
- [x] Require positive semantic evidence for direct/evidence shots.
- [ ] Calibrate image and video semantic thresholds on a human-labeled dataset.
- [ ] Add OCR rejection for unrelated text, dates, brands, and watermarks.
- [ ] Add historical-period classification for clothing, architecture, vehicles, and technology.
- [ ] Add face/entity identity matching for recurring real people.
- [ ] Add action recognition for athletic exertion, machinery operation, and meditation motion.

### 2.3 Media supply

- [ ] Expand the curated bank from an image-heavy library to a balanced, licensed video library.
- [ ] Add at least 100 verified clips for each production domain before launch.
- [ ] Track duration, loop safety, native motion, camera stability, crop safety, license, and source
  authority in catalog metadata.
- [ ] Add a second licensed video provider to avoid a Pexels-only motion dependency.
- [ ] Quarantine assets that fail human review; never let a rejected asset re-enter through cache.

Acceptance:

- At least 95% of required media shots resolve without reuse or weak fallback.
- At least 90% of important selected assets are rated directly relevant by blinded reviewers.
- Zero license-unknown assets reach production.

## Phase 3 — Timing, pacing, and editing

Status: aligned semantic cuts and content-aware dissolve targets implemented; deeper validation
remains.

### 3.1 Scene and shot timing

- [x] Align shot boundaries to word/phrase/sentence timing.
- [x] Enforce content-profile hold and cut-rate limits.
- [x] Consolidate undersized scene boundaries without changing narration.
- [x] Keep native video camera-static to avoid conflicting synthetic motion.
- [ ] Add a semantic-boundary confidence score to every cut.
- [ ] Reject cuts inside names, numbers, quotations, or tightly coupled clauses.
- [ ] Move a cut to the nearest valid phrase boundary when video action timing permits.
- [ ] Add action-window synchronization so the required action starts near the narrated verb.
- [ ] Add beat-level pre-roll/post-roll handles for video clips.

### 3.2 Transitions

- [x] Replace the universal 20–25% comment with content-aware dissolve ranges.
- [x] Enforce minimum as well as maximum dissolve share in production.
- [x] Keep only clean cuts and short dissolves.
- [ ] Add visual match-cut scoring based on focal position, motion direction, luminance, and subject.
- [ ] Add luminance/color continuity checks across adjacent cuts.

Initial dissolve ranges:

| Type | Range |
|---|---:|
| Documentary | 15–30% |
| Explainer | 4–15% |
| Motivational | 0–10% |
| Meditation | 45–90% |
| Story | 15–34% |
| Audiobook | 18–40% |

Acceptance:

- No arbitrary cut in the middle of a spoken phrase.
- No back-to-back dissolves.
- No dissolve used to hide an irrelevant asset change.
- Human editors rate rhythm at least 4/5 for every content type.

## Phase 4 — Genre-specific completion

### 4.1 Documentary

- [x] Keep authentic real/archival imagery as the primary grammar.
- [x] Apply strict literal relevance and direct-evidence rules.
- [ ] Add claim retrieval and entailment verification from approved sources.
- [ ] Add historical period and chronology checks.
- [ ] Require archival provenance for evidence-role images.

### 4.2 Explainer

- [x] Preserve structured mechanisms in hybrid production.
- [ ] Compile solved diagram, timeline, UI, code, map, document, and typography families; currently
  some still use compatibility renderers.
- [ ] Add representation-specific comprehension tests and text-density limits.

### 4.3 Motivational

- [x] Require native video for hook/action/payoff/atmosphere roles.
- [ ] Add exertion/action recognition and select the strongest action window.
- [ ] Add music-energy arc synchronization without compromising narration loudness.

### 4.4 Meditation

- [x] Require predominantly native nature video and gentle dissolve pacing.
- [ ] Verify loop boundaries and motion smoothness.
- [ ] Add silence-pattern and breath-pause QC.
- [ ] Suppress captions by explicit accessibility/user policy rather than by visual heuristics.

### 4.5 Story and audiobook

- [x] Strengthen prompt-level continuity requirements.
- [ ] Add a typed character/world bible.
- [ ] Add reference-image and identity consistency checks.
- [ ] Add a licensed or generated narrative-media provider with provenance.
- [ ] Track wardrobe, props, location, weather, and time-of-day state across scenes.

## Phase 5 — Audio and narration

- [x] Fix content-type speed selection so it no longer depends on base speed being exactly `0.9`.
- [x] Preserve per-type voice, speed, word budget, music category, ducking, and mastering.
- [ ] Add a pronunciation dictionary for names, places, acronyms, and domain terminology.
- [ ] Add automated clipping, breath, long-pause, robotic-prosody, and pronunciation diagnostics.
- [ ] Human-rate each default voice per genre and channel profile.
- [ ] Add chapter-aware music arcs and graceful loop/crossfade handling.

Acceptance:

- Narration is intelligible at target loudness with no clipping.
- Names and key terms are pronounced correctly.
- Music never masks narration and does not pump during micro-pauses.

## Phase 6 — Reliability, latency, and operations

- [ ] Add hard timeouts per provider, model, stage, and full job.
- [ ] Add bounded retry policy with jitter and failure classification.
- [ ] Add circuit breakers for failing providers.
- [ ] Record P50/P95 stage latency, cache hit rate, provider yield, and cost per finished minute.
- [ ] Resume safely from every stage after process/container interruption.
- [ ] Add load tests for configured worker concurrency.
- [ ] Add storage quotas, artifact retention policy, and alerting.
- [ ] Validate Docker health, API authentication, queue persistence, database migration, and graceful
  shutdown in staging.

Acceptance:

- 95% first-pass completion minimum.
- No 60-second job can run unbounded for hours.
- Retry never duplicates a public job or corrupts a run.

## Phase 7 — Evaluation and release

### Locked benchmark

- [ ] Create at least 10 prompts per content type.
- [ ] Run at least three seeds per prompt.
- [ ] Include simple, ambiguous, niche, entity-heavy, motion-heavy, and long-form cases.
- [ ] Store immutable expected claims, visual propositions, prohibited confusers, and timing notes.

### Human review rubric

Score 1–5:

1. script hook and retention;
2. factual accuracy;
3. narration-to-visual relevance;
4. visual specificity;
5. scene and cut timing;
6. visual variety and continuity;
7. audio naturalness;
8. overall publishability.

### Release gates

- [ ] Automated suite passes.
- [ ] At least 95% first-pass benchmark completion.
- [ ] 100% duration compliance within the production tolerance.
- [ ] Zero unresolved media, blank frames, wrong critical assets, missing licenses, or audio failures.
- [ ] At least 90% direct relevance on important beats.
- [ ] At least 85% of videos rated publishable without manual re-editing.
- [ ] No content type scores below 4/5 median overall quality.
- [ ] Staging soak test completes before production traffic.

## Immediate next execution sequence

1. Run the full automated suite after the hardening changes.
2. Render one 60-second golden video for each content type in hybrid mode.
3. Review contact sheets and videos against the rubric.
4. Calibrate profile quotas and semantic thresholds from observed failures.
5. Expand licensed video supply for meditation and motivation.
6. Implement the typed story continuity system.
7. Implement factual retrieval/verification for documentary and educational scripts.
8. Run the complete 30+ production benchmark and do not launch until all release gates pass.

