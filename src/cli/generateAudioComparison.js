import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSpeech } from '../services/ttsService.js';
import { generateMeditationSpeech } from '../audio/meditationPacer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

// Representative 65-word paragraph for speech cadence and timing comparison:
const SAMPLE_TEXT = "Deep beneath the surface of the ocean lies a hidden network of fiber-optic cables that powers our modern digital world. Every message we send, every transaction we make, and every video we stream travels through these glass strands across the seabed. It is a quiet reminder that our invisible digital lives still depend on a physical reality.";

// Authentic meditation script with professional YouTube breathing & reflection pauses:
const MEDITATION_SEGMENTS = [
  { text: "Close your eyes gently.", pauseType: "NORMAL", pauseAfterMs: 2000 },
  { text: "Take a slow, deep breath in, filling your lungs completely.", pauseType: "BREATH_IN", pauseAfterMs: 5000 },
  { text: "And slowly let it go, releasing every trace of tension.", pauseType: "BREATH_OUT", pauseAfterMs: 5500 },
  { text: "Allow your shoulders to soften, and feel your jaw relax.", pauseType: "BODY_SCAN", pauseAfterMs: 4000 },
  { text: "Imagine a warm, calming light resting gently over your entire body.", pauseType: "VISUALIZATION", pauseAfterMs: 6000 },
  { text: "For the next few moments, simply rest in this quiet stillness.", pauseType: "SECTION_TRANSITION", pauseAfterMs: 7000 },
];

/**
 * EXACT CANONICAL LIST — 1 ENTRY PER CORE CONTENT TYPE
 * All calibrated with tailored speeds and voices for YouTube production.
 */
const CANONICAL_CONTENT_TYPES = [
  {
    id: 'meditation',
    label: 'Guided Meditation & Sleep',
    voice: 'af_heart',
    speed: 0.76,
    format: 'landscape',
    isMeditation: true,
    comment: 'Calibrated at 0.76x with professional YouTube meditation silence pauses (5s inhale, 5.5s exhale, 4s body scan, 7s deep rest).',
  },
  {
    id: 'documentary',
    label: 'Documentary & History',
    voice: 'bm_george',
    speed: 0.95,
    format: 'landscape',
    comment: 'Authoritative, grounded documentary pace with measured historical gravity (George).',
  },
  {
    id: 'explainer_landscape',
    label: 'Explainer (16:9 YouTube)',
    voice: 'af_bella',
    speed: 0.98,
    format: 'landscape',
    comment: 'High clarity, crisp modern diction with Bella for long-form explanatory videos.',
  },
  {
    id: 'explainer_shorts',
    label: 'Explainer (9:16 Shorts)',
    voice: 'af_bella',
    speed: 1.00,
    format: 'shorts',
    comment: 'Fastest permitted; energetic delivery essential for short-form retention (Bella).',
  },
  {
    id: 'motivational',
    label: 'Motivational & Mindset',
    voice: 'am_puck',
    speed: 0.98,
    format: 'landscape',
    comment: 'Agile, confident, resonant male delivery with Puck for motivational impact and momentum.',
  },
  {
    id: 'audiobook',
    label: 'Audiobook & Literature',
    voice: 'af_heart',
    speed: 0.82,
    format: 'landscape',
    comment: 'Relaxed literary pace (0.82x) with Heart voice; warm, comforting, and immersive for literary and book narrations.',
  },
  {
    id: 'story',
    label: 'Narrative Storytelling',
    voice: 'af_heart',
    speed: 0.92,
    format: 'landscape',
    comment: 'Warm, captivating storytelling cadence with Heart; rich emotional range and character immersion.',
  },
];

async function main() {
  const outputDir = path.join(ROOT_DIR, 'public', 'media', 'audio-samples');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`🎙️  Generating Canonical Speech Samples for All 11 Content Types...`);
  console.log(`📁  Output directory: ${outputDir}\n`);

  const results = [];

  for (const item of CANONICAL_CONTENT_TYPES) {
    const filename = `${item.id}_speed_${item.speed.toFixed(2)}.${item.isMeditation ? 'wav' : 'mp3'}`;
    const outputPath = path.join(outputDir, filename);

    console.log(`⏳ Synthesizing ${item.label} (Voice: ${item.voice}, Speed: ${item.speed}x)...`);
    const t0 = Date.now();
    try {
      let durationSec = null;
      let totalSilenceSec = null;
      let totalSpeechSec = null;

      if (item.isMeditation) {
        const medResult = await generateMeditationSpeech({
          segments: MEDITATION_SEGMENTS,
          outputFile: outputPath,
          voice: item.voice,
          speed: item.speed,
          subprofile: 'guided',
        });
        durationSec = medResult.durationSec;
        totalSilenceSec = medResult.totalSilenceSec;
        totalSpeechSec = medResult.totalSpeechSec;
      } else {
        await generateSpeech({
          text: SAMPLE_TEXT,
          outputFile: outputPath,
          voice: item.voice,
          speed: item.speed,
        });
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`   ✅ Complete in ${elapsed}s -> ${filename}`);

      results.push({
        ...item,
        filename,
        webUrl: `/media/audio-samples/${filename}`,
        durationSec,
        totalSilenceSec,
        totalSpeechSec,
      });
    } catch (err) {
      console.error(`   ❌ Failed for ${item.label}: ${err.message}`);
    }
  }

  // Generate HTML page with strictly ONE card per content type + Voice Library Banner
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Type Speech Pacing Benchmarks — Kokoro TTS</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Fira+Code:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-cyan: #38bdf8;
      --accent-emerald: #10b981;
      --accent-purple: #a855f7;
      --accent-amber: #f59e0b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
    body {
      background: var(--bg);
      background-image: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.08) 0%, transparent 60%);
      color: var(--text);
      padding: 44px 24px 80px;
      max-width: 1050px;
      margin: 0 auto;
    }
    header { margin-bottom: 28px; }
    h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; }
    p.subtitle { color: var(--text-muted); font-size: 16px; line-height: 1.5; }

    /* Voice Library Banner */
    .banner {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(56, 189, 248, 0.1) 100%);
      border: 1px solid rgba(168, 85, 247, 0.35);
      border-radius: 14px;
      padding: 18px 24px;
      margin-bottom: 30px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .banner-text h3 { font-size: 17px; color: #fff; margin-bottom: 4px; }
    .banner-text p { font-size: 14px; color: #cbd5e1; }
    .banner-btn {
      background: var(--accent-purple);
      color: #fff;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 10px 20px;
      border-radius: 10px;
      transition: all 0.2s ease;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(168, 85, 247, 0.3);
    }
    .banner-btn:hover { background: #9333ea; transform: translateY(-1px); }

    .sample-box {
      background: rgba(56, 189, 248, 0.05);
      border: 1px solid rgba(56, 189, 248, 0.18);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 28px;
      font-size: 14.5px;
      line-height: 1.6;
      color: #e2e8f0;
    }
    .sample-box strong { color: var(--accent-cyan); }

    .grid { display: flex; flex-direction: column; gap: 14px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      transition: all 0.2s ease;
    }
    .card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      transform: translateY(-1px);
    }
    .card.meditation-card {
      border-color: rgba(16, 185, 129, 0.35);
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.07) 0%, rgba(17, 24, 39, 0.85) 100%);
    }

    .info { flex: 1; }
    .title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    .title { font-weight: 700; font-size: 16.5px; color: #fff; }
    .badge {
      font-family: 'Fira Code', monospace;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
    }
    .badge-speed { background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-voice { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .badge-pause { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }

    .comment { color: var(--text-muted); font-size: 13.5px; line-height: 1.45; margin-top: 4px; }
    .stats { color: #64748b; font-size: 12px; font-family: 'Fira Code', monospace; margin-top: 6px; }

    .audio-wrapper { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    audio { height: 42px; outline: none; }
    .audio-meta { font-size: 11px; color: #64748b; font-family: 'Fira Code', monospace; }
  </style>
</head>
<body>
  <header>
    <h1>🎙️ Content Type Speech Speed & Cadence Benchmarks</h1>
    <p class="subtitle">Each YouTube channel category is configured with its production speech speed and default voice. Meditation uses physically natural silence pauses.</p>
  </header>

  <!-- Banner to Voice Library -->
  <div class="banner">
    <div class="banner-text">
      <h3>Looking to audition all Kokoro TTS voices?</h3>
      <p>Listen to all 30+ American, British, and International voices with their official quality ratings.</p>
    </div>
    <a href="/media/audio-samples/voices.html" class="banner-btn">Open Voice Library →</a>
  </div>

  <div class="sample-box">
    <strong>Channel Benchmark Text (65 words):</strong><br>
    "${SAMPLE_TEXT}"
  </div>

  <div class="grid">
    ${results.map((r) => `
      <div class="card ${r.isMeditation ? 'meditation-card' : ''}">
        <div class="info">
          <div class="title-row">
            <span class="title">${r.label}</span>
            <span class="badge badge-speed">${r.speed}x</span>
            <span class="badge badge-voice">${r.voice}</span>
            ${r.isMeditation ? '<span class="badge badge-pause">Professional Silence Pauses</span>' : ''}
          </div>
          <div class="comment">${r.comment}</div>
          ${r.isMeditation ? `<div class="stats">Total: ${r.durationSec}s · Speech: ${r.totalSpeechSec}s · Silence Pauses: ${r.totalSilenceSec}s</div>` : ''}
        </div>
        <div class="audio-wrapper">
          <audio controls preload="metadata" src="${r.webUrl}"></audio>
          <span class="audio-meta">${r.isMeditation ? 'WAV 24kHz Mono' : 'Format: ' + r.format}</span>
        </div>
      </div>
    `).join('')}
  </div>

</body>
</html>`;

  await fs.writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
  console.log(`\n🎉 Canonical Content Types benchmark page updated!`);
  console.log(`🔗 URL: http://localhost:3000/media/audio-samples/index.html`);
}

main().catch((err) => {
  console.error('Fatal error during audio comparison generation:', err);
  process.exit(1);
});
