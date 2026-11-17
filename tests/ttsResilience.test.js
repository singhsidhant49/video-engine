import assert from 'node:assert/strict';
import test from 'node:test';
import { isRetryableTtsError, requestKokoroSpeech } from '../src/services/ttsService.js';

test('Kokoro retries transient Docker DNS failures and returns the recovered response', async () => {
  let calls = 0;
  const response = await requestKokoroSpeech({
    url: 'http://kokoro:8880/v1/audio/speech',
    payload: { input: 'test' },
    timeoutMs: 1000,
    attempts: 3,
    retryBaseDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });
  assert.equal(calls, 3);
  assert.equal(response.status, 200);
});

test('Kokoro exposes an audio-resumable failure after bounded connection retries', async () => {
  await assert.rejects(
    requestKokoroSpeech({
      url: 'http://kokoro:8880/v1/audio/speech',
      payload: { input: 'test' },
      timeoutMs: 1000,
      attempts: 2,
      retryBaseDelayMs: 1,
      fetchImpl: async () => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      },
    }),
    (error) => error.code === 'TTS_UNAVAILABLE' && error.resumeFrom === 'audio' && error.retryable === true
  );
});

test('Kokoro does not retry permanent client errors', async () => {
  let calls = 0;
  await assert.rejects(
    requestKokoroSpeech({
      url: 'http://kokoro:8880/v1/audio/speech',
      payload: { input: 'test' },
      timeoutMs: 1000,
      attempts: 5,
      retryBaseDelayMs: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response('bad voice', { status: 400, statusText: 'Bad Request' });
      },
    }),
    /HTTP 400/
  );
  assert.equal(calls, 1);
  assert.equal(isRetryableTtsError({ status: 400 }), false);
});
