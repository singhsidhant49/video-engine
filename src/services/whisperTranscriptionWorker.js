import { transcribeWords, releaseWhisper } from './audioAnalysisService.js';

const audioPath = process.argv[2];
const send = (payload) => new Promise((resolve) => {
  if (!process.send) return resolve();
  process.send(payload, () => resolve());
});

try {
  if (!audioPath) throw new Error('Whisper worker requires an audio path');
  const transcript = await transcribeWords(audioPath);
  await send({ ok: true, transcript });
} catch (error) {
  await send({ ok: false, error: String(error?.message || error) });
  process.exitCode = 1;
} finally {
  await releaseWhisper().catch(() => {});
  if (process.connected) process.disconnect();
}
