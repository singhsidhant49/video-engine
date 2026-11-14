import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import wavefile from 'wavefile';

import { analyzeNarration, resolveWhisperPolicy, transcribeWords } from '../src/services/audioAnalysisService.js';
import { runTimelineQc } from '../src/qc/timelineQc.js';

test('long narration bypasses local Whisper on a resource-bounded deployment', () => {
  const long = resolveWhisperPolicy(480, {
    WHISPER_ENABLED: 'auto', WHISPER_MAX_AUDIO_SECONDS: '180', WHISPER_TIMEOUT_MS: '120000',
  });
  assert.equal(long.useWhisper, false);
  assert.match(long.reason, /480\.0s exceeds/);

  const short = resolveWhisperPolicy(90, {
    WHISPER_ENABLED: 'auto', WHISPER_MAX_AUDIO_SECONDS: '180', WHISPER_TIMEOUT_MS: '120000',
  });
  assert.equal(short.useWhisper, true);
  assert.equal(short.timeoutMs, 120000);
});

test('Whisper cancellation rejects before starting an isolated process', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transcribeWords('not-used.wav', { signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
});

test('disabled Whisper produces monotonic estimated timing without failing alignment QC', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vf-alignment-fallback-'));
  const audioPath = path.join(tmpDir, 'narration.wav');
  const originalEnabled = process.env.WHISPER_ENABLED;
  const wav = new wavefile.WaveFile();
  wav.fromScratch(1, 16000, '16', new Int16Array(16000));
  await fs.writeFile(audioPath, Buffer.from(wav.toBuffer()));
  process.env.WHISPER_ENABLED = 'false';
  try {
    const narration = await analyzeNarration(audioPath, 'A short deterministic alignment fallback works.', 30);
    assert.equal(narration.source, 'estimate');
    assert.ok(narration.words.length > 0);
    assert.ok(narration.words.every((word, index, all) => index === 0 || word.startFrame >= all[index - 1].startFrame));

    const qc = runTimelineQc({ fps: 30, durationInFrames: 30, style: 'minimal_premium', clips: [] }, { narration });
    const alignment = qc.checks.find((check) => check.id === 'alignment');
    assert.equal(alignment.severity, 'warn');
    assert.match(alignment.detail, /deterministic estimated word timing/);
  } finally {
    if (originalEnabled == null) delete process.env.WHISPER_ENABLED;
    else process.env.WHISPER_ENABLED = originalEnabled;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
