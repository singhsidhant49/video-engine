import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('studio exposes channel and status filters and sends them to the APIs', async () => {
  const [html, script] = await Promise.all([
    fs.readFile(path.resolve('public/dashboard/studio.html'), 'utf8'),
    fs.readFile(path.resolve('public/dashboard/studio.js'), 'utf8'),
  ]);
  for (const id of ['videoChannelFilter', 'videoStatusFilter', 'videoFormatFilter', 'videoDateFrom', 'videoDateTo', 'videoDurationMin', 'videoDurationMax', 'ideaChannel', 'ideaStatusFilter']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(script, /params\.set\('channelId'/);
  assert.match(script, /params\.set\('status'/);
  assert.match(script, /ideaStatusFilter/);
  assert.match(script, /video\.channelId/);
  assert.match(script, /data-experiment-title/);
  assert.match(script, /data-retry-stage/);
});
