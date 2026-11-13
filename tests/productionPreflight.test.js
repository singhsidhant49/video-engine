import assert from 'node:assert/strict';
import test from 'node:test';
import { clearProductionPreflightCache, inspectProductionPreflight } from '../src/server/productionPreflight.js';

const configured = (overrides = {}) => ({
  deepseek: { apiKey: 'configured' }, openai: { apiKey: '' },
  kokoro: { url: 'http://tts.internal:8880/v1/audio/speech' },
  ideogram: { apiKey: '' }, replicate: { apiToken: '' },
  server: { youtubeAnalyticsEnabled: true, youtubePublishingEnabled: false },
  ...overrides,
});

test('production preflight requires generation dependencies but keeps YouTube optional', async () => {
  clearProductionPreflightCache();
  const result = await inspectProductionPreflight({
    configValue: configured(), env: {}, useCache: false,
    fetchImpl: async () => new Response('not found', { status: 404 }),
    probeTools: async () => {},
  });
  assert.equal(result.ready, true);
  assert.equal(result.required.contentModel.provider, 'deepseek');
  assert.equal(result.required.tts.healthy, true);
  assert.equal(result.optional.youtube.healthy, false);
  assert.equal(result.optional.youtube.required, false);
  assert.equal(result.optional.aiImages.fallback, 'stock');
});

test('production preflight reports actionable TTS, model and media failures', async () => {
  clearProductionPreflightCache();
  const result = await inspectProductionPreflight({
    configValue: configured({ deepseek: { apiKey: '' } }), useCache: false,
    fetchImpl: async () => { throw new Error('connection refused'); },
    probeTools: async () => { throw new Error('ffmpeg missing'); },
  });
  assert.equal(result.ready, false);
  assert.equal(result.required.contentModel.code, 'CONTENT_MODEL_NOT_CONFIGURED');
  assert.equal(result.required.tts.code, 'TTS_UNAVAILABLE');
  assert.equal(result.required.mediaToolchain.code, 'MEDIA_TOOLCHAIN_UNAVAILABLE');
});
