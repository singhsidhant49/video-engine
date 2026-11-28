import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSpeech } from '../services/ttsService.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

const DEFAULT_SAMPLE_TEXT = "Hello! This is a voice demonstration from Kokoro TTS, designed for crystal-clear narration and engaging storytelling.";

const LANGUAGE_SAMPLES = {
  hf_alpha: "नमस्ते! यह कोकोरो टीटीएस की आवाज़ का एक नमूना है, जो स्पष्ट और स्वाभाविक है।",
  ef_dora: "¡Hola! Esta es una demostración de voz de Kokoro TTS, clara y natural para sus videos.",
  em_alex: "¡Hola! Esta es una demostración de voz masculina de Kokoro TTS, clara y natural.",
  ff_siwis: "Bonjour! Ceci est une démonstration vocale de Kokoro TTS, claire et naturelle pour vos vidéos.",
  jf_alpha: "こんにちは！これはKokoro TTSの音声サンプルです。自然でクリアなナレーションをお届けします。",
  if_sara: "Ciao! Questa è una dimostrazione vocale di Kokoro TTS, chiara e naturale per i tuoi video.",
};

// Curated metadata and categories for Kokoro voices (strictly user's selected 4 voices)
const VOICE_METADATA = {
  af_heart: {
    name: 'Heart',
    category: 'female',
    accent: 'American Female',
    quality: 'Top Tier (Grade A)',
    traits: 'Warm, calm, soothing, highly articulate. #1 choice for Storytelling and Audiobook.',
    sampleText: 'Welcome. Allow your mind and body to settle into quiet stillness as we begin this session.',
  },
  af_bella: {
    name: 'Bella',
    category: 'female',
    accent: 'American Female',
    quality: 'Top Tier (Grade A-)',
    traits: 'Polished, clear, energetic, modern. Outstanding for Explainers, Tutorials, Educational & Shorts.',
    sampleText: 'Welcome! Today we are exploring how modern digital networks quietly power our connected world.',
  },
  am_puck: {
    name: 'Puck',
    category: 'male',
    accent: 'American Male',
    quality: 'Top Male (Grade C+ / Quality B)',
    traits: 'Agile, characterful, confident, resonant male delivery. Recommended for Documentaries, History, and Motivational.',
    sampleText: 'Discipline is not about motivation in the moment; it is about building daily habits that never break.',
  },
  af_nicole: {
    name: 'Nicole (Whisper)',
    category: 'female',
    accent: 'American Female (Whisper)',
    quality: 'High (Grade B-)',
    traits: 'Soft whisper voice. Ideal for Bedtime Stories, Sleep Meditation, and ASMR (not for general content).',
    sampleText: 'Close your eyes now... let the quiet rhythm of the night gently carry you into deep sleep.',
  },
};

async function main() {
  const outputDir = path.join(ROOT_DIR, 'public', 'media', 'audio-samples', 'voices');
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`🎙️  Generating Complete Kokoro TTS Voice Library...`);
  console.log(`📁  Output directory: ${outputDir}\n`);

  const voiceEntries = Object.entries(VOICE_METADATA);
  const results = [];

  for (const [voiceId, meta] of voiceEntries) {
    const filename = `${voiceId}.mp3`;
    const outputPath = path.join(outputDir, filename);
    const textToSpeak = LANGUAGE_SAMPLES[voiceId] || DEFAULT_SAMPLE_TEXT;

    console.log(`⏳ Synthesizing voice [${voiceId}] (${meta.name} · ${meta.accent})...`);
    const t0 = Date.now();
    try {
      await generateSpeech({
        text: textToSpeak,
        outputFile: outputPath,
        voice: voiceId,
        speed: 1.0,
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`   ✅ Complete in ${elapsed}s -> ${filename}`);

      results.push({
        id: voiceId,
        ...meta,
        filename,
        webUrl: `/media/audio-samples/voices/${filename}`,
        text: textToSpeak,
      });
    } catch (err) {
      console.error(`   ❌ Failed to generate [${voiceId}]: ${err.message}`);
    }
  }

  // Generate HTML Gallery page
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kokoro TTS Voice Library — All Voices</title>
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
      background-image: radial-gradient(circle at 50% 0%, rgba(168, 85, 247, 0.09) 0%, transparent 60%);
      color: var(--text);
      padding: 40px 24px 80px;
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      margin-bottom: 32px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 8px;
    }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--accent-cyan);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.1);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 6px 14px;
      border-radius: 8px;
      transition: all 0.2s;
    }
    .back-btn:hover { background: rgba(56, 189, 248, 0.2); }

    h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; }
    p.subtitle { color: var(--text-muted); font-size: 16px; line-height: 1.5; max-width: 800px; }

    /* Filter toolbar */
    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      background: rgba(17, 24, 39, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 14px 20px;
      margin-bottom: 28px;
    }
    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .filter-tab {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .filter-tab:hover {
      border-color: rgba(255, 255, 255, 0.3);
      color: #fff;
    }
    .filter-tab.active {
      background: var(--accent-purple);
      border-color: var(--accent-purple);
      color: #fff;
    }
    .search-box {
      flex: 1;
      min-width: 240px;
      max-width: 340px;
    }
    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 8px 14px;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent-purple); }

    /* Grid & Cards */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 18px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 16px;
      transition: all 0.2s ease;
    }
    .card:hover {
      border-color: rgba(168, 85, 247, 0.4);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
      transform: translateY(-2px);
    }
    .card.top-tier {
      border-color: rgba(16, 185, 129, 0.3);
      background: linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(17, 24, 39, 0.85) 100%);
    }

    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .voice-name-block { display: flex; flex-direction: column; gap: 4px; }
    .voice-title { font-size: 18px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
    .voice-id {
      font-family: 'Fira Code', monospace;
      font-size: 13px;
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.1);
      padding: 2px 7px;
      border-radius: 5px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .quality-badge {
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .badge-grade-a { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }
    .badge-grade-b { background: rgba(56, 189, 248, 0.18); color: var(--accent-cyan); border: 1px solid rgba(56, 189, 248, 0.35); }
    .badge-grade-c { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-grade-d { background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2); }

    .traits { color: var(--text-muted); font-size: 13.5px; line-height: 1.5; }
    .accent-tag { font-size: 12px; color: #a78bfa; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

    .player-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    audio { flex: 1; height: 38px; outline: none; }

    .copy-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e2e8f0;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .copy-btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
    .copy-btn.copied { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #34d399; }
  </style>
</head>
<body>

  <header>
    <div class="nav-links">
      <a href="/media/audio-samples/index.html" class="back-btn">← Back to Content Type Speeds</a>
    </div>
    <h1>🎙️ Kokoro TTS Voice Library (Selected Voices)</h1>
    <p class="subtitle">Audition your selected Kokoro TTS voice roster. Only your curated voices are active in the system, with character profiles, ratings, and instant playback.</p>
  </header>

  <!-- Filter & Search Toolbar -->
  <div class="controls-bar">
    <div class="filter-tabs">
      <button class="filter-tab active" data-filter="all">All Selected Voices (${results.length})</button>
      <button class="filter-tab" data-filter="female">Female Voices</button>
      <button class="filter-tab" data-filter="male">Male Voices</button>
      <button class="filter-tab" data-filter="top">Top Rated (Grade A / B)</button>
    </div>
    <div class="search-box">
      <input type="text" id="voiceSearch" class="search-input" placeholder="Search voice name or traits...">
    </div>
  </div>

  <!-- Voice Cards Grid -->
  <div class="grid" id="voiceGrid">
    ${results.map((r) => {
      const isTop = r.quality.includes('Grade A') || r.quality.includes('Grade B') || r.quality.includes('Top');
      let badgeClass = 'badge-grade-d';
      if (r.quality.includes('Grade A')) badgeClass = 'badge-grade-a';
      else if (r.quality.includes('Grade B') || r.quality.includes('Quality B')) badgeClass = 'badge-grade-b';
      else if (r.quality.includes('Grade C')) badgeClass = 'badge-grade-c';

      return `
      <div class="card ${isTop ? 'top-tier' : ''}" data-category="${r.category}" data-top="${isTop}" data-id="${r.id}" data-name="${r.name}">
        <div>
          <div class="card-top">
            <div class="voice-name-block">
              <span class="accent-tag">${r.accent}</span>
              <div class="voice-title">
                <span>${r.name}</span>
                <span class="voice-id">${r.id}</span>
              </div>
            </div>
            <span class="quality-badge ${badgeClass}">${r.quality}</span>
          </div>
          <p class="traits" style="margin-top: 10px;">${r.traits}</p>
        </div>

        <div class="player-row">
          <audio controls preload="metadata" src="${r.webUrl}"></audio>
          <button class="copy-btn" onclick="copyVoiceId('${r.id}', this)">Copy ID</button>
        </div>
      </div>
      `;
    }).join('')}
  </div>

  <script>
    function copyVoiceId(voiceId, btn) {
      navigator.clipboard.writeText(voiceId).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 1500);
      });
    }

    const tabs = document.querySelectorAll('.filter-tab');
    const cards = document.querySelectorAll('.card');
    const searchInput = document.getElementById('voiceSearch');

    function applyFilters() {
      const activeTab = document.querySelector('.filter-tab.active').dataset.filter;
      const query = searchInput.value.toLowerCase().trim();

      cards.forEach(card => {
        const category = card.dataset.category;
        const isTop = card.dataset.top === 'true';
        const id = card.dataset.id.toLowerCase();
        const name = card.dataset.name.toLowerCase();
        const traits = card.querySelector('.traits').textContent.toLowerCase();

        let matchesTab = true;
        if (activeTab === 'top') matchesTab = isTop;
        else if (activeTab !== 'all') matchesTab = category === activeTab;

        const matchesQuery = !query || id.includes(query) || name.includes(query) || traits.includes(query);

        if (matchesTab && matchesQuery) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        applyFilters();
      });
    });

    searchInput.addEventListener('input', applyFilters);
  </script>
</body>
</html>`;

  const htmlPath = path.join(ROOT_DIR, 'public', 'media', 'audio-samples', 'voices.html');
  await fs.writeFile(htmlPath, html, 'utf8');
  console.log(`\n🎉 Kokoro Voice Library generated!`);
  console.log(`🔗 URL: http://localhost:3000/media/audio-samples/voices.html`);
}

main().catch((err) => {
  console.error('Fatal error during voice gallery generation:', err);
  process.exit(1);
});
