const $ = (id) => document.getElementById(id);
const state = {
  key: sessionStorage.getItem('videoApiKey') || '',
  videos: [],
  poll: null,
  objectUrl: null,
  thumbnailUrls: new Map(),
  channels: [],
  ideas: [],
  selectedChannelId: null,
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
const localInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60_000)).toISOString().slice(0, 16);
};

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
      sessionStorage.removeItem('videoApiKey');
      const dialog = $('settingsDialog');
      if (dialog && !dialog.open) dialog.showModal();
      const errEl = $('settingsError');
      if (errEl) errEl.textContent = 'Invalid API key. Please check your VIDEO_API_KEYS configuration.';
    }
    $('healthText').textContent = error.message;
  }
}

function syncComposerAiVisibility() {
  const isAi = $('imageSource')?.value === 'ai';
  if ($('styleField')) $('styleField').style.display = isAi ? '' : 'none';
  if ($('modelField')) $('modelField').style.display = isAi ? '' : 'none';
  if ($('providerField')) $('providerField').style.display = isAi ? '' : 'none';
  if ($('qualityField')) $('qualityField').style.display = isAi ? '' : 'none';
  if ($('customStyleField')) $('customStyleField').style.display = (isAi && $('imageStyle')?.value === 'custom') ? '' : 'none';
}

function syncChannelAiVisibility() {
  const isAi = $('channelImageSource')?.value === 'ai';
  if ($('channelStyleField')) $('channelStyleField').style.display = isAi ? '' : 'none';
  if ($('channelModelField')) $('channelModelField').style.display = isAi ? '' : 'none';
  if ($('channelProviderField')) $('channelProviderField').style.display = isAi ? '' : 'none';
  if ($('channelQualityField')) $('channelQualityField').style.display = isAi ? '' : 'none';
  if ($('channelCustomStyleField')) $('channelCustomStyleField').style.display = (isAi && $('channelImageStyle')?.value === 'custom') ? '' : 'none';
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

$('imageSource')?.addEventListener('change', syncComposerAiVisibility);
$('imageStyle')?.addEventListener('change', syncComposerAiVisibility);
$('channelImageSource')?.addEventListener('change', syncChannelAiVisibility);
$('channelImageStyle')?.addEventListener('change', syncChannelAiVisibility);

// Initial visibility sync
syncComposerAiVisibility();
syncChannelAiVisibility();

function populateChannelSelect() {
  const select = $('channel');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="default">✨ Standalone / Default Studio</option>';
  for (const ch of state.channels) {
    const opt = document.createElement('option');
    opt.value = ch.id;
    opt.textContent = `${ch.name} (${ch.handle || ch.id})`;
    select.appendChild(opt);
  }
  if (state.channels.some((c) => c.id === currentVal)) {
    select.value = currentVal;
  }
}

$('channel')?.addEventListener('change', () => {
  const channelId = $('channel').value;
  if (channelId === 'default') return;
  const ch = state.channels.find((c) => c.id === channelId);
  if (!ch) return;
  const d = ch.productionDefaults || {};
  if (d.contentType && d.contentType !== 'auto' && $('contentType')) $('contentType').value = d.contentType;
  if (d.aspectRatio && $('aspect')) $('aspect').value = d.aspectRatio;
  if (d.durationSeconds && $('duration')) $('duration').value = String(d.durationSeconds);
  if (d.imageSource && $('imageSource')) $('imageSource').value = d.imageSource;
  if (d.imageStyle && $('imageStyle')) $('imageStyle').value = d.imageStyle;
  if (d.imageModel && $('imageModel')) $('imageModel').value = d.imageModel;
  if (d.imageProvider && $('imageProvider')) $('imageProvider').value = d.imageProvider;
  if (d.imageQuality && $('imageQuality')) $('imageQuality').value = d.imageQuality;
  if (d.customStylePrompt !== undefined && $('customStylePrompt')) $('customStylePrompt').value = d.customStylePrompt;
  if (d.voice && $('voice')) $('voice').value = d.voice;
  if (d.music && $('music')) $('music').value = d.music;
  if (d.tone && $('tone')) $('tone').value = d.tone;
  syncComposerAiVisibility();
});

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
      const selectedModel = $('imageModel')?.value || 'p-image-ideogram';
      creativeObj.imageStyle = imageStyleVal;
      creativeObj.imageModel = selectedModel;
      const explicitProvider = $('imageProvider')?.value;
      creativeObj.imageProvider = (explicitProvider && explicitProvider !== 'auto')
        ? explicitProvider
        : (selectedModel.includes('flux') ? 'flux' : 'ideogram');
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
      const populate = (musicSelect) => {
        if (!musicSelect) return;
        while (musicSelect.options.length > 1) musicSelect.remove(1);
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
      };
      populate($('music'));
      populate($('channelMusic'));
    }
  } catch (err) {
    console.warn('Could not load audio tracks:', err);
  }
}

function setupBackdropClose(dialog) {
  if (!dialog) return;
  dialog.addEventListener('click', (event) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dialog.close();
    }
  });
}

setupBackdropClose($('channelDialog'));
setupBackdropClose($('settingsDialog'));
setupBackdropClose($('reviewDialog'));

const saveApiKey = () => {
  const inputKey = $('apiKey').value.trim();
  if (inputKey) {
    state.key = inputKey;
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

function showDesk(name) {
  const channels = name === 'channels';
  document.querySelectorAll('.production-view').forEach((element) => { element.hidden = channels; });
  $('channelsView').hidden = !channels;
  $('productionTab').classList.toggle('active', !channels);
  $('channelsTab').classList.toggle('active', channels);
  if (channels) loadChannels();
}

function renderChannels() {
  $('channelGrid').innerHTML = state.channels.length ? state.channels.map((channel) => {
    const d = channel.productionDefaults || {};
    const isAi = d.imageSource === 'ai';
    const mediaBadge = isAi
      ? `<span class="pill badge-ai">🎨 AI · ${escapeHtml(d.imageStyle || 'stickman')} (${escapeHtml(d.imageModel || 'ideogram')})</span>`
      : '<span class="pill badge-stock">🌐 Curated Stock</span>';
    const formats = (d.supportedContentTypes?.length ? d.supportedContentTypes : [d.contentType || 'explainer']).join(', ');
    return `
    <article class="channel-card ${channel.id === state.selectedChannelId ? 'selected' : ''}" data-channel-id="${escapeHtml(channel.id)}">
      <h3>${escapeHtml(channel.name)}</h3><div class="meta">${escapeHtml(channel.handle || channel.niche)}</div>
      <div class="pill-row">
        ${channel.contentPillars.slice(0, 4).map((pillar) => `<span class="pill">${escapeHtml(pillar)}</span>`).join('')}
      </div>
      <div class="pill-row">
        ${mediaBadge}
        <span class="pill">📐 ${escapeHtml(d.aspectRatio || '16:9')} · ${Number(d.durationSeconds || 120)}s</span>
        <span class="pill">📁 ${escapeHtml(formats)}</span>
        <span class="pill">🎙️ ${escapeHtml(d.voice || 'auto')}</span>
      </div>
      <div class="pill-row">
        <span class="automation-badge">${channel.automation.enabled ? `● ${escapeHtml(channel.automation.scheduleCron)} · ${escapeHtml(channel.automation.timezone)}` : '○ Manual production'}</span>
      </div>
      <div class="channel-actions">
        <button data-channel-action="use_in_studio" data-id="${escapeHtml(channel.id)}">🎬 Use in Studio</button>
        <button data-channel-action="connect" data-id="${escapeHtml(channel.id)}">${channel.youtube.connected ? 'YouTube connected' : 'Connect YouTube'}</button>
        ${channel.youtube.connected ? `<button data-channel-action="autopublish" data-id="${escapeHtml(channel.id)}">${channel.automation.autoPublish ? 'Disable autopublish' : 'Enable autopublish'}</button>` : ''}
        <button data-channel-action="delete" data-id="${escapeHtml(channel.id)}">Delete</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty">Create your first channel.</div>';
}

function renderIdeas() {
  const channel = state.channels.find((item) => item.id === state.selectedChannelId);
  $('ideasTitle').textContent = channel ? `${channel.name} ideas` : 'Select a channel';
  $('brainstormButton').disabled = !channel;
  $('ideaGrid').innerHTML = state.ideas.length ? state.ideas.map((idea) => {
    const canProduce = ['draft', 'approved', 'failed'].includes(idea.status);
    const canPublish = ['ready', 'publish_failed'].includes(idea.status) && channel?.youtube?.connected;
    return `<article class="idea-card"><div class="pill-row"><span class="score">Retention ${Number(idea.retentionScore)}/100</span><span class="pill">${escapeHtml(idea.hookFormula)}</span><span class="pill">${escapeHtml(idea.status)}</span></div><h3>${escapeHtml(idea.title)}</h3><div class="hook">“${escapeHtml(idea.spokenHook)}”</div><p>${escapeHtml(idea.narrativeArc)}</p>${idea.error ? `<p class="meta">${escapeHtml(idea.error)}</p>` : ''}${canPublish ? `<label>Optional YouTube publish time<input type="datetime-local" data-publish-time value="${escapeHtml(localInputValue(idea.publishAt))}"></label>` : ''}<div class="actions">${idea.status === 'draft' ? `<button data-idea-action="approve" data-id="${escapeHtml(idea.id)}">Approve</button>` : ''}${canProduce ? `<button class="primary" data-idea-action="produce" data-id="${escapeHtml(idea.id)}">Produce video</button>` : ''}${canPublish ? `<button data-idea-action="schedule" data-id="${escapeHtml(idea.id)}">Save publish time</button><button class="primary" data-idea-action="publish" data-id="${escapeHtml(idea.id)}">${idea.status === 'publish_failed' ? 'Retry YouTube upload' : 'Publish to YouTube'}</button>` : ''}${idea.videoId ? `<span class="meta">Video ${escapeHtml(idea.videoId)}</span>` : ''}</div></article>`;
  }).join('') : '<div class="empty">No ideas yet. Brainstorm a batch to begin.</div>';
}

async function loadChannels() {
  if (!state.key) { $('settingsButton').click(); return; }
  try {
    const result = await api('/v1/channels');
    state.channels = result.channels || [];
    populateChannelSelect();
    if (state.selectedChannelId && !state.channels.some((item) => item.id === state.selectedChannelId)) state.selectedChannelId = null;
    renderChannels();
    if (state.selectedChannelId) await loadIdeas(); else renderIdeas();
  } catch (error) { $('channelMessage').textContent = error.message; }
}

async function loadIdeas() {
  if (!state.selectedChannelId) return;
  const result = await api(`/v1/channels/${encodeURIComponent(state.selectedChannelId)}/ideas`);
  state.ideas = result.ideas || []; renderIdeas(); renderChannels();
}

$('productionTab').onclick = () => showDesk('production');
$('channelsTab').onclick = () => showDesk('channels');

$('newChannelButton').onclick = () => {
  $('channelForm').reset();
  if ($('channelError')) $('channelError').textContent = '';
  syncChannelAiVisibility();
  $('channelDialog').showModal();
};

$('closeChannel')?.addEventListener('click', () => $('channelDialog').close());
$('cancelChannel')?.addEventListener('click', () => $('channelDialog').close());

$('channelForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter || $('channelForm').querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const errorEl = $('channelError');
  if (errorEl) errorEl.textContent = '';
  try {
    const supportedTypes = Array.from(document.querySelectorAll('#channelSupportedTypes input[type="checkbox"]:checked'))
      .map((cb) => cb.value);
    const primaryContentType = $('channelContentType').value;
    if (!supportedTypes.length) supportedTypes.push(primaryContentType);

    const imageSourceVal = $('channelImageSource').value;
    const prodDefaults = {
      aspectRatio: $('channelAspect').value,
      durationSeconds: Number($('channelDuration').value) || 120,
      contentType: primaryContentType,
      supportedContentTypes: supportedTypes,
      imageSource: imageSourceVal,
      voice: $('channelVoice')?.value || 'auto',
      music: $('channelMusic')?.value || 'auto',
      tone: $('channelTone')?.value?.trim() || 'clear, compelling, and authoritative',
    };

    if (imageSourceVal === 'ai') {
      const selectedModel = $('channelImageModel')?.value || 'p-image-ideogram';
      prodDefaults.imageStyle = $('channelImageStyle')?.value || 'cinematic_documentary';
      prodDefaults.imageModel = selectedModel;
      const explicitProvider = $('channelImageProvider')?.value;
      prodDefaults.imageProvider = (explicitProvider && explicitProvider !== 'auto')
        ? explicitProvider
        : (selectedModel.includes('flux') ? 'flux' : 'ideogram');
      prodDefaults.imageQuality = $('channelImageQuality')?.value || 'medium';
      const customPrompt = $('channelCustomStylePrompt')?.value?.trim();
      if (prodDefaults.imageStyle === 'custom' && customPrompt) {
        prodDefaults.customStylePrompt = customPrompt;
      }
    }

    const body = {
      name: $('channelName').value.trim(),
      handle: $('channelHandle').value.trim(),
      niche: $('channelNiche').value.trim(),
      targetAudience: $('channelAudience').value.trim(),
      contentPillars: $('channelPillars').value.split(',').map((val) => val.trim()).filter(Boolean),
      productionDefaults: prodDefaults,
      automation: {
        enabled: $('channelAutomation').checked,
        scheduleCron: $('channelCron').value.trim(),
        timezone: $('channelTimezone').value.trim(),
        approvalMode: $('channelApproval').value,
      },
    };

    const created = await api('/v1/channels', { method: 'POST', body: JSON.stringify(body) });
    state.selectedChannelId = created.id;
    $('channelDialog').close();
    event.target.reset();
    await loadChannels();
    populateChannelSelect();
  } catch (error) {
    if (errorEl) errorEl.textContent = error.message;
    else $('channelMessage').textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
});

$('channelGrid').addEventListener('click', async (event) => {
  const action = event.target.closest('[data-channel-action]');
  if (action) {
    event.stopPropagation(); const id = action.dataset.id;
    try {
      if (action.dataset.channelAction === 'use_in_studio') {
        showDesk('production');
        const select = $('channel');
        if (select) {
          select.value = id;
          select.dispatchEvent(new Event('change'));
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (action.dataset.channelAction === 'connect') {
        const channel = state.channels.find((item) => item.id === id);
        if (channel?.youtube?.connected) return;
        const result = await api(`/v1/channels/${encodeURIComponent(id)}/youtube/connect`);
        window.open(result.authorizationUrl, 'youtube-oauth', 'width=620,height=760,noopener,noreferrer');
      }
      if (action.dataset.channelAction === 'autopublish') {
        const channel = state.channels.find((item) => item.id === id);
        const enabling = !channel.automation.autoPublish;
        if (!enabling || confirm('Enable unattended YouTube uploads? Completed videos will use this channel’s privacy setting, which defaults to private.')) {
          await api(`/v1/channels/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ automation:{ autoPublish:enabling } }) });
          await loadChannels();
        }
      }
      if (action.dataset.channelAction === 'delete' && confirm('Delete this channel and all its ideas? Existing rendered videos are preserved.')) {
        await api(`/v1/channels/${encodeURIComponent(id)}`, { method:'DELETE' });
        if (state.selectedChannelId === id) { state.selectedChannelId = null; state.ideas = []; }
        await loadChannels();
      }
    } catch (error) { $('channelMessage').textContent = error.message; }
    return;
  }
  const card = event.target.closest('[data-channel-id]'); if (!card) return;
  state.selectedChannelId = card.dataset.channelId; await loadIdeas();
});

$('brainstormButton').onclick = async () => {
  const button = $('brainstormButton'); button.disabled = true; $('channelMessage').textContent = 'Generating retention-engineered ideas…';
  try {
    await api(`/v1/channels/${encodeURIComponent(state.selectedChannelId)}/ideas/brainstorm`, { method:'POST', body:JSON.stringify({ count:5 }) });
    $('channelMessage').textContent = 'Ideas ready for review.'; await loadIdeas();
  } catch (error) { $('channelMessage').textContent = error.message; }
  finally { button.disabled = false; }
};

$('ideaGrid').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-idea-action]'); if (!button) return;
  button.disabled = true; const base = `/v1/channels/${encodeURIComponent(state.selectedChannelId)}/ideas/${encodeURIComponent(button.dataset.id)}`;
  try {
    if (button.dataset.ideaAction === 'approve') await api(base, { method:'PATCH', body:JSON.stringify({ status:'approved' }) });
    if (button.dataset.ideaAction === 'produce') await api(`${base}/produce`, { method:'POST' });
    if (button.dataset.ideaAction === 'schedule') {
      const value = button.closest('.idea-card').querySelector('[data-publish-time]').value;
      await api(base, { method:'PATCH', body:JSON.stringify({ publishAt:value ? new Date(value).toISOString() : null }) });
    }
    if (button.dataset.ideaAction === 'publish' && confirm('Upload this video to the connected YouTube channel using the channel privacy settings?')) await api(`${base}/publish`, { method:'POST' });
    await loadIdeas();
  } catch (error) { $('channelMessage').textContent = error.message; button.disabled = false; }
});

loadVideos(); loadAudioTracks(); state.poll = setInterval(() => { loadVideos(); if (!$('channelsView').hidden) loadChannels().catch(() => {}); }, 8_000);
