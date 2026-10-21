import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config/index.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';
import { MEDIA_FIXTURES, wordsForMediaFixture } from '../src/composition/milestone16Fixtures.js';

const fixture = MEDIA_FIXTURES[0], durationInFrames = 150;
const args = { shot: { id: fixture.id, role: fixture.role, visualConcept: fixture.title, family: fixture.family || 'image', presentation: { cameraMove: fixture.cameraMove, variant: fixture.variant || 'full' } }, editorialPlan: { editorialObjective: fixture.title }, overlay: fixture.overlay, asset: fixture.asset, supportingAssets: fixture.supportingAssets || [], alignedWords: wordsForMediaFixture(durationInFrames), timing: { startFrame: 0, endFrame: durationInFrames, durationInFrames }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary' };
const startCold = performance.now(); const cold = compileSolvedMediaShot(args); const coldMs = performance.now() - startCold;
const iterations = 100, startWarm = performance.now(); for (let i = 0; i < iterations; i++) compileSolvedMediaShot(args); const warmAverageMs = (performance.now() - startWarm) / iterations;
const startPreflight = performance.now(); for (let i = 0; i < iterations; i++) compileSolvedMediaShot(args).preflight; const cameraPreflightAverageMs = (performance.now() - startPreflight) / iterations;
const report = { generatedAt: new Date().toISOString(), coldMediaSolveMs: Number(coldMs.toFixed(3)), warmMediaSolveAverageMs: Number(warmAverageMs.toFixed(3)), cameraPreflightAverageMs: Number(cameraPreflightAverageMs.toFixed(3)), iterations, passed: cold.preflight.passed, publishable: cold.visualQuality.publishable };
const output = path.join(config.rootDir, 'fixtures', 'golden', 'composition-m16', 'performance.json'); await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
