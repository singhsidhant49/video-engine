const $ = (id) => document.getElementById(id);
const state = {
  key: localStorage.getItem('videoApiKey') || sessionStorage.getItem('videoApiKey') || '',
  videos: [],
  poll: null,
  objectUrl: null,
  thumbnailUrls: new Map(),
};
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
    const isCompleted = video.status === 'completed';
    const thumbUrl = video.thumbnailObjectUrl || '';
    const posterStyle = thumbUrl ? `style="background-image: url('${thumbUrl}'); background-size: cover; background-position: center;"` : '';
    const formatBadge = video.output?.aspectRatio || video.metadata?.aspectRatio || '';
    return `<article class="video-card"><div class="poster" data-poster-id="${video.id}" ${posterStyle}><span class="status ${video.status}">${escapeHtml(video.status)}</span>${formatBadge ? `<span style="position:absolute;top:12px;right:12px;background:rgba(20,19,17,.82);color:#fff;border-radius:4px;padding:3px 7px;font-size:10px;font-weight:700;">${escapeHtml(formatBadge)}</span>` : ''}${!isCompleted ? `<strong>${escapeHtml(video.stage || 'QUEUED')}</strong>` : ''}</div><div class="card-body"><h3 class="card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3><div class="meta">${dateLabel(video.createdAt)}${video.result?.durationSeconds ? ` · ${Math.round(video.result.durationSeconds)} sec` : ''}</div><div class="progress"><span style="width:${Number(video.progress || 0)}%"></span></div><div class="actions">${buttons}</div></div></article>`;
  }).join('') : '<div class="empty">No videos yet. Your first production will appear here.</div>';
}

async function loadVideos() {
  if (!state.key) {
    try {
      const res = await fetch('/api/session-token').then((r) => r.json());
      if (res?.token) {
        state.key = res.token;
        localStorage.setItem('videoApiKey', state.key);
        sessionStorage.setItem('videoApiKey', state.key);
      }
    } catch {}
  }

  if (!state.key) {
    $('healthText').textContent = 'API key required';
    const dialog = $('settingsDialog');
    if (dialog && !dialog.open) dialog.showModal();
    return;
  }

  try {
    const [ready, result] = await Promise.all([api('/ready'), api('/v1/videos')]);
    state.videos = result.videos || [];
    render(); // Immediate render so videos show without waiting for thumbnails

    $('healthDot').classList.toggle('ready', ready.ready);
    $('healthText').textContent = ready.ready ? `Ready · ${ready.queue?.workerCount ?? 1} worker` : 'Service not ready';

    const liveIds = new Set(state.videos.map((video) => video.id));
    for (const [id, url] of state.thumbnailUrls) {
      if (!liveIds.has(id)) { URL.revokeObjectURL(url); state.thumbnailUrls.delete(id); }
    }

    // Lazy load thumbnails in background
    for (const video of state.videos.filter((v) => v.status === 'completed')) {
      if (state.thumbnailUrls.has(video.id)) {
        video.thumbnailObjectUrl = state.thumbnailUrls.get(video.id);
        const posterEl = document.querySelector(`[data-poster-id="${video.id}"]`);
        if (posterEl) posterEl.style.backgroundImage = `url('${video.thumbnailObjectUrl}')`;
        continue;
      }
      fetch(`/v1/videos/${video.id}/thumbnail`, { headers: { Authorization: `Bearer ${state.key}` } })
        .then(async (response) => {
          if (response.ok) {
            const url = URL.createObjectURL(await response.blob());
            video.thumbnailObjectUrl = url;
            state.thumbnailUrls.set(video.id, url);
            const posterEl = document.querySelector(`[data-poster-id="${video.id}"]`);
            if (posterEl) posterEl.style.backgroundImage = `url('${url}')`;
          }
        })
        .catch(() => {});
    }
  } catch (error) {
    if (/bearer|unauthorized/i.test(error.message)) {
      state.key = '';
      localStorage.removeItem('videoApiKey');
      sessionStorage.removeItem('videoApiKey');
      const dialog = $('settingsDialog');
      if (dialog && !dialog.open) dialog.showModal();
      const errEl = $('settingsError');
      if (errEl) errEl.textContent = 'Invalid API key. Please check your VIDEO_API_KEYS configuration.';
    }
    $('healthText').textContent = error.message;
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

$('imageSource')?.addEventListener('change', () => {
  const isAi = $('imageSource').value === 'ai';
  if ($('styleField')) $('styleField').style.display = isAi ? '' : 'none';
  if ($('modelField')) $('modelField').style.display = isAi ? '' : 'none';
  if ($('qualityField')) $('qualityField').style.display = isAi ? '' : 'none';
  if ($('customStyleField')) $('customStyleField').style.display = (isAi && $('imageStyle').value === 'custom') ? '' : 'none';
});

$('imageStyle')?.addEventListener('change', () => {
  const isCustom = $('imageStyle').value === 'custom' && $('imageSource').value === 'ai';
  if ($('customStyleField')) $('customStyleField').style.display = isCustom ? '' : 'none';
});

// Initial visibility sync
if ($('imageSource')) {
  const isAi = $('imageSource').value === 'ai';
  if ($('styleField')) $('styleField').style.display = isAi ? '' : 'none';
  if ($('modelField')) $('modelField').style.display = isAi ? '' : 'none';
  if ($('qualityField')) $('qualityField').style.display = isAi ? '' : 'none';
}

$('createForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true; $('formMessage').textContent = 'Submitting production…';
  try {
    const voiceVal = $('voice').value;
    const musicVal = $('music')?.value;
    const audioObj = {};
    if (voiceVal && voiceVal !== 'auto') audioObj.voice = voiceVal;
    if (musicVal && musicVal !== 'auto') audioObj.music = musicVal;

    const imageSourceVal = $('imageSource')?.value || 'stock';
    const imageStyleVal = $('imageStyle')?.value || 'anime';
    const customPromptVal = $('customStylePrompt')?.value || '';

    const creativeObj = {
      contentType: $('contentType').value,
      tone: $('tone').value,
      audience: 'general YouTube audience',
      pacing: 'auto',
      style: 'cinematic_documentary',
      imageSource: imageSourceVal,
    };
    if (imageSourceVal === 'ai') {
      creativeObj.imageStyle = imageStyleVal;
      creativeObj.imageModel = $('imageModel')?.value || 'p-image-ideogram';
      creativeObj.imageQuality = $('imageQuality')?.value || 'medium';
      if (imageStyleVal === 'custom' && customPromptVal) {
        creativeObj.customStylePrompt = customPromptVal;
      }
    }

    const body = {
      prompt: $('prompt').value, profileId: $('channel').value || 'default',
      output: { durationSeconds: Number($('duration').value), aspectRatio: $('aspect').value, resolution: '1080p' },
      creative: creativeObj,
      audio: audioObj,
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
    if (action === 'download') {
      const response = await fetch(`/v1/videos/${id}/download`, { headers: { Authorization: `Bearer ${state.key}` } });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${id}.mp4`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
    if (action === 'review') {
      const response = await fetch(`/v1/videos/${id}/download`, { headers: { Authorization: `Bearer ${state.key}` } });
      if (!response.ok) throw new Error(`Review download failed (${response.status})`);
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
      const url = URL.createObjectURL(await response.blob());
      state.objectUrl = url;
      $('reviewVideo').src = url;
      $('reviewVideo').load();
      $('reviewDialog').showModal();
    }
    await loadVideos();
  } catch (error) { alert(error.message); }
});

async function loadAudioTracks() {
  try {
    const res = await fetch('/api/audiotracks').then((r) => r.json());
    if (res?.tracks?.length) {
      const musicSelect = $('music');
      if (!musicSelect) return;
      const groups = {};
      for (const track of res.tracks) {
        if (!groups[track.category]) groups[track.category] = [];
        groups[track.category].push(track);
      }
      for (const [cat, tracks] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = cat.toUpperCase();
        for (const t of tracks) {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.title} (${t.artist})`;
          optgroup.appendChild(opt);
        }
        musicSelect.appendChild(optgroup);
      }
    }
  } catch (err) {
    console.warn('Could not load audio tracks:', err);
  }
}

const saveApiKey = () => {
  const inputKey = $('apiKey').value.trim();
  if (inputKey) {
    state.key = inputKey;
    localStorage.setItem('videoApiKey', state.key);
    sessionStorage.setItem('videoApiKey', state.key);
    const errEl = $('settingsError');
    if (errEl) errEl.textContent = '';
  }
  const dialog = $('settingsDialog');
  if (dialog && dialog.open) dialog.close();
  loadVideos();
};

$('settingsButton').onclick = () => {
  $('apiKey').value = state.key;
  const errEl = $('settingsError');
  if (errEl) errEl.textContent = '';
  const dialog = $('settingsDialog');
  if (dialog && !dialog.open) dialog.showModal();
};

const settingsForm = $('settingsDialog')?.querySelector('form');
if (settingsForm) {
  settingsForm.addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    saveApiKey();
  });
}

$('saveKey').onclick = (e) => {
  e.preventDefault();
  saveApiKey();
};

$('refreshButton').onclick = loadVideos;
$('closeReview').onclick = () => {
  $('reviewVideo').pause();
  $('reviewVideo').removeAttribute('src');
  $('reviewVideo').load();
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;
  $('reviewDialog').close();
};
loadVideos(); loadAudioTracks(); state.poll = setInterval(loadVideos, 8_000);
