# Milestone 5: Asset Quality Review & Pipeline Validation

**Date:** 2026-09-27  
**Branch:** `dev`  
**Evaluation Scope:** Three real end-to-end pipeline validation runs (`--no-render`) and one full 82-second 1080p Landscape Explainer render.

---

## 1. Executive Summary

Milestone 5 was validated across three distinct content domains:
1. **ASML / Semiconductor Topic:** *"How ASML Dominates Global Chipmaking With EUV Lithography"* (`video-2026-09-27T12-58-07`)
2. **NVIDIA / Business Case Study:** *"How Nvidia Became The Engine of The AI Revolution"* (`video-2026-09-27T13-02-47`)
3. **Nuclear Fusion / Science Explainer:** *"How Nuclear Fusion Could Provide Unlimited Clean Energy"* (`video-2026-09-27T13-09-46`)

In all three pipelines, the Asset Intelligence Layer successfully enforced semantic correctness over visual beauty:
- **Zero false-match leaks:** No headquarters building or logo won for product/hardware requests.
- **Authentic subject wins:** Real ASML cleanroom EUV scanners and Nvidia H100 Tensor Core GPU boards won their respective primary shots.
- **Graceful procedural routing:** Data and comparison shots (e.g. nanometer scale comparisons, revenue charts, and plasma reaction diagrams) routed to procedural Remotion cards instead of forcing irrelevant stock photos.
- **Deterministic 1080p Render:** Rendered `renders/video-2026-09-27T12-58-07-landscape.mp4` (82.39s, 2470 frames, 0 blank frames, 0 frozen frames, 100% audio sync).

---

## 2. Quantitative Quality Diagnostics

Across the validation runs, `asset-quality-diagnostics.json` recorded the following metrics:

| Metric | ASML Run (`12-58-07`) | NVIDIA Run (`13-02-47`) | Fusion Run (`13-09-46`) |
| :--- | :--- | :--- | :--- |
| **Total Shot Requests** | 26 | 25 | 23 |
| **Excellent Selections** | 12 (46.2%) | 11 (44.0%) | 8 (34.8%) |
| **Good Selections** | 0 (0.0%) | 2 (8.0%) | 1 (4.3%) |
| **Acceptable Selections** | 1 (3.8%) | 0 (0.0%) | 1 (4.3%) |
| **Weak Selections** | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) |
| **Unresolved / Procedural** | 13 (50.0%)* | 12 (48.0%)* | 13 (56.5%)* |
| **Average Semantic Score** | 0.905 | 0.881 | 0.865 |
| **Average Presentation Score**| 0.945 | 0.938 | 0.920 |
| **Provider Calls** | 96 | 88 | 78 |
| **Query Stage Usage (EXACT)** | 12 | 13 | 9 |
| **Exact Asset Reuse Count** | 0 | 0 | 0 |
| **Concept Reuse Count** | 2 | 1 | 1 |
| **Portrait False Match Gated**| 0 (disqualified) | 0 (disqualified) | 0 (disqualified) |
| **Building False Match Gated**| 0 (disqualified) | 0 (disqualified) | 0 (disqualified) |
| **Cliche Penalties Applied** | 1 | 2 | 1 |

*\*Note: "Unresolved / Procedural" consists primarily of authored procedural data shots (charts, process cards, comparisons) which are intentionally handled by procedural Remotion families without downloading third-party media.*

---

## 3. Shot-by-Shot Inspection: ASML Semiconductor Pipeline

| Scene / Shot ID | Concept Requested | Resolution Status | Provider | Asset Selected | Gate / Verification Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `s01_shot_01` | ASML cleanroom EUV machine | **excellent** | Brave | ASML cleanroom EUV machine | Exact machine photo; building excluded. |
| `s01_shot_02` | ASML cleanroom EUV machine | **excellent** | Brave | ASML cleanroom EUV machine | Multi-shot progression angle. |
| `s01_shot_03` | semiconductor cleanroom interior | **excellent** | Brave | ASML cleanroom | Authentic cleanroom environment. |
| `s02_shot_01` | silicon wafer close-up | **excellent** | Brave | Wafer after processing | High-res silicon wafer photo. |
| `s03_shot_01-03`| tin droplet laser plasma | *procedural* | — | — | Procedural process diagram. |
| `s04_shot_01` | nanometer scale comparison | *procedural* | — | — | Procedural hero stat / compare. |
| `s05_shot_01` | 1990s semiconductor research lab | *recast* | — | — | Recast to title "Decades of Doubt". |
| `s06_shot_01` | ASML headquarters Veldhoven | **excellent** | Wikipedia | ASML Veldhoven Campus | Authentic building (explicitly requested). |
| `s06_shot_02` | ASML headquarters Veldhoven | **excellent** | Brave | ASML headquarters | Secondary angle for headquarters beat. |
| `s07_shot_01` | EUV machine shipping ($200M) | *procedural* | — | — | Procedural hero stat ($200M). |
| `s08_shot_01-02`| TSMC / Samsung fabs | *procedural* | — | — | Procedural comparison flow. |
| `s09_shot_01` | empty semiconductor fab | **excellent** | Brave | empty semiconductor fab | Atmospheric fab shot. |
| `s09_shot_03` | shutdown fab | **excellent** | Brave | shutdown fab | Tense atmospheric lighting. |
| `s10_shot_01-02`| world map export controls | **excellent** | Brave | Global semiconductor map | Geopolitical map graphic. |
| `s11_shot_03` | semiconductor export ban | **acceptable** | Commons | Port Adelaide Export Depot | Historical archival export photo. |
| `s12_shot_01` | ASML engineers working | **excellent** | Brave | Engineer working in cleanroom | Authentic cleanroom engineering. |
| `s13_shot_01` | futuristic city night | **excellent** | Brave | City Lights Futuristic Night | Dramatic payoff establishing shot. |

---

## 4. Full Landscape Render Results

The full video generation pipeline was rendered to disk:
- **Output File:** `renders/video-2026-09-27T12-58-07-landscape.mp4`
- **Resolution:** $1920\times1080$ (Landscape 16:9)
- **Duration:** 82.39 seconds (2470 frames at 30 fps)
- **Audio:** 192 kbps AAC, -16 LUFS normalized dialogue, background ambient bed
- **Post-Render QC:**
  - `blank-frames`: 0 (none)
  - `frozen-clips`: 0 (every clip moves)
  - `duration`: 82.39s (matches 82.33s timeline within 2 frames)
- **Visual Critic Keyframe Sheet:** Saved to `renders/runs/video-2026-09-27T12-58-07/contact-sheet.jpg`.

---

## 5. Explicit Weak / Unresolved Selections & Future Roadmap

1. **Specific Historical Archive Shots:** For `scene_005` (*1990s semiconductor research lab*), neither Wikimedia Commons nor Brave yielded a verified 1990s photo with free editorial license. The pipeline correctly refused to substitute a generic modern stock office and instead recast to a clean typographic title card (*"Decades of Doubt"*).
2. **Export Control Treaty Document:** For `scene_011_shot_01`, a specific government seal / export control treaty document was unresolved and gracefully promoted the second shot in the scene.
3. **Web Editorial Licensing Traceability:** Web images acquired via Brave Search are classified as `Web Editorial (Brave Search)`. All third-party sources and URLs are saved into `credits.txt` for automatic video description attribution.
