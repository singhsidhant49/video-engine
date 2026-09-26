import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';
import { generateDirectorPlan, normalizePlan } from '../services/aiDirectorService.js';
import { generateSpeech } from '../services/ttsService.js';
import { analyzeNarration } from '../services/audioAnalysisService.js';
import { ensureSoundEffects, ensureBackgroundMusic } from '../services/sfxGeneratorService.js';
import { directScenes, recast } from './visualDirector.js';
import { directAssets } from './assetDirector.js';
import { buildTimeline, rngFrom, sceneWordRanges } from './timeline.js';
import { synthesizeWithSay } from '../services/devTts.js';
import { formatCredits } from '../shared/licensing.js';
import { runTimelineQc, printQc } from '../qc/timelineQc.js';
import { runRenderQc } from '../qc/renderQc.js';

/**
 * Editorial Plan (LLM) → narration → alignment → Visual Director → Asset
 * Director → recast → Timeline Director → static QC → render → render QC.
 *
 * The LLM decides editorial intent and feel; every presentation decision
 * after that is deterministic code.
 *
 * Every intermediate is written to renders/runs/<videoId>/ so a run can be
 * inspected, and re-rendered from its plan without calling the LLM again.
 *
 * @param {object} o
 * @param {string} o.topic
 * @param {string} [o.niche]
 * @param {'shorts'|'landscape'} [o.format]
 * @param {string} [o.voice]         Kokoro voice
 * @param {string} [o.style]         directing style id (see src/shared/styles.js); otherwise the director picks
 * @param {number} [o.durationSec]   target length
 * @param {string} [o.audioFile]     use this narration instead of TTS (its words should follow the plan's script)
 * @param {string} [o.planFile]      reuse a saved plan.json instead of calling the LLM
 * @param {boolean} [o.render=true]  false = stop after timeline + QC
 * @param {'kokoro'|'say'} [o.tts]   'say' = macOS dev narration (for evals while Kokoro is unavailable)
 */
export async function createFacelessVideo({
  topic,
  niche = '',
  format = 'shorts',
  voice = config.kokoro.defaultVoice,
  style,
  durationSec,
  audioFile,
  planFile,
  render = true,
  tts = 'kokoro',
  onProgress = () => {},
}) {
  const t0 = Date.now();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const videoId = `video-${stamp}`;
  const fps = config.video.fps;
  const runDir = path.join(config.rendersDir, 'runs', videoId);
  const runPublic = path.join(runDir, 'public');
  await fs.mkdir(runPublic, { recursive: true });
  const save = (name, data) => fs.writeFile(path.join(runDir, name), JSON.stringify(data, null, 1));

  console.log(`\n🎬 ${videoId} · "${topic}" · ${format}`);

  // 1. Editorial plan.
  onProgress({ step: 1, message: 'Directing: script and shot intent...' });
  const plan = planFile
    ? normalizePlan(JSON.parse(await fs.readFile(planFile, 'utf8')), { topic, niche, format, style })
    : await generateDirectorPlan({ topic, niche, format, durationSec, style });
  plan.format = format;
  await save('plan.json', plan);
  console.log(`   "${plan.title}" · style ${plan.style} · ${plan.scenes.length} scenes · ${plan.script.split(/\s+/).length} words`);

  // 2. Narration.
  onProgress({ step: 2, message: audioFile ? 'Using supplied narration audio...' : 'Generating voiceover with Kokoro TTS...' });
  let narrationFile;
  if (audioFile) {
    narrationFile = path.join(runPublic, `narration${path.extname(audioFile) || '.wav'}`);
    await fs.copyFile(audioFile, narrationFile);
  } else if (tts === 'say') {
    narrationFile = path.join(runPublic, 'narration.wav');
    await synthesizeWithSay(plan.script, narrationFile);
  } else {
    narrationFile = path.join(runPublic, 'narration.wav');
    await generateSpeech({ text: plan.script, outputFile: narrationFile, voice, speed: config.kokoro.speed });
  }

  // 3. Word timing (script aligned to what was actually said).
  onProgress({ step: 3, message: 'Aligning script to narration...' });
  const narration = await analyzeNarration(narrationFile, plan.script, fps);
  await save('words.json', { source: narration.source, matchRate: narration.matchRate, duration: narration.durationInSeconds, words: narration.words, transcript: narration.transcript });

  // 4. Visual Director: treatment, family, variant, camera, asset needs — from intent + style + real durations.
  onProgress({ step: 4, message: 'Directing visuals and resolving imagery...' });
  const ranges = sceneWordRanges(plan.scenes);
  const sceneSeconds = ranges.map(([a, b]) => Math.max(0.5, narration.words[b].end - narration.words[a].start));
  const specs = directScenes(plan, { format, rng: rngFrom(`${videoId}:visual`), sceneSeconds });

  // 5. Asset Director: tiered search under each scene's acceptability policy, then the fallback ladder.
  const { assets, report: assetReport } = await directAssets(plan, specs, { publicDir: runPublic, format });
  specs.forEach((spec, i) => recast(spec, plan.scenes[i], assets[spec.sceneId], format));
  await save('direction.json', specs);
  await save('assets.json', { scenes: assetReport, search: assetReport.search });
  // Credits for the video description: every third-party asset actually used, with licence and author.
  const usedAssets = Object.values(assets).flatMap((a) => [a.primary, ...(a.alternates || [])]).filter(Boolean);
  await fs.writeFile(path.join(runDir, 'credits.txt'), formatCredits(plan.title, usedAssets));
  const recasts = specs.flatMap((s) => s.recasts.map((r) => `${s.sceneId}: ${r}`));
  if (recasts.length) console.log(`   ↳ recast:\n     ${recasts.join('\n     ')}`);
  const [sfxSources, bgmSource] = await Promise.all([ensureSoundEffects(), ensureBackgroundMusic(plan.style)]);
  const copyIn = async (rel) => {
    await fs.mkdir(path.dirname(path.join(runPublic, rel)), { recursive: true });
    await fs.copyFile(path.join(config.publicDir, rel), path.join(runPublic, rel));
    return rel;
  };
  const sfx = Object.fromEntries(await Promise.all(Object.entries(sfxSources).map(async ([k, rel]) => [k, await copyIn(rel)])));
  const bgm = { ...bgmSource, src: await copyIn(bgmSource.src) };

  // 6. Timeline Director + static QC.
  onProgress({ step: 5, message: 'Building the edit...' });
  const timeline = buildTimeline({ plan, specs, narration, assets, sfx, bgm, videoId, format, fps, audioSrc: path.basename(narrationFile) });
  await save('timeline.json', timeline);
  const staticQc = runTimelineQc(timeline, { plan, narration, assetReport });
  printQc('Timeline QC', staticQc);
  if (!staticQc.ok) throw new Error(`Timeline QC failed — see ${path.join(runDir, 'qc.json')}`);

  const result = {
    success: true,
    videoId,
    title: plan.title,
    runDir,
    durationSeconds: narration.durationInSeconds,
    totalFrames: timeline.durationInFrames,
    scriptPayload: plan,
    qc: { timeline: staticQc },
    credits: path.join(runDir, 'credits.txt'),
  };
  if (!render) {
    await save('qc.json', result.qc);
    return result;
  }

  // 7. Render.
  onProgress({ step: 6, message: 'Bundling compositions...' });
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: runPublic, ignoreRegisterRootWarning: true });
  const inputProps = { timeline };
  const composition = await selectComposition({ serveUrl, id: format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer', inputProps });
  const outputFilename = `${videoId}-${format}.mp4`;
  const outputPath = path.join(config.rendersDir, outputFilename);
  let lastPct = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 17,
    imageFormat: 'jpeg',
    jpegQuality: 94,
    colorSpace: 'bt709',
    audioBitrate: '192k',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress: p }) => {
      const pct = Math.round(p * 100);
      if (pct !== lastPct && pct % 10 === 0) console.log(`   rendering ${pct}%`);
      lastPct = pct;
      onProgress({ step: 6, message: `Rendering video: ${pct}%`, progress: pct });
    },
  });

  // 8. Visual QA on the actual file.
  onProgress({ step: 7, message: 'Checking the render...' });
  const renderQc = await runRenderQc(outputPath, timeline);
  printQc('Visual QA', renderQc);
  result.qc.render = renderQc;
  await save('qc.json', result.qc);

  console.log(`\n🎉 ${outputPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  return { ...result, outputPath, outputFilename };
}
