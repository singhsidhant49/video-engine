import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPalette } from '../src/shared/styles.js';
import { buildVisualRealizationDiagnostics } from '../src/pipeline/visualRealizationDiagnostics.js';
import { renderContactSheet } from '../src/tools/preview.js';

const FIXTURES_DIR = path.resolve('fixtures/golden');

function createGoldenTimeline({ id, title, style, hue, clips, durationInFrames }) {
  const fps = 30;
  const word = (text, s) => ({ index: 0, text, startFrame: s, endFrame: s + 8 });
  return {
    version: 3,
    videoId: id,
    title,
    format: 'landscape',
    fps,
    width: 1920,
    height: 1080,
    durationInFrames,
    style,
    palette: buildPalette(style, hue),
    clips: clips.map((c, i) => ({
      id: `c${String(i + 1).padStart(2, '0')}`,
      sceneId: `scene_${String(i + 1).padStart(3, '0')}`,
      kind: c.family,
      family: c.family,
      variant: c.variant || 'default',
      intensity: 4,
      from: c.from,
      durationInFrames: c.duration,
      cutAt: 0,
      enter: { type: 'cut', frames: 0 },
      exit: { type: 'cut', frames: 0 },
      bed: null,
      texture: null,
      overlay: c.overlay,
      shots: [
        {
          id: `shot_${String(i + 1).padStart(2, '0')}_01`,
          storyboardShotId: `shot_${String(i + 1).padStart(2, '0')}_01`,
          sceneId: `scene_${String(i + 1).padStart(3, '0')}`,
          from: 0,
          startFrame: c.from,
          endFrame: c.from + c.duration,
          durationInFrames: c.duration,
          role: 'subject',
          family: c.family,
          variant: c.variant || 'default',
          layout: `${c.family}:${c.variant || 'default'}`,
          presentation: {
            family: c.family,
            variant: c.variant || 'default',
            layout: `${c.family}:${c.variant || 'default'}`,
            cameraMove: c.camera || 'static',
            movementState: c.camera === 'static' ? 'STATIC' : 'SUBTLE',
            visualDensity: c.density || 'MEDIUM',
            overlayMode: 'primary',
          },
          asset: null,
          assets: [],
          move: { type: c.camera || 'static', scale: [1, 1], focus: [[0.5, 0.5], [0.5, 0.5]] },
          overlay: c.overlay,
        },
      ],
      narration: c.narration || '',
    })),
    realizedShots: [],
    cutOverlays: [
      { type: 'fadeIn', frame: 0, frames: 12 },
      { type: 'fadeOut', frame: durationInFrames, frames: 16 },
    ],
    captions: {
      mode: 'phrase',
      hidden: [],
      chunks: [
        { id: 0, startFrame: 4, endFrame: 60, words: [word('The', 4), word('hidden', 12), word('monopoly.', 22)] },
      ],
    },
    audio: { narration: null, bgm: null, sfx: [], speech: [] },
  };
}

async function generateBusinessDoc() {
  const dir = path.join(FIXTURES_DIR, 'business_documentary');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, 'public'), { recursive: true });

  const timeline = createGoldenTimeline({
    id: 'golden_business_doc',
    title: 'The Dutch Monopoly That Controls Global Computing',
    style: 'cinematic_documentary',
    hue: 215,
    durationInFrames: 540,
    clips: [
      {
        family: 'statement',
        variant: 'kinetic',
        from: 0,
        duration: 90,
        camera: 'static',
        density: 'LOW',
        narration: 'One company builds the machines that power the modern world.',
        overlay: { words: ['One', 'Machine', 'Rules', 'Them', 'All'], ats: [4, 12, 20, 28, 36], kicker: 'GLOBAL CHOKEPOINT' },
      },
      {
        family: 'process',
        variant: 'flow',
        from: 90,
        duration: 120,
        camera: 'static',
        density: 'HIGH',
        narration: 'The light generation process requires molten tin vaporized fifty thousand times per second.',
        overlay: {
          steps: [
            { title: 'Tin Droplets', detail: '50,000 droplets per second in vacuum' },
            { title: 'Laser Excitation', detail: 'CO2 pulse vaporizes droplet to plasma' },
            { title: 'EUV Light', detail: 'Emits 13.5 nanometer wavelength' },
          ],
          ats: [6, 45, 85],
        },
      },
      {
        family: 'stat',
        variant: 'hero',
        from: 210,
        duration: 90,
        camera: 'static',
        density: 'MEDIUM',
        narration: 'Each system costs more than one hundred and fifty million dollars.',
        overlay: { value: '150', prefix: '$', suffix: ' million', label: 'Average cost per EUV machine', direction: 'up', at: 6, countFrames: 24, kicker: 'CAPITAL INTENSITY' },
      },
      {
        family: 'list',
        variant: 'ledger',
        from: 300,
        duration: 120,
        camera: 'static',
        density: 'HIGH',
        narration: 'The entire semiconductor industry depends entirely on this supply chain.',
        overlay: {
          title: 'TOP FAB CUSTOMERS',
          items: ['Taiwan Semiconductor (TSMC)', 'Samsung Electronics', 'Intel Foundry'],
          ats: [8, 48, 86],
        },
      },
      {
        family: 'document',
        variant: 'default',
        from: 420,
        duration: 120,
        camera: 'static',
        density: 'MEDIUM',
        narration: 'Governments have classified these systems as sovereign security assets.',
        overlay: { source: 'STRATEGIC EXPORT DIRECTIVE', headline: 'Direct export restrictions enacted on advanced extreme ultraviolet tools.', date: 'SEPTEMBER 2024', highlightAt: 14 },
      },
    ],
  });

  timeline.realizedShots = timeline.clips.flatMap((c) => c.shots);
  await fs.writeFile(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf8');
  const diagnostics = buildVisualRealizationDiagnostics(timeline);
  await fs.writeFile(path.join(dir, 'visual-design-diagnostics.json'), JSON.stringify(diagnostics, null, 2), 'utf8');

  console.log('Rendering Business Documentary Contact Sheet...');
  const sheet = await renderContactSheet(dir, { scale: 0.35, ats: [0.5] });
  console.log('Business Documentary Sheet:', sheet);
}

async function generateTechExplainer() {
  const dir = path.join(FIXTURES_DIR, 'tech_explainer');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, 'public'), { recursive: true });

  const timeline = createGoldenTimeline({
    id: 'golden_tech_explainer',
    title: 'Why GPUs Beat CPUs at Deep Learning',
    style: 'tech_editorial',
    hue: 160, // Emerald / tech green
    durationInFrames: 510,
    clips: [
      {
        family: 'statement',
        variant: 'kinetic',
        from: 0,
        duration: 90,
        camera: 'static',
        density: 'LOW',
        narration: 'Modern artificial intelligence runs on parallel silicon architecture.',
        overlay: { words: ['Massive', 'Parallel', 'Compute'], ats: [4, 14, 24], kicker: 'SILICON ARCHITECTURE' },
      },
      {
        family: 'compare',
        variant: 'columns',
        from: 90,
        duration: 120,
        camera: 'static',
        density: 'HIGH',
        narration: 'While CPUs excel at sequential logic, GPUs execute millions of parallel calculations.',
        overlay: {
          left: { title: 'CENTRAL PROCESSOR (CPU)', items: ['Optimized for low latency', 'Few powerful compute cores', 'Complex branch prediction'] },
          right: { title: 'GRAPHICS PROCESSOR (GPU)', items: ['Optimized for high throughput', 'Thousands of matrix ALUs', 'Massive memory bandwidth'] },
          leftAt: 4,
          rightAt: 45,
        },
      },
      {
        family: 'stat',
        variant: 'hero',
        from: 210,
        duration: 90,
        camera: 'static',
        density: 'MEDIUM',
        narration: 'A single modern accelerator delivers over thirty-five thousand teraflops.',
        overlay: { value: '35,000', prefix: '', suffix: ' TFLOPS', label: 'FP8 Matrix Tensor Performance', direction: 'up', at: 6, countFrames: 24, kicker: 'RAW COMPUTE' },
      },
      {
        family: 'chart',
        variant: 'default',
        from: 300,
        duration: 110,
        camera: 'static',
        density: 'HIGH',
        narration: 'Model parameters have outpaced traditional Moore\'s Law scaling.',
        overlay: { title: 'TRAINING COMPUTE DEMAND (FLOPs)', values: [10, 45, 180, 850], labels: ['2020', '2022', '2024', '2026'], at: 6, drawFrames: 30 },
      },
      {
        family: 'code',
        variant: 'default',
        from: 410,
        duration: 100,
        camera: 'static',
        density: 'MEDIUM',
        narration: 'With a few lines of matrix operations, neural weights update simultaneously.',
        overlay: { code: 'import torch\n\n# Distributed Tensor Parallelism\nwith torch.cuda.device(device_id):\n    attn_out = flash_attention_2(q, k, v)\n    loss = cross_entropy(logits, targets)\n    loss.backward()', language: 'python', from: 4, to: 65 },
      },
    ],
  });

  timeline.realizedShots = timeline.clips.flatMap((c) => c.shots);
  await fs.writeFile(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf8');
  const diagnostics = buildVisualRealizationDiagnostics(timeline);
  await fs.writeFile(path.join(dir, 'visual-design-diagnostics.json'), JSON.stringify(diagnostics, null, 2), 'utf8');

  console.log('Rendering Tech Explainer Contact Sheet...');
  const sheet = await renderContactSheet(dir, { scale: 0.35, ats: [0.5] });
  console.log('Tech Explainer Sheet:', sheet);
}

async function generatePsychologyExplainer() {
  const dir = path.join(FIXTURES_DIR, 'psychology_explainer');
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, 'public'), { recursive: true });

  const timeline = createGoldenTimeline({
    id: 'golden_psychology_explainer',
    title: 'How The Framing Effect Controls Your Decisions',
    style: 'editorial_explainer',
    hue: 35, // Amber warm editorial
    durationInFrames: 510,
    clips: [
      {
        family: 'statement',
        variant: 'kinetic',
        from: 0,
        duration: 90,
        camera: 'static',
        density: 'LOW',
        narration: 'The way a choice is framed determines how your brain perceives risk.',
        overlay: { words: ['Context', 'Shapes', 'Perception'], ats: [4, 14, 24], kicker: 'BEHAVIORAL ECONOMICS' },
      },
      {
        family: 'quote',
        variant: 'default',
        from: 90,
        duration: 120,
        camera: 'static',
        density: 'MEDIUM',
        narration: 'As Daniel Kahneman observed: We are prone to overestimate how much we understand about the world.',
        overlay: {
          quote: 'We are prone to overestimate how much we understand about the world and to underestimate the role of chance.',
          author: 'Daniel Kahneman',
          role: 'Nobel Laureate in Economic Sciences',
          at: 4,
          authorAt: 32,
        },
      },
      {
        family: 'compare',
        variant: 'columns',
        from: 210,
        duration: 110,
        camera: 'static',
        density: 'HIGH',
        narration: 'Consider two medical treatments with identical statistical outcomes.',
        overlay: {
          left: { title: 'SURVIVAL FRAME (GAINS)', items: ['90% survival rate at 1 month', '84% of patients choose surgery', 'Risk-averse framing'] },
          right: { title: 'MORTALITY FRAME (LOSSES)', items: ['10% mortality rate at 1 month', 'Only 50% choose surgery', 'Loss-averse framing'] },
          leftAt: 4,
          rightAt: 40,
        },
      },
      {
        family: 'list',
        variant: 'ledger',
        from: 320,
        duration: 100,
        camera: 'static',
        density: 'HIGH',
        narration: 'Cognitive biases consistently override mathematical logic.',
        overlay: {
          title: 'COGNITIVE HEURISTICS',
          items: ['Availability Heuristic', 'Anchoring Bias', 'Loss Aversion'],
          ats: [6, 36, 68],
        },
      },
      {
        family: 'statement',
        variant: 'highlight',
        from: 420,
        duration: 90,
        camera: 'static',
        density: 'LOW',
        narration: 'Awareness of the frame is the first step toward rational judgment.',
        overlay: { words: ['Question', 'The', 'Frame'], ats: [4, 14, 24], kicker: 'THE TAKEAWAY' },
      },
    ],
  });

  timeline.realizedShots = timeline.clips.flatMap((c) => c.shots);
  await fs.writeFile(path.join(dir, 'timeline.json'), JSON.stringify(timeline, null, 2), 'utf8');
  const diagnostics = buildVisualRealizationDiagnostics(timeline);
  await fs.writeFile(path.join(dir, 'visual-design-diagnostics.json'), JSON.stringify(diagnostics, null, 2), 'utf8');

  console.log('Rendering Psychology Explainer Contact Sheet...');
  const sheet = await renderContactSheet(dir, { scale: 0.35, ats: [0.5] });
  console.log('Psychology Explainer Sheet:', sheet);
}

async function main() {
  console.log('Generating Golden Visual References...');
  await generateBusinessDoc();
  await generateTechExplainer();
  await generatePsychologyExplainer();
  console.log('\nAll Golden Visual References generated successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
