import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeImagePrompt,
  createImagePromptSpec,
  deterministicImageSeed,
  normalizeContinuityBible,
} from '../src/pipeline/aiImagePromptComposer.js';

test('image prompt spec preserves exact narration, continuity, sequence context, and format', () => {
  const spec = createImagePromptSpec({
    scene: {
      id: 'scene_2',
      narration: 'After months of rejection, Arun sat alone and wondered whether to continue.',
      imagePrompt: 'Arun sits beside rejected application letters in his apartment at night',
      shot: 'wide', tone: 'reflective', continuity: 'continue', purpose: 'emotion',
    },
    req: {
      sceneId: 'scene_2', storyboardShotId: 'shot_2', concept: 'discouraged Arun at his desk',
      visibleNeed: { subject: 'Arun', action: 'sitting alone beside rejected letters', environment: 'small apartment at night', viewerNeedsToSee: 'Arun deciding whether to continue', visualRole: 'REACTION', avoidVisuals: ['cheerful crowd'] },
    },
    previous: { concept: 'Arun opening another rejection letter' },
    next: { concept: 'Arun reaches for a fresh application form' },
    continuityBible: {
      characters: [{ id: 'arun', name: 'Arun', description: 'young Indian man with short black hair', wardrobe: 'faded blue shirt' }],
      locations: [{ id: 'apartment', name: 'Arun apartment', description: 'small room with a wooden desk and city-facing window' }],
      chronology: 'late night after months of applications',
    },
    format: 'shorts',
    style: { label: 'cinematic editorial realism' },
  });
  const prompt = composeImagePrompt(spec);

  assert.equal(spec.aspectRatio, '9:16');
  assert.match(prompt, /rejected letters/i);
  assert.match(prompt, /faded blue shirt/i);
  assert.match(prompt, /previous shot/i);
  assert.match(prompt, /next shot/i);
  assert.match(prompt, /Editorial purpose:/);
  assert.match(prompt, /zero text/i);
});

test('legacy continuity strings normalize and deterministic seeds never vary', () => {
  const bible = normalizeContinuityBible({ characters: ['Sarah, 29, red coat'], locations: ['abandoned Victorian house'] });
  assert.equal(bible.characters[0].description, 'Sarah, 29, red coat');
  assert.equal(bible.locations[0].description, 'abandoned Victorian house');
  assert.equal(deterministicImageSeed({ shot: 'one' }), deterministicImageSeed({ shot: 'one' }));
  assert.notEqual(deterministicImageSeed({ shot: 'one' }), deterministicImageSeed({ shot: 'two' }));
});
