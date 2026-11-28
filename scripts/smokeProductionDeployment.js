import assert from 'node:assert/strict';
import 'dotenv/config';

const base = process.env.VIDEO_SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const configuredCredential = String(process.env.VIDEO_API_KEYS || '').split(',')[0].trim();
const separator = configuredCredential.indexOf(':');
const credential = separator > 0 ? configuredCredential.slice(separator + 1) : configuredCredential;
assert.ok(credential, 'VIDEO_API_KEYS is required');
const auth = { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' };
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body?.error?.message || String(body).slice(0, 200)}`);
  return { response, body };
};

const health = await request('/health');
assert.equal(health.body.status, 'ok');
for (const page of ['overview', 'production', 'channels', 'ideas', 'analytics', 'settings']) {
  const result = await request(`/dashboard/${page}`);
  assert.match(result.body, /VideoForge Studio/);
}
const removedLeak = await fetch(`${base}/api/session-token`);
assert.equal(removedLeak.status, 404, 'the removed browser credential endpoint must remain unavailable');
const legacyDashboard = await fetch(`${base}/dashboard/index.html`, { redirect: 'manual' });
assert.equal(legacyDashboard.status, 308, 'the obsolete publishing dashboard must redirect to the current studio');
const legacyScript = await fetch(`${base}/dashboard/app.js`);
assert.equal(legacyScript.status, 410, 'the obsolete publishing UI script must not remain accessible');
const publishingRoute = await fetch(`${base}/v1/channels/not-a-channel/youtube/connect`, { headers: auth });
assert.equal(publishingRoute.status, 404, 'YouTube publishing routes must be absent while publishing is disabled');
const ready = await request('/ready', { headers: auth });
assert.equal(ready.body.ready, true);
const videos = await request('/v1/videos', { headers: auth });

const id = `smoke-${Date.now().toString(36)}`;
try {
  const created = await request('/v1/channels', { method: 'POST', headers: auth, body: JSON.stringify({
    id, name: 'Deployment Smoke Channel', niche: 'practical science', archetype: 'tutorial', positioning: 'Evidence-led experiments', targetAudience: 'curious adults', contentPillars: ['physics', 'space'],
    productionDefaults: { formats: ['landscape', 'shorts'], durationMode: 'llm', durationRanges: { shorts: { min: 20, max: 45 }, landscape: { min: 120, max: 240 } } },
  }) });
  assert.deepEqual(created.body.productionDefaults.formats, ['landscape', 'shorts']);
  const patched = await request(`/v1/channels/${id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ automation: { enabled: false, scheduleCron: '15 9 * * 1' } }) });
  assert.equal(patched.body.archetype, 'tutorial');
  assert.equal(patched.body.positioning, 'Evidence-led experiments');
  assert.equal(patched.body.automation.scheduleCron, '15 9 * * 1');
  const performance = await request(`/v1/channels/${id}/performance`, { method: 'POST', headers: auth, body: JSON.stringify({
    title: 'A proven physics format', format: 'shorts', durationSeconds: 38, impressions: 4000, views: 1000,
    clickThroughRate: 6.2, averageViewPercentage: 74, retention30sPercentage: 69, subscribersGained: 11, source: 'manual',
  }) });
  assert.equal(performance.body.format, 'shorts');
  const performanceList = await request(`/v1/channels/${id}/performance`, { headers: auth });
  assert.equal(performanceList.body.snapshots.length, 1);
  const brainstorm = await request(`/v1/channels/${id}/ideas/brainstorm`, { method: 'POST', headers: auth, body: JSON.stringify({ count: 4, useAi: false }) });
  assert.deepEqual(new Set(brainstorm.body.ideas.map((idea) => idea.format)), new Set(['landscape', 'shorts']));
  for (const idea of brainstorm.body.ideas) {
    const range = created.body.productionDefaults.durationRanges[idea.format];
    assert.ok(idea.durationSeconds >= range.min && idea.durationSeconds <= range.max);
    assert.ok(idea.primaryKeyword && idea.thumbnailConcept && idea.durationRationale);
  }
} finally {
  await fetch(`${base}/v1/channels/${id}`, { method: 'DELETE', headers: auth });
}

console.log(JSON.stringify({ ok: true, routes: 6, readiness: ready.body.status, persistedVideosVisible: videos.body.videos?.length || 0, mixedFormatBrainstorm: true, performanceFeedback: true, publishingDisabled: true, obsoleteDashboardRemoved: true, credentialLeakRemoved: true }));
