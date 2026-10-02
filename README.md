# 🎬 Faceless Video Generation Pipeline (Node.js + DeepSeek + Kokoro TTS + Remotion)

An enterprise-grade, high-performance programmatic video generation pipeline built for faceless YouTube channels, Instagram Reels, and TikTok.

---

## How it works

An AI-directed editing engine: DeepSeek writes the narration and decides, sentence by sentence, what the viewer should see; a deterministic resolver turns that into an explicit timeline (frames, camera paths, reveals, captions, transitions, sound); Remotion renders it; QC checks the result. See [PIPELINE_ARCHITECTURE.md](PIPELINE_ARCHITECTURE.md) and [VISUAL_PIPELINE_AUDIT.md](VISUAL_PIPELINE_AUDIT.md).

---

## 🚀 Quick Start

### 1. Requirements & Prerequisites
- Node.js v18+
- Docker running `kokoro-tts` container (`docker start kokoro-tts`)
- DeepSeek API key (Optional; fallbacks provided if omitted)

### 2. Environment Setup
Create or update `.env`:
```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_URL=https://api.deepseek.com/v1

KOKORO_TTS_URL=http://localhost:8880/v1/audio/speech
KOKORO_VOICE=af_bella
KOKORO_SPEED=0.9

OUTPUT_FPS=30
PORT=3000
```

---

## 💻 Usage Options

### Option A: Web Studio Dashboard (Recommended)
Launch the visual browser dashboard to configure topics, select voices, preview options, and render videos:

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser!

### Option B: CLI Generator

```bash
# 9:16 Short (the director picks a style)
npm run generate -- --topic "How Uber scaled its architecture" --format shorts

# 16:9 long-form, planned chapter by chapter
npm run generate -- --topic "The rise and fall of Blockbuster" --format landscape --duration 480

# Use an existing narration file instead of TTS, force a style, or reuse a saved plan
npm run generate -- --topic "..." --audio path/to/voice.wav --style cinematic_documentary
npm run generate -- --topic "..." --plan renders/runs/<id>/plan.json --audio path/to/voice.wav

npm run generate -- --help

# Evaluate the real DeepSeek path across 10 kinds of brief, or compare every style on one plan
node scripts/evalDirector.js --render
node scripts/styleMatrix.js --plan renders/runs/<id>/plan.json --audio voice.wav
```

Each run writes `plan.json`, `words.json`, `direction.json`, `assets.json`, `timeline.json` and `qc.json` to `renders/runs/<videoId>/`. Preview a run as a contact sheet with `node scripts/previewRun.js renders/runs/<videoId>`.

### Option C: Remotion Studio Preview
Live preview and edit React video components in real-time:

```bash
npm run remotion:studio
```

---

## 📁 Output & Render Files
- Rendered `.mp4` videos are saved in `./renders/`
- Per-run artifacts and assets are in `./renders/runs/<videoId>/`
media-bank/
  video/
    technology/
    business/
    finance/
    psychology/
    science/
    history/
    abstract/
    backgrounds/
    transitions/
    textures/

  images/
    technology/
    business/
    finance/
    psychology/
    science/
    history/
    abstract/
    backgrounds/

  icons/
    ui/
    arrows/
    devices/
    finance/
    science/
    social/
    generic/

  overlays/
    grids/
    film-grain/
    light-leaks/
    paper-texture/
    noise/
    gradients/

  documents/
    generic-report/
    spreadsheet/
    code/
    newspaper/
    timeline/

  audio/
    whoosh/
    click/
    impact/
    riser/
    ambience/
# Production visual mode

Production generation defaults to `MEDIA_EDITORIAL`: real image/video media is composition-solved before Remotion renders it, while procedural chart/process/diagram/statement families are disabled. Use `--visual-mode LEGACY_PROCEDURAL` only for regression, debugging, or compatibility.

Useful validation commands:

```bash
npm test
npm run render:media-editorial
```
