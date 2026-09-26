# Pipeline Architecture

The engine is an **AI-directed editor**, not a template slideshow. The LLM decides *what to show and why*; deterministic code decides *how it looks and when*; Remotion only draws an explicit timeline.

```
brief ─▶ 1 Editorial Plan (DeepSeek) ─▶ plan.json     narration + per-sentence intent, typed data, and FEEL:
          │                                           tone, importance, shot scale, focus, camera behaviour,
          │                                           continuity, treatment  (aiDirectorService.js)
          ▼
        2 Narration (Kokoro · --audio file · --tts say for dev)
          ▼
        3 Aligner ─▶ words.json                       script words timed against the audio (alignmentService.js)
          ▼
        4 Visual Director ─▶ direction.json           treatment, family, composition VARIANT, camera language,
          │                                           and what imagery each scene needs  (visualDirector.js)
          ▼
        5 Asset Director ─▶ assets.json               tiered search under each scene's acceptability policy
          │                                           (assetDirector.js + freeMediaService.js), then the
          │                                           fallback ladder recasts scenes it could not illustrate
          ▼
        6 Timeline Director ─▶ timeline.json          frames, sub-shots, camera paths, reveals, captions,
          │                                           transitions, SFX, ducking  (timeline.js)
          ▼
        7 Timeline QC ── error ─▶ stop                (qc/timelineQc.js)
          ▼
        8 Remotion composition library ─▶ mp4        (remotion/engine, remotion/families)
          ▼
        9 Visual QA ─▶ qc.json                        blank / frozen / brightness / duration (qc/renderQc.js)
```

Every intermediate is saved in `renders/runs/<videoId>/`. Re-render a run's plan without the LLM with `--plan renders/runs/<id>/plan.json`, and preview any run with `node scripts/previewRun.js renders/runs/<id>`.

## Asset quality ladder

| Tier | What it is | Allowed for |
|---|---|---|
| verified | Wikipedia lead image of the entity, or a Commons file whose title names it | everything |
| relevant | Query-matched Commons (named phrases must match), Pexels/Pixabay photo and **video** | everything |
| generated | Purpose-built image (`IMAGE_GENERATOR`, default Pollinations; `GENERATED_FIRST=1` ranks it above stock for mood shots) | mood shots; subjects only when not a real entity |
| generic | Curated topic library | mood photo scenes, and only in styles that allow it |

A named real subject never gets a generic image. When nothing acceptable is found the Visual Director recasts the scene down the ladder — **video → image sequence → still → graphic → typography → ground** — and QC reports it. Search failures (rate limits, outages) are cached around, retried, and reported separately from "nothing exists".

## Licensing and relevance

- Every candidate carries its licence (Commons/Wikipedia extmetadata, Pexels/Pixabay/Unsplash licences). `LICENSE_POLICY=commercial` (default) accepts public domain, CC0, CC BY, CC BY-SA and the stock licences; rejects NC, ND, non-free/fair-use and unknown licences before download. `strict` also drops share-alike and AI images; `any` disables the filter (internal use only).
- Each run writes `credits.txt` — every third-party asset actually used, with author, licence and source page — ready for the video description. Timeline QC fails if a used asset has no recorded licence.
- CLIP relevance (`src/services/relevance.js`) auditions up to four stills for atmosphere scenes and keeps the best match to the scene's visual description (drops anything below the unrelated floor), and rejects extra images that are notably less on-topic than the primary. It does not overrule verified entity images — CLIP does not know identities. `RELEVANCE=off` disables it.

## Composition variants

Photo scenes: `full`, `editorial` (photo panel + type panel), `split` (two photographs, second arrives mid-sentence), `depth` (sharp print over its blurred plate — used for portrait photos in 16:9 and quiet wide shots), `annotated` (ring + label on the subject; enabled only with `FOCUS_GROUNDING=1`, because the local OWL-ViT and CLIP-crop detectors tested were not reliable enough to point at the right thing). Stat scenes: `hero`, `split`. Lists: `stack`, `cards`, `ledger`. Comparisons: `columns`, `versus`. Charts take per-style drawing tokens (stroke, area fill, gridlines, marker). Each style weights the variants; the Visual Director adds anti-repetition (never three plain full-frames in a row, no repeated variant unless the plan says `continuity: continue`), and explicit treatments (`quiet`, `graphic`, `typographic`) are decisions, not weights.

## React Video Editor templates (MIT)

The free templates at https://github.com/reactvideoeditor/remotion-templates are MIT-licensed (commercial use allowed). They are demos — placeholder gradients, hard-coded text, fixed pixel sizes and 2-second timings — so none is used as-is or loaded at runtime (the MCP server is a development-time reference only). Their effects are re-implemented as timeline-driven, style-aware engine components that work over photographs and video clips:

| Effect | Used for | Styles |
|---|---|---|
| Letterbox (Letterbox Reveal) | The video "opens" from a slit to 2.39:1; chapter cards | cinematic documentary, investigative, minimal premium |
| Focus pull (Image Zoom Reveal) | First shot of hook/reveal/importance-5 scenes racks into focus | most styles |
| Film burn (Film Burn) | Warm light-leak section transition, alternating with dip | cinematic documentary |
| Iris (Spotlight Reveal) | Accent transition on climaxes (subject to the transition budget) | investigative, tech editorial |
| Photo stack (Photo Stack) | Photo variant: real prints drop onto a blurred plate, one per phrase | documentary, investigative (weighted) |
| Highlight / chars (Text Highlight, Animated Text) | Statement variants: marker sweep as words are spoken; per-character kinetic reveal | explainer, tech, fast educational |
| Split chapter (Title Split) | Outline number + filled title meeting on an accent rule | investigative, tech, fast educational |
| Share / rank charts (Donut Chart, Progress Bars) | Proportions (donut), rankings with long labels (horizontal bars) | all (chart `type: share|rank`) |

Attribution and the MIT text are in `THIRD_PARTY_NOTICES.md`. Deliberately not used: playful text effects (bubble/pop/pulse/bounce/glitch), decorative backgrounds, logo/countdown/particle templates, gimmick transitions, effects the engine already had, the three templates marked Pro on the website, and the CSS-keyframe templates that don't render deterministically.

## Evaluation tools

- `node scripts/evalDirector.js [--only 2,5] [--render]` — the real DeepSeek path on 10 briefs (educational, documentary, finance, history, technology, listicle, storytelling, statistics, quotes, poor imagery); saves raw output, normalised plan and metrics, flags weak plans; `--render` renders each with dev narration and collects QC. Requires an API key.
- `node scripts/styleMatrix.js --plan p.json --audio a.wav [--format landscape]` — the same plan in every directing style, one row per style.
- `node scripts/previewRun.js renders/runs/<id>` — contact sheet of any run.

## Who decides what

| LLM (plan.json) | Code (timeline.json) |
|---|---|
| Narration, one sentence per scene | Every frame number (cuts sit in the pause before each sentence) |
| Directing style (from a menu) and optional brand colour | Palette derived from one hue; type, grade, grain from the style |
| Tone, importance, shot scale, focus, camera behaviour, continuity, treatment | Variant, base zoom, move vocabulary and magnitude, transition softness |
| Scene `kind` + typed `data` (stat, list, process, timeline, chart, comparison, quote, document, chapter, statement, ui, code, photo) | Composition family and layout |
| ≤6-word on-screen text, the `emphasis` phrase, intensity, section breaks | When each element appears (anchored to the spoken word) |
| Image search intent and real entities | Asset choice, crop, focal point, camera move |
| — | Transitions (hard cut by default; designed ones under a per-minute budget) |
| — | Captions, when they yield, SFX placement, music ducking |

The validator (`normalizePlan`) rejects what the renderer could not show truthfully: statistics the sentence doesn't state, quotes the narration doesn't speak, documents whose source isn't named, headlines that paraphrase the sentence. Those scenes become photo shots; nothing is ever filled with placeholder content.

## Directing styles — `src/shared/styles.js`

`cinematic_documentary`, `investigative`, `editorial_explainer`, `data_driven`, `tech_editorial`, `minimal_premium`, `fast_educational`. Each owns fonts, display treatment, palette derivation, image grade, camera vocabulary and magnitude, reveal type, transition palette and budget, caption mode, and pacing (`maxHoldSec`, `minShotSec`). One style per video, so every shot resolves against the same tokens.

## Composition families — `src/remotion/families/`

| Family | Kind(s) | Notes |
|---|---|---|
| image | atmosphere, subject | Full-frame photo, focal-point camera path; long holds split into reframes or a second image on phrase boundaries; optional kicker/headline |
| stat | statistic | Count-up lands on the spoken number, over a dimmed photo or ground |
| statement | statement | Kinetic words, each revealed as it is spoken |
| list / process / timeline | list, process, timeline | Items appear when mentioned; earlier items dim so attention follows the voice; the timeline rail travels |
| chart | chart | Real series; line draws toward the emphasised figure; bar variant |
| compare | comparison | Focus moves to the second side when it is spoken; tones drive colour |
| quote / document / chapter / ui / code | … | Quote and document only for real, narrated sources |

## Timing guarantees

- One frame convention: every component reads the local Sequence frame.
- Transition overlap is compensated: the incoming clip starts half the transition before the cut and the outgoing one ends half after, so picture never drifts from the voice and the timeline always covers `[0, audioFrames)` (checked by QC).
- Captions are the script's own words, grouped on phrase boundaries, timed by alignment (not by index).

## Swapping in better media

- Music: put licensed tracks at `public/audio/bgm/<style>.mp3`; they replace the synthesized pads.
- SFX: replace any `public/audio/sfx/<name>.wav`; existing files are never overwritten.
- Photos: set `PEXELS_API_KEY` / `PIXABAY_API_KEY` for more candidates.
