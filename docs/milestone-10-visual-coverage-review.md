# Milestone 10: Visual Coverage & Explanatory Graphics Review

**Status:** COMPLETE  
**Primary Objective:** Eliminate generic typography and statement fallbacks when real media is unavailable. Empower the video engine to visually explain complex and abstract concepts using procedural code windows, repository UIs, relationship diagrams, supply chain maps, timelines, charts, comparisons, and authentic documents.

---

## 1. Visual Coverage Architecture

### 1.1 The Visual Coverage Plan (`src/storyboard/visualCoveragePlan.js`)
An intermediate, deterministic structure authored directly from the storyboard before asset resolution and editorial timing:
- **`classifyInformationType(scene)`**: Categorizes every content beat into one of 12 information types:
  `code` | `interface` | `process` | `comparison` | `relationship` | `timeline` | `location` | `data` | `evidence` | `entity` | `atmosphere` | `emphasis`.
- **`buildVisualCoveragePlan(storyboard)`**: Maps each shot to its optimal primary representation and an ordered non-statement fallback ladder (`fallbackRepresentations`).
- **`synthesizeProceduralData(scene, representation)`**: Synthesizes rich, topic-grounded semantic payloads (code with terminal test runs, file trees, multi-node neural pathways, supply chain geographic hubs) so procedural renderers never fail from sparse LLM data.

### 1.2 Elimination of "No Media → StatementShot"
Previously, whenever stock imagery was missing or unusable, `visualDirector.recast()` and `visualRealizationDirector.chooseFamily()` defaulted to `statement` text cards. This caused tech videos like *"How AI Coding Agents Work"* to collapse into 59% typographic statement cards.

Under Milestone 10, the fallback ladder is strictly semantic:
- **`code`** → `ModernCodeShot` (syntax highlighting, line numbers, line highlights, terminal drawer)
- **`interface`** → `ModernUiShot` (workspace, file tree, active context search bar, audit status)
- **`relationship`** → `DiagramShot` (connected nodes, directional SVG arrows, active stage highlight)
- **`location`** → `MapShot` (geopolitical coordinate grid, radar hubs, flight arcs)
- **`process`** → `ProcessShot` (sequential step flow with word anchoring)
- **`comparison`** → `CompareShot` (split canvas, shared baseline, side-by-side attributes)
- **`timeline`** → `TimelineShot` (chronological milestone progression)
- **`data`** → `ChartShot` (animated line/bar curves with highlight target)
- **`evidence`** → `DocumentShot` (archival header, headline, passage, and highlight region)
- **`emphasis`** → `StatementShot` (reserved strictly for true rhetorical emphasis)

---

## 2. New Explanatory Primitives

| Family | Component | Description & Visual Capabilities |
| :--- | :--- | :--- |
| **`code`** | `ModernCodeShot` | Dark IDE window, window control dots, active file tab, syntax-styled lines with line numbers, active line accent highlights, and embedded terminal drawer (`$ agent run`, test passes/fails). |
| **`ui`** | `ModernUiShot` | Workspace layout with active context search bar, multi-file directory tree, and right-hand inspection / audit status pane. |
| **`diagram`** | `DiagramShot` | Multi-component node and relationship architecture diagram with glass nodes, directional SVG dashed arrows, role tags, and stage illumination. |
| **`map`** | `MapShot` | Global coordinate supply chain map with pulsing radar pings, regional hubs, and dependency labels. |
| **`document`** | `DocumentShot` | Academic / archival research document with institution banner, paper headline, verbatim passage, and yellow/accent highlight bar. |

---

## 3. Visual Coverage Diagnostics (`visual-coverage-diagnostics.json`)

Persisted on every timeline run and enforced during Pre-Render QA:
- **`directCoverageCount` / `directRatio`**: Proportion of shots where visuals directly demonstrate the narration (code, diagrams, UI, charts, authentic subject media).
- **`weakCoverageCount` / `weakRatio`**: Proportion of shots using fallback typography or generic stock.
- **`unresolvedCount`**: Hard error blocker if any shot has missing payloads or unrendered canvases.
- **`perceptuallyBlankFrames`**: Cumulative count of frames containing only background texture and negligible content (hard error if > 2.0s).
- **`textOverflowWarnings`**: Upstream validation ensuring headlines stay within 2 lines / 80 characters.
- **`textGroundingWarnings`**: Lexical validation verifying that on-screen text corresponds to the scene narration.

---

## 4. Benchmark Regressions: Before vs. After

### 4.1 Tech Explainer: *"How AI Coding Agents Work"*
- **Run ID:** `video-2026-09-28T08-52-55`
- **Output:** `renders/video-2026-09-28T08-52-55-landscape.mp4`

| Metric | Milestone 9 (Before) | Milestone 10 (After) | Change |
| :--- | :--- | :--- | :--- |
| **Statement / Typography Share** | **59%** (10 of 17 scenes) | **5%** (1 shot) | **-54% drop** |
| **Code Visualization Share** | **0%** | **61%** | **+61%** |
| **UI & Repository Share** | **0%** | **11%** | **+11%** |
| **Process Flow Share** | **0%** | **9%** | **+9%** |
| **Authentic B-Roll Share** | 41% | 16% | Focused on actual dev scenes |
| **Direct Coverage Ratio** | 41% | **85%** | **+44% improvement** |
| **Weak Coverage Ratio** | 59% | **15%** | **-44% reduction** |
| **Unresolved Shots** | 0 | **0** | Clean |
| **Blank Frames** | 0 | **0** | Clean |

**Visual Verdict:** The video now genuinely looks like a software engineering documentary: viewers see code loops executing, terminal outputs flipping from `FAIL` to `PASS`, file trees being searched, and tool dispatch architectures.

### 4.2 Psychology Explainer: *"Why Your Brain Chooses Instant Gratification"*
- **Run ID:** `video-2026-09-28T09-01-31`
- **Output:** `renders/video-2026-09-28T09-01-31-landscape.mp4`
- **Duration:** 77.8s (Target: 75s ±5% = 71.25s–78.75s)

| Metric | Milestone 9 (Before) | Milestone 10 (After) | Change |
| :--- | :--- | :--- | :--- |
| **Statement Cards** | 40% | **0%** | **Completely eliminated** |
| **Process / Cognitive Loop** | 10% | **22%** | **+12%** |
| **Scientific Document Evidence** | 0% | **9%** | Stanford marshmallow study |
| **Data Discounting Chart** | 10% | **12%** | Hyperbolic decay curve |
| **Contextual UI / Habit Feeds**| 0% | **22%** | Notification / dopamine triggers |
| **Authentic B-roll Imagery** | 40% | **28%** | Preserved strong photography |
| **Direct Coverage Ratio** | 50% | **80%** | **+30% improvement** |
| **Weak Coverage Ratio** | 50% | **20%** | **-30% reduction** |
| **Audio Loudness** | -16.0 LUFS | **-16.0 LUFS** | Preserved Milestone 9 master |

---

## 5. Pre-Render Hard Failures & Quality Control

`src/qc/timelineQc.js` now enforces:
1. **`visual-coverage-unresolved`**: Hard error if any shot has unresolved visual coverage.
2. **`visual-coverage-blank-frames`**: Hard error if perceptually blank frames exceed 2 seconds (`fps * 2`).
3. **`visual-coverage-weak-ratio`**: Warning if weak coverage exceeds 40%.
4. **`visual-coverage-text-fitting`**: Upstream line limit enforcement (headlines capped at safe 2-line budgets).
5. **`visual-coverage-text-grounding`**: Warning if on-screen text has zero lexical grounding in the narration beat.

---

## 6. Test Suite
- Total tests: **45 / 45 passing** (`node --test tests/**/*.test.js`)
- New test suite: `tests/visualCoverage.test.js` verifying deterministic classification, non-statement fallback chains, procedural data synthesis, and QC error gating.
- External search providers: untouched.
- AI image generation: **strictly disabled**.
