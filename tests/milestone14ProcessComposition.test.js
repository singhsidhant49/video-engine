import assert from 'node:assert/strict';
import test from 'node:test';

import { phrasesFromAlignedWords } from '../src/composition/alignedPhrases.js';
import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';

test('aligned narration phrases bind media annotations to spoken timing', () => {
  const words = [
    { text: 'Factory', norm: ['factory'], startFrame: 0, endFrame: 12, endsPhrase: false },
    { text: 'evidence', norm: ['evidence'], startFrame: 13, endFrame: 28, endsPhrase: true },
  ];
  const phrases = phrasesFromAlignedWords(words, 0);
  assert.equal(phrases.length, 1);
  assert.equal(phrases[0].text, 'Factory evidence');

  const compiled = compileSolvedMediaShot({
    shot: { id: 'shot', role: 'evidence', visualConcept: 'factory evidence', family: 'image', presentation: { cameraMove: 'static' } },
    editorialPlan: { editorialObjective: 'Show evidence' }, overlay: { annotation: 'Factory evidence' },
    asset: { id: 'asset', type: 'image', src: 'assets/factory.jpg', width: 2400, height: 1350, focal: { x: .5, y: .45 } },
    alignedWords: words, timing: { startFrame: 0, durationInFrames: 120 },
    format: 'landscape', width: 1920, height: 1080, styleId: 'documentary',
  });
  assert.equal(compiled.preflight.passed, true);
  assert.ok(compiled.solvedScene.mediaGeometry.media_primary);
});
