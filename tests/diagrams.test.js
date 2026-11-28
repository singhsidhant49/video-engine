import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSolvedMediaShot } from '../src/composition/compileSolvedMediaShot.js';

const image = { id: 'subject', type: 'image', src: 'assets/subject.jpg', width: 2400, height: 1350, focal: { x: .68, y: .44 }, subjectBounds: { x: .55, y: .14, width: .32, height: .72 } };

test('media layout preserves subject-safe text and caption geometry in landscape', () => {
  const compiled = compileSolvedMediaShot({
    shot: { id: 'landscape', role: 'subject', visualConcept: 'subject', family: 'image', presentation: { cameraMove: 'subtlePush' } },
    editorialPlan: { editorialObjective: 'Show the subject' }, overlay: { headline: 'THE REAL STORY' }, asset: image,
    alignedWords: [], timing: { startFrame: 0, durationInFrames: 150 }, format: 'landscape', width: 1920, height: 1080, styleId: 'documentary',
  });
  assert.equal(compiled.preflight.passed, true);
  assert.ok(compiled.solvedScene.captionBox.width > 0);
  assert.ok(compiled.solvedScene.mediaGeometry.media_primary);
});

test('media layout produces a valid subject-aware vertical crop', () => {
  const verticalImage = {
    ...image,
    width: 1350,
    height: 2400,
    focal: { x: .52, y: .42 },
    subjectBounds: { x: .26, y: .1, width: .5, height: .4 },
  };
  const compiled = compileSolvedMediaShot({
    shot: { id: 'vertical', role: 'subject', visualConcept: 'subject', family: 'image', presentation: { cameraMove: 'static' } },
    editorialPlan: { editorialObjective: 'Show the subject' }, overlay: {}, asset: verticalImage,
    alignedWords: [], timing: { startFrame: 0, durationInFrames: 120 }, format: 'shorts', width: 1080, height: 1920, styleId: 'documentary',
  });
  assert.equal(compiled.preflight.passed, true);
  assert.ok(compiled.solvedScene.mediaGeometry.media_primary.rect.height > 0);
});
