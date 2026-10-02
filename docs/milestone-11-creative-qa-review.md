# Milestone 11 Review — Creative QA Director & Automated Repair Loop

## Executive Summary

Prior to Milestone 11, the video generator operated under the naive assumption that `valid timeline = good video`. While Milestones 7–10 gave the engine duration budgeting, audio mastering, and procedural visual coverage (code windows, diagrams, maps, timelines, comparisons), several visual and editorial weaknesses remained:
- **Representation Fatigue**: Monotonous runs of identical visual families (e.g. 61% code with 3+ consecutive syntax editor windows in tech explainers).
- **Domain Semantic Inappropriateness**: Software developer repository UIs inappropriately rendered in psychology/human behavior explainers when words like "system" or "feed" appeared.
- **Perceptual Blankness & Composition Defects**: Bare statement cards or ground frames with excessive empty canvas area (>70%).
- **Static Shot Holds**: Long shots (>5.5s) held statically without visual progression, and rushed complex graphics (<2.5s).
- **Caption Collisions**: Captions competing with full-frame cognitive graphics.

Milestone 11 creates the **Creative QA Director & Automated Repair Engine** (`src/qc/creativeQaDirector.js`), integrating a strict 2-pass feedback loop:
`Storyboard → Visual Plan → Timeline → Creative QA (Pass 1) → Repair → Creative QA (Pass 2) → Final QA Gate → Render`.

All 53 unit and regression tests pass deterministically. External media providers and AI image generation remain strictly disabled.

---

## 1. Creative QA Architecture

The Creative QA Director reviews the compiled timeline along with storyboard intent, visual coverage plan, duration diagnostics, pacing diagnostics, visual realization diagnostics, and audio diagnostics:

```
┌────────────────────────────────────────────────────────┐
│                   Compiled Timeline                     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │ evaluateCreativeQa()      │
              │ - Hard vs. Editorial      │
              │ - Semantic Appropriateness│
              │ - Representation Fatigue  │
              │ - Composition QA          │
              │ - Pacing & Hold QA        │
              │ - Audio Integration       │
              └─────────────┬─────────────┘
                            │
               repairsNeeded.length > 0 ?
              ┌─────────────┴─────────────┐
              │                           │
              ▼ Yes                       ▼ No
   ┌───────────────────────┐   ┌───────────────────────┐
   │ applyCreativeRepairs()│   │ Render Preflight      │
   │ Priority 1 -> 7       │   │ Production Ready      │
   │ Max 2 Passes          │   └───────────────────────┘
   │ Preserve Strong/Good  │
   └──────────┬────────────┘
              │
              ▼
   ┌───────────────────────┐
   │ evaluateCreativeQa()  │ (Pass 2 Verification)
   └──────────┬────────────┘
              │
    Hard Failures > 0 ?
   ┌──────────┴────────────┐
   │ Yes: Block Render     │
   │ No:  Save Artifacts & │
   │      Proceed to Render│
   └───────────────────────┘
```

### Shot Quality State
Instead of arbitrary numeric aesthetic ratings, each shot receives an authoritative editorial state:
- `STRONG`: Asset score ≥ 80 or high-fidelity custom visual perfectly aligned with scene intent. Preserved untouched unless a hard failure occurs.
- `GOOD`: Valid semantic representation, balanced layout, comfortable hold duration. Preserved untouched.
- `ACCEPTABLE`: Usable visual, but slightly repetitive or candidate for micro-progression.
- `WEAK`: Generic media, inappropriate domain UI, long static hold, or excessive blankness. Triggers repair.
- `FAILED`: Blank frame or unrendered ground. Must repair or block production render.

### Hard Failures vs. Editorial Warnings

| Category | Hard Failures (Must Repair or Block) | Editorial Warnings (Attempt Bounded Repair) |
|---|---|---|
| **Visual / Frame** | `blank_frame`, `missing_visual`, `unresolved_coverage` | `weak_composition`, `nearly_empty_screen`, `weak_hook`, `weak_ending` |
| **Typography / Text** | `clipped_text` (>80 characters) | `headline_overflow`, `caption_competition`, `layout_fatigue` |
| **Asset Quality** | `invalid_asset`, `unlicensed_asset` | `weak_media`, `generic_stock`, `inappropriate_domain_ui` |
| **Pacing / Rhythm** | `duration_limit_exceeded` | `representation_fatigue`, `hold_too_long` (>5.5s), `rushed_graphic` (<2.5s) |
| **Audio** | `audio_clipping_risk` (Peak > -0.5 dBFS) | `audio_loudness_drift` (outside -14 to -18 LUFS range) |

---

## 2. Bounded Repair Priority & Actions

Repairs execute in strict priority order to prevent oscillation and guarantee convergence within **2 passes maximum**:

1. **Hard Failures**: `blank_frame`, `clipped_text`, `missing_visual`
2. **Semantic Domain Mismatches**: `inappropriate_domain_ui`, `asset_semantic_mismatch`
3. **Perceptual Blankness**: `nearly_empty_screen`, `weak_composition`
4. **Text & Layout Problems**: `caption_competition`, `layout_fatigue`, `text_overflow`
5. **Representation Fatigue**: 3+ consecutive shots of identical representation family
6. **Pacing & Shot Holds**: `hold_too_long`, `rushed_graphic`
7. **Stylistic Repetition**: `weak_hook`, `weak_ending`

### Implemented Repair Actions
- `REPLACE_ASSET`: Replaces low-scoring generic media with higher-scoring alternates or topic-grounded procedural primitives.
- `CHANGE_REPRESENTATION`: Replaces the visual family and synthesizes immediate grounded procedural data (`diagram`, `process`, `compare`, `ui`, `code`, `map`, `timeline`).
- `CHANGE_LAYOUT`: Varies internal variants (e.g. `code:syntax` → `code:terminal` or `ui:workspace` → `ui:fileTree`).
- `ADD_MICRO_PROGRESSION`: Activates phased node highlights or test suite terminal passes on static shots >5.5s.
- `SIMPLIFY_TEXT`: Trims headlines exceeding safe character bounds (e.g. >70 chars).
- `HIDE_CAPTION`: Yields floating subtitles during dense cognitive graphics to eliminate visual competition.
- `EXTEND_HOLD` / `SHORTEN_HOLD`: Dynamically recalibrates duration for fast or slow shots.

---

## 3. Before/After Audit of Benchmark Regressions

### Benchmark 1: Tech Explainer — "How AI Coding Agents Work"

**Known Bottleneck from Milestone 10:**
Code representation surged to **61%**, with repetitive IDE syntax windows (`syntax` → `syntax` → `syntax`).

**Creative QA Evaluation (`creative-qa-before.json`):**
- Detected `representation_fatigue` on Scene 6 (`loop through execution cycle`) and Scene 12 (`nearly_empty_screen`).
- Detected `layout_fatigue` on Scenes 2 and 5.
- Detected static hold (7.4s) on Scene 13.

**Repairs Applied (`creative-repairs.json`):**
1. `scene_002_shot_01`: `CHANGE_LAYOUT` from `code:syntax` to `code:terminal`.
2. `scene_005_shot_01`: `CHANGE_LAYOUT` from `code:syntax` to `code:terminal`.
3. `scene_006_shot_01`: `CHANGE_REPRESENTATION` from `code` to `process` (agent execution loop).
4. `scene_006_shot_02`: `CHANGE_REPRESENTATION` from `code` to `process`.
5. `scene_012_shot_01`: `CHANGE_REPRESENTATION` from `statement` (nearly empty) to `diagram`.
6. `scene_013_shot_01`: `ADD_MICRO_PROGRESSION` added interactive terminal pass to 7.4s hold.

**Result (`creative-qa-after.json`):**
- Whole-video representation balance:
  - `code`: 6 shots (42.8%)
  - `process`: 3 shots (21.4%)
  - `ui`: 2 shots (14.3%)
  - `image`: 2 shots (14.3%)
  - `diagram`: 1 shot (7.1%)
- Hard failures: **0**
- Failed shots: **0**
- Weak shots: **0**
- Production Ready: **YES**

---

### Benchmark 2: Psychology — "Why Your Brain Chooses Instant Gratification"

**Known Bottleneck from Milestone 10:**
Contextual UI accounted for **22%**, rendering developer-style repository and software UI for human brain and impulse beats.

**Creative QA Evaluation (`creative-qa-before.json`):**
- Detected `inappropriate_domain_ui` on Scene 5 ("Your brain treats future you like a stranger") and Scene 10 ("The prefrontal cortex can override impulse").
- Detected static holds >5.5s on Scene 1 (7.2s), Scene 3 (6.5s), and Scene 9 (8.3s).

**Repairs Applied (`creative-repairs.json`):**
1. `scene_005_shot_01`: `CHANGE_REPRESENTATION` from `ui:workspace` to `diagram:nodes` (`NEURAL CONFLICT ARCHITECTURE`).
2. `scene_010_shot_01`: `CHANGE_REPRESENTATION` from `ui:workspace` to `diagram:nodes` (`NEURAL CONFLICT ARCHITECTURE`).
3. `scene_010_shot_02`: `CHANGE_REPRESENTATION` from `ui:workspace` to `diagram:nodes`.
4. `scene_010_shot_02`: `CHANGE_LAYOUT` to `workspace` node layout.
5. Scenes 1, 3, 9: `ADD_MICRO_PROGRESSION` applied progressive reveals and activation markers.

**Result (`creative-qa-after.json`):**
- Inappropriate developer UI completely eliminated from psychology scenes.
- Representation balance:
  - `diagram`: 3 shots (27.3%)
  - `image`: 3 shots (27.3%)
  - `process`: 2 shots (18.2%)
  - `chart`: 1 shot (9.1%)
  - `document`: 1 shot (9.1%)
  - `timeline`: 1 shot (9.1%)
- Hard failures: **0**
- Failed shots: **0**
- Weak shots: **0**
- Production Ready: **YES**

---

### Benchmark 3: Business Documentary — "Why ASML is the World's Most Important Monopoly"

**Known Bottleneck & Verification Requirement:**
Ensure machine-over-office semantic ranking is preserved, asset quality remains high, and no regressions are introduced.

**Creative QA Evaluation & Repair:**
- Detected 3+ image runs in closing scenes (Scenes 11, 12, 13).
- Repaired Scene 11 & 12 to supply-chain `diagram` and Scene 13 to `compare`.
- Added micro-progression to long holds on Scenes 2, 6, 9.

**Result (`creative-qa-after.json`):**
- Asset quality remained 100% intact: 8 licensed assets used with authoritative cleanroom EUV imagery.
- Direct coverage: **100%** (0 unresolved shots, 0 blank frames).
- Representation balance:
  - `image`: 4 shots (28.6%)
  - `diagram`: 2 shots (14.3%)
  - `stat`: 2 shots (14.3%)
  - `map`: 2 shots (14.3%)
  - `timeline`: 1 shot (7.1%)
  - `process`: 1 shot (7.1%)
  - `list`: 1 shot (7.1%)
  - `compare`: 1 shot (7.1%)
- Hard failures: **0**
- Failed shots: **0**
- Weak shots: **0**
- Production Ready: **YES**

---

## 4. Persisted Diagnostics & Artifact Traceability

Every generation run produces complete before/after audit trails in `renders/runs/<videoId>/`:
1. `creative-qa-before.json`: Initial holistic evaluation with issues, severity, and repair candidates.
2. `creative-repairs.json`: Itemized log of every repair executed with `{ shotId, sceneId, action, reason, before, after }`.
3. `creative-qa-after.json`: Final post-repair verification report.
4. `preview/contact-pre-repair.png`: Contact sheet captured before creative repairs.
5. `preview/contact-post-repair.png`: Contact sheet captured after creative repairs.
6. `qc-pre.json`: Complete preflight record linking Timeline QC, Critic review, Creative QA, and contact sheets.

---

## 5. Human Review Rubric Summary

| Dimension | Review Criterion | Engine Outcome |
|---|---|---|
| **Content** | Does every scene advance the idea? | Storyboard sections guarantee clear progression; no redundant filler scenes. |
| **Visual** | Does every shot add meaning? | Direct explanatory graphics (code, diagram, chart, map, document) replace generic statement cards. |
| **Composition** | Does it look deliberate? | Empty area ratio monitored; frames with >70% empty canvas repaired to structured diagrams. |
| **Pacing** | Does anything feel rushed or slow? | Holds >5.5s receive micro-progression; cognitive graphics <2.5s extended. |
| **Variety** | Does anything feel templated? | 3+ consecutive identical representations or layouts detected and diversified. |
| **Audio** | Is it comfortable and polished? | Mastered to -16 LUFS, true peak ≤ -1.5 dBFS, pause bridging without pumping. |

---

## 6. Next Steps & Recommendations

Milestone 11 completes the automated creative review and bounded repair loop.
Recommended next milestone: **Milestone 12 — Final Production Validation & Batch Renders** (full rendering of the 3 benchmark videos with contact sheet comparisons, final quality sign-off, and packaging validation).
