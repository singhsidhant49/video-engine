import path from 'node:path';
import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';
import { STYLE_IDS } from '../shared/styles.js';

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

if (args.includes('--help')) {
  console.log(`Usage: npm run generate -- --topic "..." [options]

  --topic <text>       what the video is about
  --niche <text>       optional category hint
  --format <f>         shorts (9:16, default) | landscape (16:9)
  --duration <sec>     target length (default 45 shorts / 120 landscape; >180 plans by chapter)
  --style <id>         force a directing style: ${STYLE_IDS.join(', ')}
  --voice <id>         Kokoro voice (default from .env)
  --audio <file>       use an existing narration file instead of TTS
  --plan <file>        reuse a saved plan.json (skip the LLM)
  --tts <engine>       kokoro (default) | say (macOS dev narration)
  --no-render          stop after timeline + QC
`);
  process.exit(0);
}

const resolve = (p) => (p ? path.resolve(p) : undefined);

createFacelessVideo({
  topic: getArg('--topic', 'How the 2008 financial crisis started'),
  niche: getArg('--niche', ''),
  format: getArg('--format', 'shorts'),
  voice: getArg('--voice', undefined),
  style: getArg('--style', undefined),
  durationSec: getArg('--duration') ? Number(getArg('--duration')) : undefined,
  audioFile: resolve(getArg('--audio')),
  planFile: resolve(getArg('--plan')),
  render: !args.includes('--no-render'),
  tts: getArg('--tts', 'kokoro'),
  onProgress: (info) => {
    if (info.progress === undefined) console.log(`[${info.step}] ${info.message}`);
  },
})
  .then((r) => console.log(`Done: ${r.outputPath || r.runDir}`))
  .catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
  });
