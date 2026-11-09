const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const state = { key: sessionStorage.getItem('videoApiKey') || '', videos: [], channels: [], ideas: [], performance: [], selectedChannelId: query.get('channelId'), editingChannelId: null, thumbs: new Map(), poll: null, mediaUrl: null, pollCount: 0 };
const terminal = new Set(['completed', 'failed', 'cancelled']);
const activeStatuses = new Set(['queued', 'preparing', 'processing', 'cancel_requested']);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
const durationLabel = (seconds) => seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60 ? `${seconds % 60}s` : ''}`.trim() : `${seconds}s`;
const bearerKey = () => {
  const separator = state.key.indexOf(':');
  return separator > 0 && /^[a-zA-Z0-9_-]{3,64}$/.test(state.key.slice(0, separator)) ? state.key.slice(separator + 1) : state.key;
};
const headers = (json = true) => ({ Authorization: `Bearer ${bearerKey()}`, ...(json ? { 'Content-Type': 'application/json' } : {}) });

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(options.body !== undefined), ...(options.headers || {}) } });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : response;
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function toast(message) {
  const node = $('toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

const routes = {
  overview: ['STUDIO', 'Overview'], production: ['CREATE', 'Production'], channels: ['AUTOMATION', 'Channels'],
  ideas: ['GROWTH ENGINE', 'Ideas'], analytics: ['FEEDBACK LOOP', 'Analytics'], settings: ['CONFIGURATION', 'Settings'],
};
function setPage() {
  const page = location.pathname.split('/').filter(Boolean).at(-1);
  const active = routes[page] ? page : 'overview';
  document.querySelectorAll('[data-page-panel]').forEach((el) => el.classList.toggle('active', el.dataset.pagePanel === active));
  document.querySelectorAll('[data-page]').forEach((el) => el.classList.toggle('active', el.dataset.page === active));
  [$('pageEyebrow').textContent, $('pageTitle').textContent] = routes[active];
  document.title = `${routes[active][1]} · VideoForge`;
  document.querySelector('.sidebar').classList.remove('open');
}

function videoCard(video) {
  const title = video.result?.title || video.metadata?.title || video.metadata?.externalId || video.id;
  const thumb = state.thumbs.get(video.id);
  const controls = video.status === 'completed'
    ? `<button data-video-action="review" data-id="${video.id}">Review</button><button data-video-action="download" data-id="${video.id}">Download</button><button class="danger" data-video-action="delete" data-id="${video.id}">Delete</button>`
    : ['failed', 'cancelled'].includes(video.status)
      ? `<button data-video-action="retry" data-id="${video.id}">Retry</button><button class="danger" data-video-action="delete" data-id="${video.id}">Delete</button>`
      : `<button data-video-action="cancel" data-id="${video.id}">Cancel</button>`;
  return `<article class="video-card"><div class="poster" data-poster="${video.id}" ${thumb ? `style="background-image:url('${thumb}')"` : ''}><span class="status ${escapeHtml(video.status)}">${escapeHtml(video.status)}</span>${video.status !== 'completed' ? `<strong>${escapeHtml(video.stage || 'QUEUED')}</strong>` : ''}</div><div class="card-body"><h3>${escapeHtml(title)}</h3><div class="meta">${dateLabel(video.createdAt)}${video.result?.durationSeconds ? ` · ${durationLabel(Math.round(video.result.durationSeconds))}` : ''}</div><div class="progress"><span style="width:${Number(video.progress || 0)}%"></span></div><div class="actions">${controls}</div></div></article>`;
}

function renderVideos() {
  $('totalCount').textContent = state.videos.length;
  $('activeCount').textContent = state.videos.filter((v) => activeStatuses.has(v.status)).length;
  $('completedCount').textContent = state.videos.filter((v) => v.status === 'completed').length;
  const empty = '<div class="empty">No productions yet. Create your first video to begin.</div>';
  $('videoGrid').innerHTML = state.videos.length ? state.videos.map(videoCard).join('') : empty;
  $('recentGrid').innerHTML = state.videos.length ? state.videos.slice(0, 4).map(videoCard).join('') : empty;
}

async function loadThumbnails() {
  const ids = new Set(state.videos.map((v) => v.id));
  for (const [id, url] of state.thumbs) if (!ids.has(id)) { URL.revokeObjectURL(url); state.thumbs.delete(id); }
  for (const video of state.videos.filter((v) => v.status === 'completed' && !state.thumbs.has(v.id))) {
    fetch(`/v1/videos/${video.id}/thumbnail`, { headers: headers(false) }).then(async (res) => {
      if (!res.ok) return; const url = URL.createObjectURL(await res.blob()); state.thumbs.set(video.id, url);
      document.querySelectorAll(`[data-poster="${video.id}"]`).forEach((el) => { el.style.backgroundImage = `url('${url}')`; });
    }).catch(() => {});
  }
}

async function loadVideos() {
  if (!state.key) { renderVideos(); return; }
  try {
    const videos = []; let cursor = null;
    do {
      const suffix = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      const result = await api(`/v1/videos?limit=100${suffix}`);
      videos.push(...(result.videos || [])); cursor = result.nextCursor || null;
    } while (cursor && videos.length < 2_000);
    state.videos = videos; renderVideos(); void loadThumbnails();
  }
  catch (error) { handleApiError(error); }
}

function channelCard(channel) {
  const formats = channel.productionDefaults.formats || [channel.productionDefaults.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
  const ranges = channel.productionDefaults.durationRanges || {};
  return `<article class="channel-card"><div class="card-top"><div><p class="eyebrow">${escapeHtml(channel.handle || channel.language || 'CHANNEL')}</p><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.niche)}</p></div><span class="status-dot ${channel.automation.enabled ? 'ready' : ''}" title="${channel.automation.enabled ? 'Automation active' : 'Automation paused'}"></span></div><div class="badge-row">${formats.map((f) => `<span class="badge accent">${escapeHtml(f)}</span>`).join('')}<span class="badge">${escapeHtml(channel.archetype)}</span><span class="badge">${escapeHtml(channel.primaryGoal)}</span></div><p class="card-copy">${escapeHtml(channel.targetAudience)}</p><div class="channel-stats"><div><span>Shorts range</span><strong>${ranges.shorts ? `${durationLabel(ranges.shorts.min)}–${durationLabel(ranges.shorts.max)}` : 'Disabled'}</strong></div><div><span>Landscape range</span><strong>${ranges.landscape ? `${durationLabel(ranges.landscape.min)}–${durationLabel(ranges.landscape.max)}` : 'Disabled'}</strong></div><div><span>Automation</span><strong>${channel.automation.enabled ? 'Enabled' : 'Paused'}</strong></div><div><span>Schedule</span><strong>${escapeHtml(channel.automation.scheduleCron)}</strong></div></div>${channel.automation.lastError ? `<p class="error-text">Last scheduler error: ${escapeHtml(channel.automation.lastError)}</p>` : ''}<div class="actions"><button data-channel-action="ideas" data-id="${channel.id}">Open ideas</button><button data-channel-action="brainstorm" data-id="${channel.id}">Generate ideas</button><button data-channel-action="analytics" data-id="${channel.id}">Add results</button><button data-channel-action="edit" data-id="${channel.id}">Edit</button><button data-channel-action="toggle" data-id="${channel.id}">${channel.automation.enabled ? 'Pause' : 'Enable'} automation</button><button class="danger" data-channel-action="delete" data-id="${channel.id}">Delete</button></div></article>`;
}

function renderChannels() {
  $('channelCount').textContent = state.channels.length;
  $('channelGrid').innerHTML = state.channels.length ? state.channels.map(channelCard).join('') : '<div class="empty">No channel profiles yet. Create one to unlock strategic ideation and automation.</div>';
  const options = state.channels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const currentProfile = $('profileId').value;
  $('profileId').innerHTML = '<option value="default">Default profile</option>' + options;
  if ([...$('profileId').options].some((option) => option.value === currentProfile)) $('profileId').value = currentProfile;
  $('ideaChannel').innerHTML = options || '<option value="">Create a channel first</option>';
  $('performanceChannel').innerHTML = options || '<option value="">Create a channel first</option>';
  if (state.selectedChannelId && state.channels.some((c) => c.id === state.selectedChannelId)) $('ideaChannel').value = state.selectedChannelId;
  else state.selectedChannelId = state.channels[0]?.id || null;
  if (state.selectedChannelId) $('performanceChannel').value = state.selectedChannelId;
}

async function loadChannels() {
  if (!state.key) { renderChannels(); return; }
  try { const result = await api('/v1/channels'); state.channels = result.channels || []; renderChannels(); }
  catch (error) { handleApiError(error); }
}

function ideaCard(idea) {
  const canProduce = ['draft', 'approved', 'failed'].includes(idea.status);
  return `<article class="idea-card"><div class="card-top"><div><div class="badge-row"><span class="badge accent">${escapeHtml(idea.format)}</span><span class="badge">${durationLabel(idea.durationSeconds)}</span><span class="badge">${escapeHtml(label(idea.trafficStrategy))}</span></div></div><div class="idea-score">${idea.compositeScore}<small>/40</small></div></div><h3>${escapeHtml(idea.title)}</h3><p class="card-copy"><strong>Hook:</strong> ${escapeHtml(idea.spokenHook)}</p><div class="idea-detail"><strong>Keyword</strong> · ${escapeHtml(idea.primaryKeyword)}<br><strong>Why it wins</strong> · ${escapeHtml(idea.whyThisIdea)}<br><strong>Duration</strong> · ${escapeHtml(idea.durationRationale)}</div><div class="idea-detail"><strong>Thumbnail</strong> · ${escapeHtml(idea.thumbnailConcept)}</div><div class="badge-row"><span class="badge">Retention ${idea.retentionScore}</span><span class="badge">Title ${idea.titleScore}</span><span class="badge">${escapeHtml(idea.status)}</span><span class="badge">${escapeHtml(idea.urgency)}</span></div><div class="actions">${idea.status === 'draft' ? `<button data-idea-action="approve" data-id="${idea.id}">Approve</button><button data-idea-action="reject" data-id="${idea.id}">Reject</button>` : ''}${canProduce ? `<button data-idea-action="produce" data-id="${idea.id}">Produce video</button>` : ''}${idea.videoId ? `<button data-idea-action="video" data-video-id="${idea.videoId}">View video</button>` : ''}</div></article>`;
}

function renderPerformance() {
  $('performanceGrid').innerHTML = state.performance.length ? state.performance.map((item) => `<article class="idea-card"><div class="card-top"><div class="badge-row"><span class="badge accent">${escapeHtml(item.format)}</span><span class="badge">${durationLabel(item.durationSeconds)}</span></div><span class="meta">${dateLabel(item.capturedAt)}</span></div><h3>${escapeHtml(item.title || item.videoId || 'Untitled video')}</h3><div class="channel-stats"><div><span>Views</span><strong>${Number(item.views || 0).toLocaleString()}</strong></div><div><span>CTR</span><strong>${item.clickThroughRate == null ? '—' : `${item.clickThroughRate}%`}</strong></div><div><span>Viewed</span><strong>${item.averageViewPercentage == null ? '—' : `${item.averageViewPercentage}%`}</strong></div><div><span>Subscribers</span><strong>${Number(item.subscribersGained || 0).toLocaleString()}</strong></div></div></article>`).join('') : '<div class="empty">No performance snapshots yet. Add results after a video has collected meaningful data.</div>';
}

async function loadPerformance() {
  const channelId = $('performanceChannel').value || state.selectedChannelId;
  if (!state.key || !channelId) { state.performance = []; renderPerformance(); return; }
  try { const result = await api(`/v1/channels/${channelId}/performance`); state.performance = result.snapshots || []; renderPerformance(); }
  catch (error) { handleApiError(error); }
}

const optionalNumber = (id) => $(id).value === '' ? null : Number($(id).value);
async function savePerformance(event) {
  event.preventDefault();
  const channelId = $('performanceChannel').value;
  if (!channelId) return toast('Create a channel first');
  const body = {
    title: $('performanceTitle').value, format: $('performanceFormat').value,
    durationSeconds: Number($('performanceDuration').value), views: Number($('performanceViews').value),
    impressions: Number($('performanceImpressions').value), clickThroughRate: optionalNumber('performanceCtr'),
    averageViewPercentage: optionalNumber('performanceViewed'), retention30sPercentage: optionalNumber('performanceRetention'),
    subscribersGained: Number($('performanceSubscribers').value), watchTimeHours: optionalNumber('performanceWatchTime'),
    revenue: optionalNumber('performanceRevenue'), source: 'manual',
  };
  try {
    await api(`/v1/channels/${channelId}/performance`, { method: 'POST', body: JSON.stringify(body) });
    $('performanceMessage').textContent = 'Snapshot saved. It will inform the next idea run.';
    $('performanceTitle').value = ''; toast('Performance saved'); await loadPerformance();
  } catch (error) { $('performanceMessage').textContent = error.message; handleApiError(error); }
}

function renderIdeas() { $('ideaGrid').innerHTML = state.ideas.length ? state.ideas.map(ideaCard).join('') : `<div class="empty">${state.selectedChannelId ? 'No ideas yet. Run the strategic idea generator.' : 'Create a channel before generating ideas.'}</div>`; }
async function loadIdeas() {
  state.selectedChannelId = $('ideaChannel').value || state.selectedChannelId;
  if (!state.key || !state.selectedChannelId) { state.ideas = []; renderIdeas(); return; }
  try { const result = await api(`/v1/channels/${state.selectedChannelId}/ideas`); state.ideas = result.ideas || []; renderIdeas(); }
  catch (error) { handleApiError(error); }
}

async function checkHealth() {
  if (!state.key) { $('healthText').textContent = 'API key required'; $('workerText').textContent = 'Open Settings'; $('keyState').textContent = 'API key required'; return; }
  try {
    const ready = await api('/ready'); $('healthDot').classList.toggle('ready', Boolean(ready.ready)); $('healthText').textContent = ready.ready ? 'System ready' : 'Service degraded';
    const workers = ready.queue?.workerCount ?? ready.queue?.workers ?? '—'; $('workerText').textContent = `${workers} worker${workers === 1 ? '' : 's'} connected`; $('keyState').textContent = 'Securely connected';
    $('apiStatus').textContent = ready.ready ? 'Ready' : 'Degraded'; $('workerStatus').textContent = workers; $('storageStatus').textContent = ready.storage?.status || ready.store?.status || 'Available';
  } catch (error) { handleApiError(error); $('apiStatus').textContent = 'Unavailable'; }
}

function handleApiError(error) {
  if (error.status === 401) {
    state.key = ''; state.videos = []; state.channels = []; state.ideas = []; state.performance = []; state.selectedChannelId = null;
    sessionStorage.removeItem('videoApiKey'); $('keyState').textContent = 'Invalid API key'; $('apiKey').value = '';
    for (const url of state.thumbs.values()) URL.revokeObjectURL(url); state.thumbs.clear();
    if (state.mediaUrl) URL.revokeObjectURL(state.mediaUrl); state.mediaUrl = null;
    renderVideos(); renderChannels(); renderIdeas(); renderPerformance();
  }
  $('healthText').textContent = error.message; toast(error.message);
}

async function refreshAll() { await checkHealth(); if (!state.key) return; await Promise.all([loadVideos(), loadChannels()]); if (state.selectedChannelId) await Promise.all([loadIdeas(), loadPerformance()]); }

async function createVideo(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true; $('formMessage').textContent = 'Submitting production…';
  try {
    const selectedChannel = state.channels.find((channel) => channel.id === $('profileId').value);
    const defaults = selectedChannel?.productionDefaults || {};
    const creative = { contentType: $('contentType').value, tone: $('tone').value, audience: selectedChannel?.targetAudience || 'general YouTube audience', pacing: 'auto', imageSource: $('imageSource').value };
    if (creative.imageSource === 'ai') Object.assign(creative, { imageProvider: defaults.imageProvider || undefined, imageModel: defaults.imageModel || undefined, imageQuality: defaults.imageQuality || undefined, imageStyle: defaults.imageStyle || undefined, customStylePrompt: defaults.customStylePrompt || undefined });
    const body = { prompt: $('prompt').value, profileId: $('profileId').value, niche: selectedChannel?.niche, output: { durationSeconds: Number($('duration').value), aspectRatio: $('aspect').value, resolution: '1080p' }, creative, audio: $('voice').value !== 'auto' ? { voice: $('voice').value } : {}, subtitles: { enabled: defaults.subtitles !== false }, metadata: { source: 'dashboard', channelId: $('profileId').value } };
    await api('/v1/videos', { method: 'POST', body: JSON.stringify(body) }); event.currentTarget.reset(); $('tone').value = 'clear, compelling, and authoritative'; $('formMessage').textContent = 'Production queued successfully.'; toast('Production queued'); await loadVideos();
  } catch (error) { $('formMessage').textContent = error.message; handleApiError(error); } finally { button.disabled = false; }
}

function applySelectedChannelDefaults() {
  const channel = state.channels.find((item) => item.id === $('profileId').value);
  if (!channel) return;
  const defaults = channel.productionDefaults;
  $('contentType').value = [...$('contentType').options].some((option) => option.value === defaults.contentType) ? defaults.contentType : 'auto';
  $('tone').value = defaults.tone;
  $('imageSource').value = defaults.imageSource;
  $('voice').value = defaults.voice || 'auto';
  if (defaults.formats.length === 1) $('aspect').value = defaults.formats[0] === 'shorts' ? '9:16' : '16:9';
}

const imageModels = {
  ideogram: [
    ['p-image-ideogram', 'P-Image Ideogram - fast and economical'],
    ['ideogram-4-5', 'Ideogram 4.5 - highest precision'],
    ['ideogram-4', 'Ideogram 4 - design and layout'],
    ['V_2_TURBO', 'Ideogram V2 Turbo'],
  ],
  replicate: [['black-forest-labs/flux-schnell', 'FLUX.1 Schnell - fast generation']],
};

function syncChannelVisualFields(preferredModel = null) {
  const ai = $('channelImageSource').value === 'ai';
  document.querySelectorAll('.channel-ai-field').forEach((field) => { field.hidden = !ai; });
  if (!ai) return;
  const provider = $('channelImageProvider').value;
  const choices = imageModels[provider] || imageModels.ideogram;
  $('channelImageModel').innerHTML = choices.map(([value, text]) => `<option value="${value}">${text}</option>`).join('');
  if (preferredModel && choices.some(([value]) => value === preferredModel)) $('channelImageModel').value = preferredModel;
  $('channelCustomStyleField').hidden = $('channelImageStyle').value !== 'custom';
}

function openChannelDialog(channel = null) {
  state.editingChannelId = channel?.id || null;
  $('channelForm').reset();
  $('channelDialogTitle').textContent = channel ? 'Edit channel' : 'Create channel';
  $('channelSubmit').textContent = channel ? 'Save changes' : 'Create channel';
  $('channelError').textContent = '';
  if (channel) {
    $('channelName').value = channel.name; $('channelNiche').value = channel.niche;
    $('channelAudience').value = channel.targetAudience;
    $('channelPainPoints').value = (channel.audiencePainPoints || []).join(', ');
    $('channelPillars').value = channel.contentPillars.join(', ');
    $('channelArchetype').value = channel.archetype; $('channelSizeTier').value = channel.sizeTier;
    $('channelGoal').value = channel.primaryGoal; $('channelResources').value = channel.resourceLevel;
    $('channelPositioning').value = channel.positioning || ''; $('channelDifferentiation').value = channel.differentiation || '';
    $('channelCompetitors').value = (channel.competitors || []).join(', ');
    $('formatLandscape').checked = channel.productionDefaults.formats.includes('landscape');
    $('formatShorts').checked = channel.productionDefaults.formats.includes('shorts');
    $('shortMin').value = channel.productionDefaults.durationRanges.shorts.min;
    $('shortMax').value = channel.productionDefaults.durationRanges.shorts.max;
    $('landscapeMin').value = channel.productionDefaults.durationRanges.landscape.min;
    $('landscapeMax').value = channel.productionDefaults.durationRanges.landscape.max;
    const defaults = channel.productionDefaults;
    $('channelImageSource').value = defaults.imageSource || 'stock';
    $('channelImageProvider').value = defaults.imageProvider === 'flux' ? 'replicate' : (defaults.imageProvider || (String(defaults.imageModel || '').includes('flux') ? 'replicate' : 'ideogram'));
    $('channelImageStyle').value = defaults.imageStyle || 'doodle_comic';
    $('channelImageQuality').value = defaults.imageQuality || 'medium';
    $('channelCustomStylePrompt').value = defaults.customStylePrompt || '';
    $('channelContentType').value = defaults.contentType || 'auto'; $('channelVoice').value = defaults.voice || 'auto';
    $('channelTone').value = defaults.tone || 'clear, compelling, and authoritative'; $('channelSubtitles').checked = defaults.subtitles !== false;
    syncChannelVisualFields(defaults.imageModel);
    $('channelAutomationEnabled').checked = channel.automation.enabled;
    $('channelCron').value = channel.automation.scheduleCron; $('channelTimezone').value = channel.automation.timezone;
    $('channelApproval').value = channel.automation.approvalMode;
  } else {
    $('formatLandscape').checked = true; $('formatShorts').checked = true;
    $('shortMin').value = 20; $('shortMax').value = 60; $('landscapeMin').value = 120; $('landscapeMax').value = 600;
    $('channelCron').value = '0 12 * * *'; $('channelTimezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    $('channelImageSource').value = 'stock'; $('channelImageProvider').value = 'ideogram'; $('channelImageStyle').value = 'doodle_comic';
    $('channelImageQuality').value = 'medium'; $('channelContentType').value = 'auto'; $('channelVoice').value = 'auto'; $('channelSubtitles').checked = true;
    syncChannelVisualFields();
  }
  $('channelDialog').showModal();
}

async function createChannel(event) {
  event.preventDefault(); event.stopPropagation(); const formats = [...($('formatLandscape').checked ? ['landscape'] : []), ...($('formatShorts').checked ? ['shorts'] : [])];
  if (!formats.length) { $('channelError').textContent = 'Select at least one video format.'; return; }
  if (Number($('shortMin').value) > Number($('shortMax').value) || Number($('landscapeMin').value) > Number($('landscapeMax').value)) { $('channelError').textContent = 'Each minimum duration must be less than or equal to its maximum.'; return; }
  const submit = $('channelSubmit'); submit.disabled = true;
  const imageSource = $('channelImageSource').value;
  const body = {
    name: $('channelName').value, niche: $('channelNiche').value,
    archetype: $('channelArchetype').value, sizeTier: $('channelSizeTier').value,
    primaryGoal: $('channelGoal').value, resourceLevel: $('channelResources').value,
    positioning: $('channelPositioning').value, differentiation: $('channelDifferentiation').value,
    competitors: $('channelCompetitors').value.split(',').map((x) => x.trim()).filter(Boolean),
    targetAudience: $('channelAudience').value,
    audiencePainPoints: $('channelPainPoints').value.split(',').map((x) => x.trim()).filter(Boolean),
    contentPillars: $('channelPillars').value.split(',').map((x) => x.trim()).filter(Boolean),
    productionDefaults: {
      formats, durationMode: 'llm', durationRanges: { shorts: { min: Number($('shortMin').value), max: Number($('shortMax').value) }, landscape: { min: Number($('landscapeMin').value), max: Number($('landscapeMax').value) } },
      contentType: $('channelContentType').value, voice: $('channelVoice').value, tone: $('channelTone').value, subtitles: $('channelSubtitles').checked,
      imageSource, imageProvider: imageSource === 'ai' ? $('channelImageProvider').value : null,
      imageModel: imageSource === 'ai' ? $('channelImageModel').value : null, imageQuality: imageSource === 'ai' ? $('channelImageQuality').value : null,
      imageStyle: imageSource === 'ai' ? $('channelImageStyle').value : 'doodle_comic', customStylePrompt: imageSource === 'ai' && $('channelImageStyle').value === 'custom' ? $('channelCustomStylePrompt').value : '',
    },
    automation: { enabled: $('channelAutomationEnabled').checked, scheduleCron: $('channelCron').value, timezone: $('channelTimezone').value, approvalMode: $('channelApproval').value, autoPublish: false, publishPrivacy: 'private' },
  };
  try {
    const editing = state.editingChannelId;
    const channel = await api(editing ? `/v1/channels/${editing}` : '/v1/channels', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    $('channelDialog').close(); event.currentTarget.reset(); state.editingChannelId = null; state.selectedChannelId = channel.id;
    toast(editing ? 'Channel updated' : 'Channel created'); await loadChannels(); await loadIdeas();
  }
  catch (error) { $('channelError').textContent = error.message; handleApiError(error); }
  finally { submit.disabled = false; }
}

async function videoAction(button) {
  const { videoAction: action, id } = button.dataset; const video = state.videos.find((v) => v.id === id);
  button.disabled = true;
  try {
    if (action === 'download') { const response = await fetch(`/v1/videos/${id}/download`, { headers: headers(false) }); if (!response.ok) throw new Error('Download failed'); const url = URL.createObjectURL(await response.blob()); const a = document.createElement('a'); a.href = url; a.download = `${id}.mp4`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); return; }
    if (action === 'review') { const result = await api(`/v1/videos/${id}/result`); if (state.mediaUrl) URL.revokeObjectURL(state.mediaUrl); const response = await fetch(result.videoUrl, { headers: headers(false) }); if (!response.ok) throw new Error(`Video could not be loaded (${response.status})`); state.mediaUrl = URL.createObjectURL(await response.blob()); $('reviewVideo').src = state.mediaUrl; $('reviewTitle').textContent = result.title || video?.id || 'Video'; const pkg = result.package; $('packageDetails').innerHTML = pkg ? `<strong>${escapeHtml(pkg.title || result.title || '')}</strong><p>${escapeHtml(pkg.description || '')}</p>` : '<p>Publish package created with the completed video.</p>'; $('reviewDialog').showModal(); return; }
    if (action === 'cancel') await api(`/v1/videos/${id}/cancel`, { method: 'POST', body: '{}' });
    if (action === 'retry') await api(`/v1/videos/${id}/retry`, { method: 'POST', body: '{}' });
    if (action === 'delete' && confirm('Delete this video and all generated files?')) await api(`/v1/videos/${id}`, { method: 'DELETE' });
    await loadVideos();
  } catch (error) { handleApiError(error); }
  finally { button.disabled = false; }
}

async function brainstorm(channelId = state.selectedChannelId) {
  if (!channelId) return toast('Create or select a channel first');
  const button = $('brainstorm'); button.disabled = true;
  try { toast('Generating strategic ideas…'); const result = await api(`/v1/channels/${channelId}/ideas/brainstorm`, { method: 'POST', body: JSON.stringify({ count: 6, useAi: true }) }); state.selectedChannelId = channelId; state.ideas = result.ideas || []; renderChannels(); renderIdeas(); toast('Strategic ideas ready'); }
  catch (error) { handleApiError(error); }
  finally { button.disabled = false; }
}

const channelPage = (page, channelId = state.selectedChannelId) => `/dashboard/${page}${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`;

async function channelAction(button) {
  const { channelAction: action, id } = button.dataset; state.selectedChannelId = id;
  const channel = state.channels.find((item) => item.id === id);
  try {
    if (action === 'ideas') { location.href = channelPage('ideas', id); return; }
    if (action === 'brainstorm') { await brainstorm(id); location.href = channelPage('ideas', id); return; }
    if (action === 'analytics') { location.href = channelPage('analytics', id); return; }
    if (action === 'edit' && channel) { openChannelDialog(channel); return; }
    if (action === 'toggle' && channel) {
      await api(`/v1/channels/${id}`, { method: 'PATCH', body: JSON.stringify({ automation: { enabled: !channel.automation.enabled } }) });
      toast(channel.automation.enabled ? 'Automation paused' : 'Automation enabled'); await loadChannels(); return;
    }
    if (action === 'delete' && channel && confirm(`Delete ${channel.name}, its ideas, and its analytics? Generated videos will remain available.`)) {
      await api(`/v1/channels/${id}`, { method: 'DELETE' });
      state.selectedChannelId = null; state.ideas = []; state.performance = [];
      toast('Channel deleted'); await loadChannels(); renderIdeas(); renderPerformance(); return;
    }
  } catch (error) { handleApiError(error); }
}

async function ideaAction(button) {
  const action = button.dataset.ideaAction; const id = button.dataset.id; const base = `/v1/channels/${state.selectedChannelId}/ideas/${id}`;
  try {
    if (action === 'approve' || action === 'reject') await api(base, { method: 'PATCH', body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' }) });
    if (action === 'produce') await api(`${base}/produce`, { method: 'POST', body: '{}' });
    if (action === 'video') { location.href = `/dashboard/production?videoId=${encodeURIComponent(button.dataset.videoId)}`; return; }
    await Promise.all([loadIdeas(), loadVideos()]); toast(label(action) + ' complete');
  } catch (error) { handleApiError(error); }
}

document.addEventListener('click', (event) => { const video = event.target.closest('[data-video-action]'); const channel = event.target.closest('[data-channel-action]'); const idea = event.target.closest('[data-idea-action]'); if (video) void videoAction(video); if (channel) void channelAction(channel); if (idea) void ideaAction(idea); });
$('createForm').addEventListener('submit', createVideo); $('channelForm').addEventListener('submit', createChannel);
$('performanceForm').addEventListener('submit', savePerformance); $('refreshPerformance').addEventListener('click', loadPerformance);
$('newChannel').addEventListener('click', () => openChannelDialog());
$('brainstorm').addEventListener('click', () => brainstorm()); $('refreshIdeas').addEventListener('click', loadIdeas); $('refreshVideos').addEventListener('click', loadVideos);
$('ideaChannel').addEventListener('change', () => { state.selectedChannelId = $('ideaChannel').value; history.replaceState(null, '', channelPage('ideas')); void loadIdeas(); });
$('performanceChannel').addEventListener('change', () => { state.selectedChannelId = $('performanceChannel').value; history.replaceState(null, '', channelPage('analytics')); void loadPerformance(); });
$('profileId').addEventListener('change', applySelectedChannelDefaults);
$('channelImageSource').addEventListener('change', () => syncChannelVisualFields());
$('channelImageProvider').addEventListener('change', () => syncChannelVisualFields());
$('channelImageStyle').addEventListener('change', () => syncChannelVisualFields($('channelImageModel').value));
$('openSettings').addEventListener('click', () => { location.href = '/dashboard/settings'; }); $('menuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
$('settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); state.key = $('apiKey').value.trim(); sessionStorage.setItem('videoApiKey', state.key); $('settingsError').textContent = ''; await refreshAll(); });
$('clearKey').addEventListener('click', () => { state.key = ''; sessionStorage.removeItem('videoApiKey'); $('apiKey').value = ''; location.reload(); });
$('closeReview').addEventListener('click', () => $('reviewDialog').close()); $('reviewDialog').addEventListener('close', () => { $('reviewVideo').pause(); $('reviewVideo').removeAttribute('src'); $('reviewVideo').load(); if (state.mediaUrl) URL.revokeObjectURL(state.mediaUrl); state.mediaUrl = null; });
window.addEventListener('storage', () => refreshAll());
setPage(); $('apiKey').value = state.key; renderVideos(); renderChannels(); renderIdeas(); renderPerformance(); await refreshAll();
state.poll = setInterval(() => {
  if (!state.key) return; state.pollCount += 1;
  if (state.videos.some((v) => !terminal.has(v.status))) void loadVideos();
  if (state.selectedChannelId && state.ideas.some((idea) => ['queued', 'producing'].includes(idea.status))) void loadIdeas();
  if (state.pollCount % 6 === 0) void loadChannels();
}, 5000);
