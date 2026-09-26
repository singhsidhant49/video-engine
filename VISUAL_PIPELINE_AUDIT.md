# Visual Pipeline Audit — Why the Videos Don't Look Professionally Produced

**Date:** 2026-09-26 · **Scope:** topic input → final MP4, TTS excluded · **Codebase:** `b9895ee`

## How this audit was done

1. I read every source file in `src/` (about 7,300 lines).
2. I ran the real pipeline stages end to end, skipping only TTS: `generateDirectorPlan` (fallback plan, no API key) → `analyzeAudioAndTiming` (Whisper) → `fetchUniversalMedia` → `ensureSoundEffects`/`ensureBackgroundMusic` → `bundle` → `renderStill` + `renderMedia`.
3. Audio was an 18.7s WAV (24 kHz, 16-bit, mono) whose words match the plan's `audioScript` exactly. I generated it with macOS `say` as a stand-in for Kokoro, because the only file in the repo (`public/audio/test_whisper.wav`, about 8s) doesn't match any script.
4. I sampled frames at 15%, 50% and 90% of every scene and extracted frames from the final MP4.
5. I pulled the real source of 33 templates from the ReactVideoEditor MCP server (`https://www.reactvideoeditor.com/api/mcp`) and checked each one for Remotion compatibility.

The harness lives outside the repo, in the session scratchpad. Two things in this document come from measurement, not only from reading code: the frame numbers and the caption drift table.

---

## Executive summary

The output does not look "not premium enough". It looks broken in ways that read as low-budget, and some of it is outright bugs. In priority order:

1. **Every scene after the first plays frozen, and some elements never appear.** Scenes run inside `<Sequence>`/`TransitionSeries`, where `useCurrentFrame()` is local, but several components subtract the global `startFrame` again. Their animation clock stays at 0 for the whole scene.
2. **The picture runs ahead of the voice, then goes blank at the end.** Each transition overlaps 8 frames, and the timeline never compensates. In the test render the visuals ended at frame 536 of 563, so the closing line ("…sixty trillion dollars of wealth worldwide") played over an empty background.
3. **Captions show the wrong words.** Whisper tokens are mapped to script words by array index. As soon as Whisper splits or merges a word ("bailout" → "bail out", "sixty trillion dollars" → "$60 trillion"), every following caption is 1–3 words off. The last caption rendered "WORLDWIDE. WORLDWIDE."
4. **The dominant visual is almost never a full-frame image.** The "full-bleed" archival shot is a letterboxed `contain` image in an 82%×76% box over a blurred copy of itself at 35% brightness. Every other scene is a small centered object on a near-black void. Measured mean frame brightness is about 5–25% for most of the video.
5. **Type is set for a webpage, not a 1080×1920 video.** Labels are 11–22px, body text 18–30px, captions 30–40px, and the "hero" words and numbers are 58–102px. On a phone, most of that text is unreadable.
6. **The plan has one shot per sentence and no sub-shot structure.** A sentence becomes one scene with one `type`, one asset and one camera value. Nothing can change inside a 4–5s scene, so every scene is an entry animation followed by several seconds of stillness.
7. **The AI decides *layouts*, not *editorial intent*.** DeepSeek picks from 14 template names and fills free-form `params` with no schema. Templates then fill any missing field with hard-coded demo content ("Data Ingestion / AI Processing", "ALEXANDER THE GREAT", a fabricated quote attributed to Carl Sagan), and that content ends up in real videos.
8. **Everything shares one visual recipe:** dark glass card, 1.5px white border, `backdrop-filter: blur`, colored glow, and a `spring()` scale-in from 0. That sameness is what makes it read as "template".
9. **The asset pipeline returns the wrong images.** In the test run, 3 of 4 scenes fell through to generic fallbacks. The "Lehman Brothers" scene showed a stock photo of laptops on a desk, from the *technology* pool, in a finance video.
10. **The system is hard-wired to 30–38 second vertical Shorts.** The director prompt enforces 75–90 words and a 5-beat Shorts arc. Every pixel value, SVG `viewBox`, image-orientation filter and AI image size assumes 9:16. "LandscapeExplainer" is the same component at 16:9. Long-form faceless YouTube video, which is the stated goal, is architecturally unsupported.

Items 1–3 can be fixed in about a day and account for a large share of the "amateur" feel. Items 4–10 need the architecture change described in §E.

---

## A. Root causes (traced to code)

### A1. Frozen scenes — local frame minus global `startFrame`

`renderScene()` passes the scene's *global* start frame into every component ([DynamicShorts.jsx:272](src/remotion/compositions/DynamicShorts.jsx#L272) and every other `case`). The component is already mounted inside a `TransitionSeries.Sequence`, so `useCurrentFrame()` returns a frame relative to the scene. Several components subtract `startFrame` anyway:

| Component | Line | Effect for any scene not starting at frame 0 |
|---|---|---|
| `ArchivalDocumentaryShot` | [ArchivalDocumentaryShot.jsx:14](src/remotion/scenes/ArchivalDocumentaryShot.jsx#L14) | `relFrame` stays 0: no pan or zoom. The date badge uses `scale(spring(0)) = scale(0)`, so it **never appears** |
| `ProcessFlowScene` | [ProcessFlowScene.jsx:7](src/remotion/scenes/ProcessFlowScene.jsx#L7), [:68-78](src/remotion/scenes/ProcessFlowScene.jsx#L68-L78) | Step springs evaluate at frames −4, −12, −20, so all steps render at `scale(0)`. **The steps are invisible**; only the pill and the title show |
| `BrowserScene`, `TerminalScene`, `CodeWindow` | `:7`, `:6`, `:16` | URL, terminal and code typing never start |

**Measured:** MP4 frames 158 and 165 (scene 2, archival) are pixel-identical, and the `NEW YORK, 2008` badge is absent in every frame.

Other components (`KineticImpactWordShot`, `MetricHeroScene`, all `templates/*`) use `Math.max(0, frame)` and happen to work. So the codebase has two incompatible timing conventions.

### A2. Picture drifts ahead of audio and ends early

[DynamicShorts.jsx:110-137](src/remotion/compositions/DynamicShorts.jsx#L110-L137) builds a `TransitionSeries` of sequences with `durationInFrames = endFrame − startFrame`, plus an 8-frame `Transition` before every scene except the first ([:33](src/remotion/compositions/DynamicShorts.jsx#L33), [:118-123](src/remotion/compositions/DynamicShorts.jsx#L118-L123)). In a `TransitionSeries`, each transition *overlaps* its neighbours, so the total length shrinks by 8 frames per cut. `qualityControlPass` forces a transition onto every scene ([aiDirectorService.js:277-281](src/services/aiDirectorService.js#L277-L281)).

Two further errors add to the drift:
- The pauses between sentences are thrown away. `analyzeAudioAndTiming` gives scene 2 `startFrame: 160` while scene 1 ends at 156 ([audioAnalysisService.js:153](src/services/audioAnalysisService.js#L153)). `TransitionSeries` ignores `startFrame` and packs the sequences back to back, so a 4-frame gap disappears at every cut.
- The `<Sequence from={startFrame}>` fallback ([:140-155](src/remotion/compositions/DynamicShorts.jsx#L140-L155)) respects `startFrame`. The same plan therefore produces different timing depending on whether *any* scene has a transition.

**Measured:** the audio is 563 frames and the visuals end at frame 536. From frame 536 on, the frame is the empty composition background (mean RGB about 9,3,14). Scene 3's visual starts entering at frame 271, 19 frames (0.6s) before its sentence; scene 4 enters at frame 389, 26 frames (0.9s) early. The error grows with every cut. A 12-scene video would end about 2.9 seconds early.

### A3. Captions show the wrong words

[audioAnalysisService.js:62-83](src/services/audioAnalysisService.js#L62-L83) takes the text for Whisper chunk *i* from `originalWords[i]`, the *i*-th whitespace token of the script. Whisper does not tokenize the way the script does: it splits compounds, merges numbers and normalizes "sixty trillion dollars" to "$60 trillion". From the first mismatch on, each script word carries a neighbouring word's timestamps.

Measured subtitle chunks (script word → the Whisper word whose timing it received):

```
338–360  "bailout, the panic"      ← timed as "bail", "out,", "the"
360–389  "spread across global"    ← timed as "pan", "expressed", "a"
456–485  "destroying sixty trillion" ← timed as "credit", "and", "destroying"
534–563  "worldwide. worldwide."   ← index ran past the script; fallback used whisper text
```

The same index cursor drives scene boundaries ([:143-184](src/services/audioAnalysisService.js#L143-L184)). Cuts drift by the same offset, and the drift compounds over a long video.

Secondary timing issues:
- Captions are fixed 3-word chunks ([:118-137](src/services/audioAnalysisService.js#L118-L137)) with no awareness of phrases or punctuation. For example, "buy. When the" sits in one chunk that straddles a sentence and a scene cut.
- Whisper only runs on `.wav` input ([:45](src/services/audioAnalysisService.js#L45)). `samples/32768` assumes 16-bit PCM, so a 24-bit or float WAV silently falls back to the weighted-length estimate, which is not real timing.
- `whisper-tiny.en` is the least accurate Whisper model. It misheard "subprime" as "supply" in this run.

### A4. Images are presented as slides, not shots

- **Archival shot is not full-bleed.** [ArchivalDocumentaryShot.jsx:85-100](src/remotion/scenes/ArchivalDocumentaryShot.jsx#L85-L100) uses `backgroundSize: 'contain'` inside an 82%×76% box with rounded corners and a drop shadow, over the same image blurred and at 35% brightness ([:59-71](src/remotion/scenes/ArchivalDocumentaryShot.jsx#L59-L71)). That is the exact look of a photo slideshow app. `SHOT_LIBRARY.md` says "No center headline box! Let the archival media fill the 1080x1920 canvas"; the code does the opposite.
- **Every other scene uses its image only as a blurred, darkened backdrop:** `blur(16–26px) brightness(0.20–0.35)` in Kinetic, Metric, Chart, Typography and all three `backgrounds/*`. The one component that does true `cover` Ken Burns, `CinematicMediaScene.jsx`, **is not imported anywhere**.
- **The camera barely moves, then stops.** `Camera.jsx` drives scale with a `spring()` that settles in about 1s ([Camera.jsx:21-25](src/remotion/components/Camera.jsx#L21-L25)), reaching 1.04×, so the frame is static for the rest of the scene. Pans are ±10px on a 1080px frame ([:53](src/remotion/components/Camera.jsx#L53)), which is imperceptible. The same 3D `rotateX/rotateY` wobble is applied to *everything*, including text and cards ([:114](src/remotion/components/Camera.jsx#L114)). On text, 1° perspective tilts read as "cheap 3D", not camera movement.
- **The archival shot's own push-in is capped** at 180 frames and 1.07× ([:24-38](src/remotion/scenes/ArchivalDocumentaryShot.jsx#L24-L38)). With the A1 bug it never runs at all.

### A5. Text is too small, and hierarchy comes from a centered stack

Sizes at a 1080px canvas width:

| Element | Size | File |
|---|---|---|
| Notification body / meta | 18px / 11px | `NotificationPopTemplate.jsx:85-125` |
| Quote author / role | 18px / 13px | `QuoteCardTemplate.jsx:107-119` |
| Stat label / trend | 16px / 13px | `StatCounterTemplate.jsx:138-159` |
| Evidence masthead / body | 13px / 22px | `EvidencePaperShot.jsx:110, 142` |
| Split comparison description | 20px | `SplitComparisonScene.jsx:79` |
| Captions | 30–40px | `AnimatedCaptions.jsx:40-42` |
| Kinetic "impact" word | 58–102px | `KineticImpactWordShot.jsx:30` |
| Metric hero number | 58–92px | `MetricHeroScene.jsx:30` |

For comparison, professional Shorts captions run about 64–90px, hero numbers 200–400px, and nothing on screen is under about 36px. `SHOT_LIBRARY.md` itself asks for "128px" metrics and "70% of screen" words.

Beyond size:
- **One layout:** every component uses `flex` + `alignItems: center` + `justifyContent: center`, so each frame is a small centered cluster with about 60–70% empty dark space (visible in every sampled still).
- **Emphasis by glow only:** `textShadow: 0 0 50px accent` appears everywhere. With no grid, no alignment variety and no editorial layout, glow becomes the only emphasis device.
- **Fonts load unreliably.** They come in through CSS `@import` inside a `<style>` tag, twice ([DynamicShorts.jsx:93-96](src/remotion/compositions/DynamicShorts.jsx#L93-L96) and `global.css:1`). There is no `delayRender`/`@remotion/google-fonts`, so nothing guarantees they have loaded before frames are captured. Eight font families are loaded, and components mix Plus Jakarta, Inter Tight, Outfit, Playfair, Newsreader and Cinzel with no per-video typographic system.

### A6. The scene model can't express an edit

The entire contract is the example schema in the director prompt ([aiDirectorService.js:117-131](src/services/aiDirectorService.js#L117-L131)):

```json
{ "id", "type", "voiceoverSentence", "sfx", "transition", "camera": {movement, speed}, "params": { ...free-form } }
```

The following are missing (details in §C3):
- **No purpose or intent** (hook, context, evidence, reveal, payoff) that code could reason about.
- **No beats inside a scene.** A scene cannot say "hold the image, then at the word 'billions' bring in the number".
- **No word anchors.** Timing is inferred from the sentence's word count (A3).
- **No asset slots.** There is one query per scene and one image; secondary assets, image sequences and composites are impossible.
- **No framing or focal point:** crop, subject position, safe area.
- **No typography role:** kicker, headline, number, label.
- **No emphasis words and no intensity value** for pacing.
- **No continuity links** to the previous or next shot.
- **No typed params.** The `process_flow` entry says only "3-step execution blueprint" ([:99](src/services/aiDirectorService.js#L99)) and never defines `steps`, so real videos get the demo defaults `Data Ingestion / AI Processing / Automated Output` ([ProcessFlowScene.jsx:10-14](src/remotion/scenes/ProcessFlowScene.jsx#L10-L14)). The old `VIDEO_QUALITY_AUDIT.md` flagged exactly this in the Airbnb video, and it is still live.

### A7. The AI picks templates; nobody directs

- The prompt hands DeepSeek a menu of 14 named layouts ([aiDirectorService.js:88-101](src/services/aiDirectorService.js#L88-L101)) and a fixed 5-beat arc that prescribes a layout per beat ("Beat 4: Massive glowing metric hero with shock camera shake", [:71-76](src/services/aiDirectorService.js#L71-L76)). So every video has the same shape: impact word, photo, chart or split, metric, payoff.
- **The "variety enforcement" ignores content** ([:253-258](src/services/aiDirectorService.js#L253-L258)). If two consecutive scenes share a type, the second becomes `archival_documentary`, even when it was a statistic with no image query.
- **The style archetype is picked by regex, and the regex misfires** ([:204-214](src/services/aiDirectorService.js#L204-L214)). `/history|war|…/` matches "soft**war**e" and "re**war**ds", so "How software ate the world" gets the *history documentary* image anchors and the bokeh background. The LLM also returns its own `archetype`, which overrides the regex result for the background but not for the image style anchor, so the two can disagree.
- **Palette discipline is missing.** The LLM invents hex colors per video *and* per scene (`accentColor` in each scene's `params`; the fallback plan mixes `#38bdf8` into a `#fbbf24`-accent video). Meanwhile many components ignore the palette entirely: `ProcessFlowScene` is hard-coded `#38bdf8`, `SplitComparisonScene` is hard-coded red top / green bottom / cyan divider (which the old audit showed colouring "Worthless Currency" green), and the backgrounds of `EvidencePaperShot`, `KineticImpactWordShot` and `MetricHeroScene` are hard-coded.
- **SFX on every cut.** The prompt *requires* an `sfx` for every scene ([:84](src/services/aiDirectorService.js#L84)), and the composition adds a whoosh to any scene without one ([DynamicShorts.jsx:207](src/remotion/compositions/DynamicShorts.jsx#L207)). A boom or whoosh every 4 seconds is a hallmark of amateur edits.

### A8. The asset pipeline returns irrelevant or poor images

[freeMediaService.js](src/services/freeMediaService.js):
- Query priority is `assetQuery` → `wikiQuery` → … ([:20](src/services/freeMediaService.js#L20)). The full descriptive `assetQuery` ("Lehman Brothers headquarters 2008") is sent as a Wikipedia *page title* ([:40](src/services/freeMediaService.js#L40)) and returns 404. The precise `wikiQuery: "Lehman Brothers"` is never tried.
- The first Commons search hit is accepted with no relevance, resolution or aspect check ([:75](src/services/freeMediaService.js#L75)). The only quality gate is "file larger than 4KB" ([:29](src/services/freeMediaService.js#L29)).
- Pexels and Pixabay always request `orientation=portrait` ([:99](src/services/freeMediaService.js#L99), [:129](src/services/freeMediaService.js#L129)), and Pollinations always generates 1080×1920 ([:160](src/services/freeMediaService.js#L160)), even for landscape. Pixabay is skipped entirely without a key, although the log still claims it was tried.
- The fallback category defaults to `technology` ([:251](src/services/freeMediaService.js#L251)), and the regex only sees the query, not the video's topic. Result: Lehman Brothers and US Treasury scenes got laptop and office stock photos.
- There is one image per scene, fetched sequentially. No candidates are ranked, nothing is de-duplicated across scenes, nothing is cached across runs, and no video clips are ever used.
- Images are inlined as base64 data URLs in `inputProps` ([videoGeneratorPipeline.js:71-75](src/pipeline/videoGeneratorPipeline.js#L71-L75)). A 4-scene test produced **5.4 MB of props**, and a 10-minute video would produce hundreds of MB. They are rendered via CSS `background-image`, which Remotion does not wait for (no `<Img>`/`delayRender`), so a frame can be captured before its image decodes.

### A9. Fabricated content is displayed as fact

Templates fall back to invented specifics whenever a field is missing:
- A quote attributed to "Dr. Carl Sagan, *Cosmos* (1980)" ([QuoteCardTemplate.jsx:13-15](src/remotion/templates/QuoteCardTemplate.jsx#L13-L15)).
- "ALEXANDER THE GREAT" ([LowerThirdTemplate.jsx:13](src/remotion/templates/LowerThirdTemplate.jsx#L13)).
- A "WALL STREET JOURNAL" breaking alert ([NotificationPopTemplate.jsx:13-15](src/remotion/templates/NotificationPopTemplate.jsx#L13-L15)).

`evidence_paper` renders LLM-invented "CONFIDENTIAL" documents attributed to real agencies. The fallback plan shows one from the "DEPARTMENT OF THE TREASURY". For a documentary-style channel this is a credibility and misinformation risk as well as a quality one: fabricated primary sources and misattributed quotes are what get channels flagged. Visual evidence should be either real (sourced) or clearly stylised illustration. It must never be a fake document presented as genuine.

### A10. The sound reads as synthetic

- The music bed is a 45-second sine-wave pad generated in code ([sfxGeneratorService.js:76-105](src/services/sfxGeneratorService.js#L76-L105)). It is looped at a fixed 0.12 volume with no ducking under speech ([DynamicShorts.jsx:203](src/remotion/compositions/DynamicShorts.jsx#L203)), so the loop point is audible every 45s in long-form.
- The SFX are oscillator plus noise bursts, regenerated with `Math.random()` on **every run**. Each run rewrites the tracked files `public/audio/sfx/*.wav`; my audit run dirtied the git tree, which I restored. No two renders sound the same.

### A11. Render settings are defaults

`renderMedia` passes no `crf`, `jpegQuality`, `imageFormat` or `x264Preset` ([videoGeneratorPipeline.js:129-142](src/pipeline/videoGeneratorPipeline.js#L129-L142)). `remotion.config.mjs` only affects the CLI. The pipeline therefore renders JPEG intermediates at default quality, then applies a full-frame CSS `filter` ([DynamicShorts.jsx:105](src/remotion/compositions/DynamicShorts.jsx#L105)) on top of animated SVG turbulence grain that is re-seeded every 2 frames ([:171-191](src/remotion/compositions/DynamicShorts.jsx#L171-L191)). Dark gradients plus noise plus JPEG plus a platform re-encode produce banding and blocking in exactly the dark areas that dominate these frames.

---

## B. Existing strengths — keep these

- **The pipeline shape is right.** Topic → LLM plan → TTS → word timing → assets → Remotion render → MP4 is the correct skeleton. `createFacelessVideo()` is small and easy to restructure.
- **Word-level timing is already in the loop.** The Whisper integration works (50 word timestamps extracted in the audit run). Only the *mapping* is wrong (A3).
- **The team already thinks about variety:** the palette per video, the archetype concept, the "zero text duplication" rule, sourcing real entities from Wikipedia/Commons, and the safe-zone notes in `frame.md`. The intent in `DIRECTOR.md`, `SHOT_LIBRARY.md` and `frame.md` is largely correct; the implementation doesn't honour it.
- **`@remotion/transitions` is already a dependency**, so a proper transition system doesn't require new infrastructure.
- **Some components have worthwhile ideas:** the highlighter stroke in `EvidencePaperShot` (strokeDashoffset draw-on), the line draw-on in `AnimatedDataCrashShot`, the full-bleed cover treatment in the unused `CinematicMediaScene`, and the word-level active highlighting in captions.
- **The fallback director plan is useful as a deterministic test fixture.**

---

## C. Critical weaknesses by area

### C1. Architecture
- **One LLM call does script, editorial plan, palette and SFX together, in one JSON document.** It is unvalidated, unschematized and not retried. `JSON.parse` failure silently switches to the Lehman Brothers fallback video, whatever the topic ([aiDirectorService.js:198-201](src/services/aiDirectorService.js#L198-L201)).
- **Visual planning happens *before* the audio exists.** Timing is then force-fitted, and the planner never knows how long a sentence actually takes.
- **There is no intermediate representation** between "LLM JSON" and "React props". The Remotion layer both *interprets* intent (switch on 50 type aliases) and *renders*.
- **No component contract.** Each scene redefines its own background, safe area, fonts and colors. There are two frame conventions (A1), and some scenes paint their own full background while others rely on `DynamicBackground`.
- **Dead code hides the real surface area:** `aiScriptService.js`, `assetService.js`, `CinematicMediaScene`, `ChartScene`, `DiagramScene`, `TimelineScene`, `StockScene`, `ConceptCard`, `StatsCard` and `AudioWaveform` are never imported. `Root.jsx` default props use obsolete types (`headline`, `concept_card`) that fall through to the archival default, so Remotion Studio previews are meaningless.
- **Built for Shorts only:** 30–38s, 9:16 pixels and prompt, a hard 95-word cap. There is no chapter or section concept for long-form.
- **Flags that do nothing:** `--theme` in `cli/generate.js:17` is parsed and passed, but `createFacelessVideo` has no `theme` parameter.

### C2. AI prompting
- The prompt is written as marketing copy ("elite, human-level", "Vox, Johnny Harris") rather than as a constrained editorial spec.
- It asks for layout names rather than communicative intent, and prescribes a layout per beat, which guarantees sameness.
- The model is asked to invent hex palettes, SFX and camera speeds. It is bad at these, and deterministic code does them better.
- There are no examples of good *visual text* (short claim, number plus unit, 2–4 word kicker) versus bad (paraphrased narration).
- No source of truth: the model invents numbers, quotes and documents with no instruction to mark them as illustrative or tie them to the narration.
- `temperature: 0.75` with `json_object` mode and no schema produces field-name drift (`heading` vs `headline` vs `title`), which the components paper over with `params.a || params.b || DEMO_DEFAULT`.

### C3. Scene planning
- One sentence maps to one scene with one visual (A6), so pacing is set by sentence length. Long sentences give 6–8s static holds; short ones give jittery 1.5s cuts.
- There is no concept of an A-roll bed (continuous imagery) with B-roll inserts and graphic overlays on top.
- **Missing fields:** purpose, visual concept, primary/secondary asset slots, framing and focal point, text role, emphasis words, intensity, beats, continuity, per-shot SFX intent, caption policy.

### C4. Visual selection
- Selection is made once per sentence from a flat menu, with no scoring of *fit* ("is this sentence a statistic, a comparison, a list, a place, a person, a process?").
- Nothing checks that the chosen type has the data it needs, so a chart with no numbers renders the demo defaults.
- Assets are picked by the first search hit (A8), with no semantic check that the image depicts the subject.

### C5. Composition
- Every frame is a centered stack on a dark void. There is no layout grid, no rule of thirds, no asymmetric editorial layouts, no full-bleed photography with type locked to the image's negative space.
- Global dimming (per-scene blur and brightness 0.2–0.35, the master `brightness(0.97)` filter and the 60% radial vignette) crushes everything. The measured mean luminance of most frames is below 10%.
- Captions (bottom 18%) and scene text (center) compete in every frame. There is no rule for when captions yield to on-screen type.

### C6. Motion
- **Every element enters with the same move:** `spring()` scale 0→1 (Metric, Kinetic, Quote, Stat, Polaroid, Evidence, Notification, Lower Third, Title, Typography, Process). Nothing exits, nothing is choreographed as a sequence, and nothing responds to the narration after the first ~0.7s.
- Perpetual loops with no purpose: the metric `pulse` sine ([MetricHeroScene.jsx:20](src/remotion/scenes/MetricHeroScene.jsx#L20)), the ProcessFlow "packet" dot cycling every 1.5s, and bokeh drifting at constant speed.
- Camera "motion" is imperceptible, then static (A4). Shake is used as punctuation on metrics, which is overused in amateur edits.
- `AnimatedCaptions` re-springs the whole caption pill on every 3-word chunk ([:27-31](src/remotion/components/AnimatedCaptions.jsx#L27-L31), [:50](src/remotion/components/AnimatedCaptions.jsx#L50)): a pop every ~0.8s for the entire video. CSS `transition` ([:102](src/remotion/components/AnimatedCaptions.jsx#L102)) has no effect in a frame-by-frame render.
- The chart's value text flips from start to end at 50% progress instead of counting ([AnimatedDataCrashShot.jsx:105](src/remotion/scenes/AnimatedDataCrashShot.jsx#L105)). The curve is one hard-coded Bézier, not data.

### C7. Typography
- Sizes are far too small (A5). There is no type scale, no tokens, and no per-format scaling (the same px values at 16:9).
- There is no font-loading guarantee, and 6+ families are mixed arbitrarily per component.
- Nothing fits text to its box. Sizes step on character count (`len > 13 ? 58 : …`) and `wordBreak: 'break-word'` can split words mid-token.
- All-caps plus heavy glow plus 900 weight everywhere. With no contrast between display and text styles, hierarchy flattens.

### C8. Timing
- Frozen clocks (A1), cumulative transition drift (A2), and index-mapped word timings (A3).
- Scene cuts land on the end of the last word, not in the pause, and ignore breaths. Most editors cut slightly *before* the new sentence begins, and cut graphics *on* the emphasized word.
- Nothing is anchored to specific words: a number can't appear when it is spoken.

### C9. Transitions
- There are four options (fade, slide-left, slide-right, wipe), a crossfade default on every cut, and a fixed 8-frame linear timing. The result is a soft, mushy dissolve on almost every cut, the opposite of professional practice, which relies mostly on hard cuts with occasional motivated transitions.
- There is no transition budget and no rule set (for example: section change → designed transition; same-subject continuation → cut; time jump → dip-to-black).

### C10. Rendering
- Default quality settings (A11), 5MB+ of base64 props, CSS background images with no load guard, unreliable font loading, and a full-frame CSS filter plus SVG turbulence every frame, which is slow and bad for compression.
- There is no automated verification of what was rendered: the test scripts only save stills for a human to look at.

---

## D. Highest-impact improvements (ranked by quality gained per unit of effort)

| # | Change | Effort | Why it matters |
|---|---|---|---|
| 1 | **Fix the timing core:** a single frame convention (never subtract `startFrame`); an explicit per-shot absolute timeline that compensates for transition overlap; phrase-aware captions from **alignment-based** word timing (sequence-align Whisper tokens to script tokens, normalizing numbers) | ~1 day | Removes the frozen scenes, invisible elements, blank ending and wrong captions at once. The current video literally doesn't do what its code intends |
| 2 | **Make imagery the dominant layer:** full-bleed `cover` with a focal-point-aware crop, real camera moves (see §F Motion), and graphics composited *over* imagery rather than blurred imagery behind cards | 1–2 days | The single biggest perceptual jump: from a slideshow to documentary footage |
| 3 | **Design tokens and a real type scale** per directing style: loaded fonts, sizes in canvas units, fit-to-box text, and a caption style that yields to on-screen type | 1–2 days | Makes every frame readable and consistent, and stops the "HTML page" look |
| 4 | **New shot model with word anchors and beats** (§E, §F), plus a typed schema per composition validated with zod; remove *all* demo defaults | 3–5 days | Enables change inside a scene, sync to specific words, and no leaked placeholder content |
| 5 | **Split AI responsibilities** (§G): script → (audio) → editorial plan from real timings → deterministic resolver | 3–5 days | The AI decides *what to show and why*; code decides *how it looks*. Variety becomes intentional |
| 6 | **Asset resolver:** multiple candidates per slot, entity-first lookup, resolution and aspect gates, cross-scene de-duplication, disk cache, `staticFile()` URLs instead of base64, `<Img>` for load safety; video clip support | 3–4 days | Relevance is what makes documentary edits feel "true" |
| 7 | **Transition policy:** default hard cut, a small motivated set, and a budget | 0.5 day | Instantly more professional |
| 8 | **Sound:** real licensed music beds per style, ducked under speech via the word timeline; sparse SFX tied to specific visual events; deterministic assets | 1–2 days | Audio is half of perceived quality |
| 9 | **Automated QC gates** (§I) | 2–3 days | Prevents regressions and lets the pipeline self-repair |
| 10 | **Long-form support:** chapters, hierarchical planning, 16:9-first layouts | 1–2 weeks | Required for "faceless YouTube" beyond Shorts |

---

## E. Target architecture

Here is the target pipeline, with what each stage produces:

```
 Brief ──▶ 1. Script Writer (LLM) ──▶ script.json  (chapters → paragraphs → sentences; claims flagged; no visuals)
                                            │
                                            ▼
                              2. Voice (Kokoro, existing) ──▶ narration.wav
                                            │
                                            ▼
                              3. Aligner ──▶ words.json  (every script token ↔ start/end ms, pauses, sentence/phrase ids)
                                            │                (Whisper + token alignment; or Kokoro word timestamps if available)
                                            ▼
 Style Library ──▶ 4. Editorial Director (LLM) ──▶ edit_intent.json
 (directing styles)     input: script + real durations + style menu + composition capability cards
                        output: style choice + per-beat intent, anchored to word ids (no frames, no hex, no px)
                                            │
                                            ▼
                              5. Resolver (deterministic)
                                 - validate/repair intent against zod schemas
                                 - map intent → composition family + variant (with variety & pacing rules)
                                 - compute absolute frames from word anchors, transition compensation
                                 - resolve assets (candidates → score → cache → staticFile)
                                 - apply style tokens (type, color grade, motion vocabulary, transition palette, caption style)
                                            │
                                            ▼
                                   timeline.json  (the EDL: tracks × clips with absolute frames, fully explicit)
                                            │
                          6. Timeline QC (static) ──fail──▶ targeted LLM repair of offending beats ──┐
                                            │ pass                                                  │
                                            ▼                                                       │
                              7. Remotion render (pure function of timeline.json)  ◀────────────────┘
                                            │
                                            ▼
                              8. Render QC (sampled frames: static/blank/contrast/overflow/repetition)
                                            │
                                            ▼
                                        final.mp4 + report.json
```

Key design decisions:

1. **Audio-first planning.** The editorial pass (4) runs *after* alignment (3), so the planner sees real durations, for example "sentence 7: 6.8s, emphasis candidates: 'sixty trillion'". Visual pacing is then designed, not force-fitted.
2. **`timeline.json` is the contract.** Remotion receives only explicit, validated, absolute data (tracks, clips, frames, resolved asset paths, token-resolved styles), with no `a || b || DEFAULT`. Given a timeline, rendering is a pure function, so it can be previewed in Studio, snapshot-tested, and re-rendered without re-calling the LLM.
3. **A multi-track timeline, not a list of scenes.**
   - `bed` track: continuous A-roll imagery or video with camera moves
   - `graphics` track: charts, cards, lists, lower thirds, anchored to words
   - `type` track: kinetic or editorial text
   - `captions` track
   - `fx` track: grain, grade, letterbox
   - `audio` tracks: VO, music with ducking, SFX

   A single sentence can then hold one image while a number lands on its word and a caption yields.
4. **Hierarchical planning for long-form.** Plan chapter by chapter with a running "style bible" and "used assets and compositions" memory. That keeps the context small, keeps the video coherent, and avoids the single-call 95-word ceiling.
5. **Static assets by path.** Use `public/runs/<videoId>/…` plus `staticFile()` instead of base64 props. Use `<Img>`/`<OffthreadVideo>` so Remotion waits for loads.

### Proposed shot/beat schema (sketch)

```ts
type Beat = {
  id: string;
  purpose: 'hook'|'context'|'explain'|'evidence'|'escalate'|'reveal'|'contrast'|'list_item'|'process_step'|'quote'|'transition'|'payoff'|'cta';
  anchor: { fromWord: number; toWord: number };        // word ids from words.json, never frames
  intent: {                                              // WHAT, not HOW
    kind: 'atmosphere'|'subject'|'statistic'|'comparison'|'list'|'process'|'timeline'|'quote'|'location'|'document'|'ui'|'concept'|'chapter';
    subject?: string;                                    // "Lehman Brothers HQ, 745 7th Ave"
    visualConcept: string;                               // 1 sentence: what the viewer should see
    entities?: { name: string; type: 'person'|'org'|'place'|'event'|'object'; wiki?: string }[];
  };
  data?: StatData | ComparisonData | ListData | TimelineData | QuoteData | ChartData; // typed per kind, validated
  onScreenText?: { role: 'kicker'|'headline'|'number'|'label'|'quote'|'chapter'; text: string; revealAtWord?: number }[]; // ≤ 6 words each
  emphasisWords?: number[];                              // word ids to hit visually
  intensity: 1|2|3|4|5;                                  // drives pacing/motion energy, not specific effects
  continuity?: 'continue_previous'|'new_subject'|'section_break';
  assetSlots?: { role: 'primary'|'secondary'|'texture'; query: string; mustDepict: string; kind: 'photo'|'video'|'either' }[];
  claimSource?: 'narration'|'illustrative';              // guards against fabricated "evidence"
};
```

The **resolver** turns each `Beat` into one or more `Clip`s on the timeline tracks: composition, variant, frames, camera move, focal point, text boxes and transition. It uses the style's rules, so the LLM never emits px, hex, easing or frame numbers.

---

## F. Visual composition system

Build **composition families**. Each has 2–4 variants, a typed data schema, a *capability card* (what it's good for, minimum and maximum duration, number of text slots, assets required) that goes into the director prompt, and a *reveal choreography* driven by word anchors.

| Family | Variants | Use when narration… |
|---|---|---|
| **FullFrameImage** (A-roll) | push-in, pull-out, pan (L/R/U/D), focal drift, 2.5D parallax (subject/background split), slow rack-blur | tells story, sets atmosphere, names a place, person or event |
| **ImageSequence** | 2–4 images cut on phrase boundaries within one beat, matched move direction | a long sentence would otherwise hold one still for more than 4s |
| **FramedMedia** | polaroid, archival print, newspaper clip, screenshot-in-browser | presents *real* artifacts (sourced) |
| **Split / Compare** | vertical split, horizontal split, before/after wipe slider, versus cards | contrasts two things (semantics come from data, not top=bad) |
| **Stack / Gallery** | photo stack, 2×2 grid, coverflow | lists examples or instances |
| **PiP / Inset** | image plus inset detail, map plus inset photo | detail within context |
| **StatReveal** | full-bleed number over image, counter with unit, number plus comparison bar | states a statistic |
| **Chart** | line (real series), bar, bar race, area, waterfall, donut | shows change over time, composition, ranking |
| **Timeline** | horizontal/vertical rail with dated nodes, camera travels along it | sequences events |
| **Process / Diagram** | steps with connectors, cycle, flow with packets | explains a mechanism |
| **List** | numbered editorial list, sequential cards, checklist | enumerates points |
| **Map** | locator pin, route draw, region highlight | location or movement |
| **Quote** | serif pull-quote over image, attributed card (sourced only) | real quotation |
| **Chapter / Title** | cinematic title, chapter card, cold-open title | section starts |
| **Kinetic Type** | 1–3 word impact, word-by-word highlight, statement build | emphasis, hook, thesis |
| **Lower Third / Callout** | name tag, location stamp, arrow and label callout | identifies something already on screen |
| **UI Mock** | phone notification, tweet, browser, terminal, code | digital events or tech topics |
| **Background** | subtle gradient, grain, textured paper | *only* behind graphic-only families, never as the default |

**Motion primitives**, shared and deterministic, owned by the style:
- **Camera:** `push`, `pull`, `pan`, `tilt`, `drift(focalA→focalB)`, `parallax(layers)`. Always *linear or ease-in-out over the whole clip* (not spring-then-stop), with style-set magnitude (for example 6–12% scale over 5s) and a focal point from asset metadata.
- **Reveals:** `mask-wipe`, `rise+fade` (8–16px, not 0→1 scale), `draw-on` (stroke), `count-up`, `type-on`, `highlight-sweep`. Each clip uses one, and a style whitelists 3–4.
- **Emphasis:** `underline-sweep`, `color-shift on word`, `scale 1→1.04 on word`, `flash-cut to number`.
- **Exits:** default hard cut. Designed exits only for graphics that leave while the bed continues.

**Directing styles**: pick one per video; this is what stops every video looking identical.

| Style | Type pairing | Grade | Motion | Transition palette | Captions | Pacing target |
|---|---|---|---|---|---|---|
| Cinematic documentary | Serif display plus grotesk | warm, lifted blacks, grain | slow push/drift, parallax | cut, dip-to-black, film-burn (rare) | small lower, sentence case | 4–6s per visual |
| Investigative | Condensed grotesk plus mono | cool, contrast, vignette | slow push, jolts on reveals | cut, flash-cut, whip (rare) | minimal | 3–5s |
| Editorial explainer | Grotesk family, 2 weights | clean, neutral | rise/fade, mask-wipe, draw-on | cut, push, match-cut | medium, highlighted keywords | 2.5–4s |
| Data-driven | Tabular grotesk | neutral dark or light | draw-on, count-up | cut, zoom-through into chart | minimal | 3–5s |
| Tech editorial | Grotesk plus mono | dark, one accent | type-on, UI slides | cut, slide | medium | 2.5–4s |
| Minimal premium | One family, light plus bold | monochrome plus accent | very slow drift only | cut, cross-dissolve | none or small | 5–7s |
| Fast-paced educational | Heavy grotesk | saturated | punchy rise, emphasis hits | cut, whip, zoom | large word-by-word | 1.5–2.5s |

Each style is a **token file**:
- `fonts`, `typeScale` (display, h1, h2, body, label, caption, in canvas-relative units)
- `palette`: 2–3 base colors, *generated from one topic hue by code*, with contrast checked
- `grade` (CSS filter or LUT-ish overlay), `grain`
- `motion` (allowed primitives, magnitudes, easing curves)
- `transitions` (allowed set plus budget per minute)
- `captions` (style, position, when to hide)
- `pacing` (min, target and max seconds per visual change; max static seconds)
- `layoutGrid` (margins and safe areas per aspect ratio)

---

## G. Who decides what

**DeepSeek decides (semantic and editorial):**
- The script: narrative structure, chapters, hook, claims, and which claims are illustrative
- The directing style, chosen from the menu, with a one-line justification
- Per beat: purpose, intent kind, subject/entities, visual concept, typed data (numbers, list items, comparison sides), ≤6-word on-screen text with its role, emphasis words, intensity, continuity, and asset search intent ("mustDepict")
- Where sections break
- Repairs: rewriting specific beats flagged by QC

**Deterministic code decides (craft):**
- Every frame number: computed from word anchors, pauses, and transition compensation
- Composition family and variant for each intent, applying variety rules (no family more than 2× in a row, rotating variants, a quota for full-frame imagery)
- Pacing: splitting long beats into image sequences, merging micro-beats, enforcing min/max hold times
- Camera move, magnitude and direction from style plus continuity (for example, alternate pan directions and don't reverse on a cut)
- All color: palette derived from one hue, WCAG contrast enforced, grade from style
- All typography: font, size, line length, fit-to-box, safe areas, caption visibility (hide captions while on-screen type is present, or shrink them)
- Transitions, from rules plus budget
- Asset selection among candidates: size, aspect, relevance score, de-duplication
- SFX placement, tied to specific visual events (a number landing, a document appearing), capped per minute; music choice from style; ducking from the word timeline
- Render settings and all QC

Rule of thumb: **if a value is a number, a color, a font or a frame, code decides it.**

---

## H. Template integration (ReactVideoEditor library)

What the MCP server provides: 95 templates in 9 categories. The **Pro** templates (Stat Counter, Bar Chart, Comparison Chart, KPI Dashboard, Bar Chart Race and others) return *no source*. The free ones are single-file demos: data is hard-coded *inside* the component, most have no props interface, animation timings are fixed (for example "draw over frames 0–60"), sizes are fixed px, and the backgrounds are the generic `#111827 → #1f2937`. Three are **not Remotion-safe at all**: `ken-burns`, `parallax-pan` and `zoom-pulse` use CSS `@keyframes`, `styled-jsx` and `next/image`, none of which Remotion drives frame by frame. They will flicker or stay static in a render.

The current `src/remotion/templates/*` files are *not* the RVE templates. They are hand-written look-alikes labelled "ReactVideoEditor style".

**Recommendation:** treat RVE as a **reference library of motion ideas and SVG math**, not a component drop-in. Port the useful ones into the composition families above behind typed props, style tokens and word-anchored timing.

| Template | Verdict | How to use it |
|---|---|---|
| `line-chart`, `area-chart`, `multi-line-chart`, `candlestick-chart`, `waterfall-chart`, `donut-chart`, `pie-chart`, `progress-bars`, `circular-progress`, `gauge-meter` | **Adapt** | Take the scale, path and draw-on math; feed real series; restyle via tokens; stretch timing to the anchored duration. Replaces the hard-coded Bézier in `AnimatedDataCrashShot` |
| `image-comparison-slider` | **Adapt** | `clipPath: inset()` wipe → Compare/before-after variant |
| `split-screen`, `picture-in-picture`, `photo-stack`, `gallery-grid`, `masonry-gallery`, `image-carousel`, `image-zoom-reveal` | **Adapt** | Layout plus stagger logic → Split, PiP, Stack and Gallery families |
| `text-highlight`, `animated-text` | **Adapt** | Word-sweep highlight driven by *word timestamps*, not `i × 0.6s` |
| `animated-list`, `progress-steps`, `onboarding-steps` | **Adapt** | List and Process families; reveal each item on its spoken anchor |
| `chapter-title`, `cinematic-title-intro`, `title-split`, `lower-third`, `quote-card` | **Adapt (lightly)** | Good choreography references; restyle with tokens and much larger type |
| `whip-pan`, `zoom-through`, `push-transition`, `fade-through-black`, `slide-wipe`, `iris-transition` | **Adapt as `@remotion/transitions` presentations** | They're written as two hard-coded demo scenes; rewrite the math as custom `TransitionPresentation`s so they can sit between any two clips |
| `letterbox-reveal`, `spotlight-reveal`, `film-burn`, `noise-grain`, `vignette-pulse`, `camera-shake` | **Adapt selectively** | FX-track overlays, used rarely per style (film-burn only in documentary styles; shake almost never) |
| `ken-burns`, `parallax-pan`, `zoom-pulse` | **Re-implement** | The idea is right but the implementation is CSS-animation based; write frame-driven versions (the camera primitives in §F) |
| `bar-chart-race`, `kpi-dashboard`, `stat-counter`, `comparison-chart`, `chart-animation` | **Pro, no source** | Build in-house (straightforward with the free chart math) or license |
| `bubble-pop-text`, `bounce-text`, `pulsing-text`, `popping-text`, `glitch-text`, `floating-bubble-text` | **Ignore** | Bouncy, playful motion that fights a premium or documentary tone; `glitch` only for a "tech/gaming" style if ever |
| `matrix-rain`, `starfield`, `geometric-patterns`, `liquid-wave`, `bokeh-circles`, `grid-pulse`, `gradient-shift` | **Ignore (mostly)** | Decorative backgrounds are part of the current problem. `gradient-shift` at most as a subtle graphic-only backdrop |
| Logo & Branding (9), `end-card`, `subscribe-reminder`, `countdown-*`, `credits-roll`, `particle-explosion`, `sound-wave` | **Ignore for now** | Channel branding later, as a per-channel intro/outro, not per video |

Also required for licence hygiene: the free templates ask for credit, not a requirement. Record the source slug and page in each ported component's header.

---

## I. Quality-control system

Two layers: **static checks on `timeline.json`** (cheap, before rendering, and able to trigger LLM repair) and **render checks on sampled frames** (after rendering, or on a fast low-res pre-render).

### Static (timeline) checks
| Check | Rule (tunable per style) |
|---|---|
| Timeline integrity | The visual tracks cover `[0, audioFrames)` with no gaps; transitions are compensated; no clip is shorter than 12 frames |
| Anchor validity | Every beat anchor maps to real word ids; the graphic reveal lands within ±3 frames of its anchor word |
| Static-time limit | No interval longer than `style.pacing.maxStatic` (for example 4s) without a camera move, a reveal or a cut |
| Pacing band | Mean seconds per visual change within the style's band; no 3 consecutive cuts under 1.2s unless intensity is 5 |
| Layout repetition | The same family no more than 2× consecutively; no family over 35% of runtime; full-frame imagery at or above the style's quota |
| Motion repetition | The same camera move and direction no more than 2× in a row; reversed pans across a cut are flagged |
| Transition budget | Designed (non-cut) transitions ≤ `style.transitions.perMinute`; none inside a continuous subject run |
| Text budget | On-screen text ≤ 6 words per element, ≤ 2 elements per frame; captions hidden or shrunk when on-screen type is present |
| Narration duplication | Token overlap between on-screen text and the concurrent narration ≤ 50% (catches "dumping narration onto the screen") |
| Required data present | Every composition's zod schema passes; **no placeholder or default content anywhere** (lint fails on any literal default string in a composition) |
| Fabrication guard | `quote` and `document` families require `claimSource: 'narration'` plus a sourced attribution; otherwise they are downgraded to stylised text |
| Asset validity | Every asset exists locally, is at least 1.1× the canvas on its cropped axis, has an aspect-compatible crop, is not reused within N minutes, and is not a known fallback in a non-matching topic |
| Audio | Music ducks at least 8 dB under speech; SFX ≤ N per minute; no SFX within 300ms of another |

### Render (frame) checks
Sample 2–4 frames per clip at low resolution, plus 1 frame every 0.5s. Every check below is achievable with `sharp` and the Remotion bundled ffprobe; no ML is needed for most.

| Check | Method |
|---|---|
| Blank or black frames | Mean luma < 4% or stdev < 3 → fail (this would have caught the blank ending) |
| Frozen clip | Frame difference between 15% and 85% of a clip below a threshold when the clip's motion ≠ `hold` (catches the startFrame bug) |
| Too dark overall | Median luma of the video below the style's floor (current renders: about 5–10%) |
| Text contrast | For each text box (known from the timeline), WCAG contrast of text color against the sampled background ≥ 4.5 (body) / 3 (display) |
| Text overflow | Render text boxes with `measureText` or a DOM probe in a check composition; fail if the content box exceeds its container or the safe area |
| Visual repetition | Perceptual hash (dHash) of clip keyframes; flag near-duplicate frames more than 10s apart |
| Caption sync | Compare each caption's active-word frame to the aligner timestamp; flag any over 2 frames |
| Relevance (optional, ML) | CLIP similarity between each primary asset and `mustDepict`; below a threshold → re-resolve the asset |
| Final encode | ffprobe: duration equals audio ±1 frame, and the correct resolution, fps and loudness (for example −14 LUFS integrated for YouTube) |

The QC output is `report.json`, with a pass/fail per check and the offending clip ids. Failures in beats go back to the LLM repair step, with the specific rule that failed; failures in craft go back to the resolver.

---

## Appendix 1 — Evidence from the audit render

The fallback "2008 crisis" plan, stand-in narration of 18.75s / 563 frames, 4 scenes, 3 transitions.

| Global frame | Audio says | Screen shows |
|---|---|---|
| 23 / 78 / 140 | "In September 2008…collapse" | Identical "COLLAPSE" (about 100px) centered on near-black for 5.2s; background image at 22% brightness under blur, effectively invisible |
| 158 → 165 | "Lehman Brothers held…" | A laptops-on-desk stock photo (technology fallback) letterboxed in a box; **pixel-identical** frames (frozen); date badge missing |
| 285 | "…that nobody would buy" | Scene 3 (evidence paper) already on screen: visuals ahead of audio |
| 403–530 | "…banking in hours, freezing credit…" | "−$60 TRILLION" (about 90px) plus 18px label, static except a sine pulse; scene visible before its sentence starts |
| 536–563 | "…dollars of wealth worldwide." | **Empty background.** Caption reads "WORLDWIDE. WORLDWIDE." |

Other measurements:
- `inputProps` size: 5,365,559 bytes for 4 images.
- Asset resolution: Wikipedia, Commons and Pixabay failed for all four queries. One Pollinations image; three curated fallbacks, two from the wrong category.

## Appendix 2 — Status of items in the older `VIDEO_QUALITY_AUDIT.md`

| Old finding | Status |
|---|---|
| Text-on-top-of-text (headline plus captions duplicate narration) | Partly addressed in the prompt ("zero text duplication") but captions still always on and compete with scene text |
| Only 5 rigid primitives | Grew to 14 menu entries, but still one-layout-per-sentence with no typed data; placeholder leaks persist (ProcessFlow) |
| No audio layer | SFX and BGM added, but synthetic, not ducked under speech, and on every cut |
| Uniform Ken Burns | Replaced by `Camera` wrapper, which is now *less* visible (1.04 spring, ±10px), and frozen by the startFrame bug for archival shots |
| No asset quality filter | Still none |
| No narrative beats | A 5-beat arc exists but prescribes layouts per beat, which enforces sameness |
| Missing infographic primitives (maps, UI, clippings) | Maps still missing; `dynamic_map_pulse` and `interface_inspection` in `SHOT_LIBRARY.md` have no implementation |

---

## Recommended next step

Do **§D items 1–3 first** (timing core, full-frame imagery with real camera moves, tokens and a type scale) inside the current structure. They are contained changes, they fix the most visible failures, and the audit harness can verify them immediately against the same frames. Then build the `Beat` → resolver → `timeline.json` layer (§E) as a new module, and migrate compositions into families one at a time behind it.
