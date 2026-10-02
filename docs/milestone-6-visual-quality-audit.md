# Milestone 6: Visual Quality Audit

**Target Render:** `video-2026-09-27T12-58-07` (ASML 82.4s Landscape Documentary)  
**Primary Artifacts Inspected:** `timeline.json`, `contact-sheet.jpg`, `scene_frames/scene_001_mid.jpg` – `scene_013_mid.jpg`, `visual-realization-diagnostics.json`, `storyboard.json`, `plan.json`, `assets.json`.

---

## 1. Executive Summary

While the underlying technical pipeline (audio timing, multi-shot storyboard data, asset fetching) functions deterministically, the **final rendered video does not meet the visual quality bar of a professional YouTube documentary or explainer**. 

Instead, the video exhibits three fundamental aesthetic failures:
1. **The Canva / SaaS Dashboard Syndrome:** Procedural shots (`stat`, `list`, `process`, `statement`) resemble isolated web components, onboarding wizards, or PowerPoint slide decks rather than broadcast motion graphics.
2. **The Artificial Slideshow Camera:** Nearly every photographic shot uses a continuous mechanical scale zoom (`pull` or `push`). There is zero editorial camera grammar (no detail framing, no intentional static holds on documentary photographs, no parallax).
3. **Card Containers & Asymmetric Dead Space:** In portrait shots (`image:depth`), photos float as tiny vertical stamps over heavily blurred backgrounds with drop shadows. In editorial split shots (`image:editorial`), secondary shots leave 44% of the widescreen canvas as empty black void because text only exists on shot 1.

---

## 2. Scene-by-Scene Quality Classification

| Scene ID | Duration | Kind / Role | Family & Variant | Rating | Primary Visual Failure Mode |
|---|---|---|---|---|---|
| **s01** (`scene_001`) | 5.80s | atmosphere / hook | `image:depth` (shots 1-2) ➔ `image:editorial` (shot 3) | **WEAK** | Portrait asset floats like a mobile phone screenshot over blurred void; pull-to-push zoom bounce; shot 3 has 44% empty black dead space on the left. |
| **s02** (`scene_002`) | 6.90s | subject / explain | `image:full` (1 shot) | **ACCEPTABLE** | High-quality macro silicon wafer asset, full bleed. However, 6.9s single continuous slow pull lacks dynamic editorial pacing or detail crop cut. |
| **s03** (`scene_003`) | 8.07s | process / process | `process:default` (3 shots) | **BAD** | Renders a horizontal dot-rail onboarding stepper ("1: Tin droplets", "2: Laser hits", "3: Plasma emits"). Looks like a web SaaS checkout form. Text under nodes clashes with captions. |
| **s04** (`scene_004`) | 7.27s | statistic / explain | `stat:hero` (1 shot) | **WEAK** | A single number "13.5 nm" floating on an empty dark void with a colored underline for 7.27s. Resembles an unstyled KPI widget from an admin dashboard. |
| **s05** (`scene_005`) | 6.33s | atmosphere / context | `statement:highlight` (1 shot) | **WEAK** | "Decades of Doubt" highlighted by a bright marker block on a dark screen. Feels like a social-media short template rather than a serious historical documentary beat. |
| **s06** (`scene_006`) | 5.70s | subject / reveal | `image:full` (shot 1) ➔ `image:editorial` (shots 2-3) | **ACCEPTABLE** | Authentic ASML HQ/logo imagery with snappy 1.9s shot pacing. However, shots 2 and 3 leave 44% of the screen completely empty black void because they have no text overlay. |
| **s07** (`scene_007`) | 8.33s | statistic / evidence | `stat:hero` (1 shot) | **BAD** | Exact repetition of the Scene 4 KPI widget ("$150 million"). Holds for 8.33 seconds on a single number with zero supporting visual evidence, Boeing 747 reference, or context. Viewer fatigue is extreme. |
| **s08** (`scene_008`) | 6.57s | list / list | `list:ledger` ➔ `list:stack` | **BAD** | **Critical rendering failure**: Frame renders 99% pitch-black void because items have initial opacity 0 waiting for word-level timestamps, but nested sequence offsets broke timing. Numbered list bullet slide appearance. |
| **s09** (`scene_009`) | 5.70s | atmosphere / escalate | `image:full` ➔ `image:depth` (shots 2-3) | **WEAK** | Shot 1 full bleed is decent, but shots 2 and 3 reuse the exact same vertical 800x2000 image inside `depth` mode, producing a jarring double-take on a narrow vertical strip. |
| **s10** (`scene_010`) | 4.90s | subject / context | `image:full` ➔ `image:editorial` | **ACCEPTABLE** | Relevant geopolitical map asset. Shot 2 suffers from the empty left panel artifact of `image:editorial`. |
| **s11** (`scene_011`) | 5.80s | subject / evidence | `image:full` ➔ `image:editorial` (shots 2-3) | **WEAK** | The query "export control document" fell back to a 19th-century Australian slaughterhouse depot. Visual mismatch + repeated dead-space editorial split. |
| **s12** (`scene_012`) | 5.93s | subject / payoff | `image:full` (1 shot) | **GOOD** | Crisp 1080p cleanroom engineer asset, full bleed, restrained lower-third typography, balanced negative space. This is the baseline quality bar. |
| **s13** (`scene_013`) | 5.03s | atmosphere / payoff | `image:full` (shot 1 static ➔ shot 2 pan) | **ACCEPTABLE** | Cinematic wide asset, intentional static hold followed by a slow panoramic horizontal camera drift. Restrained type. |

---

## 3. Systematic Failure Analysis

### 3.1 Procedural-Card Fatigue (Scenes 3, 4, 7, 8)
- Over 30 seconds of an 82-second video (37%) consists of procedural graphics that look like SaaS dashboard widgets, Canva cards, or PowerPoint slides.
- **`stat:hero`**: Just an isolated huge number with an accent bar on a dark void. Holding this for 7 to 8 seconds causes viewer abandonment.
- **`process:default`**: A linear horizontal dot stepper with circular numbers 1, 2, 3 and connecting lines. It belongs in a web checkout funnel, not a documentary on deep-ultraviolet physics.
- **`list:ledger` / `list:cards`**: Numbered bullet points floating in cards or disappearing into pitch-black void due to reveal opacity bugs.

### 3.2 Repetitive Camera Zoom & Lack of Intentional Static
- Every single media shot was assigned a continuous scaling move (`pull` or `push`).
- When two shots in a scene share an asset or framing, the camera zooms in, cuts, and zooms out, creating a distracting accordion effect.
- Strong documentary photographs and diagrams are never allowed to sit statically with editorial dignity.

### 3.3 Composition, Aspect Ratio, and Crop Failures
- `image:depth` was designed as a bandaid for vertical portrait photos in 16:9, but it creates a tiny floating card in the center with a blurry drop-shadow background. In documentary editing, portrait or non-standard assets should be treated with an **Editorial Split** (image filling one side cleanly, or cropped to a dynamic detail window), never a floating drop-shadowed box.
- `image:editorial` reserves 44% of the left screen for typography. When a multi-shot scene cuts to Shot 2 or Shot 3, those secondary shots usually lack headline text, leaving an enormous black dead hole on the left 44% of the video.

### 3.4 Caption Interference
- When word-level highlighted captions sit at the bottom center of the screen, they directly collide with `process:default` step details, `stat:hero` metric labels, and lower-third headlines.
- In 16:9 landscape format, captions should default to clean, restrained phrase subtitles that yield completely when major on-screen graphics are active.

---

## 4. Required Redesign Strategy for Milestone 6

1. **Procedural Graphics Redesign:**
   - Eradicate generic card containers, rounded boxes, drop shadows, and horizontal dot steppers.
   - Redesign `stat`, `process`, `list`, `timeline`, `comparison`, and `statement` using high-end editorial motion design: full-frame typography, minimalist editorial rules, asymmetric balance, and contextual sub-metrics.
2. **Editorial Camera Grammar:**
   - Introduce deliberate states: `STATIC`, `SUBTLE`, `ACTIVE`.
   - Ensure high-value photographs, documents, and charts can hold statically.
   - Expand camera motion vocabulary (`subtlePush`, `subtlePull`, `pan`, `detailCrop`, `parallax`). Prohibit >2 consecutive identical moves.
3. **Editorial Crop & Layout System:**
   - Replace the awkward `image:depth` floating phone card with `EditorialCrop` and full-frame or clean split framing.
   - Fix `image:editorial` so it never leaves an empty black half-screen on secondary shots.
4. **Fix Shot-Level Timing & List Visibility:**
   - Ensure list items, process steps, and timeline points never render as an empty pitch-black screen. Structure must be visible immediately, with active highlighting following narration.
5. **Caption Mode & Safe Area Control:**
   - In 16:9 landscape, support `MINIMAL` and `PHRASE` caption modes that gracefully yield during headline/data moments.
