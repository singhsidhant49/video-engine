# Visual Rendering Architecture Audit

Date: 2026-09-28  
Scope: read-only architecture audit of the current canonical-storyboard-to-Remotion-pixels path. No production code was changed.

## Executive conclusion

The diagnosis is substantially correct, with one important refinement: **Remotion is not the quality ceiling; the current compilation boundary is.** The pipeline makes useful editorial decisions before render, but it compiles them only to `family + variant + overlay props`. Most final composition decisions—boxes, coordinates, text scale, hierarchy, responsive branching, reveal order, and background treatment—remain embedded in family JSX. As a result, a semantic shot becomes a template invocation rather than a solved, inspectable scene.

The target should therefore keep Remotion as the deterministic frame executor while moving layout and choreography decisions out of JSX. This does not require a rewrite. Milestone 13's diagram path already proves the useful shape:

`semantic spec -> format context -> solved geometry -> renderer`

That path can be generalized incrementally into:

`Storyboard -> VisualCoveragePlan -> EditorialVisualPlan -> SceneComposition IR -> LayoutEngine -> MotionChoreographer -> FrameStatePreflight -> Remotion Executor`

The highest-priority prerequisite is not a new renderer. It is making `VisualCoveragePlan` a valid, executable shot-level contract. In the current normal pipeline, `buildVisualCoveragePlan(storyboard)` is passed a canonical storyboard with `sections[].scenes[]`, but the function reads `storyboard.scenes`; this produces an empty plan. Its unit test uses a non-canonical `{scenes: [...]}` fixture and therefore misses the integration defect (`src/pipeline/videoGeneratorPipeline.js:316-323`, `src/storyboard/visualCoveragePlan.js:127-133`, `tests/visualCoverage.test.js:65-86`). Even when populated, the plan is not consumed by `directScenes()` or `realizeSceneShots()`; it is used only by diagnostics/QA.

## Current flow

### Actual pipeline

```text
AI content plan
  aiDirectorService: narration + kind + text/data/entity hints
    -> editorialAnalysis: merge source scenes into editorial beats
    -> visualStoryboardDirector + shotPlanner: canonical Storyboard v2
       sections[] -> scenes[] -> shots[]
    -> VisualCoveragePlan artifact (currently disconnected and normally empty)
    -> storyboardCompatibility: canonical storyboard -> legacy execution-plan scenes
    -> visualDirector.directScenes: one scene-level family/variant/spec
    -> continuityDirector: mutate scene specs for repetition/transition policy
    -> assetRequestPlanner + assetDirector: shot-level media resolution
    -> visualDirector.recast: scene-level fallback after asset availability
    -> timeline.buildTimeline
       - resolve shot frame ranges
       - visualRealizationDirector: choose family/variant per shot
       - synthesize family-specific overlay props
       - author transitions/captions/audio
    -> Creative QA mutates timeline contracts
    -> Video.jsx dispatches family component
    -> family JSX decides layout + type + hierarchy + animation + background
    -> Remotion/Chromium produces pixels
    -> renderQc samples low-resolution rendered frames for blank/frozen/brightness checks
```

### Important split-brain decisions

There are three representation-selection layers:

1. `buildVisualCoveragePlan()` selects an information type, primary representation, and fallback representations.
2. `directScenes()` selects a scene-level family/variant; `recast()` mutates it after asset resolution.
3. `realizeSceneShots()` independently selects the final shot family/variant using storyboard hints, scene spec, assets, and presentation memory.

Only layer 3 directly controls shot dispatch. Layer 1 is advisory/diagnostic, and layer 2 is partly inherited and partly overridden. This duplicated authority is a central source of unpredictability.

## End-to-end shot traces

The examples below are representative paths through the code. Exact content values vary by project, but every named transformation is the production path.

### Case 1: real image/media shot

#### Storyboard input

- Schema: `ShotSchema` and `StoryboardSceneSchema` in `src/models/storyboard.schema.js:14-46`.
- Created by `buildStoryboard()` -> `toCanonicalScene()` -> `authorShots()` in `src/pipeline/visualStoryboardDirector.js:11-46,74-98` and `src/storyboard/shotPlanner.js:97-130`.
- Relevant shot fields: `id`, `role`, `durationHint`, `visualConcept`, `assetIntent`, `mediaPreference`, `searchConcepts`, `entities`, `motionPreference`, `textOverlay`, `evidenceRequirement`.
- Example semantic intent: `{ role: "subject", mediaPreference: "real", assetIntent: "entity", visualConcept: "ASML EUV machine" }`.

#### Coverage planning

- `classifyInformationType(scene)` returns `entity`/`atmosphere` for suitable beats.
- `buildVisualCoveragePlan()` nominally emits `{sceneId, shotId, informationType, primaryRepresentation: "media", fallbackRepresentations, coverageConfidence, coverageStatus}` (`src/storyboard/visualCoveragePlan.js:48-118,127-207`).
- Current defect: it enumerates `storyboard.scenes`, not canonical `storyboard.sections[].scenes[]`, so the production call normally emits `[]`.
- Current authority: none. `realizeSceneShots()` does not receive a coverage item.

#### Asset and realization

- `planAssetRequests()` walks canonical sections/scenes/shots and produces `AssetRequestSchema` objects with orientation/resolution constraints (`src/pipeline/assetRequestPlanner.js:51-81`, `src/models/assetRequest.schema.js`).
- `directAssets()` searches, scores, materializes, and stores `assets[sceneId].byShot[storyboardShotId]` (`src/pipeline/assetDirector.js:208-359`).
- `analyzeCropFitness()` contributes crop/subject/safe-area fitness to candidate scoring, but its `safeTextRegions` are not propagated to the timeline or layout (`src/services/assetScorer.js:34-139`, `src/assets/assetIntelligenceScorer.js:185-193,261-270`).
- `freeMediaService.focalPoint()` derives a Sharp attention-based focal point for stills; fallbacks and video use `{x: 0.5, y: 0.45}` (`src/services/freeMediaService.js:334-345,393-423`).
- `realizeSceneShots()` calls `chooseFamily()`; real/auto media with an accepted asset becomes `image` (`src/pipeline/visualRealizationDirector.js:48-93,220-274`).
- `chooseImageVariant()` chooses `montage`, `editorial`, `split`, or `full`; this is heuristic and anti-repetition based, not layout-feasibility based (`:95-121`).
- `chooseCameraMove()` and `cameraPath()` select a named move and produce scale/focus key endpoints (`:137-205`).
- Output object: realized shot with `presentation {family, variant, layout, crop, focalPoint, overlayMode, cameraMove, movementState, transitionIn/out, treatment, visualDensity}`, plus `asset`, `move`, and `timing` (`:236-273`).

#### Timeline

- `resolveShotTiming()` maps duration hints to aligned word boundaries, preferring phrase/sentence breaks and enforcing minimum holds (`src/pipeline/shotTimingResolver.js:15-58`).
- `overlayFor('image')` produces `kicker`, `headline`, reveal frames, annotation frame, split frame, and stack frames (`src/pipeline/timeline.js:158-210`).
- `buildTimeline()` emits a `TimelineShotSchema`-compatible object; the schema validates traceability and presentation labels but does not validate asset, overlay, move, geometry, or animation contracts (`src/models/timeline.schema.js:8-24`, `src/pipeline/timeline.js:373-451`).

#### Remotion dispatch and props

- `Video` -> `Sequence` -> `ClipFrame` -> `MultiShotClip` -> `FAMILIES[shot.family]` -> `PhotoShot` (`src/remotion/engine/Video.jsx:14-19,27-72,154-205`).
- `MultiShotClip` creates an ad hoc `subClip` prop with family, variant, duration, overlay, presentation, assets, texture, and a one-item `bed` containing the asset and camera move (`:159-169`).
- No component prop schema exists for `PhotoShot` or its variants.

#### Layout, animation, rendered frame

- `PhotoShot` dispatches again by variant (`src/remotion/families/photo.jsx:264-281`).
- `FullPhoto`, `EditorialPhoto`, `SplitPhoto`, `PortraitSplitPhoto`, and `AnnotatedPhoto` each own their boxes and responsive branch logic (`:48-262`).
- Example: `EditorialPhoto` hardcodes a 54% top media panel in 9:16 and a 46/54 split in 16:9 (`:89-92`).
- `Bed` -> `ShotMedia` -> `CameraImage`/`CameraVideo` (`src/remotion/engine/imagery.jsx:62-119`).
- `cameraLayout()` computes cover scaling, focal clamping, and eased scale/focus interpolation per frame (`:13-50`). Stills honor focal x/y; videos use CSS `objectFit: cover` and scale only, so the authored focus path does not reposition video (`:78-93`).
- Text size is selected by the heuristic `fitSize()` and browser wrapping happens in JSX/CSS (`src/remotion/engine/theme.js:72-96`).
- Final pixels are therefore determined jointly by timeline props and `photo.jsx`/`imagery.jsx`, with the latter owning the actual composition.

### Case 2: procedural process/diagram shot

There are currently two different paths for closely related semantics.

#### Storyboard and coverage

- `authorShots()` marks `process` and other structured kinds as `mediaPreference: "procedural"` (`src/storyboard/shotPlanner.js:101-127`).
- Coverage classification maps process information to primary representation `diagram`, not `process` (`src/storyboard/visualCoveragePlan.js:72-81,148-151`).
- `directScenes()` maps the same information type to family `process` (`src/pipeline/visualDirector.js:77-85`).
- `realizeSceneShots()` usually inherits the recast/spec family because `spec.family !== image` has priority (`src/pipeline/visualRealizationDirector.js:48-68`). Thus the nominal diagram coverage decision commonly renders through `ProcessShot`, not `DiagramShot`.

#### Process family path

- `chooseVariant('process')` returns `flow`; presentation layout is the string `process:flow` (`visualRealizationDirector.js:107-121,232-249`).
- `overlayFor('process')` uses authored `scene.data.steps` or a generic three-step fallback, then maps step titles to word-anchored `ats[]` (`src/pipeline/timeline.js:164-186,227-230`).
- `Video.jsx` dispatches to `ProcessShot` (`src/remotion/engine/Video.jsx:16`).
- `ProcessShot` computes column width and all geometry inside JSX. It switches `flexDirection` between row and column, chooses gaps/type sizes, computes active state, and animates a progress rule (`src/remotion/families/structured.jsx:127-195`).
- This path does **not** use `DiagramSpec`, `FormatLayoutContext`, or `solveDiagramLayout()`.

#### Diagram family path

- A relationship/diagram shot becomes family `diagram`, variant `nodes` (`visualRealizationDirector.js:75-81,117`).
- `overlayFor('diagram')` uses authored nodes or `synthesizeProceduralData(scene, 'diagram')` (`timeline.js:264-267`, `visualCoveragePlan.js:260+`).
- `DiagramShot` normalizes props with `createDiagramSpec()`, creates `FormatLayoutContext`, and calls `solveDiagramLayout()` during render (`src/remotion/families/diagrams.jsx:18-37`).
- `DiagramSpec` owns grammar, semantic nodes/edges, importance, visual form, emphasis sequence, and background hint (`src/diagrams/diagramSpec.js:18-90`).
- `layoutEngine` owns node boxes and connector paths for comparison, cycle, pipeline/system, network, hierarchy/stack/funnel, and flow (`src/diagrams/layoutEngine.js:65-150`).
- `DiagramShot` still owns title placement, node padding, semantic visual form styling, connector labels, animation timing, current-node highlighting, central badges, and background defaults (`diagrams.jsx:39-447`).
- Layout is recomputed in render and is not persisted into the timeline; Creative QA separately recomputes its own copy.

#### Phrase timing to animation

- Shot boundaries are phrase-aware via `resolveShotTiming()`.
- `overlayFor.sequential()` performs a token-based search against aligned words. It emits relative frame offsets for list/process/timeline/statement items (`timeline.js:56-65,164-186`).
- `DiagramShot` does not consume phrase event timings. It uses fixed `frameAt + idx * 6/8` choreography (`diagrams.jsx:39-44,111-113,155-162`). `DiagramSpec.emphasisSequence` is authored but not used by the renderer.

#### Final frame

- The process route yields flexbox-based template pixels.
- The diagram route yields explicit node boxes/SVG connector pixels, but text metrics and connector collision avoidance are not solved.
- These visually similar semantics therefore have incompatible composition and motion architectures.

### Case 3: chart/comparison shot

#### Chart

- A `chart`/`statistic`/`quantify` beat classifies as information type `data`; coverage nominally selects `chart` (`visualCoveragePlan.js:100-104,168-170`).
- `directScenes()` may select `chart` or `stat`; `recast()` can change missing image scenes to `chart` (`visualDirector.js:28-33,117-119,225-227`).
- `realizeSceneShots()` selects `chart` and generally preserves `spec.variant`/`default`; it forces a static camera and HIGH density (`visualRealizationDirector.js:121,137-140,207-217`).
- `overlayFor('chart')` takes `scene.data.values/labels` or synthesized values and emits `at`/`drawFrames` based loosely on emphasis timing (`timeline.js:235-240`).
- `Video.jsx` dispatches `ChartShot`; props are the ad hoc overlay `{title, values, labels, at, drawFrames}`.
- `ChartShot` computes `maxVal`, fixed chart height, equal flex columns, `height = value/max * chartH * .85 * progress`, a 60%-width bar, and labels in JSX (`src/remotion/families/structured.jsx:345-381`).
- There is no chart semantic schema, scale object, axis policy, label measurement, collision resolution, negative/zero/domain handling, or geometry preflight.

#### Comparison

- `visualIntent: compare` classifies to information type `comparison`; coverage selects `comparison` (`visualCoveragePlan.js:78-81,152-155`).
- Family names diverge: representation `comparison`, renderer family `compare`, variant `columns`.
- `overlayFor('compare')` emits `{left, right, leftAt, rightAt, withImage}` using authored/synthesized data and a word anchor for the right title (`timeline.js:241-245`). `withImage` is not used by `CompareShot`.
- `CompareShot` owns two-column/top-bottom layout, divider/badge placement, font ratios, item styling, and reveal opacity (`structured.jsx:243-341`).
- Although `DiagramSpec` defines a `COMPARISON` grammar, this family does not use it. The codebase therefore has two comparison layout systems.

## Responsibility map

| Responsibility | Current owner(s) | Effective authority / audit result |
|---|---|---|
| Semantic representation selection | `visualCoveragePlan.classifyInformationType/buildVisualCoveragePlan`; `visualDirector.directScenes/recast`; `visualRealizationDirector.chooseFamily`; Creative QA repairs | Duplicated. Final shot family is effectively owned by `chooseFamily()` plus post-timeline QA mutation. Coverage plan is not authoritative. |
| Visual family selection | `directScenes()`, `recast()`, `realizeSceneShots()`, `applyCreativeRepairs()` | Four mutation points; scene and shot authority are mixed. |
| Layout | Family JSX; diagram `layoutEngine` only for `DiagramShot` | Mostly renderer-owned and template-specific. |
| Element positioning | Inline JSX/CSS; diagram solver node boxes/SVG paths | Mostly hardcoded/flex/absolute positions. |
| Text fitting | `theme.fitSize()` in selected editorial/photo/list components; CSS elsewhere | Heuristic character-width estimation, inconsistent adoption, no measured height. |
| Image crop | Candidate crop score; `visualDirector.recast()` for portrait landscape; `cameraLayout()` cover crop | Crop feasibility is scored upstream, but actual crop is separately recomputed; safe text regions are dropped. |
| Background | Family components and `Ground`; diagram `backgroundModes.js` exists but `DiagramShot` defaults directly | Fragmented; selection and rendering are not consistently connected. |
| Visual hierarchy | `DiagramSpec` importance for diagrams; otherwise family JSX and source data order | Mostly implicit in component implementation. |
| Animation timing | `timeline.overlayFor()` for some phrase anchors; component-local offsets/durations; `ClipFrame` for transitions | Fragmented across compiler and renderer. |
| Animation easing | `remotion/engine/motion.js` shared curves plus direct `interpolate()` calls | Partly centralized vocabulary, locally applied. No springs found. |
| Scene transition | `timeline.chooseTransitions()` and `Video.ClipFrame`; overlay dips/flashes in `CutOverlays` | Reasonably centralized; preserve. |
| Caption placement | `Captions.jsx`, `SAFE_AREA`, `captionBand()`, and timeline hidden ranges | Global fixed band. `layoutConstraints.caption` is emitted but not consumed by `Captions`. |
| Format adaptation | `ThemeProvider`, safe/type tokens, family `isVertical` branches, diagram format solver | Mixed. Diagrams genuinely solve alternate geometry; most families branch proportions/flex direction. |
| Diagram geometry | `createDiagramSpec()` + `solveDiagramLayout()` + `DiagramShot` | Best-separated path, but not text-aware and computed at render time. |
| Chart geometry | `ChartShot` JSX | Entirely renderer-owned template geometry. |
| Visual density | `visualRealizationDirector.densityFor()` and diagnostics | A label used for reporting/anti-runs; does not parameterize layout capacity. |
| Continuity | `continuityDirector`, presentation memory in `visualRealizationDirector`, diagnostics/Creative QA | Distributed heuristic checks and mutations; no unified cross-scene visual plan. |

## Coupling hotspots

1. `src/remotion/families/structured.jsx`: each component mixes semantic interpretation, layout, type scale, hierarchy, background, responsive behavior, and animation. `ProcessShot`, `CompareShot`, and `ChartShot` are the clearest decomposition candidates.
2. `src/remotion/families/photo.jsx`: variants mix crop geometry, media placement, safe zones, headline fitting, shading, annotation routing, and animation.
3. `src/remotion/families/editorial.jsx`: `StatShot`, `StatementShot`, `QuoteShot`, and `DocumentShot` mix content shaping, typography, geometry, and choreography.
4. `src/remotion/families/diagrams.jsx`: better separation for node geometry, but still mixes normalization/layout invocation, connector drawing, styling, title/badge placement, and choreography.
5. `src/pipeline/timeline.js`: combines edit compilation, family-specific prop synthesis, semantic fallbacks, phrase anchoring, captions, transitions, sound design, and timeline serialization.
6. `src/pipeline/visualRealizationDirector.js`: combines representation choice, asset selection, variant/layout choice, crop label, camera choreography, density, and continuity memory.
7. `src/qc/creativeQaDirector.js`: evaluates guessed metrics and mutates representation, layout labels, content, caption policy, and timing without re-running a layout/timeline solver.

## Hardcoded layout audit

Highest-risk examples:

1. **Photo split geometry:** `photo.jsx:89-126` fixes vertical media to `54%` height and landscape media start to `46%` width, with fixed 60px-equivalent offsets. Content length and focal bounds do not influence the split.
2. **Portrait treatment:** `photo.jsx:181-208` fixes the landscape portrait panel at `48%` width.
3. **Annotation routing:** `photo.jsx:226-244` uses fixed 260/380/120/340/90 offsets and only left/right choice. It does not test label bounds or line/subject/text intersections.
4. **Stat split:** `editorial.jsx:48-57` fixes vertical photo height at `46%` and landscape split at `52%`, independent of value/label height.
5. **Process columns:** `structured.jsx:135-190` divides remaining width by step count and changes only row/column direction. It has no minimum readable width, overflow fallback, or measured text height.
6. **Comparison:** `structured.jsx:264-337` uses fixed gaps, a 45% divider badge position, and embedded type multipliers. It does not solve unequal content lengths.
7. **Chart:** `structured.jsx:349-377` fixes chart height (240/280 units), gap (24/44), bar width (60%), and 85% max-domain fill. Labels can collide or wrap without geometry feedback.
8. **Map:** `diagrams.jsx:491-540` uses a fixed-height 420-unit pseudo-map, hardcoded SVG world-like path, percent coordinates, and `whiteSpace: nowrap`; it is not a geographic or collision-aware layout.
9. **Code/UI:** `diagrams.jsx:550+` uses fixed paddings, max widths, pane widths, and font multipliers; no line-count or content-height solver exists.
10. **Diagram solver:** `layoutEngine.js` is systematic but still uses fixed proportions per grammar. Node boxes are not derived from measured labels, and connector paths are straight/orthogonal heuristics without obstacle routing.
11. **Format tokens:** `shared/styles.js:151-159` provides only two static type scales and safe-area sets. Family-local multipliers create a second untracked token layer.
12. **Dead output:** `timeline.js:414-425` emits `layoutConstraints`, but no Remotion component consumes it. It communicates intent without enforcing pixels.

Absolute positioning is not itself a defect in a video compositor. The risk is that coordinates are authored inside JSX before content bounds are known and cannot be inspected or validated as a scene-wide solved result.

## Animation audit

- Shared primitives: `progress()` wraps Remotion `interpolate()` with common easing; `reveal()` returns frame-derived CSS for mask/fade/pop/rise (`src/remotion/engine/motion.js`).
- Camera: `cameraLayout()` interpolates focus/scale across the entire still-image shot using `ease.camera` (`imagery.jsx:13-44`). Video only scales, so focal movement is incomplete (`:78-93`).
- Scene transitions: `chooseTransitions()` authors types and frames; `ClipFrame` executes dissolve/push/whip/zoom/wipe/iris; `CutOverlays` executes dip/flash/burn/fades (`timeline.js:284-307`, `Video.jsx:27-92`).
- Per-element animation: every family directly calls `progress()`, `reveal()`, or `interpolate()` with local offsets and durations. Examples include chart bar growth, process active phases, statement word reveals, diagram connector/node staggering, document highlighting, and code type-on.
- Phrase synchronization: available for statement/list/process/timeline/quote and some image/stat/chart/compare events through `overlayFor()`. Diagram nodes/connectors ignore phrase timing and use fixed index staggering.
- Springs: no Remotion `spring()` usage was found.
- CSS transitions: `structured.jsx:164` and `diagrams.jsx:183` specify `transition: ...`. These are outside the frame-derived animation model and should not be relied on for deterministic rendering.
- Opacity sequencing: extensively component-local. Many components intentionally show a 0.32-0.48 base state at frame 0, then interpolate opacity.

Conclusion: easing vocabulary is partly centralized, but choreography is fragmented. There is no `MotionPlan`, no semantic event track, and no preflightable frame-state model.

## Format audit: 16:9 and 9:16

### What is centralized

- Timeline dimensions are exactly `1920x1080` for `landscape` and `1080x1920` for `shorts` (`timeline.js:503-511`).
- `ThemeProvider` supplies `isVertical`, short-edge `unit`, format type scale, and percentage-derived safe margins (`theme.js:8-32`, `shared/styles.js:151-159`).
- Asset requests ask for landscape or portrait orientation (`assetRequestPlanner.js:51-73`).
- Diagram specs cap node counts by format and the diagram solver changes grammar geometry (`diagramSpec.js:28-34`, `layoutEngine.js`).

### What is genuinely recomposed

- `DiagramShot` layouts: horizontal flows/pipelines become vertical; comparisons become left/right versus top/bottom; radial dimensions change; node limits change.
- Photo editorial/split modes: side-by-side panels become stacked panels.
- Structured process/timeline/compare: flex direction switches row/column.

### What is mostly branched/scaled

- Typography, stat, captions, code, UI, document, map, and chart primarily use the same composition with alternate multipliers, widths, heights, or flex direction.
- There is no format-independent composition intent followed by constraint solving. `isVertical` conditionals are embedded throughout JSX.
- The timeline's `layoutConstraints` do not drive those branches.

Verdict: diagrams perform real recomposition; photo/process/compare perform coarse alternate arrangements; most other families are scaled or locally branched templates.

## Text audit

### Generation

- Primary narration and source-scene `text`/typed `data` are authored by `aiDirectorService` before storyboard creation (`src/services/aiDirectorService.js:6-24` and its plan prompt/validation).
- `visualStoryboardDirector` copies source `text` and `data` into `presentationSource`; `shotPlanner` assigns `textOverlay` only to the first authored shot (`visualStoryboardDirector.js:27-45`, `shotPlanner.js:116-129`).
- Timeline `overlayFor()` chooses family-specific text and may synthesize generic procedural content when data is absent (`timeline.js:158-275`, `visualCoveragePlan.synthesizeProceduralData()`).
- Creative QA can truncate headlines or replace representation and synthesize new overlay content after timeline compilation (`creativeQaDirector.js:541-604`).

### Measurement, wrapping, sizing, overflow

- `fitSize()` estimates line length from character counts and a glyph ratio. It does not load fonts, measure glyphs, calculate actual line breaks, or consider box height (`theme.js:72-96`).
- It is used by photo headlines and some editorial/list components, but not systematically by process, comparison, chart labels, diagram nodes, captions, code, UI, map labels, or all document text.
- Wrapping is delegated to Chromium CSS (`textWrap`, `overflowWrap`, `whiteSpace`, flex layout). Several components force `nowrap`.
- The minimum size can still overflow because `fitSize()` clamps at `minSize` and has no failure result.
- QA treats `headline.length > 80` or long diagram label character counts as overflow proxies. It does not measure rendered bounds (`visualCoverageDiagnostics.js:141-149`, `creativeQaDirector.js:205-214`, `diagramQaDirector.js:70-78`).
- No font-ready measurement/preflight stage exists. No line-clamp/ellipsis policy or semantic text-reduction feedback exists.

Gap: text is finalized before actual geometry is known, while layout is finalized inside JSX after upstream QA has run.

## Media audit

- Crop selection begins in candidate scoring through `analyzeCropFitness()`, using aspect ratio and focal estimates. It returns protected/safe-text regions, but these are only scoring metadata and do not reach composition.
- Stills get a focal point from Sharp attention/crop analysis when available. Videos and fallback stills use a center-biased default.
- `presentation.crop` is only the label `editorial` or `cover`; renderers branch on variant, not a detailed crop rectangle.
- `cameraLayout()` calculates a cover crop and keeps the interpolated focal point centered subject to edge clamping for stills.
- `CameraVideo` uses `objectFit: cover` and scale. It does not apply focal x/y positioning, so image and video camera semantics differ.
- Text-safe areas are global canvas margins plus family-local caption reservations. Asset-derived `safeTextRegions` are unused, so negative-space-aware headline placement does not occur.
- Camera movement comes from role-based heuristics and recent-move memory, then fixed scale/focus endpoints. It is not selected from actual subject box, crop slack, saliency path, or text placement.
- Grounded annotations require `focusBox`, but the active asset pipeline shown here generally materializes `focal`, not a detector-produced `focusBox`; `recast()` consequently disables annotation unless external candidate metadata supplies one.

## Diagram architecture as a general foundation

### What should be generalized

- `createFormatLayoutContext()`: viewport, safe areas, caption reserve, primary visual area, and typography tokens.
- The split between semantic `DiagramSpec` and solved `layout`.
- Stable IDs, explicit node/edge semantics, importance, visual form, and grammar.
- Explicit boxes and anchors.
- Format-specific capacity limits.
- Deterministic solver output and the ability to run it before render.
- Separate connector geometry.
- Geometry-derived occupancy diagnostics.

### What must be fixed before generalization

1. Rename/generalize `FormatLayoutContext` and make one canonical source for safe zones; it currently differs from `SAFE_AREA`.
2. Move solving out of `DiagramShot` into pipeline compilation and persist solved geometry.
3. Add measured text intrinsic sizes and min/max constraints before box solving.
4. Add collision checks for node-node, text-box, connector-node, connector-label, safe-area, and caption-region intersections.
5. Route connectors around node boxes; current cycle connectors run center-to-center and general routes do not avoid obstacles.
6. Reserve a title region explicitly. Current `primaryVisualArea` begins at `safe.top`, the same y used for the diagram title, so title and nodes can occupy overlapping space.
7. Make repair actions re-run normalization, layout, motion, and timeline invariants. Today some repairs mutate data without recompilation.
8. Generalize beyond graph nodes into scene elements: media, text, shapes, chart marks, code blocks, document excerpts, and groups.

Conclusion: yes, Milestone 13 is the best seed for a general `SceneComposition/LayoutEngine`, but it is a structural prototype rather than a production-general solver.

## QA audit

### Current validation type

Creative QA validates **contracts and heuristics**, not actual rendered geometry.

- `evaluateComposition()` returns family-based constants such as `emptyAreaRatio = .25` for graphics and always returns `safeMargins: true` (`creativeQaDirector.js:77-123`).
- Text clipping is inferred from character count.
- Caption competition is inferred from hidden frame ranges.
- Diagram dead space is derived from solved node y-span, not pixels.
- Diagram tiny text is inferred from label length.
- `connectorWarnings` and `frame0IncompleteWarnings` are reported in aggregate, but `evaluateDiagramQuality()` never emits `connector_overlap` or `frame0_incomplete`; those counters are effectively inert (`diagramQaDirector.js:35-123,193-250`).
- Diagram QA is run against `clip.overlay`, while the actual shot may be a sub-shot with `shot.overlay`; clip/shot props can diverge.
- `applyCreativeRepairs().EXTEND_HOLD` changes a shot duration without shifting later shots, clip duration, total duration, captions, or audio. This can break the previously gap-free timeline (`creativeQaDirector.js:644-655`).
- `ADD_MICRO_PROGRESSION` writes diagram node `activeAt`, but `DiagramShot` ignores `activeAt` (`:625-640` versus `diagrams.jsx:155-162`).

### What actual rendered QC can detect

`renderQc` samples two 72x128 grayscale frames per clip and checks duration, near-black/low-variance blankness, frame difference, and median photo brightness (`src/qc/renderQc.js`). It cannot identify elements or geometry.

### Direct answers

| Question | Current capability |
|---|---|
| Real bounding-box overlap? | No. |
| Actual clipping? | No; only length proxies and gross blank pixels. |
| Connector intersections? | No. |
| Visual dead space? | Only family constants or diagram node-span approximation; not actual rendered meaningful-pixel/element occupancy. |
| Safe-area violations? | No actual bounds test. |
| Caption/text collisions? | No; only policy-range checks. |

## Top 10 quality-limiting architectural issues

1. **Coverage planning is disconnected and normally empty for canonical Storyboard v2.** This invalidates the intended semantic-first path at its first boundary.
2. **The intermediate representation stops at template selection.** `family:variant` is a label, not composition geometry.
3. **Representation authority is duplicated across four stages.** Coverage, direction, realization, and QA can disagree or overwrite one another.
4. **Layout and visual hierarchy live in JSX.** They cannot be inspected, solved globally, or geometry-tested before render.
5. **Text measurement is approximate and late.** Character heuristics cannot guarantee wrapping, height, clipping, or consistent type hierarchy.
6. **Motion choreography is fragmented.** Phrase timing exists, but many renderers ignore it and author fixed local staggers.
7. **Format behavior is family-specific.** 9:16 frequently means branch/scale/stack rather than constraint-driven recomposition.
8. **Media intelligence is not carried into composition.** Crop score, protected regions, and safe text regions do not guide final layout; video ignores focal positioning.
9. **QA does not inspect real geometry.** Some reported counters have no producing rules, and some repairs write fields the renderer ignores or violate timeline invariants.
10. **Parallel semantic renderers drift.** Process versus diagram, compare versus comparison grammar, stat versus chart, and legacy/modern UI/code paths duplicate concepts with incompatible contracts.

## Files most in need of change

Ordered by leverage, not by file quality:

1. `src/storyboard/visualCoveragePlan.js` — canonical traversal, schema, and executable shot-level authority.
2. `src/pipeline/visualRealizationDirector.js` — replace family/variant-only output with an editorial visual plan and composition requests.
3. `src/pipeline/timeline.js` — separate edit timing from overlay/content synthesis and motion event authoring.
4. `src/models/timeline.schema.js` — introduce validated composition, geometry, and motion contracts instead of passthrough ad hoc props.
5. `src/diagrams/layoutEngine.js` — generalize format context/boxes/anchors; add intrinsic sizing and collision APIs.
6. `src/remotion/engine/Video.jsx` — transition from family dispatch to generic scene execution, while preserving a legacy adapter.
7. `src/remotion/families/structured.jsx` — decompose process/timeline/compare/chart/list templates into semantic adapters and generic primitives.
8. `src/remotion/families/photo.jsx` — separate media placement/crop constraints, text block layout, annotation routing, and rendering.
9. `src/remotion/families/diagrams.jsx` — make it consume pre-solved geometry and motion rather than solving/choreographing during render.
10. `src/qc/creativeQaDirector.js` and `src/diagrams/diagramQaDirector.js` — replace guessed composition metrics with solved frame-state checks and safe repair/recompile loops.

## What should be preserved

- Remotion and its frame-deterministic rendering model.
- Canonical storyboard IDs and shot traceability.
- Word alignment, phrase-aware shot boundaries, caption chunking, and audio timeline.
- `ThemeProvider`, shared palettes, fonts, safe-area concepts, and common easing vocabulary, after consolidation.
- `ShotMedia`, still-image focal crop mathematics, `Ground`, `Shade`, captions, and clip transition execution as low-level render primitives.
- Asset request/scoring/materialization and video-level reuse memory.
- Continuity goals: anti-repetition, restrained transitions, density variation, and static/moving rhythm.
- Diagram semantic grammars, `DiagramSpec` concepts, explicit boxes/anchors, and format-aware solver direction.
- Existing families as compatibility adapters and regression references during migration.
- Contact sheets, timeline QC, render QC, and golden fixtures, expanded rather than replaced.

## Proposed target architecture

### 1. VisualCoveragePlan

Location: keep under `src/storyboard/`, add a Zod schema under `src/models/`.

One item per canonical `shotId`, containing information type, representation candidates, evidence requirements, media/procedural constraints, required semantic payload, and rationale. It should not contain pixels.

### 2. EditorialVisualPlan

Location: `src/pipeline/` as the output of a refactored realization director.

Owns the selected representation, semantic emphasis, hierarchy, desired composition grammar, density/cognitive load, asset bindings, text blocks, and continuity decisions. It replaces duplicated scene spec plus shot presentation mutations.

### 3. SceneComposition IR

Location: `src/composition/sceneComposition.js` with schema in `src/models/sceneComposition.schema.js`.

Suggested shape:

```js
{
  version,
  shotId,
  viewportPolicy,
  regions: [{ id, role, constraints }],
  elements: [
    { id, kind: 'media'|'text'|'shape'|'chart'|'connector'|'code'|'group',
      semanticRole, importance, content, intrinsic, constraints, styleTokenRefs }
  ],
  relationships: [{ type, from, to }],
  readingOrder: [],
  captionPolicy,
  backgroundIntent,
  motionIntent
}
```

It should describe what must be composed and the constraints between elements, not final React markup.

### 4. LayoutEngine

Location: new `src/composition/layout/`, initially extracting/generalizing `src/diagrams/layoutEngine.js`.

Inputs: `SceneComposition`, `FormatLayoutContext`, measured intrinsic sizes.  
Outputs: `SolvedScene` with explicit boxes, crop rectangles/object positions, connector routes, z-order, text line breaks/font sizes, occupancy metrics, and unsatisfied constraints.

Format adaptation should be policy/constraint driven: select a composition grammar per format, then solve. It should permit genuinely different reading orders and region topology in 16:9 and 9:16 rather than only changing scale.

### 5. MotionChoreographer

Location: `src/composition/motion/` or `src/pipeline/motionChoreographer.js`; execute it after layout and timing are known, before Remotion.

Inputs: aligned words/phrases, shot range, semantic emphasis sequence, solved elements, motion style, continuity memory.  
Output: explicit tracks/events such as `{targetId, property, from, to, startFrame, endFrame, easing, triggerPhraseId}`.

Phrase timestamps should first become named semantic events (`conceptIntroduced`, `comparisonPivot`, `valueSpoken`, `conclusion`) and then bind to element tracks. Token matching remains a fallback. Every event should be clamped to the shot and preflighted for minimum readable hold.

### 6. FrameStatePreflight

Location: `src/qc/frameStatePreflight.js` using the same geometry and motion evaluator as the renderer.

Evaluate frame 0, all event boundaries, local extrema, mid-holds, and final frame. Detect:

- element/safe/caption bounds violations;
- actual solved text overflow;
- element-element overlaps not explicitly allowed;
- connector-node and connector-label intersections;
- crop/focal/protected-region loss;
- insufficient contrast and minimum type size;
- empty first frames, dead space/occupancy, and late reveals;
- animation discontinuities and insufficient scan time.

This is geometry preflight, not screenshot computer vision. Pixel QC remains a final backstop.

### 7. GenericSceneRenderer

Location: `src/remotion/engine/GenericSceneRenderer.jsx`.

It should render solved primitives by ID and evaluate explicit motion tracks at the current frame. It must not choose representation, layout, wrapping, or choreography. `Video.jsx` remains responsible for sequences, transitions, global finishing, captions, and audio.

### Compatibility bridge

Add a `LegacyFamilyAdapter` that converts existing `family/variant/overlay` timeline entries to the old components. New composition-enabled shots and legacy family shots can coexist in one video. This is the key to migration without a rewrite.

## Answers to the specific questions

1. **Should Remotion remain the renderer?** Yes. It is well suited to deterministic frame execution, media decode, audio, sequencing, and React/SVG drawing. Move creative computation out of it; do not replace it.
2. **Which current Remotion families should remain?** Keep media/document/quote/code/UI/map specializations where their semantics require distinctive drawing, plus global captions, ground, media, transitions, and finish primitives. Keep all families temporarily as compatibility adapters and regression fixtures.
3. **Which families should be decomposed?** First `structured.jsx` (`process`, `timeline`, `compare`, `chart`, `list`), then `photo.jsx` and `editorial.jsx` (`stat`, `statement`, `chapter`). Decompose `DiagramShot` only enough to consume pre-solved data; preserve its semantic grammar work.
4. **Can diagram layout infrastructure be generalized?** Yes. Generalize format context, boxes, anchors, grammar selection, capacity limits, occupancy, and connector routing. Add measured intrinsics, general element kinds, collision constraints, and pre-render persistence.
5. **Where should SceneComposition IR live?** In a renderer-independent `src/composition/` domain, with validation in `src/models/`. It should not live under `src/remotion/` or `src/diagrams/`.
6. **Where should motion plans be authored?** In a pipeline-stage `MotionChoreographer` after timing and solved layout, before timeline serialization. Remotion should evaluate tracks, not invent them.
7. **Where should text measurement occur?** In a deterministic pre-render measurement service shared with the renderer, after fonts are loaded and before layout solve. Cache measurements by font/style/text/width. Persist chosen line breaks and font size in solved output.
8. **How should phrase timestamps map to animation events?** Convert aligned words to stable phrase IDs/ranges; bind semantic cues from the Editorial Visual Plan to those phrases; emit explicit clamped event frames; use token matching only when no authored binding exists; enforce readable pre/post holds.
9. **How should format-specific composition work?** Resolve the same semantic composition against separate format policies. Policies may choose different grammar/topology, reading order, element suppression, and asset crop. Then solve constraints independently for 16:9 and 9:16.
10. **Largest quality improvement with least regression risk?** Make diagram-style pre-solved composition available to `process`, `compare`, and `chart` while retaining current Remotion primitives and a legacy fallback. In parallel, fix coverage traversal/authority and add measured text plus geometry preflight. This improves the weakest template-heavy graphics without disturbing media, audio, or transitions.

## Incremental migration plan

### Phase 0: contract repair and observability

- Fix canonical traversal in `VisualCoveragePlan` and add an integration test using `StoryboardSchema` output.
- Add schemas for coverage items, editorial visual plans, and solved compositions.
- Make coverage selection an explicit input to realization; record any override with reason.
- Stop unsafe QA mutations unless the affected stages are recompiled.
- Persist debug artifacts: editorial plan, composition IR, solved layout, motion plan, and preflight report.

### Phase 1: one vertical slice

- Generalize `FormatLayoutContext` and text measurement.
- Implement `SceneComposition` for **process/flow only**.
- Compile current `scene.data.steps`/synthesized steps into elements/relationships.
- Solve both 16:9 and 9:16 geometry outside Remotion.
- Bind step reveals to phrase events.
- Render through `GenericSceneRenderer`, with `ProcessShot` as a feature-flagged legacy fallback.
- Add frame-state overlap/clipping/caption tests and golden renders.

### Phase 2: comparisons and charts

- Unify `CompareShot` with diagram comparison grammar.
- Add chart semantic marks/scales/labels to the IR and a chart solver.
- Replace family-local responsive branches with format policies.

### Phase 3: photo/editorial composition

- Carry focal/protected/safe-text regions from asset scoring into composition.
- Solve media/text regions and crop/object-position together.
- Make video focal positioning equivalent to still behavior.
- Move annotations to general anchor/connector routing.

### Phase 4: motion and QA convergence

- Convert remaining local animation offsets to motion tracks.
- Make Creative QA consume solved geometry and frame states.
- Keep post-render pixel QC as final regression protection.

### Phase 5: retire family dispatch selectively

- Once migrated representations pass golden and integration tests, reduce families to semantic adapters or primitive renderers.
- Keep genuinely specialized renderers where a generic primitive would reduce clarity.

## Risks

- **Font measurement determinism:** Node/Chromium metric differences can move lines. Use the exact render fonts and measurement implementation, cache results, and test in the render environment.
- **IR over-generalization:** A universal scene graph can become harder than family JSX. Begin with the shared needs of process/comparison/chart, not every possible visual.
- **Regression in proven media/audio paths:** Keep the legacy adapter and migrate per representation under a feature flag.
- **Solver instability:** Deterministic tie-breaking and explicit unsatisfied constraints are required; never silently overlap.
- **Motion/layout dependency cycles:** Motion can change bounds. Initially constrain motion to transforms that stay within preflight envelopes, or preflight swept bounds.
- **QA repair invalidation:** Any semantic/text/layout/timing repair must re-run all dependent compiler stages.
- **Artifact/version compatibility:** Timeline schema versions and cache invalidation must account for new IR/layout/motion artifacts.
- **Performance:** Pre-solving and text measurement add cost, but are cacheable and should reduce render-time logic.
- **Synthetic content quality:** Layout improvements cannot make generic synthesized diagram/chart data authentic; provenance and evidence requirements must remain explicit.
- **False confidence from geometric QA:** Geometry can be valid but editorially weak. Preserve human/contact-sheet review and semantic QA.

## First implementation milestone

**Milestone: Solved Process Composition (no broad family rewrite).**

Deliverables:

1. Repair and validate canonical shot-level `VisualCoveragePlan`; feed it into realization.
2. Add `SceneComposition`/`SolvedScene` schemas for text, group, shape, and connector elements.
3. Extract/generalize `FormatLayoutContext` from the diagram engine.
4. Add deterministic real-font text measurement and persisted line breaks.
5. Compile only `process` shots into a flow composition; solve separately for 16:9 and 9:16.
6. Author process motion tracks from aligned phrase events.
7. Add `FrameStatePreflight` for bounds, overlap, text overflow, caption reservation, frame-0 validity, and connector intersections.
8. Render the solved process scene with `GenericSceneRenderer`; retain `ProcessShot` fallback behind a flag.
9. Add canonical-storyboard integration tests, geometry tests, and golden renders for both formats.

Success criteria:

- The production coverage plan contains exactly one item per canonical shot.
- Process JSX contains no content-dependent layout or reveal-timing decisions on the new path.
- The persisted solved scene fully explains every visible box and animation event.
- Preflight detects deliberately introduced overflow, overlap, caption collision, and connector obstruction before rendering.
- Existing non-process shots, audio, transitions, and render outputs remain on the legacy path unchanged.

This milestone creates the architecture boundary that matters, proves it on a high-value procedural family, and leaves the rest of the working renderer intact.
