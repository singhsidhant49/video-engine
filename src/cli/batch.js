import { createFacelessVideo } from '../pipeline/videoGeneratorPipeline.js';

const VIDEOS_TO_GENERATE = [
  {
    topic: 'How Wall Street High Frequency Trading Makes Billions in Microseconds',
    niche: 'finance',
    format: 'shorts',
    voice: 'af_bella',
  },
  {
    topic: 'The Dark Psychology of Casino Design',
    niche: 'science',
    format: 'shorts',
    voice: 'am_michael',
  },
  {
    topic: 'Why Senior Engineers Do Not Write Clean Code',
    niche: 'code-snippet',
    format: 'shorts',
    voice: 'am_adam',
  },
];

async function runBatch() {
  console.log(`\n🎬 ======================================================`);
  console.log(`🚀 Starting Universal Batch Video Generator (${VIDEOS_TO_GENERATE.length} Videos)`);
  console.log(`======================================================\n`);

  const results = [];

  for (let i = 0; i < VIDEOS_TO_GENERATE.length; i++) {
    const item = VIDEOS_TO_GENERATE[i];
    console.log(`\n▶️  [${i + 1}/${VIDEOS_TO_GENERATE.length}] Directing & Rendering: "${item.topic}" (${item.niche})...`);

    try {
      const result = await createFacelessVideo({
        topic: item.topic,
        niche: item.niche,
        format: item.format,
        voice: item.voice,
        onProgress: (info) => {
          if (info.progress) {
            if (info.progress % 25 === 0) {
              console.log(`  [Progress] ${info.message}`);
            }
          } else {
            console.log(`  [Step ${info.step}] ${info.message}`);
          }
        },
      });

      results.push(result);
      console.log(`✅ [${i + 1}/${VIDEOS_TO_GENERATE.length}] COMPLETE -> ${result.outputPath}\n`);
    } catch (err) {
      console.error(`❌ [${i + 1}/${VIDEOS_TO_GENERATE.length}] FAILED: ${err.message}`);
    }
  }

  console.log(`\n🎉 BATCH COMPLETED! Successfully created ${results.length}/${VIDEOS_TO_GENERATE.length} videos.`);
  results.forEach((r, idx) => {
    console.log(`  ${idx + 1}. [${r.title}] -> ${r.outputPath}`);
  });
}

runBatch();
