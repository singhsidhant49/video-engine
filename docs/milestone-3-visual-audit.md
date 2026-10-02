# Milestone 3 visual audit

Date: 2026-09-27

Scope: the pre-Milestone-3 storyboard-to-timeline path, Remotion realization, static QC, and rendered output. This is a quality audit, not a claim that later asset-search or continuity milestones are complete.

## Findings and action taken

1. **Photo dependencies were scene-level.** A scene resolved one primary image and the timeline derived reframes or hold splits. The canonical shot did not own its asset or crop. Assets, crop, focal point, camera path, and presentation now live on each realized shot. `DynamicMontage` handles hooks with several relevant real assets.

2. **Procedural graphics could dominate.** One family per scene could produce a wall of cards. Realization is now shot-aware and prefers real media for establishing, subject, context, detail, document, and evidence roles when a suitable asset exists. Diagnostics report media/procedural balance and structured runs. The final run still has an eight-shot structured run; Milestones 4–7 own the remaining asset/continuity work.

3. **Motion was generic.** Photo motion previously rotated through a scene-level vocabulary. Moves are now selected per shot from role, geometry, motion preference, focal point, and recent camera history. Scale changes are restrained to roughly 2.5–7.5%. Procedural layouts stay static while information reveals animate.

4. **Shot semantics did not reach the renderer.** The timeline independently invented bed shots from a hold threshold. Canonical count, order, and IDs now pass unchanged into `timeline.json`; role, concept, media preference, evidence requirement, and scene/section traceability survive. The legacy splitter is disabled.

5. **Evidence visuals were weakly distinguished.** Evidence and graphic roles now prefer semantic structured families; real media wins for specific entities/documents when available. Required evidence survives in the realized-shot trace. Provider ranking is still imperfect: the ASML scene received verified headquarters/freight imagery, not the requested lithography-machine view. Search/ranking milestones own that gap.

6. **Scene length stood in for shot planning.** Long scenes were split because of a hold threshold. `shotTimingResolver` now uses authored duration hints, aligned-word starts, phrase/sentence endings, energy-aware minimum holds, and exact frame conservation. It never changes authored count or order.

7. **Some graphics felt template-driven.** Statement realization is restricted to words, highlight, and typewriter treatments instead of chips/cards. Stat, compare, and list use a narrower editorial vocabulary and recent-variant memory. Golden renders show strong stat/statement/process work; list and document families remain more template-like.

8. **Overlay logic repeated at scene scope.** Overlays now compile per shot from only the aligned words intersecting it. Caption yielding uses exact shot ranges. Inspection found and fixed a comparison reveal bug where an internal shot opened empty; the first subject now appears at frame two and later content remains voice-anchored.

9. **Transitions were over-designed.** The old selector could add burns, irises, flashes, and accent transitions for variety. The new policy defaults to hard cuts, reserves push/wipe for sections, permits an occasional low-energy photographic dissolve, and enforces a budget. The final run uses zero designed transitions across ten scenes.

10. **Crop/readability decisions were not traceable.** Crop mode, focal point, overlay mode, density, and camera move now live in `presentation`. Full/depth/editorial photo variants use geometry and semantic role. Exact shot caption suppression protects primary graphics. Semantic crop quality still requires contact-sheet inspection.

11. **Pacing metrics were clip-biased.** Diagnostics now operate on realized shots: family, variant, layout, camera, asset reuse, structured/photo runs, static holds, media/procedural balance, and density. Static-hold calculation discounts progressive overlay reveals instead of treating a whole procedural shot as inert.

12. **Multi-shot scenes were technically supported but not meaningful.** Remotion could play several bed segments, but they were not canonical editorial beats. `MultiShotClip` now renders every canonical shot, including a one-shot scene, using that shot's family, variant, assets, overlay, timing, and camera. The final run renders 23 authored shots across 10 scenes with no timeline-invented shots.

## Representative before/after

Before, a seven-second comparison could be one clip-level card or a photo split only to satisfy maximum hold. After, three authored comparison shots retain their IDs, receive phrase-aligned ranges, alternate columns/versus/columns, reveal immediately, and suppress captions for exact ranges.

Before, a hook with several assets could still show one image plus a generic zoom. After, an establishing hook can resolve to `montage:dynamic`, use two to five real assets, make controlled internal hard cuts, and keep overlay text minimal.

## Acceptance boundary

Milestone 3 establishes truthful shot execution and measurable render behavior. It does not solve provider-independent requests, entity-aware search expansion, semantic/presentation ranking, or full-video continuity repair. Those remain Milestones 4–7.
