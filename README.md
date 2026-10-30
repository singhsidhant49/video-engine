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

### Option D: Asynchronous Video API

The application-facing API is prompt-first; channel/profile settings are optional. Configure at least one API key for production:

```env
NODE_ENV=production
VIDEO_API_KEYS=replace-with-a-long-random-api-key
VIDEO_WORKER_CONCURRENCY=1
VIDEO_API_MAX_REQUEST_BYTES=1mb
VIDEO_MAX_QUEUED_JOBS=25
VIDEO_MAX_OWNER_PENDING_JOBS=5
VIDEO_SHUTDOWN_TIMEOUT_MS=30000
```

For local development, start the API and its in-process worker:

```bash
npm start
```

Create a job (returns `202` immediately):

```bash
curl -X POST http://localhost:3000/v1/videos \
  -H "Authorization: Bearer replace-with-a-long-random-api-key" \
  -H "Idempotency-Key: customer-order-123" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Create a two-minute documentary about coffee","output":{"durationSeconds":120,"aspectRatio":"16:9"}}'
```

Use `GET /v1/videos/:id` for progress, `GET /v1/videos/:id/result` for the result, and authenticated `GET /v1/videos/:id/download` for the MP4. `POST /v1/videos/:id/cancel` cancels a job and `POST /v1/videos/:id/retry` resumes a failed or cancelled job under the same video ID, reusing valid pipeline checkpoints.

`DELETE /v1/videos/:id` is the single permanent deletion operation. It cancels active work, deletes the final video and every per-run artifact, and removes the video job record. Poll the returned `GET /v1/operations/:operationId` URL until it is complete. Shared caches and user media-bank files are never deleted.

In Docker production mode, PostgreSQL stores job and deletion state, Redis/BullMQ coordinates a separate worker process, and generated files persist in a named Docker volume. Outside Docker, the local development fallback still stores state under `renders/api/` and runs an in-process queue.

Prompt text may contain up to 50,000 characters, allowing complete narrative, visual, editing, and quality-control briefs. The total JSON request limit is configured by `VIDEO_API_MAX_REQUEST_BYTES`.

`GET /health` is a process liveness check. `GET /ready` verifies that the worker is accepting jobs and that its persistent store is readable and writable. Queue admission is bounded globally and per API account; overload returns HTTP `429`. `SIGTERM` and `SIGINT` stop admission, allow active work a grace period, and leave interrupted jobs queued for recovery on restart. The legacy synchronous `/api/generate` and unscoped `/api/renders` endpoints are disabled in production.

### Production Docker stack

Merge `.env.docker.example` into `.env`, replace all placeholder secrets, then run:

```powershell
docker compose up -d --build
docker compose ps
docker compose logs -f api worker
```

Open [http://localhost:3000](http://localhost:3000) for the authenticated production dashboard. The stack contains the API, a separate video worker, PostgreSQL, Redis/BullMQ, and Kokoro TTS. Videos and databases survive restarts in named Docker volumes. See [Docker production deployment](docs/docker-production.md) for health checks, backups, scaling, storage, and the future multi-user migration.

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

Production generation defaults to `HYBRID_EDITORIAL`: authentic real image/video media remains the first choice for concrete people, places, objects, actions, environments, and evidence, while chart/process/diagram/comparison/timeline/UI/code families remain available when they explain the narration more directly. Use `--visual-mode MEDIA_EDITORIAL` for an explicit documentary-style media-only edit, or `--visual-mode LEGACY_PROCEDURAL` for regression and compatibility.

Useful validation commands:

```bash
npm test
npm run render:media-editorial
```






The containerized system is ready for private, single-host production use across multiple YouTube channels. A public HeyGen-style multi-customer service still needs object storage/CDN delivery, full identity and billing, webhooks, observability, backups, retention automation, and load/security testing; the migration path is documented in [Docker production deployment](docs/docker-production.md).
