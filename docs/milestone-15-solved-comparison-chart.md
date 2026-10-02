# Milestone 15 — Solved Comparison and Chart Composition

## Interrupted-work audit

Work resumed from the existing dirty tree without reverting Milestone 14. The initial audit classified the new comparison/chart contracts, compilers, solvers, and motion modules as present and importable; `GenericSceneRenderer` was partially extended; production integration, persisted semantic-spec artifacts, explicit fallbacks, M15 tests, goldens, benchmarks, and this report were missing. The audit also found one shared-core regression: the new `minimumFinalHold` metadata pointed at a synthetic late frame rather than the final semantic activation. That caused every solved PROCESS fixture to fall back. The lifecycle calculation now derives the final state from actual track ends, restoring the M14 path.

## Architecture and production path

The production path is now:

`Storyboard → VisualCoveragePlan → EditorialVisualPlan → ComparisonSpec/ChartSpec → SceneComposition → measured layout solve → SolvedScene → MotionPlan → FrameStatePreflight → typed timeline registries → GenericSceneRenderer`

`timeline.js` normalizes the `compare` family and `comparison` representation at one compiler boundary. Process, comparison, and chart have independent migration switches (`USE_SOLVED_PROCESS_COMPOSITION`, `USE_SOLVED_COMPARISON_COMPOSITION`, and `USE_SOLVED_CHART_COMPOSITION`) under the existing global `USE_SOLVED_COMPOSITION` switch. Solved geometry remains in `solvedScenes`; choreography remains in `motionPlans`; timeline shots store only typed IDs.

The pipeline persists:

- `scene-compositions.json`
- `comparison-specs.json`
- `chart-specs.json`
- `solved-scenes.json`
- `motion-plans.json`
- `frame-state-preflight.json`
- `composition-fallbacks.json`

## Shared composition core

`SceneComposition` now supports text, shape, connector, group, media, icon, chart axis, chart mark, chart label, annotation, and region elements with semantic bindings and explicit complexity budgets. `SolvedScene` persists visual hierarchy, chart coordinates, annotation geometry, caption geometry, background selection, format policy, and complexity results.

`CompositionFormatContext` is the canonical source for viewport, title, primary visual, caption, and Shorts interaction-safe geometry. It also owns type minimums and spacing tokens. The per-video timeline now persists art direction: palette, typography, spacing, surface/rule language, accent behavior, permitted backgrounds, motion temperament, and caption style. The renderer consumes the same theme palette and fonts as legacy families; no topic color is hardcoded.

Text measurement uses real TrueType metrics and classic `kern` pairs. Text fitting records `FIT`, `FIT_WITH_WRAP`, `FIT_WITH_REWRITE_REQUIRED`, or `FAILED`, and semantic reduction is deterministic: `FULL → SHORT → LABEL_ONLY`. It never uses automatic ellipsis or shrinks below the format minimum.

## ComparisonSpec and layout behavior

`ComparisonSpec` owns the communication objective, distinct subjects, optional metrics and dimensions, key difference, emphasized side, and optional grammar. The compiler chooses among dual field, unequal editorial columns, shared baseline, spectrum, before/after, delta comparison, and stacked vertical.

Landscape allocates measured 40–60% side widths when copy is unequal. Shorts always recompiles into a true stacked topology. Both subjects are present and readable at frame 0. The renderer uses flat editorial fields, clean rules, strong labels, and one accent; it does not use generic card grids or renderer-local layout.

Motion follows semantic phrase anchors: establish both sides, emphasize A, pivot to B, highlight the key difference, settle, and hold. The renderer evaluates persisted opacity, emphasis, highlight, draw/reveal, scale, and translation tracks from the Remotion frame.

## ChartSpec, scales, and layout behavior

`ChartSpec` requires a question, explicit takeaway, chart type, typed series/data, axis policy, evidence semantics, and illustrative/source metadata. Factual required charts without provenance fail validation. Conceptual fixtures persist `illustrative: true` and visibly label themselves “Illustrative.”

Supported types are BAR, LINE, AREA, DOT, PROGRESS, and SIMPLE_STACK. Linear scales guard identical domains and division by zero; validation reports all-zero, identical, negative, empty/invalid, and extreme-range data. Solved axes persist domain, range, scale type, ticks, baseline, units, and pixel positions.

Shorts BAR charts recompose horizontally with categorical Y and numeric X axes, fewer ticks, larger direct values, a larger plot, a shortened takeaway, caption reserve, and right-rail/bottom safe-area protection. Landscape bars remain vertical. Multi-series lines use one accent plus a muted secondary series and direct endpoint labels.

Chart motion establishes structure at frame 0, draws a line or coherently grows bars, emphasizes the important point, reveals the takeaway, then holds. Text labels are not independently cascaded.

## Captions, preflight, and repair

Solved comparison and chart shots use COMPACT narration captions. The format context reserves the actual caption box before layout; no graphic is subsequently shifted in JSX. INTEGRATED/HIDDEN remain available only when narration-equivalent visible text is declared.

Preflight covers viewport and interaction-safe escape, measured text overflow, minimum type, caption/group collision, comparison side balance, frame-0 completeness, late pivots/reveals, chart-label collision, motion density, swept bounds, lifecycle order, and final hold.

Layout repairs re-run measurement and layout. Chart tick collisions reduce ticks; annotations move; redundant labels simplify. A hard chart-label preflight failure requests a fresh `SceneComposition` compile and a conservative-label layout/motion/preflight pass; solved pixels are never mutated in place. Comparison text-fit failure can request a stacked grammar and re-solve.

## Legacy fallback and diagnostics

`CompareShot`, `ChartShot`, and `ProcessShot` remain available through `LegacyFamilyAdapter`. Compiler or hard-preflight failure keeps `renderMode: "legacy"` and persists:

- shot ID and normalized representation
- failure stage and failed constraint
- fallback renderer
- human-readable reason

Diagnostics include solved/fallback counts by family, comparison topology and chart type distributions, text reductions, repair actions, caption modes, motion density, background usage, final-hold warnings, and fallback reasons. Background selection is deterministic and avoids a third identical solved background in a row.

## Human-like visual quality gate

Geometry preflight is followed by an editorial publishability gate. It scores clarity, hierarchy, composition, typography, motion, rhythm, consistency, and mobile quality. The gate separately measures meaningful content occupancy, excluding roots, backgrounds, textures, rules, and empty surfaces. It detects template-like composition, weak focal hierarchy, over-containerization, underused canvas, decorative dominance, generic dashboard treatment, attention competition, chart/comparison storytelling weakness, and reduced-preview unreadability.

Failed reviews persist a typed repair request with actions such as switching comparison grammar, strengthening focal hierarchy, expanding meaningful content, reducing decoration/support contrast, increasing primary type, adding a chart highlight, or extending the read hold. Every request requires recompilation; the gate never mutates solved pixels.

Motion plans persist state-by-state focal targets with read-time budgets. Preflight verifies that every target exists, is visible, carries sufficient visual weight, remains outside captions, and receives its required hold. Important text is evaluated from its actual introduction frame rather than merely the total shot duration.

Landscape is reviewed at a reduced video-player width and Shorts at a phone-like width. This gate initially rejected the landscape primary chart values; their type size and label geometry were increased before the goldens were accepted.

Production stores `visual-quality-reviews.json`. A comparison or chart that passes geometry but fails editorial publishability remains on its legacy renderer with `failureStage: "visual_quality_gate"`. Adjacent shots also persist `continuityCompatibility` covering background family, accent use, title position, motion intensity, caption mode, and density.

Non-CUT transitions now carry a transition-quality record. Missing semantic reasons, required anchors, or unsuitable durations cause replacement with CUT before clip timing is built. The gate also records caption stability, important-text stability, and direction compatibility.

## Tests and regression results

The final full repository run passes **117 tests**. M15 adds validation, both-format layouts, unequal copy, phrase pivots, frame-0 completeness, semantic reduction, linear/categorical and edge-case scales, mobile tick policy, collision detection, final hold, focal-state validation, reduced-preview rejection, transition replacement, motion event binding, repair/recompile, production registries, and explicit fallback coverage.

M14 PROCESS goldens were re-rendered after shared renderer changes and visually checked. Its solved layout, connectors, frame-0 structure, emphasis progression, caption behavior, and final hold remain intact.

## Visual evidence and human review

The golden harness renders four comparison and four chart fixtures in both 16:9 and 9:16 at frame 0, 25%, 50%, 75%, and final: 80 state frames and 16 lifecycle contact sheets. It also creates matched legacy-versus-solved evidence for one comparison and one chart, plus psychology, landscape structured, and Shorts regression sheets.

Artifacts:

- [M15 manifest](../fixtures/golden/composition-m15/manifest.json)
- [Per-fixture human review](../fixtures/golden/composition-m15/human-review.json)
- [Persisted visual-quality reviews](../fixtures/golden/composition-m15/visual-quality-reviews.json)
- [Psychology landscape regression](../fixtures/golden/composition-m15/regressions/psychology-landscape.png)
- [Structured landscape regression](../fixtures/golden/composition-m15/regressions/structured-landscape.png)
- [Structured Shorts regression](../fixtures/golden/composition-m15/regressions/structured-shorts.png)
- [Comparison legacy vs solved](../fixtures/golden/composition-m15/legacy-vs-solved/comparison/comparison.png)
- [Chart legacy vs solved](../fixtures/golden/composition-m15/legacy-vs-solved/chart/comparison.png)
- [M14 process regression](../fixtures/golden/process-m14/ai-agent/landscape/state-contact-sheet.png)

Human review findings:

- Comparisons communicate the distinction in roughly one second; both subjects are visible immediately and only one side receives the active emphasis.
- Shorts comparisons are intentionally vertical, retain large labels, and keep their takeaway above captions and interaction UI.
- The solved treatment reads as editorial information design rather than dashboard/card UI.
- Chart takeaways are visible without reading every tick. Axes and marks are clean, highlighted data is dominant, and the plot owns most of the usable region.
- Mobile bars are genuinely recomposed horizontally. Line motion explains the trend by drawing it; frame 0 shows points/structure rather than a falsely completed trend.
- The first review caught and corrected an unwanted comparison leader, incorrect line frame-0 inheritance, desktop axes on horizontal mobile bars, and indistinguishable multi-series lines.
- Final automated editorial classifications are 9 STRONG and 7 ACCEPTABLE. The ACCEPTABLE comparison variants remain publishable but retain a documented decorative-field/system-grammar warning; the gate does not promote them to STRONG merely because geometry passes.

## Performance

Measured on the local Node runtime using 100 warm iterations:

| Compiler | Cold | Warm average | Measurement cache |
| --- | ---: | ---: | --- |
| Comparison | 33.984 ms | 0.736 ms | 10 entries, 1,000 hits, 10 misses |
| Chart | 12.989 ms | 0.796 ms | 11 entries, 1,403 hits, 11 misses |

The raw result is stored in [performance.json](../fixtures/golden/composition-m15/performance.json). Cache size stays bounded by the measured text variants used by each composition.

## Files changed for M15

The main additions are the comparison/chart schemas, semantic normalizers, compilers, layout solvers, motion choreographers, shared solved helpers, fixtures, M15 tests, render/benchmark/regression scripts, renderer primitives, production timeline/pipeline persistence, editorial planning support, preflight rules, continuity diagnostics, and this report. Shared schemas, format context, text measurement, motion lifecycle, M14 process output, timeline schema, stage registry, and package scripts were extended rather than replaced.

## Remaining limitations

- Font measurement supports TrueType horizontal metrics and classic kerning but not full complex-script shaping.
- Chart limits remain three series and twelve points per series; logarithmic, time-zone-aware, and broken scales are intentionally out of scope.
- Dense multi-series legends use direct endpoint labeling and may still require a future dedicated legend grammar.
- Annotation routing is a simple deterministic leader, not a general obstacle-avoiding annotation router.
- Comparison/chart regression evidence is still-frame and lifecycle-sheet based; automated perceptual-diff thresholds are not yet enforced in CI.
- PHOTO, LIST, TIMELINE, media-bank, and AI-image paths were not migrated.

## Recommendation for Milestone 16

Freeze these solved contracts first, then make M16 a visual-regression and art-direction continuity milestone before migrating another family: add CI perceptual diffs, multi-shot transition contact sheets, a dedicated multi-series legend/annotation router, and only then migrate PHOTO/media under the same typed solved-scene boundary.
