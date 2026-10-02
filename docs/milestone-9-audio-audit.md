# Milestone 9 Audio Pipeline Audit

**Date:** 2026-09-28  
**Scope:** Audio pipeline evaluation across Kokoro TTS, BGM selection & automation, SFX design, speech envelope ducking, pause classification, and final delivery mastering.  
**Benchmark Case:** "Why Your Brain Chooses Instant Gratification" (77.83s, landscape, `minimal_premium`, run: `video-2026-09-27T16-30-25`).

---

## 1. Executive Summary

While Milestones 1–8 established an authoritative storyboard, asset intelligence, content-aware pacing, and duration budgeting, the audio subsystem has remained primitive:
1. **Narration is under-gained:** Kokoro outputs raw un-normalized 24kHz 16-bit mono audio at approximately **-24.2 dBFS RMS / ~ -22.5 LUFS**, which is 6–8 dB below YouTube's standard delivery window (-14 to -16 LUFS).
2. **Music ducking suffers from a feast-or-famine binary failure:**
   - When inter-word gaps are $<500$ms, the greedy algorithm merges the entire 77.8s timeline into a single uninterrupted speech interval `[0, 2332]`. BGM is forced into permanent deep suppression (`volume = 0.035`), burying the soundtrack entirely.
   - Conversely, when pauses exceed 500ms, the symmetric 12-frame (400ms) linear ramp triggers severe **music pumping**—surging into full base volume and then abruptly slamming back down as soon as speech resumes.
3. **SFX transients risk digital clipping:** `impact_boom.wav` was found to have 4 clipped samples at 0.00 dBFS in its source file. No stem limiter or true-peak ceiling exists before Remotion mixing.
4. **Music looping is unmanaged:** The 45-second ambient soundtrack loops abruptly at 45.0s with no crossfade or section-level energy variation.
5. **No intentional audio structure:** No pre-roll music establishment, no post-narration payoff tail, and no audio bed protection under complex graphics (charts, process flows).

---

## 2. Empirical Measurements (Benchmark Run)

### A. Narration Stem (`public/narration.wav`)
- **Format:** 24,000 Hz, 16-bit PCM, Mono
- **Duration:** 77.83 seconds (190 words)
- **Peak Level:** -3.08 dBFS
- **RMS Level:** -24.17 dBFS
- **Estimated Integrated Loudness:** ~ -22.5 LUFS
- **Clipping:** 0 samples
- **Diagnosis:** The signal has adequate headroom (-3 dBFS peak), but the perceived loudness is much too low for YouTube (-14 to -16 LUFS target). Without normalization, the viewer is forced to raise system volume, which exacerbates loud SFX and BGM surges.

### B. BGM Stem (`cinematic_ambient_business_editorial.wav`)
- **Format:** 22,050 Hz, 16-bit PCM, Mono
- **Duration:** 45.00 seconds (repeats at frame 1350 in a 2335-frame timeline)
- **Peak Level:** -15.12 dBFS
- **RMS Level:** -27.88 dBFS
- **Remotion Base Gain:** 0.10 (synthetic) / 0.16 (licensed)
- **Remotion Ducked Gain:** 0.035 (synthetic) / 0.05 (licensed)
- **Diagnosis:** The track is 32 seconds shorter than the video. Remotion's native `<Audio loop />` creates an unpadded repeat at 45.0s. Furthermore, the ducked gain of 0.035 attenuates an already quiet track (-28 dBFS RMS) by another 29 dB, rendering it inaudible on mobile devices.

### C. SFX Stems (`public/audio/sfx/*.wav`)

| SFX File | Sample Rate | Duration | Peak Level (dBFS) | RMS Level (dBFS) | Clipped Samples |
|---|:---:|:---:|:---:|:---:|:---:|
| `cash_register.wav` | 44,100 Hz | 0.60s | -4.67 | -18.49 | 0 |
| `click.wav` | 44,100 Hz | 0.04s | -6.21 | -18.85 | 0 |
| `impact_boom.wav` | 44,100 Hz | 0.85s | **0.00** | -14.55 | **4 (Clipped)** |
| `paper_slam.wav` | 44,100 Hz | 0.32s | -3.16 | -21.03 | 0 |
| `sub_drop.wav` | 44,100 Hz | 1.10s | -1.49 | -12.33 | 0 |
| `whoosh.wav` | 44,100 Hz | 0.38s | -7.92 | -22.32 | 0 |

- **Diagnosis:** `impact_boom.wav` clips at digital full scale (0.00 dBFS). In `timeline.js`, it is invoked with gain 0.35, but when added to narration peaks, it risks inter-sample clipping on consumer DACs.

---

## 3. Analysis of Current Flaws

### 1. The Speech Interval Collapse & Ducking Pumping
In `src/pipeline/timeline.js`:
```javascript
const speech = [];
for (const w of words) {
  const last = speech[speech.length - 1];
  if (last && w.startFrame - last[1] < fps * 0.5) last[1] = w.endFrame;
  else speech.push([w.startFrame, w.endFrame]);
}
```
And in `src/remotion/engine/Video.jsx`:
```javascript
const RAMP = 12; // 400ms
return (f) => {
  let dist = Infinity;
  for (const [a, b] of speech) {
    if (f >= a && f <= b) { dist = 0; break; }
    dist = Math.min(dist, f < a ? a - f : f - b);
  }
  const duck = Math.min(1, dist / RAMP);
  const v = bgm.ducked + (bgm.base - bgm.ducked) * duck;
  ...
}
```
**Failure mechanism:**
- If word gaps are $<15$ frames (500ms), all words coalesce into one interval. The ducking parameter `dist` stays 0 for the entire video. The music stays pinned at 0.035 gain (dead silence).
- If word gaps are $>15$ frames (e.g. an intentional 0.8s pause), `dist` reaches 12 after only 0.4s. The music surges from 0.035 to 0.16 (a +13 dB leap) for a fraction of a second, then violently plunges back down as soon as the next word starts.
- There is **no Attack/Hold/Release envelope**, no distinction between breath pauses and editorial pauses, and no lookahead.

### 2. Lack of Pause Classification
Currently, all gaps between words are treated identically. In real editorial mixing:
- **Micro-pauses (~100–500ms):** Natural phrasing and breathing. Music must **remain ducked** without flutter or pumping.
- **Normal pauses (~500ms–1.5s):** End of sentence or transition between points. Music should perform a gentle, partial swell (e.g. -6 dB rather than full +14 dB).
- **Editorial pauses (>1.5s):** Intentional dramatic silence or thinking beats. Music may bloom to full base volume with a smooth release envelope.

### 3. Lack of Loudness Target & Stem Headroom
YouTube recommends videos be uploaded targeting **-14 LUFS ($\pm 1$ LUFS)** with a maximum true peak of **-1.0 dBTP**.
Currently:
- There is no loudness calculation.
- Stems are combined in Remotion without a limiter or bus compressor.
- Narration sits at ~ -22.5 LUFS.

### 4. Section-Level Music Energy Ignored
In documentary and explainer storytelling:
- **Hook (0:00–0:10):** Medium-high intensity; music should establish briefly before speech.
- **Explanation (0:10–0:40):** Low-medium bed; speech intelligibility is paramount.
- **Complex Graphic Hold (Process / Chart):** Music must drop further (-2 to -4 dB) so visual comprehension is unhindered.
- **Payoff / Conclusion:** Swell to emotional resolution; music continues for 1.5–2.5s after speech ends (tail).

---

## 4. Architectural Plan for Milestone 9

1. **Audio Mastering Engine (`src/audio/audioMastering.js`):**
   - Pure Node.js audio DSP for WAV normalization: calculates RMS, peak dBFS, and EBU R128 loudness.
   - Normalizes narration stem to target **-16.0 LUFS** (with true-peak limited to **-1.5 dBFS**), maintaining natural speech dynamics without aggressive compression.
   - Calibrates and clamps SFX library assets to prevent digital clipping (`impact_boom` peak clamped to -3 dBFS).
2. **Dynamic BGM Ducking Envelope Generator (`src/audio/duckingEngine.js`):**
   - Generates a frame-by-frame continuous gain curve using an asymmetrical **Attack-Hold-Release** envelope:
     - **Attack:** Fast, smooth dip when speech begins (~120ms / 4 frames).
     - **Hold:** Minimum recovery hold of 600ms (18 frames) after speech stops.
     - **Release:** Slow, musical swell (~800–1200ms / 25–35 frames) only when pause warrants it.
   - Classifies every pause:
     - `MICRO_PAUSE` (100–500ms): 100% ducked (zero pumping).
     - `NORMAL_PAUSE` (500ms–1.5s): partial recovery (capped at 40–50% swell).
     - `EDITORIAL_PAUSE` (>1.5s): full musical recovery.
3. **Section-Aware Energy & Graphic Bed Protection:**
   - Adjusts BGM base and ducked ceilings based on narrative section (`hook`: medium/high, `core_explanation`: low/medium, `chart/process`: bed protection -3 dB).
4. **Music Intro & Payoff Tail:**
   - Intro: BGM starts 0.3s before first word.
   - Outro: BGM holds and resolves with a 2.0s tail after the final spoken word before fading out.
5. **Restrained SFX Policy & Audio QC:**
   - Eliminates rapid-fire SFX. Caps SFX frequency to minimum 5s gap.
   - Records comprehensive diagnostics in `audio-diagnostics.json`.
   - Adds timeline QC checks: `audio-speech-masking`, `audio-pumping-risk`, `audio-peak-clipping`, `audio-loudness-target`.
