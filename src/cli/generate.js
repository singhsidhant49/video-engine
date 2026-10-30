import path from 'node:path';
import fs from 'node:fs/promises';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';
import { STYLE_IDS } from '../shared/styles.js';
import { cloneRun } from '../core/jobs/runCloner.js';

const args = process.argv.slice(2);
const getArg = (flags, fallback) => {
  const flagList = Array.isArray(flags) ? flags : [flags];
  for (const f of flagList) {
    const i = args.indexOf(f);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  }
  return fallback;
};

const hasFlag = (...flags) => flags.some((f) => args.includes(f));

if (hasFlag('--help', '-h')) {
  console.log(`Usage: npm run generate -- [options]

Core Options:
  --topic <text>           what the video is about
  --brief <file.json>      structured prompt/data request for application integrations
  --channel-profile <json> channel audience, tone, content type and pacing defaults
  --channel-id <id>        stable channel identifier stored with the run
  --niche <text>           optional category hint
  --format <f>             shorts (9:16, default) | landscape (16:9)
  --duration <sec>         target length (default 45 shorts / 75 landscape)
  --style <id>             force a directing style: ${STYLE_IDS.join(', ')}
  --voice <id>             Kokoro voice (default from .env)
  --audio <file>           use an existing narration file instead of TTS
  --plan <file>            reuse a saved plan.json (skip the LLM)
  --tts <engine>           kokoro (default) | say (macOS dev narration)
  --no-render              stop after timeline + QC
  --render-scale <n>       render scale (default 1; use 0.5 for benchmark previews)
  --visual-mode <mode>     HYBRID_EDITORIAL (default) | MEDIA_EDITORIAL | LEGACY_PROCEDURAL
  --dev                    permit unresolved placeholders; never publishable

Resumability & Iteration (Milestone 12):
  --resume <runId>         resume existing run safely, reusing valid intermediate artifacts
  --from <stage>           invalidate and re-run from specified stage onward
  --clone <targetId>       fork/clone existing run before resuming (non-destructive)
  --scene <sceneId>        render only a single scene (fast partial iteration)
  --range <start:end>      render only a time range in seconds (e.g. 15:30)
  --contact-sheet-only     generate contact sheet preview without full video render
  --no-tts                 reuse cached audio without calling TTS
  --offline                run with cached provider queries and local assets only
`);
  process.exit(0);
}

const resolve = (p) => (p ? path.resolve(p) : undefined);

function requireValidChoice(value, name, choices) {
  if (value != null && !choices.includes(value)) {
    throw new Error(`${name} must be one of: ${choices.join(', ')}`);
  }
}

async function main() {
  let resumeId = getArg(['--resume']);
  const briefPath = resolve(getArg(['--brief']));
  const channelProfilePath = resolve(getArg(['--channel-profile', '--channelProfile']));
  const brief = briefPath ? JSON.parse(await fs.readFile(briefPath, 'utf8')) : undefined;
  const channelProfile = channelProfilePath ? JSON.parse(await fs.readFile(channelProfilePath, 'utf8')) : undefined;
  const cloneTarget = getArg(['--clone']);
  const requestedFormat = getArg(['--format'], resumeId || brief ? undefined : 'shorts');
  const requestedDuration = getArg(['--duration', '--durationSec', '--duration-sec']);
  const requestedVisualMode = getArg(['--visual-mode', '--visualMode']);
  requireValidChoice(requestedFormat, '--format', ['shorts', 'landscape']);
  requireValidChoice(requestedVisualMode, '--visual-mode', ['HYBRID_EDITORIAL', 'MEDIA_EDITORIAL', 'LEGACY_PROCEDURAL']);
  if (requestedDuration != null && (!Number.isFinite(Number(requestedDuration)) || Number(requestedDuration) <= 0)) {
    throw new Error('--duration must be a positive number of seconds');
  }

  if (resumeId && cloneTarget) {
    const cloned = await cloneRun({ sourceRunId: resumeId, targetRunId: cloneTarget });
    resumeId = cloned.runId;
  }

  const developmentMode = hasFlag('--dev');
  const result = await createFacelessVideo({
    brief,
    channelProfile,
    channelId: getArg(['--channel-id', '--channelId']),
    topic: getArg(['--topic'], resumeId || brief ? undefined : 'How the 2008 financial crisis started'),
    niche: getArg(['--niche'], resumeId || brief ? undefined : ''),
    format: requestedFormat,
    voice: getArg(['--voice'], undefined),
    style: getArg(['--style'], undefined),
    durationSec: requestedDuration != null ? Number(requestedDuration) : undefined,
    audioFile: resolve(getArg(['--audio', '--audioFile', '--audio-file'])),
    planFile: resolve(getArg(['--plan', '--planFile', '--plan-file'])),
    render: !hasFlag('--no-render', '--noRender'),
    tts: getArg(['--tts'], resumeId ? undefined : 'kokoro'),
    resume: resumeId,
    from: getArg(['--from']),
    scene: getArg(['--scene']),
    range: getArg(['--range']),
    contactSheetOnly: hasFlag('--contact-sheet-only', '--contactSheetOnly'),
    noTts: hasFlag('--no-tts', '--noTts'),
    offline: hasFlag('--offline'),
    visualMode: requestedVisualMode,
    publishMode: developmentMode ? 'DEV_RENDER' : 'PRODUCTION_RENDER',
    unresolvedMediaMode: developmentMode ? 'ALLOW_DEV_PLACEHOLDER' : 'FAIL_PRODUCTION_RENDER',
    renderScale: Number(getArg(['--render-scale'], '1')),
    onProgress: (info) => {
      if (info.progress === undefined) console.log(`[${info.step}] ${info.message}`);
    },
  });

  console.log(`\n🎉 Pipeline completed: ${result.outputPath || result.preflightContactSheet || result.runDir}`);
}

main().catch((err) => {
  console.error('\n❌ Generation failed:', err);
  process.exit(1);
});
