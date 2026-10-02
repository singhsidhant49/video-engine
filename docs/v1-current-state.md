# V1 current state audit

Date: 2026-09-27

Scope: Phase 0 inspection and Milestone 1 data foundation only. This audit describes the repository before the Milestone 1 additions in this change unless a row explicitly says otherwise.

## Executive summary

The repository is a working synchronous Node.js pipeline, not a blank prototype. It already has a normalized editorial plan, deterministic visual direction, phrase-aware frame compilation, real multi-shot playback, media normalization, continuity heuristics, pre-render timeline QC, post-render pixel QC, Kokoro narration, Whisper alignment, and filesystem run artifacts.

The main foundation gap was that these stages exchanged implicit JavaScript objects. There was no top-level job object, runtime schema boundary, or authoritative checkpoint manifest. A failed run left useful artifacts behind, but the engine could not reliably determine which stage completed or whether an artifact matched its expected contract.

The present storyboard also has two parallel creative paths: `visualStoryboardDirector` creates an inspection artifact, while `visualDirector` and the normalized LLM plan actually drive asset selection and timeline compilation. Consolidating those paths is Milestone 2 work, not part of this change.

## Pipeline as implemented

1. `aiDirectorService` generates and normalizes one combined script/editorial/visual plan.
2. Kokoro (or supplied audio/dev TTS) produces narration.
3. Whisper transcription is sequence-aligned back to script words; timing estimation is the fallback.
4. `visualStoryboardDirector` emits beat/scene/shot diagnostics.
5. `visualDirector` deterministically chooses family, variant, camera policy, asset need, and accents.
6. `continuityDirector` adjusts adjacent-scene scale/motion and recommends transitions.
7. `assetDirector` searches a local image bank, Wikipedia, Wikimedia Commons, Pexels, Brave, and Pixabay, downloads/normalizes media, checks licensing, measures relevance, and prevents URL/hash reuse.
8. `timeline` converts aligned words, direction, and assets into deterministic frames, sub-shots, transitions, captions, SFX, and music ducking.
9. The static visual critic may repair timeline presentation; timeline QC can block rendering.
10. Remotion renders registered scene families and multi-shot sequences.
11. Render QC checks duration, blank frames, frozen clips, and brightness; the rendered critic extracts a contact sheet.

## Requirement coverage

| Area | State before Milestone 1 | Evidence and gaps |
| --- | --- | --- |
| 16:9 output | Exists | `landscape` compiles to 1920x1080. The default CLI format is still `shorts`. |
| Cross-niche renderer | Exists | One Remotion engine and family set serves all topics/styles. |
| Per-video visual approach | Partial | The LLM selects a per-video style and deterministic style tokens control craft. There was no explicit `VideoVisualStrategy` artifact. |
| Multi-shot scenes | Partial/working | Timeline bed shots are split on nearby word/phrase boundaries and Remotion renders `clip.shots`. The separate storyboard artifact does not yet author the shots that drive the timeline. |
| Avoid sentence = static image | Partial | Long photo clips can receive up to four bed shots/reframes; long single-shot image clips are criticized. Editorial plan scenes still largely originate one normalized LLM scene at a time. |
| Meaningful/evidence visuals | Partial | Entity-aware Wikipedia/Commons lookup and structured graphics exist. Generic and generated fallbacks can still win for mood/texture requests. |
| Procedural graphics | Exists | Stat, statement, list, process, timeline, chart, compare, UI, code, document, chapter, and ground families exist. |
| Visual continuity | Partial | Adjacent scale/motion checks and timeline repetition checks exist; whole-video rhythm and source/concept memory are limited. |
| Anti-repetition | Partial | Variant history, transition budgets, URL/hash dedupe, camera move history, and QC warnings exist. Layout/concept/source fatigue is not comprehensively modeled. |
| Deterministic render | Exists | Seeded choices and frame math are computed before Remotion. Remotion makes no LLM or network calls. |
| Resumability | Missing | Artifacts existed but no manifest, stage state, validation, or resume command. Milestone 1 adds manifest state only; actual `--resume` remains deferred. |
| Low cost | Exists/partial | Local TTS, local Whisper, filesystem cache, and free media providers are used. Brave/API calls and current generated fallback can add external dependency. |
| Future provider boundary | Missing | Provider functions are imported directly into `assetDirector`; no provider interface yet. The new `AssetRequest`/`AssetCandidate` contracts create the data seam only. |
| Runtime schemas | Missing | All important JSON contracts were implicit. Milestone 1 adds Zod contracts and validates storyboard/timeline/job/checkpoint boundaries. |
| Channel defaults vs video strategy | Missing | Styles are per video, but no `ChannelProfile` inheritance model exists yet. |
| Audio polish | Partial | Speech-aware BGM ducking and sparse event SFX exist. Loudness normalization and section music cues do not. |
| Pre-render QA | Partial | Coverage, timing, repetition, transitions, text, assets, licensing, alignment, and captions are checked. It does not yet validate every requested creative metric or perform layer-specific retry loops. |
| Post-render QA | Partial/working | Duration, blank/frozen frames, brightness, and contact-sheet extraction exist. Codec/audio/silence/peak checks remain. |
| Observability | Partial | Console logs and artifacts exist; there is no structured per-stage duration/cache/provider summary. |

## Module findings

### Pipeline

- `src/pipeline/videoGeneratorPipeline.js`: orchestrates the complete synchronous flow and writes artifacts. Before this milestone it had no job lifecycle or checkpoint manifest.
- `src/pipeline/visualDirector.js`: deterministic scene-family, layout variant, camera, accent, and asset-need selection. It already guards against some repeated photo layouts.
- `src/pipeline/visualStoryboardDirector.js`: already models variable shot counts for longer landscape scenes, but its storyboard is advisory and not the authoritative input to asset/timeline stages.
- `src/pipeline/assetDirector.js`: tightly coupled to provider functions. It has licensing gates, CLIP auditioning, URL/hash duplicate control, and media normalization.
- `src/pipeline/continuityDirector.js`: adjacent-scene scale/motion scoring only; it mutates shallow-copied specs and does not yet reason over sections or full-video rhythm.
- `src/pipeline/timeline.js`: deterministic compiler with phrase-aware cuts, frame ranges, multi-shot beds, overlays, captions, music ducking, and sparse SFX.

### Services

- `aiDirectorService`: one large prompt combines script and visual decisions. Normalization is strong, but editorial analysis and storyboard responsibility are not separate contracts. Extracted claims are labeled `verified` without external fact verification.
- `freeMediaService`: supports local cache, Wikipedia, Commons, Pexels, Brave, Pixabay, and Pexels video. It also contains a pre-existing Pollinations/generated-image fallback. This conflicts with the V1 brief and is explicitly not expanded in Milestone 1; removal/disablement belongs with the asset-provider migration.
- `assetScorer`: exposes semantic and crop-related factors, but still collapses them into one weighted score and does not implement a stock-cliché penalty.
- `alignmentService` and `audioAnalysisService`: robust normalized sequence alignment with Whisper and deterministic estimation fallback.
- `ttsService`: local Kokoro request and WAV output; no cache or loudness normalization.
- `visualCriticService`: catches generic filler, caption collision, and long single-shot photo scenes; it also returns a single 1–10 score, which should become diagnostic metrics in the QA milestone.

### Remotion and QA

- `src/remotion/engine/Video.jsx` already behaves as a registry-backed renderer and can render multiple shot sequences inside one clip.
- `src/remotion/families/` contains substantial reusable photo, editorial, and structured primitives. No new family is needed for Milestone 1.
- `src/qc/timelineQc.js` has useful deterministic pre-render checks and blocks only errors.
- `src/qc/renderQc.js` samples frames using FFmpeg/Sharp but lacks audio integrity and codec checks.
- `src/shared/styles.js` supplies coherent per-video design tokens, pacing, motion, transitions, captions, and layout weights. Some asset flags are documented but not consistently honored by `visualDirector`.

## Milestone 1 changes

- Added Zod schemas for `VideoProject`, `VideoVisualStrategy`, canonical storyboard sections/scenes/shots, `AssetRequest`, `AssetCandidate`, timeline, and checkpoint manifest.
- Added `JobContext` to own per-run configuration, artifacts, status, current stage, and errors.
- Added `CheckpointStore` and `manifest.json` with stage timestamps, durations, artifacts, failures, and skipped stages.
- Added a validated `visual-strategy.json` compatibility default. It is a contract foundation, not yet the Phase 2 strategy selector.
- Upgraded the existing storyboard artifact to the canonical Video → Sections → Scenes → Shots shape while retaining `beats` as a compatibility alias.
- Added validation at storyboard and timeline write boundaries.
- Preserved existing artifact names and rendering inputs.

## Intentionally untouched in this milestone

Asset provider abstraction, AI fallback removal, semantic query planning, separate relevance/presentation ranking, cliché penalties, video asset memory, continuity V2, new scene primitives, audio mastering, repair loops, actual resume/cache execution, channel profiles, fixture generation, and golden renders remain later milestones.

