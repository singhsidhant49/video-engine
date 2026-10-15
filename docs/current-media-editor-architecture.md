# Current-State Architecture Audit: Automated Faceless YouTube Video Engine

**Audit Date:** October 2, 2026  
**Repository:** `d:/projects/videogenerator`  
**Operating Baseline:** Code is Authoritative (milestone documents, past design docs, and deprecated comments are superseded by active implementation).  2
**Document Status:** Ground Truth Current State. No redesign or refactoring proposed.

---

## 1. Executive Summary

The video engine today operates primarily as a **media-first, editorial video assembly system** targeting YouTube Shorts (9:16, 1080x1920) and Landscape videos (16:9, 1920x1080).

Historically, the engine was built around procedural Remotion React components (such as `PhotoShot`, `ProcessShot`, `CompareShot`, `ChartShot`, `StatementShot`, and `DiagramShot`). Following recent architecture milestones (Milestones 15–20), the engine has shifted its default production path to **`MEDIA_EDITORIAL`**, an asset-first compilation pipeline. 

Under `MEDIA_EDITORIAL`:
1. Narration audio is synthesized via a local Kokoro TTS neural service and aligned to word timestamps via Whisper-base.en.
2. The script is segmented into semantic visual beats (action shifts, entity shifts, evidence requirements) rather than arbitrary duration timers.
3. Every shot is directed as a media shot (searching authentic photo and video assets across Wikimedia Commons, Wikipedia, Pexels, Pixabay, and Brave Image Search).
4. Media is resolved, downloaded, hashed, and measured.
5. Geometry and layout are statically solved upfront (`FULL_BLEED`, `IMAGE_PLUS_STAT`, or `LAYERED_MEDIA`) with crop and pan/zoom calculated deterministically based on detected faces, focal subjects, and platform safe margins.
6. The scene is compiled into a JSON `solvedScene` and a declarative `motionPlan`.
7. At render time, Remotion does **not** make layout or crop decisions; it executes a single generic renderer (`GenericSceneRenderer.jsx`) that reads the pre-solved pixel bounding boxes, objectPosition percentages, and motion keyframes.
8. Subtitles are dynamically positioned to avoid focal subjects and faces, styled using contrast analysis (`CLEAN_TEXT`, `SOFT_SCRIM`, or `COMPACT_CAPSULE`), and highlighted per word as spoken.
9. Two layers of automated QA and repair (`runCreativeQaLoop` and `runTimelineQc`) inspect frame-state bounds, canvas occupancy, and continuity before Remotion renders the final MP4.

Legacy procedural graphic shot families remain in the codebase but are **disabled by default in production**.

---

## 2. Current Default Production Mode

### Visual Mode Status
* **Default Mode Today:** **`MEDIA_EDITORIAL`**
* **Active by Default:** **YES**. Controlled by `src/config/visualMode.js: resolveVisualPolicy()` and `DEFAULT_VISUAL_POLICY`.
* **Environment / CLI Flags Controlling Visual Routing:**
  * `--visual-mode <mode>` (CLI): Accepts `MEDIA_EDITORIAL`, `HYBRID`, or `LEGACY_PROCEDURAL`.
  * Defaults to `MEDIA_EDITORIAL` when omitted.
  * In `src/config/visualMode.js`:
    ```javascript
    export const DEFAULT_VISUAL_POLICY = Object.freeze({
      visualMode: 'MEDIA_EDITORIAL',
      useMediaEditorial: true,
      allowSplitLayout: false,
      enableProceduralGraphics: false,
      enableLegacyVisualFamilies: false,
      renderPipeline: 'SOLVED_MEDIA',
      preferRealMediaOverGraphics: true,
    });
    ```

### Reachability of Legacy Procedural / Template Families
* **Reachability:** Reachable **only** if explicitly requested via `--visual-mode LEGACY_PROCEDURAL` or in isolated unit test suites (e.g., `tests/diagrams/`, `tests/composition/`).
* **Condition in Production:** When `--visual-mode` is omitted or set to `MEDIA_EDITORIAL`:
  * `enableProceduralGraphics` is `false`.
  * `enableLegacyVisualFamilies` is `false`.
  * `allowSplitLayout` is `false`.
* **Are diagrams/charts/process/comparison still used automatically?**
  * **NO.** In `MEDIA_EDITORIAL`, `estimateShotDemand` in `src/storyboard/shotPlanner.js` forces `requiresMedia: true` on all shots.
  * In `src/assets/providerRegistry.js`, routes for `DATA` and `CONCEPT` information types are mapped to `ROUTES.DATA = 'auto'` and `ROUTES.CONCEPT = 'auto'`, which route directly to real-media providers (`local-bank`, `wikipedia`, `commons`, `pexels-image`, `brave-image`).
  * Procedural templates (`ChartShot`, `CompareShot`, `ProcessShot`, `DiagramShot`) are **not** selected in normal production runs.
* **Relevant Files:**
  * `src/config/visualMode.js` (`resolveVisualPolicy`, `DEFAULT_VISUAL_POLICY`)
  * `src/pipeline/videoGeneratorPipeline.js` (lines 40–58)
  * `src/storyboard/shotPlanner.js` (lines 45–95)
  * `src/composition/mediaSceneSpec.js` (`strategyFor`)
  * `src/remotion/engine/Video.jsx` (lines 180–200)

---

## 3. Complete Top-Level Execution Flow

The real function-level path from user/CLI request to final rendered MP4 is mapped below:

```
CLI Command: node src/cli/generate.js --topic "..." --format <shorts|landscape>
  │
  ▼
main() [src/cli/generate.js]
  │ (Normalizes options, resolves paths, validates API keys)
  ▼
runVideoGeneration(request, options) [src/pipeline/videoGeneratorPipeline.js]
  │
  ├─► resolveVisualPolicy() [src/config/visualMode.js]
  ├─► JobContext.init() / CheckpointManager
  │
  ├─► Stage 1: "script" 
  │   └─► aiDirectorService.createScript() [src/services/aiDirectorService.js]
  │       ├─► generateOutline() (LLM pass 1)
  │       ├─► generateScriptFromOutline() (LLM pass 2)
  │       └─► compressWordBudget() (deterministic word count governor)
  │
  ├─► Stage 2: "narration"
  │   ├─► ttsService.synthesizeNarration() [src/services/ttsService.js]
  │   │   └─► Kokoro TTS HTTP Container -> speech.wav
  │   ├─► audioAnalysisService.alignNarration() [src/services/audioAnalysisService.js]
  │   │   └─► Whisper-base.en transcription + Needleman-Wunsch word alignment
  │   └─► audioAnalysisService.analyzeAudio() [src/services/audioAnalysisService.js]
  │       └─► ffmpeg ebur128 loudness / true peak analysis
  │
  ├─► Stage 3: "storyboard"
  │   └─► visualStoryboardDirector.createStoryboard() [src/pipeline/visualStoryboardDirector.js]
  │       ├─► shotPlanner.planShots() [src/storyboard/shotPlanner.js]
  │       │   ├─► segmentVisualBeats() (semantic action/entity parser)
  │       │   ├─► estimateShotDemand() (duration & visual shift budget)
  │       │   └─► authorShots() (creates Section -> Scene -> Shot)
  │       └─► durationBudgetDirector.validate()
  │
  ├─► Stage 4: "visualCoverage" (Kept for diagnostics / fallback compatibility)
  │   └─► visualCoverageDirector.createPlan() [src/storyboard/visualCoveragePlan.js]
  │
  ├─► Stage 5: "assets"
  │   └─► assetDirector.resolveAssets() [src/pipeline/assetDirector.js]
  │       ├─► assetRequestPlanner.planAssetRequests() [src/pipeline/assetRequestPlanner.js]
  │       │   └─► mapActionToVisibleQueries() (query ladder & exclusion builder)
  │       ├─► providerRegistry.searchAssetProviders() [src/assets/providerRegistry.js]
  │       │   └─► parallel search: local-bank, wikipedia, commons, pexels, brave, pixabay
  │       ├─► assetIntelligenceScorer.scoreAssetCandidate() [src/assets/assetIntelligenceScorer.js]
  │       │   └─► Semantic + Entity + Format + Resolution + License scoring
  │       └─► assetDirector.materializeCandidate() [src/pipeline/assetDirector.js]
  │           └─► download, sharp probe, aspect check, hash check, fallback to image bank
  │
  ├─► Stage 6: "mediaScenePlanning"
  │   └─► mediaEditorialPlanner.createMediaEditorialPlan() [src/pipeline/mediaEditorialPlanner.js]
  │       ├─► createEditorialVisualBeat() (derives visual change reason & evidence role)
  │       └─► createMediaShotPlan() (derives strategy: FULL_BLEED / IMAGE_PLUS_STAT)
  │
  ├─► Stage 7: "compositionSolving"
  │   ├─► compileSolvedMediaShot() [src/composition/compileSolvedMediaShot.js]
  │   ├─► mediaLayoutSolver.solveMediaLayout() [src/composition/layout/mediaLayoutSolver.js]
  │   │   └─► computes viewport rect, safe margins, objectPosition crop, text box
  │   ├─► mediaMotionChoreographer.planMediaMotion() [src/composition/motion/mediaMotionChoreographer.js]
  │   └─► motionPlanSolver.solveMotionPlan() [src/composition/motion/motionPlanSolver.js]
  │       └─► produces declarative tracks: cameraScale, cameraFocusX, cameraFocusY, opacity
  │
  ├─► Stage 8: "subtitles"
  │   └─► subtitlePlanner.planSubtitles() [src/composition/subtitles/subtitlePlanner.js]
  │       ├─► buildCaptionChunks() (Whisper words -> 2-5 word display cues)
  │       ├─► solveCaptionPlacement() (avoids face/focal subject, enforces safe zones)
  │       └─► analyzeSubtitleContrast() -> CLEAN_TEXT | SOFT_SCRIM | COMPACT_CAPSULE
  │
  ├─► Stage 9: "timeline"
  │   └─► timelineCompiler.compileTimeline() [src/timeline/timelineCompiler.js]
  │       ├─► merges solvedScenes, motionPlans, captions, cutOverlays into timeline schema
  │       └─► audioMixer.mixSoundtrack() (BGM ducking envelope under narration)
  │
  ├─► Stage 10: "preflight"
  │   ├─► preflightSolvedScene() [src/qc/frameStatePreflight.js] (swept bounds, safe area)
  │   ├─► evaluateMediaVisualQuality() [src/qc/mediaVisualQualityGate.js] (occupancy, collision)
  │   └─► buildEditContinuityDiagnostics() [src/qc/editContinuityDiagnostics.js]
  │
  ├─► Stage 11: "creativeQa"
  │   └─► runCreativeQaLoop() [src/qc/creativeQaDirector.js] (Max 2 repair passes)
  │       └─► applyCreativeRepairs() (replaces bad assets, moves captions, simplifies text)
  │
  ├─► Stage 12: "timelineQc"
  │   └─► runTimelineQc() [src/qc/timelineQc.js] (Hard structural gate: coverage, licensing, trace)
  │
  ├─► Stage 13: "render"
  │   └─► remotionRenderService.renderVideo() [src/services/remotionRenderService.js]
  │       ├─► bundles Remotion entry (`src/remotion/index.js` -> `Video.jsx`)
  │       └─► executes Remotion `renderMedia()` -> final MP4
  │
  └─► Stage 14: "renderQc"
      └─► runRenderQc() [src/qc/renderQc.js] (FFmpeg frame probe: blank frames, frozen clips)
```

---

## 4. Video Request and Project Creation

### Configuration Resolution
* **Topic Supply:** Passed via `--topic "<string>"` CLI flag.
* **Duration Supply:** Passed via `--duration <seconds>` CLI flag (defaults: 45s for Shorts, 60s for Landscape).
* **Format Selection:** Passed via `--format <shorts|landscape>` (or `--aspect <9:16|16:9>`).
  * `shorts`: 1080x1920 (Vertical, 9:16)
  * `landscape`: 1920x1080 (Horizontal, 16:9)
* **Niche / Channel Defaults:** Resolved in `src/shared/styles.js: getStyle(styleName)`. Options: `minimal`, `bold`, `editorial`, `technical`, `documentary`. Default is `minimal` (or style resolved from prompt intent).
* **Output / Run Directory Creation:**
  * Runs are created at `renders/runs/video-YYYY-MM-DDTHH-mm-ss/`.
  * Symlinked or copied to `renders/video-YYYY-MM-DDTHH-mm-ss-<format>.mp4`.
* **JobContext Initialization:**
  * Created in `src/core/checkpoints/checkpointManager.js`.
  * Manages `runDir`, `checkpointCache`, `stageRegistry`, step execution, and JSON persistence.
* **Config Hierarchy (Highest to Lowest Precedence):**
  1. Explicit CLI arguments (`--visual-mode`, `--format`, `--duration`, `--style`)
  2. Environment variables (`.env` keys: `KOKORO_ENDPOINT`, `PEXELS_API_KEY`, etc.)
  3. Visual policy resolution (`src/config/visualMode.js: resolveVisualPolicy()`)
  4. Channel / Style token presets (`src/shared/styles.js`)
  5. System defaults (30 fps, 1080p canvas, Kokoro voice `af_sky`)

---

## 5. Script and Content Planning

### Workflow
```
topic + targetDuration + format
  │
  ▼
aiDirectorService.createScript() [src/services/aiDirectorService.js]
  │
  ├─► Step 1: Outline Generation (LLM Pass 1)
  │     └─► Prompt specifies hook, context, explanation, escalation, payoff
  │     └─► Strict beat duration and pacing guidance
  │
  ├─► Step 2: Full Script Generation (LLM Pass 2)
  │     └─► Structured JSON output: title, hook, sections, scenes, narration, visualNotes
  │
  ├─► Step 3: Word-Budget Governor (Pre-TTS Compression)
  │     └─► WPM calculation (Default ~145 WPM for Kokoro)
  │     └─► Target words = (durationSec * 145) / 60
  │     └─► If script exceeds +10% target: deterministic sentence-level trimming
  │
  └─► Output: Canonical Script Object
```

### Schemas and Rules
* **LLM Calls:** Uses Google Gemini (or configured OpenAI-compatible endpoint). Uses structured JSON schema prompts with backoff retries.
* **Hook / Conclusion Logic:**
  * First scene is explicitly flagged as `purpose: "hook"`.
  * Final scene is explicitly flagged as `purpose: "payoff"` or `"conclusion"`.
* **Duration Budget:** Pre-TTS checks guarantee narration length matches target within ±10%. Post-TTS checks verify audio duration against timeline requirements.

---

## 6. TTS + Alignment

### Provider & Architecture
* **TTS Provider:** Local Kokoro Neural TTS Docker/HTTP service (`http://localhost:8880/v1/audio/speech`). Fallback: OpenAI TTS if Kokoro unreachable.
* **Voice Model:** Configured per profile (default female `af_sky`, male `am_adam` or `am_michael`).
* **Cache:** SHA-256 hash of `voice + speed + narrationText` stored in `.cache/tts/`.

### Alignment Engine
* **Alignment Tool:** Local Whisper neural model (`whisper-base.en` via `@huggingface/transformers` / ONNX runtime).
* **Alignment Algorithm:** Needleman-Wunsch global sequence alignment algorithm in `src/services/alignmentService.js`.
* **Timing Output Structure:**
  ```javascript
  {
    text: "Undersea cables carry 99% of all internet traffic.",
    start: 0.12,
    end: 3.45,
    matchRate: 0.99,
    words: [
      { text: "Undersea", start: 0.12, end: 0.65, confidence: 0.98 },
      { text: "cables", start: 0.68, end: 1.12, confidence: 0.97 },
      ...
    ]
  }
  ```
* **Downstream Usage:**
  * Audio word timestamps are converted to exact frames (`frame = Math.round(second * fps)`).
  * Scene boundaries lock to phrase pauses.
  * Subtitles chunk words into 2–4 word cues with millisecond accuracy.

---

## 7. Canonical Storyboard

### Hierarchy
The canonical storyboard structure is strictly **Section → Scene → Shot**:

```
Storyboard (Root)
  └── sections: Array<Section>
        └── scenes: Array<Scene>
              └── shots: Array<Shot>
```

### Fields on `Scene`
* `id`: e.g. `scene-01`
* `sectionId`: e.g. `section-01`
* `narration`: Spoken script text for the scene
* `purpose`: `hook` | `context` | `explanation` | `escalation` | `evidence` | `payoff`
* `visualIntent`: `identify` | `establish` | `explain` | `compare` | `demonstrate`
* `durationInSeconds`: Floating point duration derived from audio alignment
* `startFrame`: Global timeline start frame
* `durationInFrames`: Total frames allocated to this scene
* `shots`: Array of child Shot objects

### Fields on `Shot`
* `id`: e.g. `shot-01-a`
* `storyboardShotId`: Canonical ID preserved across the entire pipeline
* `sceneId`: Parent scene ID
* `sectionId`: Parent section ID
* `narrationSegment`: The subset of narration spoken during this shot
* `from`: Local frame offset from start of clip
* `durationInFrames`: Exact frame length
* `timelineStartFrame`: Global frame offset in the master video
* `visualRequirement`: Visual requirements (e.g. `authentic_photograph_or_footage`)
* `mediaPreference`: `real` | `video` | `auto`
* `semanticBeat`: Beat metadata (subject, action, environment, evidence)
* `presentation`: Layout descriptor (e.g. `{ family: 'image', variant: 'full_bleed' }`)

### Authoritative Downstream Object
* In `MEDIA_EDITORIAL`, the **`Shot`** is authoritative. Every shot maps 1-to-1 to a `solvedScene` and a `motionPlan`.
* `beats` is a deprecated legacy alias that is ignored downstream.

---

## 8. Visual Beat Planning

### Decision Logic: "What to show for this narration?"
Visual beat planning is executed in `src/storyboard/shotPlanner.js`:

1. **Input:** Scene narration text and audio word timings.
2. **Semantic Segmentation (`segmentVisualBeats`):**
   * Scans text for semantic change markers:
     * **Action verbs:** *moves, connects, destroys, transmits, builds, explodes*
     * **Entity changes:** nouns introduced (e.g., *ship, fiber optic cable, shark*)
     * **Contrast / Pivot markers:** *however, but, on the other hand, in reality*
     * **Evidence / Detail markers:** *specifically, under the microscope, measured at*
3. **Shot Demand Estimation (`estimateShotDemand`):**
   * Evaluates scene duration against pace targets (Shorts: 2.2s–4.0s per shot; Landscape: 2.8s–5.5s per shot).
   * If a scene is 6 seconds long and introduces 2 distinct concepts, it demands 2 shots.
   * If a scene is short (≤ 3.5s) or represents a single continuous thought, it stays 1 shot.
4. **Output:** An array of planned shots, each annotated with a `visualChangeReason` (`NEW_IDEA`, `NEW_ENTITY`, `NEW_ACTION`, `DETAIL_SHIFT`, `CONTINUATION`).

---

## 9. Shot Splitting

### Rules
* **Minimum Shot Duration:**
  * Shorts: **1.8s** (54 frames at 30 fps)
  * Landscape: **2.2s** (66 frames at 30 fps)
* **Maximum Shot Duration:**
  * Shorts: **4.5s** (135 frames at 30 fps)
  * Landscape: **6.5s** (195 frames at 30 fps)
* **Semantic Split Logic:**
  * If narration contains an explicit pivot or secondary entity AND remaining duration exceeds the minimum shot duration, the scene is split into multiple shots.
* **Duration Split Logic (Stale Visual Prevention):**
  * If a single scene holds for > 5.5s in Shorts or > 7.0s in Landscape without a natural semantic boundary, the planner splits it into a **detail shot** or a **camera reframe continuation**.
* **Continuation Shots:**
  * The second shot inherits the context of the first shot but requests an alternate perspective (`DETAIL_FOCUS` or `REVERSE_ANGLE`).

---

## 10. Asset Request Generation

### Trace: Narration to `AssetRequest`
* **Narration:** *"Undersea fiber optic cables stretch across the ocean floor to carry data."*
* **Planner Function:** `src/pipeline/assetRequestPlanner.js: mapActionToVisibleQueries()`
* **Ladder Generation:**
  1. **Primary Entity + Action:** `undersea fiber optic cable seabed`
  2. **Primary Entity + Environment:** `deep ocean floor cable laying`
  3. **Visual Concept Alternative:** `submarine communications cable underwater`
  4. **Broad Context Fallback:** `underwater technology ocean depths`
* **Exclusions Generated:** `cartoon, 3d render, vector, drawing, text, watermark, meme`
* **Orientation Requirement:**
  * Shorts: `portrait` (or high-res landscape with crop slack)
  * Landscape: `landscape`
* **AssetRequest Object:**
  ```javascript
  {
    requestId: "req-shot-01-a",
    shotId: "shot-01-a",
    sceneId: "scene-01",
    semanticConcept: "undersea fiber optic cable",
    entity: "fiber optic cable",
    action: "stretch across ocean floor",
    environment: "deep ocean seabed",
    queries: [
      "undersea fiber optic cable seabed",
      "submarine telecommunications cable ocean floor",
      "cable ship laying underwater cable"
    ],
    fallbackQueries: [
      "deep ocean seabed underwater",
      "fiber optic light pulses network"
    ],
    orientation: "portrait", // for Shorts
    mediaTypePreference: "auto",
    evidenceLevel: "DIRECT"
  }
  ```

---

## 11. Asset Providers

### Active Providers
| Provider Name | Media Type | Priority | Search Function | Normalization Function | Licensing / Provenance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`local-bank`** | Image | 1 (Immediate) | `searchLocalBank()` | `normalizeLocalAsset()` | Public Domain / Curated |
| **`wikipedia`** | Image | 2 (High) | `searchWikipedia()` | `normalizeWikipediaAsset()` | CC-BY-SA / Wikimedia |
| **`commons`** | Image | 3 (High) | `searchCommons()` | `normalizeCommonsAsset()` | CC / Public Domain |
| **`pexels-image`** | Image | 4 (Medium) | `searchPexelsImages()` | `normalizePexelsAsset()` | Pexels Free License |
| **`brave-image`** | Image | 5 (Medium) | `searchBraveImages()` | `normalizeBraveAsset()` | Editorial Web Provenance |
| **`pixabay-image`** | Image | 6 (Medium) | `searchPixabayImages()` | `normalizePixabayAsset()` | Pixabay Content License |
| **`pexels-video`** | Video | 7 (Medium) | `searchPexelsVideos()` | `normalizePexelsVideo()` | Pexels Free License |

### Disabled Providers
* **AI Image Generation (Flux/StableDiffusion/DALL-E):** Disabled in `src/assets/providerRegistry.js` (`ALLOW_GENERATED_MEDIA: false`). Only authentic photos and B-roll are retrieved to maintain editorial credibility.
* **YouTube Rip / Third-Party Scrapers:** Disabled due to licensing risk.

---

## 12. Asset Intelligence and Candidate Ranking

The ranking engine in `src/assets/assetIntelligenceScorer.js` scores each candidate out of 100 points:

### Scoring Breakdown
1. **Semantic Match (35%):** Keyword overlap with narration, entities, and actions.
2. **Entity Match (25%):** Exact match of named nouns and physical subjects.
3. **Format & Crop Fitness (32%):** Native aspect ratio match vs. canvas. A 9:16 portrait image for Shorts receives full credit; a wide landscape image receives a penalty unless it has high vertical crop slack.
4. **Resolution Floor (25%):** Minimum 1080px on shortest dimension. Corrupted or low-resolution files (< 720p) are penalized heavily.
5. **Credibility & Licensing (45%):** Explicit CC-BY, Public Domain, or Pexels licenses get maximum score. Unspecified licenses are penalized.
6. **Diversity Penalty:** Candidates sharing domain or identical tags with recently used assets are penalized to prevent visual repetition.

### Disqualifiers
* **Hard Disqualifiers (Rejected Immediately):**
  * `license_unusable`: Commercial or restricted rights.
  * `watermark_risk`: Detected watermark or stock photo overlay tags.
  * `low_resolution_corrupted`: Dimensions < 640px.
  * `format_incompatible_crop`: Cannot be cropped to canvas without losing the subject.
* **Contextual Disqualifiers:**
  * Generic corporate stock cliches (handshakes, puzzle pieces, lightbulb graphics).
  * Out-of-domain mismatches (e.g. a church or cemetery image returned for an internet infrastructure query).

---

## 13. Asset Reselection & Materialization

When candidate #1 fails (download timeout, 404, hash collision, or corrupt image data):
1. **Candidate #2 Evaluation:** The materializer tests candidate #2 from the ranked pool.
2. **Alternate Provider:** If all candidates from Provider A fail or fail crop safety, queries are routed to Provider B (e.g. from Pexels to Wikimedia Commons).
3. **Alternate Query Ladder:** Moves from specific entity query down to broad context query.
4. **Curated Image Bank Fallback:** If all external providers fail, the system selects a curated thematic fallback from `fixtures/image-bank/` matching the domain category.
5. **Emergency Unresolved Media:** If everything fails, an unresolved media placeholder is created and flagged for QA. The pipeline halts before rendering if unresolved media is present in production mode.

---

## 14. Image / Video Metadata

### Populated Metadata
* `dimensions`: Actual `width` and `height` in pixels (probed via `sharp` or `ffprobe`).
* `aspectRatio`: Width / Height.
* `orientation`: `portrait` (AR < 0.85), `landscape` (AR > 1.2), or `square`.
* `focal`: `{ x, y }` normalized coordinates (0.0 to 1.0) derived from subject detection or default rule of thirds.
* `faceBounds`: Detected face bounding boxes (if faces present).
* `subjectSafeRegion`: Bounding box enclosing the primary subject to protect from cropping.
* `qualityTier`: `PRIMARY`, `SECONDARY`, or `FALLBACK`.
* `nativeMotion`: Boolean (`true` for video files, `false` for still images).

### Unused / Gaps
* `negativeSpace` / `safeTextRegions`: Computed geometrically by subtracting `subjectSafeRegion` from the canvas, rather than via computer vision segmentation.

---

## 15. Media Scene Planning

The media scene planner (`src/pipeline/mediaEditorialPlanner.js`) creates a `MediaSceneSpec` for each shot:

### Key Fields
* `shotId`: e.g. `shot-01-a`
* `mediaRole`: `PRIMARY_SUBJECT` | `EVIDENCE` | `ENVIRONMENT` | `METAPHOR`
* `strategy`: `FULL_BLEED` | `IMAGE_PLUS_STAT` | `LAYERED_MEDIA`
* `cameraIntent`: `STATIC` | `SUBTLE_PUSH` | `SUBTLE_PULL` | `FOCAL_PAN`
* `textNeed`: `NONE` | `HEADLINE` | `STAT` | `LABEL`
* `captionMode`: `CLEAN_TEXT` | `SOFT_SCRIM` | `COMPACT_CAPSULE`
* `transitionIntent`: `{ entry: 'CUT' | 'SHORT_DISSOLVE', exit: 'CUT' }`

---

## 16. Media Composition Strategies

### Active Strategies in Production
1. **`FULL_BLEED` (Primary Default, > 90% of shots):**
   * **When Selected:** Single strong subject image or video.
   * **Geometry:** Media fills 100% of canvas (`width: 100%`, `height: 100%`, `objectFit: 'cover'`).
   * **Crop:** Centers on `focal` or `subjectSafeRegion`.
2. **`IMAGE_PLUS_STAT` (Selected when narration features a major metric or percentage):**
   * **When Selected:** Narration contains high-impact numerical data (e.g. *99% of data*, *400 submarine cables*).
   * **Geometry:** Full-bleed background media with a high-contrast stat overlay container placed safely away from the primary subject.
3. **`LAYERED_MEDIA` (Fallback for portrait assets in landscape or landscape assets in Shorts):**
   * **When Selected:** Media aspect ratio drastically mismatches canvas and cropping would destroy the subject.
   * **Geometry:** Foreground media scaled to fit within safe margins; background is the same media zoomed and blurred (36px gaussian blur, 40% dark scrim).

### Inactive / Never Selected Strategies
* **`EDITORIAL_SPLIT` (Two-column half-media / half-text):** Explicitly disabled in `src/composition/mediaSceneSpec.js` and `resolveVisualPolicy` (`allowSplitLayout: false`).
* **`TWO_MEDIA_COMPARE`:** Retained in legacy templates, not selected in `MEDIA_EDITORIAL`.

---

## 17. Crop and Reframe Pipeline

### Image Algorithm (`src/composition/layout/mediaLayoutSolver.js`)
* Uses CSS `object-fit: cover` with explicit `object-position: ${x * 100}% ${y * 100}%`.
* **Focal Point Positioning:**
  * Computes the bounding box of `subjectSafeRegion`.
  * Checks crop slack along the cropped dimension:
    * If width is cropped: `slackX = (assetWidth - targetWidth) / 2`.
    * Centers the visible window around `focal.x` while clamping to `[0, 1]` so no black bars appear.
* **Face Protection:** If faces are detected, `objectPosition` is shifted to prevent the top of the head from being cut off.
* **Shorts Crop:** In 9:16, landscape media loses ~60% of horizontal content. If `subjectSafeRegion` is too wide to fit in 9:16, the shot is flagged for `LAYERED_MEDIA` or alternate asset selection.

### Video Handling
* Videos use `<OffthreadVideo>` in Remotion.
* Videos keep native motion. Synthetic camera moves (pan/zoom) are **disabled** on video assets to prevent conflicting motion sickness.

---

## 18. Landscape Composition (16:9, 1920x1080)

* **Canvas:** 1920x1080.
* **Safe Area Margins:** 96px left/right, 64px top/bottom.
* **Layout Choice:**
  * Full bleed is standard.
  * Captions sit in the lower center (within bottom 160px).
  * Stat overlays or headlines occupy top-left or top-right quadrants depending on where negative space exists relative to the subject.

---

## 19. Shorts Composition (9:16, 1080x1920)

* **Canvas:** 1080x1920.
* **Platform Safe Margins:**
  * Top: 220px (channel bar, sound info header).
  * Bottom: 360px (action buttons, comment overlay, caption scrubber).
  * Right: 140px (like, comment, share icon rail).
* **Vertical Occupancy:** Media must occupy 100% of height in `FULL_BLEED`, or ≥ 60% of canvas height in `LAYERED_MEDIA`.
* **Caption Placement:** Locked to horizontal center (`left: safe.left, width: 100% - safe.left - safe.right`), positioned in the vertical sweet spot (between Y: 1150px and Y: 1450px) where it avoids both the bottom scrubber and center focal subjects.

---

## 20. Camera and Motion Planning

### Camera Modes
1. **`STATIC` (Default for Videos & Fast Cuts):** Scale = 1.0, Focus = constant.
2. **`SUBTLE_PUSH`:** Gentle zoom in from scale 1.00 to 1.06 over shot duration.
3. **`SUBTLE_PULL`:** Gentle zoom out from scale 1.06 to 1.00.
4. **`FOCAL_PAN`:** Slow camera pan from secondary area toward the focal subject.

### Selection Rules
* **Video Clips:** Always `STATIC`. Synthetic zooms over native video motion are forbidden.
* **Short Holds (< 2.2s):** `STATIC`. Insufficient time for viewers to register pan/zoom.
* **Image Shots (≥ 2.5s):** Alternates between `SUBTLE_PUSH` and `SUBTLE_PULL` to maintain visual energy without inducing motion fatigue.
* **Repeated Moves:** Tracked by `editContinuityDiagnostics.js`. Consecutive identical camera moves are flagged and repaired.

---

## 21. Motion Plan Schema

Solved declarative motion plan object (`motionPlans[id]`):

```javascript
{
  id: "motion-shot-01-a",
  shotId: "shot-01-a",
  durationInFrames: 90,
  maximumSimultaneousTracks: 2,
  tracks: [
    {
      targetId: "media_primary",
      property: "cameraScale",
      from: 1.0,
      to: 1.06,
      startFrame: 0,
      endFrame: 90,
      easing: "easeOutQuad"
    },
    {
      targetId: "media_primary",
      property: "cameraFocusX",
      from: 0.5,
      to: 0.52,
      startFrame: 0,
      endFrame: 90,
      easing: "easeInOutQuad"
    }
  ],
  lifecycle: [
    { phase: "ENTER", startFrame: 0, endFrame: 6 },
    { phase: "ESTABLISH", startFrame: 6, endFrame: 24 },
    { phase: "EXPLAIN", startFrame: 24, endFrame: 66 },
    { phase: "EMPHASIZE", startFrame: 66, endFrame: 78 },
    { phase: "SETTLE", startFrame: 78, endFrame: 90 },
    { phase: "EXIT", startFrame: 90, endFrame: 90 }
  ]
}
```

---

## 22. Subtitle Generation

### Pipeline
```
Whisper Word Timings (start/end seconds)
  │
  ▼
buildCaptionChunks() [src/composition/subtitles/subtitlePlanner.js]
  │ (Groups words into natural spoken phrases: 2-4 words per cue)
  ▼
Timeline Caption Cues
  │
  ▼
Captions.jsx [src/remotion/engine/Captions.jsx]
```

### Cue Sizing & Target
* **Target Word Count:** 2 to 4 words per chunk.
* **Line Count:** Strictly 1 line (maximum 2 lines if a long word wraps).
* **Shorts Font Size:** 60px–68px (bold, high legibility for mobile).
* **Landscape Font Size:** 44px–52px.
* **Highlight Logic:** Active spoken word takes theme accent color (e.g. vibrant gold/yellow or cyan); unspoken words remain white with black text shadow.

---

## 23. Subtitle Positioning

* **Solver Function:** `solveCaptionPlacement()` in `src/composition/subtitles/subtitlePlanner.js`.
* **Interaction Safe Area:** Never places text inside the bottom 360px in Shorts.
* **Subject & Face Avoidance:**
  * Checks intersection between `captionBox` and `subjectSafeRegion`.
  * If collision occurs, moves caption vertically to upper-mid zone (Y: 480px) or shrinks caption container.
* **Active Contrast Styles:**
  * `CLEAN_TEXT`: Transparent container with strong text shadow (used when background image is dark/uniform).
  * `SOFT_SCRIM`: Radial dark gradient behind text (used on varied backgrounds).
  * `COMPACT_CAPSULE`: Semi-transparent blurred pill container (`rgba(10, 12, 16, 0.62)` with `backdrop-filter: blur(8px)`).

---

## 24. Subtitle Rendering

* **Remotion Component:** `src/remotion/engine/Captions.jsx`
* **Typography:** Syne / Inter / Archivo loaded via `@remotion/google-fonts`.
* **Shadow:** Double-layer drop shadow (`0 4px 16px rgba(0,0,0,0.92)`).
* **Animation:** Instant entry or subtle 3-frame fade after pauses. No bouncing or erratic scaling that distracts from narration.

---

## 25. Text Overlays

Active non-subtitle text overlay types:
1. **`STAT`:** Giant numerical callout (e.g. *"99%"*, *"< 50ms"*).
2. **`HEADLINE` / `TOPIC_HEADER`:** Contextual category banner for section transitions.
3. **`LABEL`:** Source attribution or geographical location (e.g. *"Atlantic Ocean Basin"*).

Triggered when `mediaSceneSpec.textNeed` is not `NONE`. Rendered through `TextPrimitive` in `GenericSceneRenderer.jsx`.

---

## 26. Text Measurement

* **Implementation:** `src/composition/layout/mediaLayoutSolver.js: measureTextLayout()`
* Uses font metric tables and canvas character-width estimation.
* **Overflow Handling:** If text exceeds bounding box width, font size is dynamically stepped down (down to minimum 22px in Shorts, 18px in Landscape). If still overflowing, words are truncated or simplified via Creative QA.

---

## 27. Scene Change Logic

* **Decision Engine:** `src/storyboard/shotPlanner.js`
* **Visual Change Reasons:**
  * `NEW_IDEA`: Shift in section or core concept.
  * `NEW_ENTITY`: Introduction of a new physical noun.
  * `NEW_ACTION`: Narrative shift to an operation or event.
  * `NEW_EVIDENCE`: Presentation of data, map, or proof.
  * `DETAIL_SHIFT`: Camera zooms into a specific feature of previous subject.
  * `CONTINUATION`: Pacing hold split.

---

## 28. Transition System

* **Default Transition:** **`CUT`** (accounts for ~85% of all cuts).
* **Active Types:**
  * `CUT`: Clean instant frame cut.
  * `SHORT_DISSOLVE`: 6–10 frame cross-dissolve between related contextual shots.
  * `DIP_TO_BLACK`: Used between major thematic chapters (12 frames).
* **Transition Durations:** Centered on cut point (incoming starts 3–5 frames early, outgoing ends 3–5 frames late).
* **Remotion Implementation:** Handled by `ClipFrame` and `CutOverlays` in `src/remotion/engine/Video.jsx`.

---

## 29. Timeline Compilation

* **Compiler Function:** `src/timeline/timelineCompiler.js: compileTimeline()`
* **Assembly:**
  1. Iterates canonical shots and places them on global frame timeline.
  2. Binds each shot to its `solvedSceneId` and `motionPlanId`.
  3. Formats audio track (`narration.wav`, background music with ducking envelope, sound effects).
  4. Formats caption chunks.
* **Authoritative Timeline Schema:**
  ```javascript
  {
    format: "shorts",
    fps: 30,
    durationInFrames: 1192,
    visualMode: "MEDIA_EDITORIAL",
    clips: [
      {
        id: "clip-01",
        from: 0,
        durationInFrames: 105,
        shots: [
          {
            id: "shot-01-a",
            storyboardShotId: "shot-01-a",
            from: 0,
            durationInFrames: 105,
            renderMode: "solved",
            solvedSceneId: "solved-shot-01-a",
            motionPlanId: "motion-shot-01-a"
          }
        ]
      }
    ],
    solvedScenes: { ... },
    motionPlans: { ... },
    captions: { chunks: [ ... ], policies: [ ... ] },
    audio: { narration: "speech.wav", bgm: { ... }, duckingEnvelope: [ ... ] }
  }
  ```

---

## 30. Remotion Entrypoint

* **Root Entrypoint:** `src/remotion/index.js` registers `<Composition id="Video" component={Video} ... />`.
* **Execution Component:** `src/remotion/engine/Video.jsx`
* **Hierarchy:**
  ```
  <Video>
    <ThemeProvider>
      <AbsoluteFill (background)>
        {clips.map => (
          <Sequence (clip.from, clip.duration)>
            <ClipFrame (transitions)>
              <MultiShotClip>
                {shots.map => (
                  <Sequence (shot.from, shot.duration)>
                    <GenericSceneRenderer 
                       solvedScene={timeline.solvedScenes[shot.solvedSceneId]}
                       motionPlan={timeline.motionPlans[shot.motionPlanId]} />
                  </Sequence>
                )}
              </MultiShotClip>
            </ClipFrame>
          </Sequence>
        )}
        <Finish (grain, vignette)>
        <CutOverlays (fades, dips)>
        <Captions (word-synced subtitles)>
        <Soundtrack (ducked audio)>
      </AbsoluteFill>
    </ThemeProvider>
  </Video>
  ```
* **Decisions inside JSX:** Virtually **zero**. The renderer is purely declarative: it reads pre-solved pixel values, pre-calculated matrix transforms, and pre-computed motion keyframes.

---

## 31. Legacy Rendering Paths

| Component / Family | Reachable in Production? | Fallback? | Status Today |
| :--- | :--- | :--- | :--- |
| **`PhotoShot`** | No (Only if `visualMode = LEGACY`) | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`ProcessShot`** | No | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`CompareShot`** | No | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`ChartShot`** | No | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`StatementShot`**| No | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`DiagramShot`** | No | Legacy only | Inactive in `MEDIA_EDITORIAL` |
| **`DynamicMontage`**| No | Legacy only | Inactive in `MEDIA_EDITORIAL` |

*All legacy templates remain imported in `Video.jsx` under `FAMILIES` for test suite backward compatibility, but in production `MEDIA_EDITORIAL`, `MultiShotClip` routes directly to `GenericSceneRenderer`.*

---

## 32. Quality Gates

Pre-render quality stages executed in order:

1. **`preflightSolvedScene` (`src/qc/frameStatePreflight.js`):**
   * Checks: Element bounds inside viewport, text overflow, caption/group collision, swept motion bounds.
   * Severity: Hard failures block timeline compilation.
2. **`evaluateMediaVisualQuality` (`src/qc/mediaVisualQualityGate.js`):**
   * Checks: Subject/caption collision, tiny media region (< 24% of canvas), awkward portrait treatment in landscape, synthetic camera motion on video.
   * Verdict: `STRONG`, `ACCEPTABLE`, `WEAK`, or `FAILED`.
3. **`buildEditContinuityDiagnostics` (`src/qc/editContinuityDiagnostics.js`):**
   * Checks: Consecutive camera moves, consecutive transition types, caption coverage (must be ≥ 95%).
4. **`runCreativeQaLoop` (`src/qc/creativeQaDirector.js`):**
   * Automated repair loop running up to 2 passes.
5. **`runTimelineQc` (`src/qc/timelineQc.js`):**
   * Hard blocking pre-render gate. Any `error` severity check halts rendering immediately.

---

## 33. Frame-State Preflight

* **Sampled Frames:** Frame 0, frame `durationInFrames - 1`, transition boundaries, and every keyframe event in `motionPlan.tracks`.
* **Checks:**
  * `element_outside_viewport`
  * `text_overflow`
  * `minimum_font_size`
  * `caption_collision`
  * `camera_subject_clipped`
  * `camera_resolution_insufficient`
  * `motion_envelope_outside_viewport`
  * `frame0_incompleteness`

---

## 34. Media Quality Gate

* **Scoring Formula:** Base score 5.0, minus 1.2 per hard warning, minus 0.45 per editorial warning.
* **Verdicts:**
  * `STRONG`: Score ≥ 3.75 and 0 warnings.
  * `ACCEPTABLE`: Score ≥ 3.75, 0 hard warnings.
  * `WEAK`: Score ≥ 2.50.
  * `FAILED`: Score < 2.50 or hard disqualifier unresolvable.
* **Rendering Rule:** `FAILED` shots cannot render in production. They trigger automatic reselection or repair.

---

## 35. Video-Level Quality Verdict

* Individual shot verdicts aggregate into the whole-video verdict.
* **Architecture Integrity Rule:** A video cannot achieve `STRONG` overall if any individual shot is `FAILED`. In `timelineQc.js`, any unresolved or failed shot generates a blocking error (`visual-coverage-unresolved`), halting the build.

---

## 36. Repair System

* **Automated Repair Function:** `applyCreativeRepairs()` in `src/qc/creativeQaDirector.js`.
* **Actions:**
  * `REPLACE_ASSET`: Replaces a weak or mismatched candidate with the next ranked candidate.
  * `CHANGE_LAYOUT`: Switches from `LAYERED_MEDIA` to `FULL_BLEED` or vice-versa.
  * `HIDE_CAPTION`: Hides caption cue during large statistical callouts.
  * `SIMPLIFY_TEXT`: Truncates overflowing headline text.
  * `EXTEND_HOLD`: Adds frames to rushed graphic holds.
* **Mechanism:** Repairs recompile downstream solved scenes and update the timeline in memory before re-checking.

---

## 37. Fallback System

Priority order when media or planning fails:
1. **Next Ranked Candidate:** Selects Candidate 2 from provider search.
2. **Alternate Provider:** Switches to Wikimedia Commons or Pexels.
3. **Alternate Query Ladder:** Expands search query to broader environmental terms.
4. **Curated Thematic Local Bank:** Retrieves pre-verified stock from `fixtures/image-bank/`.
5. **Layered Media Fallback:** Applies blurred background frame if orientation mismatches.
6. **Pipeline Halt:** If all fallbacks fail, the engine refuses to render rather than displaying corrupted or ungrounded frames.

---

## 38. Whole-Video Continuity

Tracked in `src/qc/editContinuityDiagnostics.js`:
* **Asset Reuse:** Flags any asset used more than once in the same video.
* **Camera Move Repetition:** Warns if 3 consecutive shots use identical camera moves (e.g. 3 consecutive `SUBTLE_PUSH`).
* **Transition Runs:** Warns if more than 2 non-CUT transitions are chained consecutively.
* **Caption Position Runs:** Prevents erratic jumping of subtitle vertical coordinates between adjacent shots.

---

## 39. Pacing Diagnostics

* **Average Shot Duration:** Target ≥ 1.8s (Shorts) and ≥ 2.5s (Landscape).
* **Rapid Cuts:** Maximum 5 cuts within any rolling 10-second window.
* **Stale Visual Holds:** Shots holding static images for > 6.0s trigger warnings.
* **Blocking vs Informational:**
  * Average shot duration and rapid cuts are **warnings** (informational).
  * Frame coverage holes and missing shot trace IDs are **errors** (strictly blocking).

---

## 40. Cache and Resume System

* **Stage Registry Order (`src/core/checkpoints/stageRegistry.js`):**
  1. `script`
  2. `narration`
  3. `storyboard`
  4. `visualCoverage`
  5. `assets`
  6. `mediaScenePlanning`
  7. `compositionSolving`
  8. `subtitles`
  9. `timeline`
  10. `render`
* **Invalidation Dependencies:**
  * Changing `topic` or `script` invalidates `narration`, `storyboard`, `assets`, `timeline`, and `render`.
  * Changing `voice` invalidates `narration`, `subtitles`, and `timeline`.
  * Changing `visualMode` or `format` invalidates `storyboard`, `assets`, `compositionSolving`, `timeline`, and `render`.
  * Audio cache is preserved in `.cache/tts/` across runs using text content hashing.

---

## 41. Persisted Artifacts

Every standard run generates the following artifacts in `renders/runs/video-<timestamp>/`:

| Filename | Producer | Consumer | Purpose |
| :--- | :--- | :--- | :--- |
| `project.json` | Pipeline Orchestrator | CLI, Pipeline | Job metadata, options, execution timestamp |
| `script.json` | `aiDirectorService` | TTS, Storyboard | Script outline, sections, narration text |
| `speech.wav` | `ttsService` | Alignment, Remotion | Synthesized narration master audio |
| `narration.json` | `audioAnalysisService` | Storyboard, Subtitles | Word-level Whisper timestamps and match rate |
| `storyboard.json` | `visualStoryboardDirector` | Assets, Media Planner | Canonical Section -> Scene -> Shot tree |
| `asset-requests.json` | `assetRequestPlanner` | `assetDirector` | Search queries, exclusions, orientation needs |
| `assets.json` | `assetDirector` | Media Planner, QC | Materialized asset paths, licenses, metadata |
| `editorial-visual-beats.json` | `mediaEditorialPlanner` | Composition Solver | Visual change reasons, media roles, beat specs |
| `media-shot-plan.json` | `mediaEditorialPlanner` | Composition Solver | Shot composition strategies, camera intents |
| `solved-media-scenes.json` | `mediaLayoutSolver` | Timeline, Remotion | Pixel coordinates, crop offsets, safe bounds |
| `motion-plans.json` | `motionPlanSolver` | Timeline, Remotion | Solved camera and emphasis tracks |
| `subtitle-plan.json` | `subtitlePlanner` | Timeline, Remotion | Subtitle cue chunks and placement coordinates |
| `timeline.json` | `timelineCompiler` | Remotion, QC | Master Remotion input contract |
| `preflight.json` | `frameStatePreflight` | Creative QA, QC | Frame-by-frame geometry preflight report |
| `creative-qa.json` | `creativeQaDirector` | Pipeline, QC | Audit before/after automated repairs |
| `timeline-qc.json` | `timelineQc` | Pipeline | Final blocking QC validation report |
| `render-qc.json` | `renderQc` | Pipeline | Post-render pixel verification report |

---

## 42. Current Debugging Flow

If a rendered shot looks incorrect, inspect artifacts in the following sequence:

1. **Wrong Image / Irrelevant Subject:**
   * Inspect `asset-requests.json` → Check `queries` and `semanticConcept`.
   * Inspect `assets.json` → Check candidate scores and selected provider.
   * Debugger: `src/assets/assetIntelligenceScorer.js`.
2. **Bad Crop / Cut-off Subject / Black Bars:**
   * Inspect `solved-media-scenes.json` → Look up `mediaGeometry[shotId]`.
   * Check `crop.x`, `crop.y`, and `objectPosition`.
   * Debugger: `src/composition/layout/mediaLayoutSolver.js`.
3. **Misaligned or Colliding Subtitles:**
   * Inspect `subtitle-plan.json` → Check `geometry.y` and `policy.mode`.
   * Inspect `narration.json` → Verify Whisper word start/end timings.
   * Debugger: `src/composition/subtitles/subtitlePlanner.js`.
4. **Pacing Too Fast / Cuts Erratic:**
   * Inspect `editorial-visual-beats.json` → Check `visualChangeReason`.
   * Inspect `timeline.json` → Check `durationInFrames` and cut points.
   * Debugger: `src/storyboard/shotPlanner.js`.
5. **Remotion Crash or Blank Screen:**
   * Inspect `timeline-qc.json` → Look for blocking errors.
   * Inspect `renders/runs/<run>/timeline.json` → Verify `solvedSceneId` exists in `solvedScenes`.
   * Debugger: `src/remotion/engine/Video.jsx`.

---

## 43. Active vs Dead Code

| Module / Component | Status | Verification & Rationale |
| :--- | :--- | :--- |
| `GenericSceneRenderer.jsx` | **ACTIVE PRODUCTION** | Authoritative renderer for all solved scenes in `MEDIA_EDITORIAL`. |
| `mediaLayoutSolver.js` | **ACTIVE PRODUCTION** | Computes all media crops, safe margins, and coordinate rects. |
| `motionPlanSolver.js` | **ACTIVE PRODUCTION** | Solves all camera pan/zoom keyframes. |
| `subtitlePlanner.js` | **ACTIVE PRODUCTION** | Chunks Whisper words and resolves collision-safe placement. |
| `Captions.jsx` | **ACTIVE PRODUCTION** | Active Remotion subtitle component with word-by-word highlighting. |
| `assetIntelligenceScorer.js` | **ACTIVE PRODUCTION** | Ranks all media candidates. |
| `creativeQaDirector.js` | **ACTIVE PRODUCTION** | Runs 2-pass pre-render repair loop. |
| `diagramQaDirector.js` | **ACTIVE FALLBACK** | Used only during diagram repair in legacy/diagram mode. |
| `visualCoveragePlan.js` | **REGRESSION / DIAGNOSTIC** | Runs during pipeline stage 4, but `MEDIA_EDITORIAL` bypasses its procedural outputs. |
| `families/photo.jsx` | **DEAD / UNUSED** | Superseded by `GenericSceneRenderer` in production. |
| `families/structured.jsx` | **DEAD / UNUSED** | Unreachable unless `--visual-mode LEGACY_PROCEDURAL` is passed. |
| `families/diagrams.jsx` | **DEAD / UNUSED** | Unreachable in default production runs. |
| `families/montage.jsx` | **DEAD / UNUSED** | Replaced by single-shot media compilation. |

---

## 44. Duplicated Authority

Current points of friction where two modules have overlapping or duplicate decision-making:

1. **Shot Count & Duration:**
   * `src/storyboard/shotPlanner.js` calculates shot count via semantic visual beats.
   * `src/storyboard/durationBudgetDirector.js` also calculates target shot counts via duration budgets.
   * *Resolution today:* `shotPlanner.js` takes precedence; `durationBudgetDirector` reports warnings.
2. **Camera Movement Selection:**
   * `mediaEditorialPlanner.js` sets `cameraIntent` (`SUBTLE_PUSH`, `STATIC`).
   * `mediaMotionChoreographer.js` re-evaluates camera behavior based on `cropSlack` and duration.
   * *Resolution today:* `mediaMotionChoreographer.js` can downgrade `SUBTLE_PUSH` to `STATIC` if crop slack is insufficient.
3. **Subtitle Placement:**
   * `subtitlePlanner.js` solves exact `{ x, y, width, height }` bounding boxes.
   * `Captions.jsx` contains fallback CSS positioning (`left: safe.left, bottom: safe.bottom`) if geometry is missing.

---

## 45. Hardcoded and Magic Rules

| Hardcoded Value | Location | Intentional Token vs Tech Debt | Impact |
| :--- | :--- | :--- | :--- |
| **145 WPM** | `aiDirectorService.js` | Intentional Token | Governs script length to match Kokoro speech rate. |
| **Top 220px / Bottom 360px** | `formatContext.js` | Intentional Token | YouTube Shorts UI safe zone protection. |
| **Right 140px** | `formatContext.js` | Intentional Token | YouTube Shorts interactive engagement rail margin. |
| **Scale 1.00 to 1.06** | `mediaMotionChoreographer.js`| Intentional Token | Maximum camera push scale to avoid resolution pixelation. |
| **0.58 Media Height Floor** | `mediaVisualQualityGate.js` | Intentional Token | Minimum vertical canvas occupancy for Shorts. |
| **2 Passes Maximum** | `creativeQaDirector.js` | Intentional Token | Bounded repair loops to prevent infinite compilation cycling. |
| **0.75 Luma Floor** | `renderQc.js` | Tech Debt | Arbitrary pixel brightness cutoff for dark scene detection. |
| **1.8s / 2.2s Shot Floor** | `shotPlanner.js` | Intentional Token | Prevents hyperactive visual fatigue. |

---

## 46. Current Quality Bottlenecks

Ranked by impact, frequency, and risk:

1. **Shorts Horizontal-to-Vertical Crop Loss (High Impact, High Frequency):**
   * High-resolution landscape stock images lose ~60% of their frame when cropped to 9:16. If the focal subject is wide, crops can feel uncomfortably tight.
2. **Provider Diversity & Redundancy (High Impact, Medium Frequency):**
   * Heavy reliance on Pexels and Wikimedia Commons can lead to repeated visual styles or generic stock footage for niche topics.
3. **Face / Subject Bounding Box Precision (High Impact, Medium Frequency):**
   * Subject bounding boxes are currently inferred using rule-of-thirds heuristics or basic color/sharpness centroid detection rather than deep neural segmentation masks.
4. **Video Asset Trim Selection (Medium Impact, High Frequency):**
   * When a 15-second Pexels video is downloaded for a 3-second shot, the engine selects the first 3 seconds rather than identifying the peak visual action.
5. **Subtitle Multi-Line Line Wrapping (Medium Impact, Medium Frequency):**
   * Long words can wrap unevenly in mobile 9:16 if text balance fails.
6. **Sound Effect Spatial Consistency (Low Impact, Medium Frequency):**
   * Sound effect triggers rely on keyword matching without loudness matching against speech.
7. **Brave Image Search Reliability (Low Impact, Low Frequency):**
   * Editorial image links from web search can occasionally return 403 hotlink-protected assets.
8. **Motion Easing Redundancy (Low Impact, High Frequency):**
   * Camera zooms use uniform quadratic easing rather than narrative-aware pacing curves.
9. **Asset Re-download on Cache Miss (Medium Impact, Low Frequency):**
   * Temporary network glitches require re-querying external APIs.
10. **Font Size Scaling Quantization (Low Impact, Low Frequency):**
    * Dynamic text step-down uses integer sizes that can jump noticeably between adjacent titles.

---

## 47. Components Working Well (Do Not Rewrite)

The following architectural components are robust, stable, and verified:

1. **Kokoro TTS + Whisper Needleman-Wunsch Alignment:** Extremely reliable word-level synchronization and zero drift.
2. **Asset Intelligence Scorer (`assetIntelligenceScorer.js`):** Sophisticated scoring with multi-factor weighting, disqualifiers, and diversity penalties.
3. **Decoupled Architecture (`compileSolvedMediaShot` + `GenericSceneRenderer`):** Complete separation of layout math from React rendering.
4. **Preflight and QC Gates (`frameStatePreflight.js` and `timelineQc.js`):** Catches missing assets, gaps, overlaps, and collisions before GPU rendering starts.
5. **Stage Checkpoint & Invalidation System (`checkpointManager.js`):** Reliable resume and caching across multi-minute generation workflows.
6. **Dynamic Caption Word Highlighting (`Captions.jsx`):** Flawless karaoke-style synchronized text highlights.

---

## 48. Real Landscape Shot Trace (16:9)

* **Narration Phrase:** *"Undersea fiber optic cables stretch thousands of miles across the dark ocean seabed."*
* **Visual Beat (`editorial-visual-beats.json`):**
  * `visualChangeReason`: `NEW_ENTITY`
  * `mediaRole`: `PRIMARY_SUBJECT`
  * `semanticBeat`: `{ subject: "undersea fiber optic cable", action: "stretch across seabed", environment: "ocean floor" }`
* **Shot Plan (`storyboard.json`):**
  * `id`: `shot-01-a`
  * `durationInFrames`: 105 (3.50s)
  * `layout`: `image:full_bleed`
* **Asset Request (`asset-requests.json`):**
  * `queries`: `["undersea fiber optic cable seabed", "submarine telecommunications cable ocean floor"]`
  * `orientation`: `landscape`
* **Candidate Selected (`assets.json`):**
  * Source: Wikimedia Commons (`commons-cables-seabed.jpg`, 2560x1440, CC-BY-SA)
  * Score: 88.5/100 (Direct entity match, 16:9 native AR, high resolution)
* **MediaShotPlan (`media-shot-plan.json`):**
  * `strategy`: `FULL_BLEED`
  * `cameraIntent`: `SUBTLE_PUSH`
  * `textNeed`: `NONE`
* **Layout Solve (`solved-media-scenes.json`):**
  * `rect`: `{ x: 0, y: 0, width: 1920, height: 1080 }`
  * `objectPosition`: `50% 50%`
* **Camera Solve (`motion-plans.json`):**
  * Track: `cameraScale` from `1.00` to `1.05` over frames 0–105.
* **Subtitle Cue (`subtitle-plan.json`):**
  * Text: *"Undersea fiber optic cables"*
  * Frames: 0 to 48
  * Style: `CLEAN_TEXT`, bottom center (Y: 960px).
* **Remotion Render (`GenericSceneRenderer.jsx`):**
  * Renders `<Img>` with `objectFit: cover` and animated `transform: scale(1.00 -> 1.05)`.
* **QA Status:** `STRONG`, 0 warnings, passed preflight and timeline QC.

---

## 49. Real Shorts Shot Trace (9:16)

* **Narration Phrase:** *"Over ninety-nine percent of all intercontinental data travels through these thin glass tubes."*
* **Visual Beat:**
  * `visualChangeReason`: `NEW_EVIDENCE`
  * `mediaRole`: `EVIDENCE`
* **Shot Plan:**
  * `id`: `shot-02-a`
  * `durationInFrames`: 96 (3.20s)
  * `layout`: `image:image_plus_stat`
* **Asset Request:**
  * `queries`: `["cross section fiber optic submarine cable", "fiber optic glass fibers close up"]`
  * `orientation`: `portrait`
* **Candidate Selected:**
  * Source: Pexels Image (1080x1920 portrait photo, high resolution)
  * Score: 92.0/100
* **MediaShotPlan:**
  * `strategy`: `IMAGE_PLUS_STAT`
  * `textNeed`: `STAT`
  * `statValue`: `99%`
  * `statLabel`: `Global Data Traffic`
* **Shorts Safe-Area Positioning (`solved-media-scenes.json`):**
  * Canvas: 1080x1920
  * Top Safe Margin: 220px
  * Bottom Safe Margin: 360px
  * Right Rail Margin: 140px
  * Stat Placement: Centered in upper safe quadrant (Y: 340px)
  * Media Occupancy: 100% full vertical bleed
* **Subtitle Placement:**
  * Subtitle cue: *"Over ninety-nine percent"*
  * Target Y: 1320px (comfortably above bottom UI rail, below center stat callout)
  * Style: `COMPACT_CAPSULE` (semi-transparent blur pill).
* **QA Status:** `STRONG`, verified zero overlap between stat, subtitle, and primary subject.

---

## 50. Final Architecture Diagram: Current Production Flow

```
                      +-----------------------------+
                      |       USER / CLI ENTRY      |
                      |    (node src/cli/generate)  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |    VISUAL POLICY RESOLVER   |
                      |   Mode: MEDIA_EDITORIAL     |
                      |   Procedural Graphics: OFF  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |       AI DIRECTOR (LLM)     |
                      | Two-Pass Outline & Script   |
                      | Word-Budget Governor (145W) |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |        TTS & ALIGNMENT      |
                      |  Kokoro Neural TTS (WAV)    |
                      |  Whisper-base.en Alignment  |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |     SEMANTIC SHOT PLANNER   |
                      | Action/Entity Beat Parser   |
                      | Section -> Scene -> Shot    |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   ASSET DISCOVERY & RANKING |
                      | Provider Search (Wiki/Pexel)|
                      | Intelligence Scorer (100pt) |
                      | Sharp / Format Materializer |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |    MEDIA EDITORIAL PLANNER  |
                      | Strategy: FULL_BLEED / STAT |
                      | Camera: STATIC / PUSH / PULL|
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   STATIC COMPOSITION SOLVER |
                      | MediaLayoutSolver (Crop/Pos)|
                      | MotionPlanSolver (Tracks)   |
                      | SubtitlePlanner (Safe Zone) |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   TIMELINE QC & REPAIR LOOP |
                      | FrameStatePreflight (Bounds)|
                      | CreativeQaDirector (2-Pass) |
                      | TimelineQc (Hard Blocker)   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      REMOTION EXECUTION     |
                      | Pure Declarative Pixel Tree |
                      | GenericSceneRenderer.jsx    |
                      | Word-Highlighted Captions   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |      POST-RENDER QC         |
                      | FFmpeg Luma / Frame Probe   |
                      | Output: Final MP4 Video     |
                      +-----------------------------+
```

---

## 52. Semantic Visual Understanding, Editorial Hard Gating & Production Hardening Layer

### 52.1 Semantic Scene Understanding & Two-Stage Vision Reasoning
The engine now explicitly decouples what an asset shows from whether it communicates the narration:
* **Stage A (Asset Description - `VisualInspectionService`):** Operates strictly blind to narration to prevent confirmation bias. Inspects actual pixel metrics (channel standard deviation, luminance, saliency center, primary subject bounds, face detection, style class) and for video samples frames at 10%, 25%, 50%, 75%, and 90%. Outputs a typed `VisualInspection` object:
  ```typescript
  interface VisualInspection {
    assetId: string;
    primarySubject: string;
    secondarySubjects: string[];
    visiblePeople: string[];
    visibleObjects: string[];
    visibleAction: string;
    environment: string;
    visibleText: string[];
    sceneSummary: string;
    communicatedMeanings: string[];
    styleClass: 'DOCUMENTARY' | 'STOCK' | 'TECHNICAL' | 'SCREENSHOT' | 'ARCHIVAL' | 'ILLUSTRATION' | 'ABSTRACT' | 'LIFESTYLE' | 'PRODUCT' | 'UNKNOWN';
    likelyUseCases: string[];
    unsuitableUseCases: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    detectionSources: string[];
  }
  ```
* **Stage B (Editorial Match - `VisualEditorialJudge`):** Compares `VisibleNeed` against `VisualInspection` and outputs `EditorialMatch`:
  ```typescript
  interface EditorialMatch {
    classification: 'DIRECT' | 'CONTEXTUAL' | 'METAPHORICAL' | 'ACCIDENTAL' | 'WRONG';
    subjectMatch: number;
    actionMatch: number;
    environmentMatch: number;
    objectMatch: number;
    meaningMatch: number;
    evidenceMatch: number;
    semanticDistance: number; // 0.0 = identical, 1.0 = unrelated
    confidence: number;
    reasons: string[];
    accept: boolean;
  }
  ```

### 52.2 Pluggable Vision Backend Architecture (`VisionSemanticBackend`)
* `LOCAL_VISION`: Local heuristic computer-vision signals (sharp channel stats, saliency, face boxes, busyness, color tone, style classification).
* `EXTERNAL_VISION`: Optional vision-language model integration when API endpoints/keys are present in environment.
* `METADATA_FALLBACK`: Used only when asset pixels are inaccessible.
* Caching: Both image inspections (`.cache/visual-inspection/`) and video trim analysis (`.cache/video-windows/`) cache deterministically by content hash, backend version, and schema version.

### 52.3 Sequential Hard Semantic Gating Order
Assets must pass sequential gates; earlier gate failures immediately reject candidates and cannot be rescued by later scores:
1. **Gate 1: Technical Validity** (resolution, decode status, permissible license)
2. **Gate 2: Hard Semantic Validity** (`DIRECT`, `CONTEXTUAL`, or permitted `METAPHORICAL`; `ACCIDENTAL` and `WRONG` are unconditionally rejected)
3. **Gate 3: Semantic Confidence** (importance-aware confidence threshold; critical roles like HOOK/EVIDENCE require >= 0.60)
4. **Gate 4: Format Fitness** (aspect ratio matching, landscape-native priority)
5. **Gate 5: Crop Fitness** (focal subject preservation, non-destructive cropping)
6. **Gate 6: Visual Quality** (sharpness, absence of blur/artifacts)
7. **Gate 7: Sequence Fitness** (prevention of metaphor runs and generic stock fatigue)

### 52.4 Lexical Ambiguity Detection & Dynamic Negative Constraints
`buildVisibleNeed` contains an adversarial ambiguity engine detecting polysemous terms:
* `travel` (time travel vs geographical maps)
* `risk` (abstract paradox risk vs wet-floor warning signs)
* `cloud` (cloud computing servers vs atmospheric cumulus clouds)
* `memory` / `leak` (RAM allocation bug vs plumbing water pipe leaks)
* `thread` (CPU multithreading vs textile sewing yarn)
* `packet` (network TCP/IP packets vs postal cardboard boxes)
* `branch` (CPU branch prediction vs botanical tree branches)
* `kernel` (OS kernel panic vs edible corn kernels)
* `network` (protocol layers vs ocean fishing nets)
* `cache` (CPU cache miss vs supermarket cash registers)
* `current` (electric current vs river water rapids)
* `bond` (treasury bond yields vs chemical molecular bonds)
* `virus` (computer malware vs biological pathogens)
* `bank` (financial bank runs vs river banks)
* `deadlock` (concurrency deadlocks vs hardware door padlocks)

### 52.5 Format & Orientation Rules
* **Landscape:** Native 16:9 assets preferred. Portrait assets in landscape are penalized; full bleed crop must satisfy `>= 0.50` or be rejected. Black bars on portrait media are blocked.
* **Shorts:** Semantic validity first. Multi-subject detector flags assets where critical subjects sit on opposite horizontal edges beyond the 9:16 crop window (`multi_subject_split_risk`), rejecting destructive crops.
* **Layered Media:** Emergency fallback only; max consecutive layered shots capped at 2.

### 52.6 Video Trim Window Selection & Cut Boundary Quality
* Evaluates sliding candidate windows across video duration using multi-sample keyframing (10%, 25%, 50%, 75%, 90%).
* Penalizes black starts (-40), overall dark frames (-25), and internal scene cuts inside the window (-30).
* Favors mid-clip action windows (+15) over camera settling (0–2s).

### 52.7 Unresolved Media Repair Ladder & Production Publishability Gate
* **Unresolved Media Mode:** `ALLOW_DEV_PLACEHOLDER` (dev iteration) vs `BLOCK_PRODUCTION` (production enforcement).
* **Publish Modes:** `DEV_RENDER` vs `PRODUCTION_RENDER`.
* **Repair Ladder:**
  1. Next candidate in pool
  2. Alternate provider
  3. Alternate specific query
  4. Broader contextual query
  5. Local curated media bank
  6. Deliberate verified asset reuse with focused detail crop (`deliberateReuseReason`)
  7. Visual requirement simplification
  8. Unresolved blocking failure
* **PRODUCTION_RENDER Gate:** Enforces 0 WRONG, 0 ACCIDENTAL, 0 unresolved critical media, 0 black-bar failures, 0 destructive crops, hook >= ACCEPTABLE, ending >= ACCEPTABLE, and overall sequence verdict >= ACCEPTABLE.

### 52.8 Debug Artifact Flow
The pipeline persists 8 standardized JSON debug artifacts in `renders/runs/<videoId>/`:
1. `visible-needs.json`
2. `asset-query-diagnostics.json`
3. `visual-inspections.json`
4. `editorial-asset-judgments.json`
5. `format-fitness.json`
6. `video-window-selection.json`
7. `visual-sequence-review.json`
8. `editorial-production-qc.json`
