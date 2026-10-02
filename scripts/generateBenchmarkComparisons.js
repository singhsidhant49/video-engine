import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { renderContactSheet } from '../src/tools/preview.js';
import { buildDiagramQualityDiagnostics } from '../src/diagrams/diagramQaDirector.js';
import { config } from '../src/config/index.js';

const BENCHMARKS = [
  { id: 'video-2026-09-28T12-38-23', name: 'psychology_short', format: 'shorts' },
  { id: 'video-2026-09-28T09-30-31', name: 'psychology_landscape', format: 'landscape' },
  { id: 'video-2026-09-28T09-26-47', name: 'ai_coding_agent', format: 'landscape' },
  { id: 'video-2026-09-28T09-36-38', name: 'asml_semiconductor', format: 'landscape' },
];

async function runBenchmarkComparisons() {
  console.log('🔍 Starting Benchmark Review & Before/After Contact Sheet Generation (Milestone 13)...');

  const summary = {};

  for (const bench of BENCHMARKS) {
    const runDir = path.join(config.rootDir, 'renders', 'runs', bench.id);
    const previewDir = path.join(runDir, 'preview');
    await fs.mkdir(previewDir, { recursive: true });

    console.log(`\n==================================================`);
    console.log(`🎬 Processing Benchmark: ${bench.name} (${bench.id}) [${bench.format}]`);

    // 1. Preserve pre-m13 contact sheet
    const existingContact = path.join(previewDir, 'contact.png');
    const existingPostRepair = path.join(previewDir, 'contact-post-repair.png');
    const preM13Path = path.join(previewDir, 'contact-pre-m13.png');

    try {
      const srcFile = (await fs.stat(existingPostRepair).catch(() => null)) ? existingPostRepair : existingContact;
      await fs.copyFile(srcFile, preM13Path);
      console.log(`   ✓ Preserved pre-M13 contact sheet: ${preM13Path}`);
    } catch (e) {
      console.warn(`   ⚠️ Warning: Could not preserve pre-m13 contact sheet: ${e.message}`);
    }

    // 2. Load timeline and generate diagram diagnostics
    const timelinePath = path.join(runDir, 'timeline.json');
    const timeline = JSON.parse(await fs.readFile(timelinePath, 'utf8'));

    const diag = buildDiagramQualityDiagnostics(timeline, { format: bench.format });
    const diagPath = path.join(runDir, 'diagram-quality-diagnostics.json');
    await fs.writeFile(diagPath, JSON.stringify(diag, null, 2), 'utf8');
    console.log(`   ✓ Saved diagram-quality-diagnostics.json (diagramCount: ${diag.diagramCount}, weak: ${diag.weakDiagramCount}, failed: ${diag.failedDiagramCount})`);

    // 3. Render post-M13 contact sheet
    console.log(`   ↳ Rendering post-M13 contact sheet...`);
    const postM13Path = await renderContactSheet(runDir, {
      timeline,
      outputFilename: 'contact-post-m13.png',
      ats: [0.5],
    });
    console.log(`   ✓ Rendered post-M13 contact sheet: ${postM13Path}`);

    // Update active preview contact.png
    await fs.copyFile(postM13Path, path.join(previewDir, 'contact.png')).catch(() => {});

    // 4. Create Side-by-Side Comparison
    try {
      const preMeta = await sharp(preM13Path).metadata();
      const postMeta = await sharp(postM13Path).metadata();

      const targetH = Math.min(preMeta.height, postMeta.height);
      const preResized = await sharp(preM13Path).resize({ height: targetH }).toBuffer();
      const postResized = await sharp(postM13Path).resize({ height: targetH }).toBuffer();

      const preInfo = await sharp(preResized).metadata();
      const postInfo = await sharp(postResized).metadata();

      const combinedW = preInfo.width + postInfo.width;
      const compSheetPath = path.join(previewDir, 'contact-comparison-pre-vs-post.png');

      await sharp({
        create: {
          width: combinedW,
          height: targetH,
          channels: 3,
          background: '#090b10',
        },
      })
        .composite([
          { input: preResized, left: 0, top: 0 },
          { input: postResized, left: preInfo.width, top: 0 },
        ])
        .png()
        .toFile(compSheetPath);

      console.log(`   🖼️  Created Before/After Comparison: ${compSheetPath}`);
    } catch (err) {
      console.warn(`   ⚠️ Side-by-side generation note: ${err.message}`);
    }

    summary[bench.name] = diag;
  }

  console.log('\n==================================================');
  console.log('📊 Benchmark Diagnostics Summary:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('✅ All benchmark comparisons completed successfully!');
}

runBenchmarkComparisons().catch((err) => {
  console.error('❌ Benchmark comparisons failed:', err);
  process.exit(1);
});
