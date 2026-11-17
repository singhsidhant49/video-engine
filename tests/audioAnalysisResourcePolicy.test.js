import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import wavefile from 'wavefile';

import { analyzeNarration, resolveWhisperPolicy, sanitizeTranscriptTimeline, transcribeWords } from '../src/services/audioAnalysisService.js';
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
  assert.equal(short.timeoutMs, 180000, 'unsafe environment timeout is raised to the CPU-safe floor');
});

test('Whisper cancellation rejects before starting an isolated process', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    transcribeWords('not-used.wav', { signal: controller.signal }),
    (error) => error?.name === 'AbortError',
  );
});

test('long-form Whisper overlap is removed before script and caption alignment', () => {
  const transcript = [
    { text: 'reassurance', start: 207.74, end: 208.34 },
    { text: 'alone', start: 208.34, end: 208.8 },
    { text: 'brain', start: 209.9, end: 210.22 },
    { text: '...', start: 209.98, end: 209.98 },
    // Whisper restarted an overlapping internal window four seconds earlier.
    { text: 'feel', start: 205.34, end: 205.66 },
    { text: 'reassurance', start: 207.74, end: 208.38 },
    { text: 'brain', start: 209.92, end: 210.22 },
    { text: 'needs', start: 210.22, end: 210.52 },
    { text: 'new', start: 210.52, end: 210.86 },
  ];
  const cleaned = sanitizeTranscriptTimeline(transcript);
  assert.deepEqual(cleaned.map((word) => word.text), ['reassurance', 'alone', 'brain', 'needs', 'new']);
  assert.ok(cleaned.every((word, index) => index === 0 || word.start >= cleaned[index - 1].start));
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

    const productionQc = runTimelineQc({
      fps: 30, durationInFrames: 30, style: 'minimal_premium', clips: [],
      captions: { mode: 'phrase', chunks: [] },
    }, { narration, publishMode: 'PRODUCTION_RENDER' });
    const productionAlignment = productionQc.checks.find((check) => check.id === 'alignment');
    assert.equal(productionAlignment.severity, 'error');
    assert.equal(productionAlignment.ok, false);
  } finally {
    if (originalEnabled == null) delete process.env.WHISPER_ENABLED;
    else process.env.WHISPER_ENABLED = originalEnabled;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
