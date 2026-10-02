import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyInformationType,
  buildVisualCoveragePlan,
  synthesizeProceduralData,
  INFORMATION_TYPES,
  REPRESENTATIONS,
} from '../src/storyboard/visualCoveragePlan.js';
import { recast } from '../src/pipeline/visualDirector.js';
import { buildVisualCoverageDiagnostics } from '../src/qc/visualCoverageDiagnostics.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('classifyInformationType categorizes explanatory beats deterministically', () => {
  // Software code & tool execution
  assert.equal(
    classifyInformationType({ narration: 'The agent inspects the codebase, runs test commands, and applies a patch.' }),
    INFORMATION_TYPES.CODE
  );

  // Workflow / Interface / Search
  assert.equal(
    classifyInformationType({ narration: 'In the editor window, the prompt enters the search bar and context window.' }),
    INFORMATION_TYPES.INTERFACE
  );

  // Multi-stage process / loop
  assert.equal(
    classifyInformationType({ narration: 'First the trigger fires, then the cycle loops back to update the state.' }),
    INFORMATION_TYPES.PROCESS
  );

  // Comparison / Contrast
  assert.equal(
    classifyInformationType({ narration: 'The prefrontal cortex competes with the limbic system in a daily tug of war.' }),
    INFORMATION_TYPES.COMPARISON
  );

  // Neural / Software Relationship Architecture
  assert.equal(
    classifyInformationType({ narration: 'The limbic system and prefrontal cortex neural network interacts across pathways.' }),
    INFORMATION_TYPES.RELATIONSHIP
  );

  // Geopolitical Location
  assert.equal(
    classifyInformationType({ narration: 'EUV lithography machines travel from the Netherlands to factories concentrated in Taiwan.' }),
    INFORMATION_TYPES.LOCATION
  );

  // Quantitative Data / Curve
  assert.equal(
    classifyInformationType({ narration: 'Perceived value drops sharply as reward delay increases along the discounting curve.' }),
    INFORMATION_TYPES.DATA
  );

  // Archival Evidence / Experiment Study
  assert.equal(
    classifyInformationType({ narration: 'The famous Stanford marshmallow experiment study tested children facing instant treats.' }),
    INFORMATION_TYPES.EVIDENCE
  );
});

test('buildVisualCoveragePlan maps scenes to non-statement fallback chains', () => {
  const storyboard = {
    scenes: [
      {
        id: 's01',
        narration: 'The agent inspects the repository and runs tests.',
        shots: [{ id: 's01_01', role: 'subject' }],
      },
      {
        id: 's02',
        narration: 'Chip fabrication is heavily concentrated in Taiwan.',
        shots: [{ id: 's02_01', role: 'context' }],
      },
      {
        id: 's03',
        narration: 'Value drops by 80 percent as delay increases.',
        shots: [{ id: 's03_01', role: 'graphic' }],
      },
    ],
  };

  const plan = buildVisualCoveragePlan(storyboard);
  assert.equal(plan.length, 3);

  // Code beat
  assert.equal(plan[0].informationType, INFORMATION_TYPES.CODE);
  assert.equal(plan[0].primaryRepresentation, REPRESENTATIONS.CODE);
  assert.ok(plan[0].fallbackRepresentations.includes(REPRESENTATIONS.UI));
  assert.ok(!plan[0].fallbackRepresentations.includes(REPRESENTATIONS.TYPOGRAPHY));

  // Location beat
  assert.equal(plan[1].informationType, INFORMATION_TYPES.LOCATION);
  assert.equal(plan[1].primaryRepresentation, REPRESENTATIONS.MAP);

  // Data beat
  assert.equal(plan[2].informationType, INFORMATION_TYPES.DATA);
  assert.equal(plan[2].primaryRepresentation, REPRESENTATIONS.CHART);
});

test('recast routes missing media to explanatory primitives rather than statement cards', () => {
  const codeScene = {
    id: 's01',
    narration: 'The agent reads the codebase and executes the tool call loop.',
    kind: 'subject',
  };
  const spec = {
    sceneId: 's01',
    family: 'image',
    variant: 'full',
    recasts: [],
    need: { role: 'subject' },
  };

  const recasted = recast(spec, codeScene, { primary: null, alternates: [] }, 'landscape');
  assert.equal(recasted.family, 'code');
  assert.ok(recasted.recasts[0].includes('code & terminal visualizer'));

  // Location missing media -> Map
  const mapScene = {
    id: 's02',
    narration: 'Semiconductor supply chains pass through factories in Taiwan.',
    kind: 'subject',
  };
  const mapSpec = {
    sceneId: 's02',
    family: 'image',
    variant: 'full',
    recasts: [],
    need: { role: 'subject' },
  };
  const mapRecasted = recast(mapSpec, mapScene, { primary: null, alternates: [] }, 'landscape');
  assert.equal(mapRecasted.family, 'map');
  assert.ok(mapRecasted.recasts[0].includes('geopolitical dependency map'));
});

test('synthesizeProceduralData produces topic-grounded, authentic data structures', () => {
  const codeData = synthesizeProceduralData({ narration: 'The agent runs tests and fixes bugs.' }, REPRESENTATIONS.CODE);
  assert.ok(codeData.code.includes('test'));
  assert.ok(codeData.terminal.includes('FAIL') || codeData.terminal.includes('PASS'));

  const diagramData = synthesizeProceduralData({ narration: 'Limbic urge triggers the prefrontal cortex.' }, REPRESENTATIONS.DIAGRAM);
  assert.ok(diagramData.nodes.length >= 2);
  assert.ok(diagramData.nodes.some((n) => n.label.includes('Limbic')));

  const mapData = synthesizeProceduralData({ narration: 'ASML ships to TSMC in Taiwan.' }, REPRESENTATIONS.MAP);
  assert.ok(mapData.regions.length >= 2);
  assert.ok(mapData.regions.some((r) => r.name.includes('Taiwan')));
});

test('buildVisualCoverageDiagnostics and timeline QC catch unresolved coverage and blank frames', () => {
  const goodTimeline = {
    fps: 30,
    durationInFrames: 300,
    clips: [
      {
        sceneId: 's01',
        durationInFrames: 100,
        family: 'code',
        overlay: { code: 'const x = 1;' },
        shots: [{ asset: null }],
      },
      {
        sceneId: 's02',
        durationInFrames: 100,
        family: 'diagram',
        overlay: { nodes: [{ id: 'a' }, { id: 'b' }] },
        shots: [{ asset: null }],
      },
      {
        sceneId: 's03',
        durationInFrames: 100,
        family: 'image',
        shots: [{ asset: { src: '/images/hero.jpg' } }],
      },
    ],
  };

  const goodDiag = buildVisualCoverageDiagnostics(goodTimeline, []);
  assert.equal(goodDiag.unresolvedCount, 0);
  assert.equal(goodDiag.perceptuallyBlankFrames, 0);
  assert.equal(goodDiag.directCoverageCount, 3);
  assert.equal(goodDiag.isProductionReady, true);

  // Unresolved empty canvas timeline
  const badTimeline = {
    fps: 30,
    durationInFrames: 180,
    clips: [
      {
        sceneId: 's01',
        durationInFrames: 90,
        family: 'ground', // empty background
        shots: [{ asset: null }],
      },
      {
        sceneId: 's02',
        durationInFrames: 90,
        family: 'code',
        overlay: {}, // missing code payload
        shots: [{ asset: null }],
      },
    ],
  };

  const badDiag = buildVisualCoverageDiagnostics(badTimeline, []);
  assert.ok(badDiag.unresolvedCount >= 2);
  assert.ok(badDiag.perceptuallyBlankFrames >= 90);
  assert.equal(badDiag.isProductionReady, false);

  // Timeline QC flags this as hard error
  const qc = runTimelineQc(badTimeline, { visualCoverageDiagnostics: badDiag });
  assert.equal(qc.ok, false);
  assert.ok(qc.errors.some((e) => e.id === 'visual-coverage-unresolved'));
});
