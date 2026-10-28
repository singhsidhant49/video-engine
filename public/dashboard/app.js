const $ = (id) => document.getElementById(id);
const state = { key: sessionStorage.getItem('videoApiKey') || '', videos: [], poll: null, objectUrl: null };
const headers = () => ({ Authorization: `Bearer ${state.key}`, 'Content-Type': 'application/json' });

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : response;
  if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`);
  return body;
}

const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';

function render() {
  const active = state.videos.filter((v) => ['queued', 'preparing', 'processing', 'cancel_requested'].includes(v.status));
  $('totalCount').textContent = state.videos.length;
  $('activeCount').textContent = active.length;
  $('completedCount').textContent = state.videos.filter((v) => v.status === 'completed').length;
  $('videoGrid').innerHTML = state.videos.length ? state.videos.map((video) => {
    const title = video.result?.title || video.metadata?.externalId || video.id;
    const buttons = video.status === 'delete_requested'
      ? '<button disabled>Deleting all files...</button>'
      : video.status === 'completed'
      ? `<button data-action="review" data-id="${video.id}">Review</button><button data-action="download" data-id="${video.id}">Download</button><button class="danger" data-action="delete" data-id="${video.id}">Delete</button>`
      : video.status === 'failed' || video.status === 'cancelled'
        ? `<button data-action="retry" data-id="${video.id}">Retry</button><button class="danger" data-action="delete" data-id="${video.id}">Delete</button>`
        : `<button data-action="cancel" data-id="${video.id}">Cancel</button>`;
    return `<article class="video-card"><div class="poster"><span class="status ${video.status}">${escapeHtml(video.status)}</span><strong>${video.status === 'completed' ? 'READY TO REVIEW' : escapeHtml(video.stage || 'QUEUED')}</strong></div><div class="card-body"><h3 class="card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3><div class="meta">${dateLabel(video.createdAt)}${video.result?.durationSeconds ? ` · ${Math.round(video.result.durationSeconds)} sec` : ''}</div><div class="progress"><span style="width:${Number(video.progress || 0)}%"></span></div><div class="actions">${buttons}</div></div></article>`;
  }).join('') : '<div class="empty">No videos yet. Your first production will appear here.</div>';
}

async function loadVideos() {
  if (!state.key) { $('settingsDialog').showModal(); return; }
  try {
    const [ready, result] = await Promise.all([fetch('/ready').then((r) => r.json()), api('/v1/videos')]);
    state.videos = result.videos || [];
    $('healthDot').classList.toggle('ready', ready.ready);
    $('healthText').textContent = ready.ready ? `Ready · ${ready.queue?.workerCount ?? 1} worker` : 'Service not ready';
    render();
  } catch (error) {
    $('healthText').textContent = error.message;
    if (/bearer|unauthorized/i.test(error.message)) $('settingsDialog').showModal();
  }
}

$('aspect').addEventListener('change', () => {
  if ($('aspect').value === '9:16') {
    if (['75', '90', '120', '180', '300', '600'].includes($('duration').value)) {
      $('duration').value = '45';
    }
  } else {
    if (['30', '45'].includes($('duration').value)) {
      $('duration').value = '120';
    }
  }
});

$('createForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true; $('formMessage').textContent = 'Submitting production…';
  try {
    const voiceVal = $('voice').value;
    const body = {
      prompt: $('prompt').value, profileId: $('channel').value || 'default',
      output: { durationSeconds: Number($('duration').value), aspectRatio: $('aspect').value, resolution: '1080p' },
      creative: { contentType: $('contentType').value, tone: $('tone').value, audience: 'general YouTube audience', pacing: 'auto', style: 'cinematic_documentary' },
      audio: voiceVal && voiceVal !== 'auto' ? { voice: voiceVal } : {},
      subtitles: { enabled: true },
      metadata: { source: 'dashboard', channelId: $('channel').value || 'default' },
    };
    const created = await api('/v1/videos', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
    $('formMessage').textContent = `Queued ${created.id}`; $('prompt').value = ''; await loadVideos();
  } catch (error) { $('formMessage').textContent = error.message; }
  finally { button.disabled = false; }
});

$('videoGrid').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'cancel' || action === 'retry') await api(`/v1/videos/${id}/${action}`, { method: 'POST' });
    if (action === 'delete' && confirm('Permanently delete this video, its MP4, run files, audio, subtitles, previews, plans, timelines, and QC data? This cannot be undone.')) {
      button.disabled = true;
      button.textContent = 'Deleting...';
      const operation = await api(`/v1/videos/${id}`, { method: 'DELETE' });
      $('formMessage').textContent = `Deletion queued for ${id}`;
      const deadline = Date.now() + 10 * 60_000;
      let current = operation;
      while (!['completed', 'failed'].includes(current.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        current = await api(current.statusUrl || `/v1/operations/${current.id}`);
      }
      if (current.status === 'failed') throw new Error(current.error?.message || 'Permanent deletion failed');
      if (current.status !== 'completed') throw new Error('Deletion is still processing; refresh to check its status');
      $('formMessage').textContent = `Deleted ${id} and all video-owned files`;
    }
    if (action === 'download' || action === 'review') {
      const response = await fetch(`/v1/videos/${id}/download`, { headers: headers() });
      if (!response.ok) throw new Error('Unable to load video');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      if (action === 'download') { const link = document.createElement('a'); link.href = url; link.download = `${id}.mp4`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000); }
      else { if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl = url; $('reviewVideo').src = url; $('reviewDialog').showModal(); }
    }
    await loadVideos();
  } catch (error) { alert(error.message); }
});

$('settingsButton').onclick = () => { $('apiKey').value = state.key; $('settingsDialog').showModal(); };
$('saveKey').onclick = () => { state.key = $('apiKey').value.trim(); sessionStorage.setItem('videoApiKey', state.key); setTimeout(loadVideos); };
$('refreshButton').onclick = loadVideos;
$('closeReview').onclick = () => { $('reviewVideo').pause(); $('reviewDialog').close(); };
loadVideos(); state.poll = setInterval(loadVideos, 8_000);
