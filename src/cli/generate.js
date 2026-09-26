import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';

// Parse command line flags
const args = process.argv.slice(2);
const getArg = (flag, defaultVal) => {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultVal;
};

const topic = getArg('--topic', 'React Server Components vs Client Components');
const niche = getArg('--niche', 'tech-explainer');
const format = getArg('--format', 'shorts');
const voice = getArg('--voice', 'af_bella');
const theme = getArg('--theme', 'dark-neon');

async function runCli() {
  console.log(`🎬 Running CLI Video Generation Pipeline...`);
  try {
    const result = await createFacelessVideo({
      topic,
      niche,
      format,
      voice,
      theme,
      onProgress: (info) => {
        console.log(`[Step ${info.step}] ${info.message}`);
      },
    });

    console.log(`SUCCESS! Video created at: ${result.outputPath}`);
  } catch (error) {
    console.error(`CLI Generation Failed:`, error);
    process.exit(1);
  }
}

runCli();
