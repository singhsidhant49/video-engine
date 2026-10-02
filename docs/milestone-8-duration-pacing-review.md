# Milestone 8 Review: Duration Budgeting, Duration Enforcement & Pacing Balance

**Status:** Completed  
**Branch:** `dev`  
**Test Suite:** 34 passing tests across contracts, fixtures, storyboard, pacing, duration budget, and timeline QC  
**Benchmark Test:** "Why Your Brain Chooses Instant Gratification" (format: `landscape`, requested duration: `75s`, style: `minimal_premium`)

---

## 1. Executive Summary & Core Principle

In Milestone 7, the engine eliminated frenetic overcutting and introduced content-aware shot pacing, raising average shot duration from 2.36s to 6.44s. However, because duration was treated as an unconstrained post-hoc outcome rather than an upfront creative constraint, the 75s psychology explainer expanded to **115.87 seconds (+54.5% over target)** with 308 words and 15 of 18 shots exceeding 5 seconds.

**Milestone 8 established the core architectural principle:**
> `--duration` is a **CREATIVE BUDGET**, not an audio time-stretch target. It directly governs script word budget, section allocations, beat count, shot count, pause budget, and hold durations **before** text-to-speech audio is generated.

Under Milestone 8:
- **Requested Target:** 75 seconds (acceptable range $\pm 5\%$: 71.25s – 78.75s; hard QC limits $\pm 10\%$: 67.5s – 82.5s)
- **Actual Final Duration:** **77.83 seconds** (+3.77% variance, strictly within the $\pm 5\%$ tolerance band)
- **Script Words:** Reduced from 308 words to **190 words** (budgeted target: 181 words, max ceiling: 190)
- **Shots & Pacing:** 10 scenes, 11 shots, 0 rapid cut windows, 0 weak holds, average shot duration 7.08s.

---

## 2. Architecture & Algorithm Changes

### A. Video Duration Budget Allocator (`src/storyboard/durationBudget.js`)
Before storyboard generation or LLM prompting, `calculateDurationBudget` computes the complete mathematical budget:
1. **Target & Bounds:**
   - `targetDurationSec`: requested duration (e.g. 75s).
   - `allowedMinDuration` ($-5\%$ = 71.25s) / `allowedMaxDuration` ($+5\%$ = 78.75s).
   - `hardMinDuration` ($-10\%$ = 67.5s) / `hardMaxDuration` ($+10\%$ = 82.5s).
2. **Editorial Reserves & Narration Time:**
   - Reserves 0.8s opening title hold, 2.2s closing thought hold, and budgeted intentional pauses (~1.5s).
   - `targetNarrationSec`: $75.0 - 4.5 = 70.5\text{s}$.
3. **Voice-Calibrated Word Budgeting:**
   - Calibrated against observed Kokoro speech rate (2.60 words/second or ~156 WPM at 1.0x speed).
   - `targetWords`: $\text{round}(70.5 \times 2.6 \times \text{voiceSpeed}) \approx 181\text{ words}$.
   - `maxWords`: strictly capped at $\text{round}(\text{targetWords} \times 1.05) \approx 190\text{ words}$.
4. **Section Duration Allocations:**
   - **Hook:** ~7.5s (~20 words)
   - **Why It Matters / Question:** ~10.5s (~27 words)
   - **Core Explanation:** ~28.5s (~74 words)
   - **Example / Contrast / Evidence:** ~15.0s (~39 words)
   - **Payoff & Conclusion:** ~13.5s (~35 words)

### B. Two-Pass Script Generation (`src/services/aiDirectorService.js`)
Rather than expecting a single unconstrained LLM call to simultaneously discover structure and adhere to length:
- **Pass 1 (Beat Outline):** Generates structured content beat outline matching the exact target scene count and section word allocations.
- **Pass 2 (Scene Drafting):** Authors full narration, visual intent, importance, and shot guidance constrained to the outline and word ceiling.

### C. Pre-TTS Script Duration Validation & Compression
Before synthesizing any audio:
- `estimateScriptDuration` validates the total words against `maxWords`.
- If the script exceeds budget, `compressPlanScript` immediately triggers an editorial compression pass (LLM or deterministic) that trims wordy intros, filler adverbs, and secondary examples while strictly protecting the hook tension and conclusion payoff.

### D. Post-TTS Duration Repair Loop (`src/pipeline/videoGeneratorPipeline.js`)
After Kokoro synthesizes audio and Whisper measures actual word timestamps:
- If actual narration duration exceeds `allowedMaxDuration` (e.g. if the selected voice spoke slower than nominal WPM), the pipeline catches this **before visual resolution**.
- Automatically computes the required compression ratio, recompresses the script, and re-synthesizes audio (up to 2 repair attempts).
- In the psychology benchmark, the initial 193-word voiceover at 0.9x speed took 79.19s (exceeding 78.75s). The repair loop automatically recompressed to 170–190 words, re-synthesized audio in 77.83s, and proceeded with perfect timing.

### E. Semantic Fallback Routing & Typographic Run Repair (`src/pipeline/visualDirector.js`)
- Missing media no longer falls back indiscriminately to generic `StatementShot`.
- Recasting inspects the scene's semantic intent and shot kind:
  - `process` $\rightarrow$ `ProcessShot` (`process:flow` / `process:steps`)
  - `compare` $\rightarrow$ `CompareShot` (`compare:columns`)
  - `stat` / `data` $\rightarrow$ `ChartShot` / `HeroStatShot`
  - `timeline` / `sequence` $\rightarrow$ `TimelineShot`
  - `document` / `evidence` $\rightarrow$ `DocumentShot`
  - `emphasis` $\rightarrow$ `StatementShot`
- Consecutive `StatementShot` runs are repaired by switching variants (`statement:kinetic`, `statement:words`, `statement:highlight`) or elevating to structured visual comparisons.

### F. Granular Pacing Diagnostics & QC Enforcement (`src/pipeline/continuityDirector.js` & `src/qc/timelineQc.js`)
- Reports full statistical percentiles: `min`, `p25`, `median`, `p75`, `max` shot duration.
- Reports duration distribution buckets: `<2s`, `2–3s`, `3–5s`, `5–7s`, `>7s`.
- Evaluates sliding 10-second windows for:
  - `OVERACTIVE`: $>5$ cuts in 10s (overcutting).
  - `UNDERACTIVE`: $\ge 10\text{s}$ static hold on weak/low-complexity graphics.
- Classifies visual holds: `STRONG_HOLD` (authentic photo, chart, process), `ACCEPTABLE_HOLD`, `WEAK_HOLD`.
- Timeline QC enforces hard duration limits ($\pm 10\%$ error) and target tolerance ($\pm 5\%$ warning).

---

## 3. Comparison Across Milestones 6, 7, and 8

| Metric | Milestone 6 (Fast / Overcut) | Milestone 7 (Slow / Over-Expanded) | Milestone 8 (Balanced Budget) | Target / Acceptable Range |
|---|:---:|:---:|:---:|:---:|
| **Requested Duration** | 75.0s | 75.0s | 75.0s | 75.0s |
| **Final Video Duration** | 68.20s | **115.87s** (+54.5%) | **77.83s** (+3.77%) | **71.25s – 78.75s (±5%)** |
| **Script Word Count** | 158 words | **308 words** | **190 words** | ~180–190 words |
| **Scene Count** | 16 scenes | 17 scenes | 10 scenes | 8–11 scenes |
| **Shot Count** | 29 shots | 18 shots | 11 shots | 10–14 shots |
| **Average Shot Duration** | 2.36s (too fast) | 6.44s (over-held) | 7.08s (comprehensible) | 4.0s – 8.0s |
| **Median Shot Duration** | 2.10s | 6.20s | 7.23s | 4.5s – 7.5s |
| **p10 Shot Duration** | 1.10s | 4.80s | 4.97s | > 3.0s |
| **p90 Shot Duration** | 3.80s | 8.90s | 8.53s | < 10.0s |
| **Cuts per 10 Seconds** | **4.24** (frenetic) | 1.55 | **1.28** | 1.0 – 2.5 |
| **Rapid Cut Windows (>5 cuts/10s)** | 3 | 0 | **0** | 0 |
| **Underactive Windows (Weak hold)** | 0 | 4 | **0** | 0 |
| **Consecutive Photo Runs** | 4 | 2 | **1** | $\le 2$ |
| **Consecutive Typographic Runs**| 3 | 3 | **2** | $\le 2$ |
| **Family Repetition Rate** | 24% | 15% | **10%** | < 15% |
| **Readability Warnings** | 2 | 0 | **0** | 0 |

---

## 4. Duration Diagnostics Summary (`duration-budget.json`)

```json
{
  "requestedDuration": 75,
  "allowedRange": {
    "min": 71.25,
    "max": 78.75
  },
  "hardLimits": {
    "min": 67.5,
    "max": 82.5
  },
  "finalVideoDuration": 77.83,
  "actualNarrationDuration": 77.83,
  "estimatedNarrationDuration": 73.08,
  "durationVarianceSec": 2.83,
  "durationVariancePercent": 3.77,
  "isWithinTolerance": true,
  "isWithinHardBounds": true,
  "scriptWordBudget": {
    "target": 181,
    "min": 168,
    "max": 190,
    "actual": 190
  },
  "pauseBudget": {
    "budgetedSec": 2.25,
    "actualSec": 0
  },
  "compressionPasses": 2,
  "expansionPasses": 0
}
```

---

## 5. Visual Realization & Contact Sheet Inspection

The rendered contact sheet (`renders/runs/video-2026-09-27T16-30-25/contact-sheet.jpg`) confirms clean, niche-appropriate visual progression without template monotony:
- **00:00 – 00:07 (Hook):** Real authentic B-roll of smartphone in hand with subtle mood lighting; title lower third "Now or later?".
- **00:07 – 00:13 (Why It Matters):** Semantic Chronology / Timeline graphic tracking habit formation (Day 1 $\rightarrow$ Year 1 $\rightarrow$ Year 10).
- **00:13 – 00:20 (Evolutionary Context):** Editorial authentic image of doctor reviewing brain MRI scan on tablet: "Ancient wiring: Not a flaw".
- **00:20 – 00:28 (Core Mechanism 1):** Technical Process flow illustrating the impulse pathway: Trigger $\rightarrow$ Limbic spike $\rightarrow$ Act now.
- **00:28 – 00:36 (Core Mechanism 2):** Typographic contrast setup: "Slower reason".
- **00:36 – 00:44 (Comparative Analysis):** Two-column contrast layout: Limbic system vs Prefrontal cortex.
- **00:44 – 00:54 (Evidence / Experiment):** Hyperbolic discounting chart showing value decay over delay time.
- **00:54 – 01:01 (Historical Reference):** Stanford 1972 Marshmallow Test graphic with phrase-level text reveal.
- **01:01 – 01:09 (Modern Context):** Real authentic B-roll of modern desk and phone interaction: "Engineered for now".
- **01:09 – 01:17 (Payoff & Resolution):** Memorable closing conclusion with word-by-word emphasis on rewiring intentional friction.

---

## 6. Definition of Done Checklist

- [x] `--duration` is a real creative budget that constrains script, sections, scenes, and shots before rendering.
- [x] Script generation uses calculated word and time budgets (two-pass beat outline + scene drafting).
- [x] Duration is estimated before TTS audio generation.
- [x] Overlong scripts are automatically compressed prior to TTS.
- [x] Actual TTS narration duration is measured against target; automatic repair loop activates if over budget.
- [x] Global beat allocation exists across narrative sections.
- [x] Comprehension floors remain protected (charts, timelines, and processes are allocated $\ge 6$s).
- [x] Weak long holds are detected and flagged in sliding 10-second window diagnostics.
- [x] Pause time is budgeted and tracked in duration diagnostics.
- [x] Underlength is not filled with generic filler.
- [x] Missing media does not default indiscriminately to typography; routes semantically by intent.
- [x] Adjacent typography runs are repaired ($\le 2$ consecutive text cards).
- [x] Psychology benchmark video lands within $\pm 5\%$ of 75 seconds (77.83s, +3.77%).
- [x] Pacing remains balanced and clearly superior to Milestone 6.
- [x] All 34 tests pass cleanly.
- [x] AI-generated media remains disabled.

---

## 7. Remaining Pacing Weaknesses & Next Milestone Recommendation

### Remaining Minor Observations:
1. **Dynamic Shot Count per Scene:** The engine produced 11 shots across 10 scenes (1.1 shots/scene). While appropriate for a contemplative 75s psychology explainer, high-tempo documentary scenes or concrete multi-angle examples should more readily support 2–3 micro-shots (e.g. context $\rightarrow$ detail crop) when visual assets permit.
2. **Kinetic Text Micro-Motion:** For text cards held for 6–7 seconds, adding subtle staged illumination or secondary graphic badges avoids static-hold warnings in timeline QC.

### Recommendation for Next Milestone:
Proceed to **Milestone 9: Audio Layer Polish, Dynamic BGM Ducking & Sound Design Synchronization**. Now that timing and duration are mathematically constrained and predictable, the audio layer (ambient sound effects on transitions, proportional BGM ducking under speech, and SFX trigger alignment) will elevate the output to broadcast-quality production standards.
