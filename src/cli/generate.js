import path from 'node:path';
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
  --niche <text>           optional category hint
  --format <f>             shorts (9:16, default) | landscape (16:9)
  --duration <sec>         target length (default 45 shorts / 75 landscape)
  --style <id>             force a directing style: ${STYLE_IDS.join(', ')}
  --voice <id>             Kokoro voice (default from .env)
  --audio <file>           use an existing narration file instead of TTS
  --plan <file>            reuse a saved plan.json (skip the LLM)
  --tts <engine>           kokoro (default) | say (macOS dev narration)
  --no-render              stop after timeline + QC
  --visual-mode <mode>     MEDIA_EDITORIAL (default) | LEGACY_PROCEDURAL

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

async function main() {
  let resumeId = getArg(['--resume']);
  const cloneTarget = getArg(['--clone']);

  if (resumeId && cloneTarget) {
    const cloned = await cloneRun({ sourceRunId: resumeId, targetRunId: cloneTarget });
    resumeId = cloned.runId;
  }

  const result = await createFacelessVideo({
    topic: getArg(['--topic'], 'How the 2008 financial crisis started'),
    niche: getArg(['--niche'], ''),
    format: getArg(['--format'], 'shorts'),
    voice: getArg(['--voice'], undefined),
    style: getArg(['--style'], undefined),
    durationSec: getArg(['--duration', '--durationSec', '--duration-sec']) ? Number(getArg(['--duration', '--durationSec', '--duration-sec'])) : undefined,
    audioFile: resolve(getArg(['--audio', '--audioFile', '--audio-file'])),
    planFile: resolve(getArg(['--plan', '--planFile', '--plan-file'])),
    render: !hasFlag('--no-render', '--noRender'),
    tts: getArg(['--tts'], 'kokoro'),
    resume: resumeId,
    from: getArg(['--from']),
    scene: getArg(['--scene']),
    range: getArg(['--range']),
    contactSheetOnly: hasFlag('--contact-sheet-only', '--contactSheetOnly'),
    noTts: hasFlag('--no-tts', '--noTts'),
    offline: hasFlag('--offline'),
    visualMode: getArg(['--visual-mode', '--visualMode']),
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
