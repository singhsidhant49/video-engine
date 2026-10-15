# 🎬 Faceless Video Generation Pipeline (Node.js + DeepSeek + Kokoro TTS + Remotion)

An enterprise-grade, high-performance programmatic video generation pipeline built for faceless YouTube channels, Instagram Reels, and TikTok.

---

## How it works

An AI-directed editing engine: DeepSeek writes the narration and decides, sentence by sentence, what the viewer should see; a deterministic resolver turns that into an explicit timeline; Remotion is used only as the renderer. Production `MEDIA_EDITORIAL` videos contain approved images/video clips plus subtitles—not Remotion chart, diagram, statement-card, or explainer templates.

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

# Use an existing narration/audiobook recording with its matching saved plan
npm run generate -- --topic "..." --plan renders/runs/<id>/plan.json --audio path/to/voice.wav

# Audiobook/chapter generated with Kokoro (long narration is chunked automatically)
npm run generate -- --topic "Chapter 1: The Beginning" --niche history --format landscape --duration 1200

# Validate everything through the contact-sheet gate without rendering the final MP4
npm run generate -- --topic "Chapter 1: The Beginning" --format landscape --duration 600 --contact-sheet-only

# Rebuild this old undersized run from planning so the new duration gate can expand it
npm run generate -- --resume video-2026-10-12T11-03-40 --from plan

# For a normally interrupted run whose inputs already pass QC, resume its failed checkpoint
npm run generate -- --resume <run-id>

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
mimages/
  technology/
  business/
  finance/
  psychology/
  science/
  history/

  health/
  lifestyle/
  people/
  work/
  education/

  nature/
  environment/
  cities/
  travel/

  infrastructure/
  industry/
  transportation/

  computers/
  software/
  ai/

  communication/
  internet/
  data/

  space/
  energy/
  medicine/

  abstract/
  concepts/
  backgrounds/

  documents/
  devices/
  objects/
# Production visual mode

Production generation defaults to `MEDIA_EDITORIAL`: real image/video media is composition-solved before Remotion renders it, while procedural chart/process/diagram/statement families are disabled. Use `--visual-mode LEGACY_PROCEDURAL` only for regression, debugging, or compatibility.

Useful validation commands:

```bash
npm test
npm run render:media-editorial
```
