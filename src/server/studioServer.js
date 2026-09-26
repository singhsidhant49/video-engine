import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config/index.js';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';

const app = express();
app.use(express.json());

// Serve static assets (audio, videos, media, public files)
app.use('/audio', express.static(path.join(config.publicDir, 'audio')));
app.use('/media', express.static(path.join(config.publicDir, 'media')));
app.use('/renders', express.static(config.rendersDir));

// Endpoint: Trigger Video Generation
app.post('/api/generate', async (req, res) => {
  const { topic, niche, format, voice, theme } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic parameter is required' });
  }

  try {
    const result = await createFacelessVideo({
      topic,
      niche,
      format,
      voice,
      theme,
      onProgress: (progress) => {
        // Simple console logging for progress
      },
    });

    res.json({
      success: true,
      message: 'Video generated successfully!',
      videoUrl: `/renders/${path.basename(result.outputPath)}`,
      filename: path.basename(result.outputPath),
      durationSeconds: result.durationSeconds,
      title: result.title,
      scriptPayload: result.scriptPayload,
    });
  } catch (error) {
    console.error('API Video Generation Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate video' });
  }
});

// Endpoint: List Generated Videos
app.get('/api/renders', async (req, res) => {
  try {
    const files = await fs.readdir(config.rendersDir);
    const mp4Files = files.filter(f => f.endsWith('.mp4')).reverse();
    const list = mp4Files.map(filename => ({
      filename,
      url: `/renders/${filename}`,
      created: new Date().toISOString(),
    }));
    res.json({ videos: list });
  } catch (err) {
    res.json({ videos: [] });
  }
});

// Serve Visual Studio Frontend Dashboard
app.get('/', (req, res) => {
  res.send(getStudioHtml());
});

const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`✨ Faceless Video Studio Running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});

function getStudioHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Faceless Video Studio - Programmatic AI Pipeline</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Fira+Code:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(15, 23, 42, 0.8);
      --accent: #38bdf8;
      --accent-purple: #a855f7;
      --border: rgba(255, 255, 255, 0.1);
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
    body {
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-image: radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.08) 0%, transparent 40%);
    }
    header {
      padding: 24px 40px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify: space-between;
      backdrop-filter: blur(12px);
      background: rgba(9, 13, 22, 0.8);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      width: 40px; height: 40px; border-radius: 12px;
      background: linear-gradient(135deg, var(--accent), var(--accent-purple));
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 20px; color: #fff;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    }
    .brand h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .status-badge {
      display: flex; align-items: center; gap: 8px; padding: 6px 16px;
      border-radius: 20px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3);
      color: #10b981; font-size: 14px; font-weight: 600;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; }

    main {
      max-width: 1300px;
      margin: 40px auto;
      padding: 0 24px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      width: 100%;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 32px;
      backdrop-filter: blur(16px);
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }

    .card-title {
      font-size: 20px; font-weight: 700; margin-bottom: 24px;
      display: flex; align-items: center; gap: 10px; color: #fff;
    }

    .form-group { margin-bottom: 20px; }
    label { display: block; font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    input[type="text"], select {
      width: 100%; padding: 14px 18px; border-radius: 14px;
      background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border);
      color: #fff; font-size: 16px; outline: none; transition: all 0.2s;
    }
    select option {
      background-color: #0f172a;
      color: #ffffff;
      padding: 12px;
    }
    input[type="text"]:focus, select:focus {
      border-color: var(--accent); box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
    }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    .btn-generate {
      width: 100%; padding: 18px; border-radius: 16px; border: none;
      background: linear-gradient(135deg, var(--accent), var(--accent-purple));
      color: #fff; font-size: 18px; font-weight: 800; cursor: pointer;
      box-shadow: 0 10px 30px rgba(56, 189, 248, 0.3); transition: all 0.2s;
      margin-top: 10px; display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .btn-generate:hover { transform: translateY(-2px); box-shadow: 0 15px 40px rgba(56, 189, 248, 0.5); }
    .btn-generate:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    .preview-container {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 450px; border: 2px dashed var(--border); border-radius: 20px;
      background: rgba(5, 8, 15, 0.5); padding: 24px; text-align: center;
    }

    video { width: 100%; max-height: 520px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }

    .loader {
      width: 48px; height: 48px; border: 4px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%; animation: spin 1s infinite linear;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    .logs {
      font-family: 'Fira Code', monospace; font-size: 13px; color: var(--accent);
      background: rgba(0,0,0,0.4); padding: 16px; border-radius: 12px; width: 100%;
      text-align: left; margin-top: 16px; max-height: 140px; overflow-y: auto;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">▶</div>
      <div>
        <h1>Faceless Video Studio</h1>
        <p style="font-size: 13px; color: var(--text-muted)">Node.js + DeepSeek + Kokoro TTS + Remotion</p>
      </div>
    </div>
    <div class="status-badge">
      <div class="status-dot"></div> Kokoro TTS Docker Connected
    </div>
  </header>

  <main>
    <!-- Left: Configuration Form -->
    <div class="card">
      <div class="card-title">⚡ Create New Video</div>
      
      <div class="form-group">
        <label>Topic / Prompt</label>
        <input type="text" id="topicInput" value="How Airbnb Scaled from Zero to 100 Billion" placeholder="e.g. How Airbnb Scaled from Zero to 100 Billion">
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Niche / Category</label>
          <select id="nicheSelect">
            <option value="business" selected>Business & Startups</option>
            <option value="finance">Finance & Markets</option>
            <option value="tech-explainer">Tech & AI Systems</option>
            <option value="history">History & Documentaries</option>
            <option value="science">Science & Space</option>
            <option value="code-snippet">Coding & Dev Tutorials</option>
          </select>
        </div>

        <div class="form-group">
          <label>Video Format</label>
          <select id="formatSelect">
            <option value="shorts" selected>9:16 Vertical (Shorts/Reels)</option>
            <option value="landscape">16:9 Widescreen (YouTube)</option>
          </select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-group">
          <label>Kokoro Voice</label>
          <select id="voiceSelect">
            <option value="af_bella" selected>Bella (Female - Crisp & Energetic)</option>
            <option value="am_adam">Adam (Male - Clear Technical)</option>
            <option value="af_sarah">Sarah (Female - Professional)</option>
            <option value="am_michael">Michael (Male - Authoritative)</option>
          </select>
        </div>
      </div>

      <button class="btn-generate" id="generateBtn" onclick="startGeneration()">
        <span>🎬 Generate Video Now</span>
      </button>
    </div>

    <!-- Right: Preview & Player Card -->
    <div class="card">
      <div class="card-title">🎥 Video Output & Player</div>
      
      <div class="preview-container" id="previewArea">
        <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">✨</div>
        <p style="color: var(--text-muted); font-size: 16px;">Configure options on the left and click "Generate Video Now".</p>
      </div>

      <div id="logsArea" style="display: none;">
        <div class="logs" id="logContent">Initialized pipeline...</div>
      </div>
    </div>
  </main>

  <script>
    async function startGeneration() {
      const topic = document.getElementById('topicInput').value.trim();
      const niche = document.getElementById('nicheSelect').value;
      const format = document.getElementById('formatSelect').value;
      const voice = document.getElementById('voiceSelect').value;
      const btn = document.getElementById('generateBtn');

      if (!topic) return alert('Please enter a topic prompt');

      btn.disabled = true;
      btn.innerHTML = '<span>⚡ Processing Pipeline...</span>';

      const previewArea = document.getElementById('previewArea');
      const logsArea = document.getElementById('logsArea');
      const logContent = document.getElementById('logContent');
      
      logsArea.style.display = 'block';
      previewArea.innerHTML = \`
        <div class="loader"></div>
        <p style="margin-top: 20px; font-weight: 700; font-size: 18px;">Rendering Video Frame-by-Frame...</p>
        <p style="color: var(--text-muted); font-size: 14px; margin-top: 8px;">Scripting AI -> Kokoro Speech -> Remotion Bundle -> MP4</p>
      \`;

      logContent.innerText = '🤖 [1/4] Generating AI Script & Layout...\\n';

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic, niche, format, voice }),
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to render video');
        }

        logContent.innerText += '🗣️ [2/4] Kokoro TTS Audio Generated!\\n';
        logContent.innerText += '📦 [3/4] Remotion Composition Bundled!\\n';
        logContent.innerText += '🎬 [4/4] MP4 Render Complete!\\n';

        previewArea.innerHTML = \`
          <video controls autoplay loop src="\${data.videoUrl}"></video>
          <div style="margin-top: 16px; display: flex; gap: 12px; align-items: center;">
            <a href="\${data.videoUrl}" download class="btn-generate" style="padding: 10px 24px; font-size: 14px; text-decoration: none;">
              ⬇️ Download MP4 (\${data.durationSeconds.toFixed(1)}s)
            </a>
          </div>
        \`;
      } catch (err) {
        logContent.innerText += '❌ Error: ' + err.message + '\\n';
        previewArea.innerHTML = \`
          <div style="color: #f43f5e; font-size: 36px; margin-bottom: 12px;">⚠️</div>
          <p style="color: #f43f5e; font-weight: bold;">Generation Failed</p>
          <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">\${err.message}</p>
        \`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🎬 Generate Video Now</span>';
      }
    }
  </script>
</body>
</html>`;
}
