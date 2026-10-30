# Video Generation Flow Audit — 2026-10-29

## Executive verdict

The pipeline is mechanically strong but not yet consistently professional across content types.
It is best at documentary/history because the default production policy is effectively a
documentary editor: it favors real images, archival material, restrained camera motion, long
holds, and clean cuts. Those choices naturally fit history. The same policy is applied to
explainer, motivational, meditation, story, and audiobook videos, where it often produces a
static stock-photo sequence instead of the visual grammar the content needs.

The latest production benchmark confirms this. It contains 32 runs across eight profiles:

- 27/32 completed successfully (84.38% first-pass rate versus the 95% target).
- All successful technology and tutorial runs failed the slideshow and family-variety checks.
- Three of four motivational runs failed the slideshow check.
- Most successful outputs were 89–100% still images.
- Every successful benchmark reported zero designed transitions.
- The benchmark verdict is `passed: false` because first-pass reliability is below target.

The central fix is not more content-type prompt text. The system needs a content-aware visual
policy that can choose the right representation per beat, enforce an appropriate image/video/
graphic mix, and block aesthetically weak production renders.

## What has already been fixed

The older 2026-10-05 audit is useful history but is no longer fully accurate. Current code has
corrected several former P0 issues:

1. Production candidates are now downloaded before semantic pixel inspection. Metadata ranks
   the shortlist but is not treated as pixel proof (`assetDirector.js:570-579`).
2. Production requires semantic pixel inspection and rejects candidates without it
   (`assetDirector.js:54-67`).
3. Editorial score and usefulness now affect final ranking
   (`assetIntelligenceScorer.js:537-550`).
4. Production defaults now fail unresolved media instead of allowing placeholders
   (`videoGeneratorPipeline.js:133-134`, `assetDirector.js:836-844`).
5. Search-discovery provenance is no longer treated as a media license.
6. The complete automated suite currently passes: 358 tests, 0 failures.

These are meaningful improvements. The remaining problems are mostly policy, coverage,
creative continuity, and quality-gate problems rather than basic pipeline corruption.

## Actual content-type differentiation

The claim that `contentType` directly controls eight dimensions is only partially true.

| Dimension | Actually content-aware? | Current behavior |
|---|---|---|
| Script structure and tone | Yes | Genre-specific prompts and five-part structures |
| Default voice | Yes | Per-type curated voice mapping |
| Narration speed / WPS | Yes, with a fragile condition | Per-type mapping is used only when base speed is exactly `0.9` |
| Pacing envelope | Yes | Fixed minimum hold, average hold, and cuts-per-10s profile |
| Music category | Yes | Per-type catalog routing and deterministic rotation |
| Editorial metaphor tolerance | Partly | Documentary, motivational, story, technical, and general modes |
| Asset-source priority | Mostly no | `preferredSource()` receives editorial mode but never uses it; source choice is driven by shot flags |
| Representation grammar | No in production | Every representation is forced to image/video in `MEDIA_EDITORIAL` |
| Camera behavior | No | Shared static/subtle-motion vocabulary for all types |
| Transition behavior | No | Shared cut/dissolve logic for all types |

The user-visible differences therefore come mainly from script prompts, pace, voice, music, and
judge tolerance. The core visual engine remains largely uniform.

## Why documentary currently looks best

Documentary is aligned with the pipeline's constraints:

- Historical subjects are searchable as concrete people, places, artifacts, documents, and
  archival images.
- Slower cinematic holds make still images feel intentional.
- Strict literalness rejects many obvious metaphors and stock-office mistakes.
- Visual continuity does not require a recurring fictional character to look identical.
- The media-only policy is less damaging because documentary often benefits from real evidence.

Other genres expose the policy mismatch:

- Explainers need diagrams, UI, code, maps, comparisons, charts, and process animation.
- Motivation needs a high share of authentic moving action, not a photo montage.
- Meditation needs long, genuinely moving nature footage and graceful dissolves.
- Story/audiobook needs persistent characters, locations, props, time of day, and visual style.

## Prioritized findings

### P0 — Production forces every beat into stock or archival media

`MEDIA_EDITORIAL` is the default. `routeRepresentation()` converts even `CHART`, `PROCESS`,
`DIAGRAM`, `TIMELINE`, `UI`, `CODE`, and `COMPARISON` to `media`, and gives them no procedural
fallback (`representationRouter.js:16-31`). `buildEditorialVisualPlan()` then selects `media`
unless legacy procedural mode is explicitly enabled (`editorialVisualPlanner.js:39-43`).

Impact:

- Explainers cannot directly show mechanisms.
- Abstract ideas are represented by generic contextual stock footage.
- The engine's already-built chart, process, comparison, UI, code, and diagram systems are
  disabled in the default production path.
- Query sanitation literally replaces words such as “diagram” and “flowchart” with “screen
  monitor,” which searches for a vaguely related photograph rather than the needed explanation.

Fix:

Create a production `HYBRID_EDITORIAL` policy and make it the default. Route concrete evidence,
people, places, environments, and actions to authentic media; route mechanisms, relationships,
comparisons, timelines, data, UI, and code to the matching structured family. Keep the media-only
mode only as an explicit documentary preference.

Acceptance target: human reviewers should rate at least 90% of important explainer beats as
“directly explains the narration,” not merely “topically related.”

### P0 — There is no enforceable visual mix per content type

The local bank is overwhelmingly still-image based: the current catalog contains 582 images and
17 videos. The latest benchmark reflects this supply and selection imbalance:

- finance: 100% images in the first repeat;
- technology: 100% images in the first repeat;
- history: 100% images;
- investigation: 100% images;
- audiobook: 100% images;
- motivation: 100% images in three repeats;
- meditation: only 11–12% video in its successful mixed runs;
- tutorial: only 6–7% video in its mixed runs.

This directly contradicts the meditation and motivational prompts, which request slow-motion
nature footage and active athletic B-roll.

Fix:

Add per-type representation budgets and enforce them before render. Initial targets to validate
with human review:

| Content type | Suggested baseline |
|---|---|
| Documentary | 35–55% archival stills, 30–50% video, 5–15% maps/documents/data |
| Explainer | 25–40% real media, 40–60% structured explanation, 10–20% evidence/UI |
| Motivational | 65–85% real video, 10–25% still/details, minimal graphics |
| Meditation | 85–100% long native video, no rapid montage |
| Story/audiobook | 40–60% consistent generated/curated narrative visuals, remainder environmental video/details |

Acquire and curate substantially more usable video, and reserve provider-download budget for
motion-required shots instead of letting still images satisfy them.

### P0 — Production QC reports visible quality failures but allows publication

`static-time`, `slideshow`, `motion-repetition`, `family-share`, and transition quality are warning
checks (`timelineQc.js:104-119`, `timelineQc.js:150-170`). A production render can therefore pass
with 100% still images, a 15-image slideshow run, repeated camera behavior, and no designed
transition.

Fix:

Introduce per-content-type production blockers:

- motion-required beat resolved to a still;
- image share above the profile maximum;
- slideshow run above the profile maximum;
- repeated camera behavior above the profile maximum;
- no dissolve in meditation or reflective long-form content;
- missing structured representation for an explanatory mechanism;
- unresolved character continuity for story content.

Warnings are appropriate for experimentation; they are not sufficient for “publish-ready.”

### P0 — The production benchmark is not yet a human-quality benchmark

The latest verdict correctly fails reliability at 84.38%, but `wrongAssets: 0` is generated by the
same automated semantic system that selected the assets. It is not independent human ground
truth. The benchmark also ignores failed warning checks when calculating publishability.

Fix:

Build a locked evaluation set with at least 10 prompts per content type, three random seeds each,
and blinded human ratings for:

1. narration-to-visual relevance;
2. visual specificity;
3. temporal synchronization;
4. visual variety;
5. motion quality;
6. character/entity continuity;
7. factual/period authenticity;
8. audio naturalness;
9. overall publishability.

Gate releases on both first-pass reliability and human scores. Keep automated QC as the fast
pre-filter, not the final definition of quality.

### P1 — The advertised transition ratio is not implemented as a ratio

Comments state 20–25% dissolves, but the code only sets a maximum dissolve budget and then uses a
dissolve for a narrow set of semantic conditions (`timeline.js:550-585`). It does not enforce a
minimum. Every successful run in the latest 32-run benchmark reports zero designed transitions.
The `transition-budget` QC check only verifies that the count is not too high; zero always passes.

Fix:

Use content-aware target ranges, not one universal ratio:

- meditation: 50–90% gentle dissolves;
- story/documentary: 15–30%, concentrated at time/place/chapter changes;
- explainer: 5–15%, mostly clean cuts and meaningful graphic morphs;
- motivational: 0–10%, mostly clean action cuts.

QC should enforce both a minimum and maximum where appropriate.

### P1 — Asset-source behavior is not truly content-type specific

`preferredSource()` accepts `editorialMode` but never references it
(`assetRequestPlanner.js:26-44`). Documentary, motivation, story, meditation, and explainer use
the same source-selection rules unless the LLM happens to author different shot metadata.

Fix:

Pass an explicit visual-source profile into request planning:

- documentary: archival authority and document provenance;
- motivational: native action video and motion quality;
- meditation: long-duration, stable, loop-safe nature video;
- story: character/world continuity source;
- explainer: structured representation first for mechanisms, authentic evidence second.

### P1 — Story and audiobook have no character/world continuity system

The current genre prompt asks for atmospheric B-roll and photography. There is no persistent cast
bible, appearance embedding, wardrobe/prop continuity, location bible, or shot-to-shot identity
gate. Stock footage cannot reliably portray the same fictional person across a dramatic arc.

Fix:

Add a story-world stage before asset planning:

- named character IDs and immutable appearance descriptors;
- recurring location and prop IDs;
- time-of-day and wardrobe state;
- approved reference frames;
- continuity scoring across adjacent shots;
- generated-image/video provider support for narrative scenes, with provenance and safety rules.

Until this exists, story/audiobook should default to an illustrated/atmospheric mode and avoid
pretending to offer literal cinematic continuity.

### P1 — Meditation is authored as calm content but realized as still-image editorial

Meditation has a slower voice, lower word budget, long pacing profile, and calm prompt. Yet the
benchmark's successful meditation runs used only about 11–12% video, and two of four runs failed
entirely. Long static images plus repeated camera motion are not equivalent to serene native
motion.

Fix:

Require long video clips for water, rain, clouds, trees, stars, and fire; verify loop boundaries;
allow fewer unique assets with longer semantic holds; suppress most captions by policy; use
content-aware dissolves; validate motion smoothness and luminance continuity; and include the
intended silence pattern in timeline QC.

### P1 — Motivational pacing changes, but the media policy does not

Motivational content gets energetic/rapid pacing and metaphor tolerance, but it does not get a
hard action-video requirement. This produces fast cuts between still photos—the appearance of
energy without real motion. Three of four benchmark runs failed the slideshow check.

Fix:

Make `ACTION`, `CRUCIBLE`, and `PAYOFF` beats video-required. Validate visible exertion/action in
the selected video window. Permit a still only for an intentional detail, portrait, or final hold.

### P1 — Explainer representation detection exists but production discards it

`visualProposition.js` correctly identifies code, UI, chart, comparison, timeline, process, and
diagram needs (`visualProposition.js:89-117`). This is valuable semantic work that is immediately
overridden by the production media-only router.

Fix:

Preserve the proposition through realization. Add a “representation correctness” hard gate:
selected family must match the proposition unless a recorded fallback is approved by a second
semantic evaluation.

### P1 — Factual provenance is recorded but not externally verified

The director requires sources for exact claims and blocks unverified exact statistics. However,
the pipeline explicitly records that sourced claims are still unverified and require human review
(`videoGeneratorPipeline.js:54-62`). Documentary “historical accuracy” is therefore a prompt and
provenance policy, not fact checking.

Fix:

For documentary and educational content, add retrieval from approved primary/reputable sources,
claim-to-source entailment checks, quote/date verification, and an editorial review artifact.
Period accuracy also needs a dedicated visual check for clothing, architecture, technology, and
date/location mismatches.

### P1 — Content-type detection is a small keyword classifier

Auto detection is a first-match regular-expression list (`videoBrief.js:64-71`). Mixed prompts can
be misclassified, and there is no confidence score or explanation. For example, a narrative
history, motivational biography, sleep story, or documentary explainer can match several types.

Fix:

Return a scored content profile rather than one label. Separate axes such as factual/fictional,
explanatory/narrative, energy, visual literalness, and continuity requirement. Allow an explicit
user choice to override auto detection and persist the decision rationale.

### P1 — Content-type narration speeds depend on an exact configuration value

Per-type speeds are applied only when `baseSpeed === 0.9` (`narrationProfile.js:79-83`). Changing
the environment default to `0.91` or `0.95` silently disables the content-type curve and produces
the generic standard profile.

Fix:

Distinguish “explicit user speed override” from “configured base speed.” Always derive the
content-type default unless the user explicitly overrides it. Add tests with non-0.9 base config.

### P1 — First-pass reliability is below production target

Five of 32 benchmark runs failed: two timeline-QC failures, one narration-quality failure, one
render failure, and one aborted audiobook operation that ran for about 131 minutes. The current
verdict is correctly failed.

Fix:

Add stage timeouts, per-stage latency metrics, bounded asset/model retries, and failure-specific
resume tests. A single 60-second audiobook test must never occupy the pipeline for over two hours.

### P2 — Visual rules are increasingly regex/domain specific

The system has extensive hard-coded defenses for database deadlocks, time travel, cloud
computing, finance, historical civilizations, and other known benchmark subjects. These tests are
useful, but new domains will not inherit the same protection automatically.

Fix:

Keep regexes only for proven catastrophic confusers. Move general semantic decisions to a typed
proposition plus calibrated vision/text model, and measure performance on unseen-domain holdouts.

### P2 — Voice quality needs outcome-based evaluation

Voice selection is deterministic, but the code's own comments rate the default documentary voice
below the top female voices. There is no pronunciation dictionary, name QA, prosody score, or
content-specific audition benchmark.

Fix:

Add pronunciation overrides, sentence-level prosody checks, name/place test clips, and listener
ratings by content type. Voice identity should be a channel choice; cadence and mastering should
adapt per video.

### P2 — There is no mandatory human approval checkpoint before full render

The pipeline can create a contact sheet, but normal production proceeds directly through render.
This wastes compute when the visual sequence is semantically acceptable but creatively weak.

Fix:

Add an optional default-on review stage for long-form work: script/claims, storyboard, selected
asset contact sheet, and a low-resolution animatic. Resume from approval without regenerating
upstream artifacts.

## Recommended implementation order

### Phase 1 — Make bad output impossible

1. Add `HYBRID_EDITORIAL` and make representation routing content-aware.
2. Add per-type visual-mix constraints and motion-required roles.
3. Promote slideshow, family-share, motion repetition, and profile-specific transition failures
   to production blockers.
4. Fix transition minimums and the narration-speed override condition.
5. Add stage timeouts and repair the five benchmark failure modes.

### Phase 2 — Make each genre visually distinct

1. Explainer: structured mechanisms, data, UI, maps, and evidence.
2. Meditation: native slow video, silence-aware edit, gentle dissolves.
3. Motivational: action-video quotas and exertion-aware window selection.
4. Story/audiobook: character/world continuity and narrative visual generation.
5. Documentary: stronger archival provenance, factual verification, and period-accuracy review.

### Phase 3 — Prove quality

1. Build the locked multi-genre human-rated benchmark.
2. Track quality and latency by content type, provider, representation, and stage.
3. Require at least 95% first-pass completion and agreed human publishability thresholds.
4. Add a low-resolution animatic approval path for long videos.

## Definition of done

The system should not be called “perfect” based only on passing unit tests. It is ready when:

- at least 95% of the locked 30+ run benchmark completes first pass;
- no production render contains unresolved media or hard technical failures;
- at least 90% of important beats are rated directly relevant by independent reviewers;
- each content type meets its representation and motion profile;
- story characters and documentary entities remain visually consistent;
- exact factual claims are verified or removed;
- visual changes align to semantic narration boundaries;
- audio, captions, and final holds pass technical QC;
- blinded reviewers rate at least 85% of outputs publishable without manual re-editing.

## Verification performed for this audit

- Read the current end-to-end pipeline, configuration, storyboard, asset, timeline, audio, and QC
  implementations.
- Compared the current code with the older audit and marked repaired findings.
- Examined `benchmarks/production/latest.json` (32 runs, generated 2026-10-16).
- Counted the current media-bank mix from `public/media-bank/catalog.json`.
- Ran the full automated suite on 2026-10-29: 358 passed, 0 failed.
- Made no runtime or production-code changes during the audit.
