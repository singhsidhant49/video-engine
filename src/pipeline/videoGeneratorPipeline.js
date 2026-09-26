import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';
import { generateDirectorPlan } from '../services/aiDirectorService.js';
import { generateSpeech } from '../services/ttsService.js';
import { analyzeAudioAndTiming } from '../services/audioAnalysisService.js';
import { fetchUniversalMedia } from '../services/freeMediaService.js';
import { ensureSoundEffects, ensureBackgroundMusic } from '../services/sfxGeneratorService.js';

/**
 * Universal Video Generation Pipeline for ANY Topic / Product / Niche.
 */
export async function createFacelessVideo({
  topic,
  niche = 'tech-explainer',
  format = 'shorts',
  voice = config.kokoro.defaultVoice,
  onProgress = () => {},
}) {
  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const videoId = `video-${timestamp}`;

  console.log(`\n======================================================`);
  console.log(`🎬 Universal Video Director: [${videoId}]`);
  console.log(`Topic: "${topic}" | Category: ${niche} | Format: ${format}`);
  console.log(`======================================================\n`);

  await fs.mkdir(config.publicDir, { recursive: true });
  await fs.mkdir(path.join(config.publicDir, 'audio'), { recursive: true });
  await fs.mkdir(path.join(config.publicDir, 'media'), { recursive: true });
  await fs.mkdir(config.rendersDir, { recursive: true });

  // STEP 1: AI Visual Director Plan
  onProgress({ step: 1, message: 'AI Visual Director planning diverse scenes & cinematography...' });
  const directorPayload = await generateDirectorPlan({ topic, niche, format });

  // STEP 2: Generate Kokoro TTS Speech
  onProgress({ step: 2, message: 'Generating voiceover with Kokoro TTS...' });
  const audioFilename = `${videoId}.mp3`;
  const audioFilePath = path.join(config.publicDir, 'audio', audioFilename);

  await generateSpeech({
    text: directorPayload.audioScript,
    outputFile: audioFilePath,
    voice: voice,
    speed: config.kokoro.speed,
  });

  const audioBuffer = await fs.readFile(audioFilePath);
  const audioUrl = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;

  // STEP 3: Cadence Audio Sync & Frame Calculation
  onProgress({ step: 3, message: 'Aligning cadence-weighted subtitles & scene cuts...' });
  const timingData = await analyzeAudioAndTiming(
    audioFilePath,
    directorPayload.audioScript,
    directorPayload.scenes,
    config.video.fps
  );

  // STEP 4: Fetch / Generate High-Res Visual Assets via Free Media Engine
  onProgress({ step: 4, message: 'Fetching authentic archival & contextual media assets...' });
  for (let i = 0; i < timingData.scenes.length; i++) {
    const scene = timingData.scenes[i];
    const asset = await fetchUniversalMedia(scene, i);
    if (asset && asset.localPath) {
      try {
        const imgBuffer = await fs.readFile(asset.localPath);
        const ext = path.extname(asset.localPath).toLowerCase().replace('.', '') || 'jpeg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        const dataUrl = `data:${mime};base64,${imgBuffer.toString('base64')}`;
        scene.params = { ...scene.params, mediaUrl: dataUrl, imageUrl: dataUrl };
      } catch (e) {
        scene.params = { ...scene.params, mediaUrl: asset.url, imageUrl: asset.url };
      }
    } else if (asset && asset.url) {
      scene.params = { ...scene.params, mediaUrl: asset.url, imageUrl: asset.url };
    }
  }

  // STEP 4.5: Multi-Track Audio Engine (Sound Effects & Background Music)
  onProgress({ step: 4, message: 'Generating multi-track sound effects & ambient music bed...' });
  const [sfxMap, bgmUrl] = await Promise.all([
    ensureSoundEffects(),
    ensureBackgroundMusic(directorPayload.style),
  ]);

  // STEP 5: Remotion Bundling & Final Rendering
  onProgress({ step: 5, message: 'Bundling Remotion Broadcast Compositor...' });
  const entryPoint = path.join(config.rootDir, 'src/remotion/index.jsx');

  const bundled = await bundle({
    entryPoint,
    ignoreRegisterRootWarning: true,
    webpackOverride: (webpackConfig) => webpackConfig,
  });

  const compositionId = format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer';

  const renderProps = {
    title: directorPayload.title,
    scenes: timingData.scenes,
    subtitles: timingData.subtitles,
    audioUrl: audioUrl,
    bgmUrl: bgmUrl,
    sfxMap: sfxMap,
    theme: directorPayload.style || 'business_editorial',
    palette: directorPayload.palette,
    format: format,
  };

  const composition = await selectComposition({
    serveUrl: bundled,
    id: compositionId,
    inputProps: renderProps,
  });

  composition.durationInFrames = timingData.totalFrames;

  const outputFilename = `${niche}-${format}-${timestamp}.mp4`;
  const outputFilePath = path.join(config.rendersDir, outputFilename);

  console.log(`🎬 Rendering video (${timingData.totalFrames} frames @ ${config.video.fps}fps) with multi-track audio...`);
  onProgress({ step: 6, message: `Rendering video frames to MP4...` });

  await renderMedia({
    composition,
    serveUrl: bundled,
    codec: 'h264',
    outputLocation: outputFilePath,
    inputProps: renderProps,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct % 20 === 0) {
        console.log(`  Rendering progress: ${pct}%`);
      }
      onProgress({ step: 6, message: `Rendering video: ${pct}%`, progress: pct });
    },
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 UNIVERSAL DIRECTED VIDEO COMPLETE!`);
  console.log(`📁 Saved to: ${outputFilePath}`);
  console.log(`⏱️ Total process time: ${durationSec}s\n`);

  return {
    success: true,
    videoId,
    title: directorPayload.title,
    outputPath: outputFilePath,
    outputFilename,
    durationSeconds: timingData.durationInSeconds,
    totalFrames: timingData.totalFrames,
    scriptPayload: directorPayload,
  };
}
