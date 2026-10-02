# Milestone 14 — Solved Process Composition

## Outcome

Process/flow shots now compile through an inspectable, validated path:

`Storyboard V2 → VisualCoveragePlan → EditorialVisualPlan → SceneComposition → SolvedScene → MotionPlan → FrameStatePreflight → GenericSceneRenderer`

All non-process families remain on the legacy family renderer. `USE_SOLVED_COMPOSITION=false` disables the new process path, and any compile/preflight hard failure falls back to `ProcessShot` with a recorded diagnostic.

## Contracts and artifacts

- Coverage traverses `sections[].scenes[].shots[]` and produces exactly one item per canonical shot.
- Coverage is passed into visual realization; every representation disagreement is recorded with original, selected, and reason fields.
- EditorialVisualPlan chooses communication objective, hierarchy, density, grammar, bindings, text, format hints, and continuity intent without pixel geometry.
- SceneComposition is a general strict IR for regions, elements, constraints, relationships, reading order, caption/background intent, and semantic events.
- SolvedScene contains all process geometry, connector paths/anchors, measured line breaks, font sizes, occupancy, warnings, and bounded repair history.
- Timeline shots reference typed solved-scene and motion-plan registries by ID. Inline or unknown shot geometry is rejected.
- Runs persist `visual-coverage-plan.json`, `editorial-visual-plan.json`, `scene-compositions.json`, `solved-scenes.json`, `motion-plans.json`, and `frame-state-preflight.json`.

## Layout and text

Landscape prefers a measured-width horizontal flow for 2–6 stages and switches to two rows if content does not fit. Shorts uses an intentional vertical stack and reserves the caption zone. More than four vertical or six landscape stages are grouped into a visible continuation stage rather than shrunk.

Text measurement reads advance metrics and Unicode character maps from the local TrueType files backing the renderer's font stacks. The cache key includes family, weight, size, line height, text, maximum width, and letter spacing. The solver persists exact line breaks and refuses to shrink below the format minimum; failure becomes `constraintUnsatisfied`.

## Motion and semantic timing

Aligned words are grouped into phrases. Each process concept is matched to its introducing phrase; sequential phrase order is only the fallback. Semantic `stepIntroduced`/`resultIntroduced` events are then converted into MotionPlan tracks. Frame 0 keeps every stage at 40% emphasis and every connector partially drawn. Motion uses central MICRO/FAST/NORMAL/EMPHASIS durations and cubic easing tokens.

Every solved process MotionPlan also persists an explicit `ENTER → ESTABLISH → EXPLAIN → EMPHASIZE → SETTLE → EXIT` lifecycle. The duration tokens are 160/280/460/680ms (5/8/14/20 frames at 30fps), with named enter, exit, move, draw, and emphasis easings. Explanatory process shots use a MEDIUM density budget capped at three simultaneous tracks: emphasis is primary, while connector drawing and prior-stage settling are subordinate.

## Professional edit rhythm

- Every shot records one semantic transition reason: new idea/evidence/entity, comparison pivot, reveal, section change, detail change, or continuation.
- The transition vocabulary is restricted to CUT, SHORT_DISSOLVE, MATCH_MOVE, MASK_REVEAL, PUSH, and WIPE. CUT remains the default; non-cut transitions are selected only for section changes, comparison pivots, or reflective continuations.
- Shared entity/concept anchors are persisted as `transitionAnchor`; an anchored cut is diagnosed as MATCH_MOVE.
- Media shots persist STATIC, SUBTLE_PUSH, SUBTLE_PULL, DETAIL_CROP, FOCAL_PAN, MATCH_CUT, or MONTAGE behavior. Actual video is forced to STATIC synthetic camera behavior so native motion is not double-animated.
- Captions persist NORMAL, COMPACT, INTEGRATED, or HIDDEN per shot, including the actual pixel box. Dense legacy graphics use COMPACT rather than disappearing. Solved process scenes use INTEGRATED only because their equivalent title/stage/support text IDs are present and validated.
- Captions use phrase chunks and restrained direct replacement/short opacity entry. Lower-frame subjects and dense graphics receive a raised solved caption box.

`edit-continuity-diagnostics.json` records transition/reason, motion, caption, and image-camera distributions; repeated designed-transition and camera runs; simultaneous-motion warnings; caption coverage; late reveals; insufficient final holds; subject/caption collisions; and empty scene starts. Timeline QC treats missing caption coverage, missing final holds, subject collisions, and empty starts as production errors.

## Geometry preflight

Preflight samples frame 0, every event boundary, event midpoints, mid-holds, and the final frame. It checks viewport/safe-area escape, measured text overflow, minimum font size, caption collision, node overlap, connector-node and connector-label obstruction, occupancy, required elements, frame-0 completeness, late activation, and final hold. Current process motion changes emphasis and connector draw only, so swept geometry is identical to solved geometry and is persisted explicitly.

Hard failures block the solved renderer and cause the compatibility fallback. Creative QA skips direct mutation of solved shots; layout/motion changes must be made by recompilation.

## Golden and regression results

Four deterministic fixtures (AI agent, dopamine loop, transaction flow, science mechanism) render in 16:9 and 9:16. Each has frame 0, 25%, 50%, 75%, final, and a state contact sheet. The AI fixture also has legacy/solved comparisons.

Human review:

- Relationship clarity: solved is materially clearer because stages have explicit directional connectors and anchors.
- Narration sync: activation follows phrase starts (8, 42, 76, 110 in the deterministic AI fixture), not index-based timing.
- Mobile behavior: true vertical recomposition, readable labels, full primary-region use, and a reserved caption region; no scaled desktop row.
- Frame 0: complete and subdued rather than blank.
- Editorial quality: the solved path is a stronger explanatory composition than legacy and would be chosen when process direction is the priority. Legacy still has richer typographic phase labeling, which is a useful future primitive rather than a reason to restore JSX layout authority.
- Psychology benchmark: the dopamine loop gains explicit sequence direction and deliberate vertical behavior.
- AI-agent benchmark: READ → PLAN → CALL TOOL → OBSERVE is immediately legible and phrase-driven.
- Non-process regression: existing pipeline tests pass and those families retain their previous dispatch and data.

## Performance

Measured locally for the four-stage landscape AI fixture:

- Cold compile/measure/solve/preflight: 29.262 ms.
- Warm mean over 100 compiles: 0.830 ms.
- Text cache after the run: 13 entries, 13 misses, 1,300 hits, two parsed font files.

Text and font caches are process-local; cache statistics are persisted with process preflight artifacts, while cache contents are not yet serialized across Node processes.

## Remaining limitations

- TrueType advance measurement does not yet apply kerning pairs or complex-script shaping; unsupported fonts use an explicit fallback metric source.
- Process motion currently changes emphasis and connector draw, not geometry, so the swept-bounds engine has not yet been exercised with translation/masking.
- Complex branching, cycles, and paginated multi-state processes are reduced to an ordered/grouped flow in this slice.
- The visual vocabulary has no dedicated phase-tag or icon primitive yet; legacy's phase metadata can be promoted into IR later.
- MATCH_MOVE anchors are modeled and diagnosed, but media-to-graphic anchor transforms are not yet solved as shared geometry.
- Caption equivalence currently validates declared on-screen text presence; deeper semantic entailment remains deterministic concept matching rather than a language-model judgment.
- The full production benchmarks still depend on external narration/assets; the deterministic psychology and AI regressions exercise their critical process scenes without changing media systems.

## Recommended next slice

First harden this compiler boundary with complex branching/cycle fixtures, font shaping, and IR-driven phase metadata. After that, `timeline` or `list` is the safest next family migration because both reuse ordered semantics without prematurely migrating compare or chart.
