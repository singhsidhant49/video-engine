> **Superseded:** this describes the previous template system. The current contract lives in `src/shared/styles.js` (styles/tokens), `src/services/aiDirectorService.js` (director schema) and `PIPELINE_ARCHITECTURE.md`.

# Remotion Frame & Composition Guidelines

## 1. Canvas Dimensions
- **Vertical Shorts / Reels / TikTok**: `1080 x 1920` (9:16 aspect ratio)
- **Landscape YouTube Explainer**: `1920 x 1080` (16:9 aspect ratio)
- **Base Frame Rate**: `30 FPS`

---

## 2. Mobile Safe Zones (9:16 Vertical)
Social platforms overlay native UI (usernames, audio titles, likes, comments, and captions) over vertical videos. All visual subjects MUST respect these bounds:

- **Top Safe Zone (0% - 14%)**: Reserved for account headers, status bars, and video category tags.
- **Bottom Safe Zone (82% - 100%)**: Reserved for audio titles, channel handle, and progress bar.
- **Right Edge Margin (84% - 100%)**: Reserved for platform interaction buttons (Like, Share, Remix).
- **ACTIVE STAGING AREA**: `Top 14% to 80%`, `Left 6% to 84%` (max width ~800px).
  - All headlines, cards, charts, evidence documents, and photo polaroids MUST stay within this active staging area.

---

## 3. Z-Index Layer Stacking Order
Every frame is composed of structured depth layers:

```
[Layer 4] (z-index: 100) — Word-level Animated Subtitle Pill (Safe Lower-Third at 18% from bottom)
[Layer 3] (z-index: 80)  — Floating Glass Badges & Stamp Overlays
[Layer 2] (z-index: 50)  — Core Visual Subject (Media, Evidence Document, Chart, Polaroid Stack, Quote Card)
[Layer 1] (z-index: 20)  — Cinematic Radial Vignette & SVG Animated Film Grain Overlay (6-8% opacity)
[Layer 0] (z-index: 10)  — Liquid Mesh Background / Ambient Topic Photo Scrim / Studio Spotlight
```

---

## 4. Editorial Directive: Visual Idea over Template
Every scene must follow the creative chain:
$$\text{NARRATION} \longrightarrow \text{MEANING} \longrightarrow \text{VISUAL IDEA} \longrightarrow \text{COMPOSITION} \longrightarrow \text{MOTION} \longrightarrow \text{TRANSITION}$$

- **Zero on-screen text duplication**: Do not transcribe spoken voiceover into on-screen title text. On-screen text is exclusively for evidentiary stamps, leaked documents, data statistics, or punchy 1-2 word kinetic hooks.
- **Intentional Camera Motion**: Use continuous subtle camera drift (pan-and-scan, push-in, parallax) so no frame feels static.
