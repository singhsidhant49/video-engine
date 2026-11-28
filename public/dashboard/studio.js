const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const state = {
  authenticated: false,
  user: null,
  publishingEnabled: false,
  videos: [],
  videoTotal: 0,
  videoCursor: null,
  videoSummary: null,
  selectedVideos: new Set(),
  pendingDeleteIds: [],
  channels: [],
  ideas: [],
  calendarItems: [],
  calendarView: 'agenda',
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  alertsData: { counts: { total: 0, critical: 0, error: 0, warning: 0 }, alerts: [] },
  alertFilter: 'all',
  performance: [],
  performanceSummary: null,
  selectedChannelId: query.get('channelId'),
  editingChannelId: null,
  editingIdea: null,
  thumbs: new Map(),
  thumbnailQueued: new Set(),
  thumbnailLoading: new Set(),
  thumbnailActive: 0,
  thumbnailObserver: null,
  poll: null,
  pollCount: 0,
  requests: new Map(),
};

const VIDEO_PAGE_SIZE = 50;
const THUMBNAIL_CONCURRENCY = 4;
const terminal = new Set(['completed', 'failed', 'cancelled']);
const activeStatuses = new Set(['queued', 'preparing', 'processing', 'cancel_requested']);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const label = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dateLabel = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
const durationLabel = (seconds) => seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60 ? `${seconds % 60}s` : ''}`.trim() : `${seconds}s`;
const headers = (json = true) => json ? { 'Content-Type': 'application/json' } : {};

function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...headers(options.body !== undefined), ...(options.headers || {}) } });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : response;
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function singleRequest(name, task) {
  if (state.requests.has(name)) return state.requests.get(name);
  const pending = Promise.resolve().then(task).finally(() => state.requests.delete(name));
  state.requests.set(name, pending);
  return pending;
}

function showLogin(message = '') {
  state.authenticated = false;
  state.user = null;
  $('keyState').textContent = 'Sign in required';
  $('loginError').textContent = message;
  if (!$('loginDialog').open) $('loginDialog').showModal();
}

async function restoreSession() {
  try {
    const result = await api('/auth/me');
    state.authenticated = true;
    state.user = result.user;
    $('accountEmail').textContent = result.user.email;
    $('keyState').textContent = result.user.email;
    if ($('loginDialog').open) $('loginDialog').close();
    return true;
  } catch (error) {
    if (error.status === 401) { showLogin(); return false; }
    showLogin('The server is unavailable. Check the deployment and try again.');
    return false;
  }
}

async function login(event) {
  event.preventDefault();
  const button = $('loginButton');
  button.disabled = true;
  $('loginError').textContent = '';
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value, password: $('loginPassword').value }) });
    state.authenticated = true;
    state.user = result.user;
    $('accountEmail').textContent = result.user.email;
    $('keyState').textContent = result.user.email;
    $('loginPassword').value = '';
    $('loginDialog').close();
    await refreshAll();
    await loadAdminUsers();
  } catch (error) {
    $('loginError').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.videos = [];
  state.videoTotal = 0;
  state.videoCursor = null;
  state.selectedVideos.clear();
  state.channels = [];
  state.ideas = [];
  state.calendarItems = [];
  state.alertsData = { counts: { total: 0, critical: 0, error: 0, warning: 0 }, alerts: [] };
  state.performance = [];
  state.performanceSummary = null;
  renderVideos();
  renderChannels();
  renderIdeas();
  renderCalendar();
  renderAlerts();
  renderPerformance();
  renderPerformanceSummary();
  showLogin('You have signed out.');
}

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

const routes = {
  overview: ['STUDIO', 'Overview'],
  calendar: ['SCHEDULE', 'Content Calendar'],
  production: ['CREATE', 'Productions'],
  channels: ['AUTOMATION', 'Channels'],
  ideas: ['GROWTH ENGINE', 'Ideas & Packaging'],
  alerts: ['MONITORING', 'Alerts & Errors'],
  analytics: ['FEEDBACK LOOP', 'Analytics'],
  settings: ['CONFIGURATION', 'Settings'],
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

function syncBulkBar() {
  for (const id of [...state.selectedVideos]) {
    if (!state.videos.some((v) => v.id === id)) state.selectedVideos.delete(id);
  }
  const count = state.selectedVideos.size;
  if ($('bulkActionBar')) $('bulkActionBar').hidden = count === 0;
  if ($('bulkSelectedCount')) $('bulkSelectedCount').textContent = `${count} video${count === 1 ? '' : 's'} selected`;
}

function videoCard(video) {
  const title = video.result?.title || video.metadata?.title || video.metadata?.externalId || video.id;
  const channel = state.channels.find((item) => item.id === video.channelId);
  const channelName = channel?.name || (video.channelId === 'default' ? 'Default profile' : video.channelId || 'Default profile');
  const thumb = state.thumbs.get(video.id);
  const checked = state.selectedVideos.has(video.id);
  const controls = video.status === 'completed'
    ? `<button class="primary-action" data-video-action="review" data-id="${video.id}">Review</button><button data-video-action="download" data-id="${video.id}">Download</button><button data-video-action="resync-captions" data-id="${video.id}">Re-sync captions</button><button data-video-action="visual-diagnostics" data-id="${video.id}">Diagnostics</button><button class="danger" data-video-action="delete" data-id="${video.id}">Delete</button>`
    : ['failed', 'cancelled'].includes(video.status)
      ? `<button class="primary-action" data-video-action="retry" data-id="${video.id}">Smart retry</button><select data-retry-stage aria-label="Retry from stage"><option value="plan">Script</option><option value="audio">Audio</option><option value="assets">Visual assets</option><option value="timeline">Timeline</option><option value="render">Render</option></select><button data-video-action="retry-stage" data-id="${video.id}">Retry stage</button><button data-video-action="visual-diagnostics" data-id="${video.id}">Diagnostics</button><button class="danger" data-video-action="delete" data-id="${video.id}">Delete</button>`
      : `<button data-video-action="cancel" data-id="${video.id}">Cancel</button>`;
  const posterMessage = video.status !== 'completed' ? escapeHtml(video.error?.message || video.stage || 'QUEUED') : thumb ? '' : 'LOADING THUMBNAIL';
  const queueDetail = video.queuePosition == null ? '' : video.queuePosition === 0 ? ' · Active now' : ` · Queue #${video.queuePosition} · ~${video.estimatedStartMinutes}m`;
  const cost = video.costEstimate ? ` · est. $${Number(video.costEstimate.amount).toFixed(3)}` : '';
  return `<article class="video-card ${checked ? 'selected' : ''}" data-video-card="${video.id}"><div class="poster" data-poster="${video.id}" ${thumb ? `style="background-image:url('${thumb}')"` : ''}><span class="status ${escapeHtml(video.status)}">${escapeHtml(video.status)}</span><label class="select-box" title="Select video"><input type="checkbox" data-video-select="${video.id}" ${checked ? 'checked' : ''}></label>${posterMessage ? `<strong data-poster-message>${posterMessage}</strong>` : ''}</div><div class="card-body"><div class="badge-row compact"><span class="badge accent">${escapeHtml(channelName)}</span>${video.error?.code ? `<span class="badge red">${escapeHtml(video.error.code)}</span>` : ''}</div><h3>${escapeHtml(title)}</h3><div class="meta">${dateLabel(video.createdAt)}${video.result?.durationSeconds ? ` · ${durationLabel(Math.round(video.result.durationSeconds))}` : ''}${queueDetail}${cost}</div>${video.error ? `<p class="error-text" style="margin-top:8px">Failed at ${escapeHtml(video.error.stage || video.error.resumeFrom || video.stage || 'unknown stage')}: ${escapeHtml(video.error.message)}</p>` : ''}<div class="progress"><span style="width:${Number(video.progress || 0)}%"></span></div><div class="actions">${controls}</div></div></article>`;
}

function renderProductionInsights() {
  const summary = state.videoSummary;
  if (!summary) { $('productionInsights').innerHTML = ''; return; }
  const failed = Object.values(summary.perChannel || {}).reduce((sum, item) => sum + item.failed, 0);
  const topFailure = Object.entries(summary.failureStages || {}).sort((a, b) => b[1] - a[1])[0];
  const failureLines = Object.entries(summary.failureStages || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([stage, count]) => `${escapeHtml(label(stage))}: ${count}`).join(' · ');
  const channelLines = Object.entries(summary.perChannel || {}).slice(0, 3).map(([id, item]) => {
    const name = state.channels.find((channel) => channel.id === id)?.name || id;
    const failureRate = item.total ? Math.round((item.failed / item.total) * 100) : 0;
    return `${escapeHtml(name)}: ${item.total} (${failureRate}% failed)`;
  }).join(' · ') || 'No channel production data';
  $('productionInsights').innerHTML = `<article><span>Stored output</span><strong>${(summary.storageBytes / 1_073_741_824).toFixed(2)} GB</strong><small>Completed delivery files</small></article><article><span>Estimated provider cost</span><strong>$${Number(summary.estimatedProviderCostUsd || 0).toFixed(2)}</strong><small>Configuration-based estimate</small></article><article><span>Failed productions</span><strong>${failed}</strong><small>${failureLines || (topFailure ? `Most common: ${escapeHtml(label(topFailure[0]))}` : 'No recorded failures')}</small></article><article><span>Channels producing</span><strong>${Object.keys(summary.perChannel || {}).length}</strong><small>${channelLines}</small></article>`;
}

function renderVideos() {
  $('totalCount').textContent = state.videoTotal || state.videos.length;
  $('activeCount').textContent = state.videos.filter((v) => activeStatuses.has(v.status)).length;
  $('completedCount').textContent = state.videos.filter((v) => v.status === 'completed').length;
  const filtersActive = ['videoChannelFilter', 'videoStatusFilter', 'videoFormatFilter', 'videoDateFrom', 'videoDateTo', 'videoDurationMin', 'videoDurationMax'].some((id) => $(id)?.value);
  const empty = `<div class="empty">${filtersActive ? 'No videos match the selected filters.' : 'No productions yet. Create your first video to begin.'}</div>`;
  $('videoGrid').innerHTML = state.videos.length ? state.videos.map(videoCard).join('') : empty;
  $('recentGrid').innerHTML = state.videos.length ? state.videos.slice(0, 4).map(videoCard).join('') : empty;
  $('loadMoreVideos').hidden = !state.videoCursor;
  if ($('videoFilterSummary')) $('videoFilterSummary').textContent = `${state.videoTotal} video${state.videoTotal === 1 ? '' : 's'}`;
  syncBulkBar();
  observeThumbnails();
}

function pumpThumbnailQueue() {
  while (state.thumbnailActive < THUMBNAIL_CONCURRENCY && state.thumbnailQueued.size) {
    const id = state.thumbnailQueued.values().next().value;
    state.thumbnailQueued.delete(id);
    if (state.thumbs.has(id) || state.thumbnailLoading.has(id)) continue;
    state.thumbnailLoading.add(id);
    state.thumbnailActive++;
    fetch(`/v1/videos/${id}/thumbnail`, { credentials: 'same-origin', headers: headers(false) }).then(async (res) => {
      if (!res.ok) throw new Error(`Thumbnail request failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      if (!state.videos.some((video) => video.id === id)) { URL.revokeObjectURL(url); return; }
      state.thumbs.set(id, url);
      document.querySelectorAll(`[data-poster="${id}"]`).forEach((el) => { el.style.backgroundImage = `url('${url}')`; el.querySelector('[data-poster-message]')?.remove(); });
    }).catch(() => {
      document.querySelectorAll(`[data-poster="${id}"] [data-poster-message]`).forEach((el) => { el.textContent = 'THUMBNAIL UNAVAILABLE'; });
    }).finally(() => { state.thumbnailLoading.delete(id); state.thumbnailActive--; pumpThumbnailQueue(); });
  }
}

function queueThumbnail(id) {
  if (!id || state.thumbs.has(id) || state.thumbnailQueued.has(id) || state.thumbnailLoading.has(id)) return;
  state.thumbnailQueued.add(id);
  pumpThumbnailQueue();
}

function observeThumbnails() {
  state.thumbnailObserver?.disconnect();
  state.thumbnailObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      state.thumbnailObserver.unobserve(entry.target);
      queueThumbnail(entry.target.dataset.poster);
    });
  }, { rootMargin: '240px' }) : null;
  const completed = new Set(state.videos.filter((video) => video.status === 'completed').map((video) => video.id));
  document.querySelectorAll('[data-poster]').forEach((node) => {
    if (!completed.has(node.dataset.poster) || state.thumbs.has(node.dataset.poster)) return;
    if (state.thumbnailObserver) state.thumbnailObserver.observe(node);
    else queueThumbnail(node.dataset.poster);
  });
}

function pruneThumbnails() {
  const ids = new Set(state.videos.map((v) => v.id));
  for (const id of state.thumbnailQueued) if (!ids.has(id)) state.thumbnailQueued.delete(id);
  for (const [id, url] of state.thumbs) if (!ids.has(id)) { URL.revokeObjectURL(url); state.thumbs.delete(id); }
}

async function loadVideos({ append = false } = {}) {
  if (!state.authenticated) { renderVideos(); return; }
  try {
    const cursor = append ? state.videoCursor : null;
    if (append && !cursor) return;
    const params = new URLSearchParams({ limit: String(VIDEO_PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    if ($('videoChannelFilter')?.value) params.set('channelId', $('videoChannelFilter').value);
    if ($('videoStatusFilter')?.value) params.set('status', $('videoStatusFilter').value);
    if ($('videoFormatFilter')?.value) params.set('format', $('videoFormatFilter').value);
    if ($('videoDateFrom')?.value) params.set('dateFrom', $('videoDateFrom').value);
    if ($('videoDateTo')?.value) params.set('dateTo', $('videoDateTo').value);
    if ($('videoDurationMin')?.value) params.set('minDuration', $('videoDurationMin').value);
    if ($('videoDurationMax')?.value) params.set('maxDuration', $('videoDurationMax').value);
    const result = await api(`/v1/videos?${params}`);
    const incoming = result.videos || [];
    state.videos = append
      ? [...new Map([...state.videos, ...incoming].map((video) => [video.id, video])).values()]
      : incoming;
    state.videoCursor = result.nextCursor || null;
    state.videoTotal = Number.isFinite(result.total) ? result.total : state.videos.length;
    pruneThumbnails();
    renderVideos();
  } catch (error) {
    handleApiError(error);
  }
}

async function loadVideoSummary() {
  if (!state.authenticated) return;
  try { state.videoSummary = await api('/v1/videos-summary'); renderProductionInsights(); }
  catch (error) { handleApiError(error); }
}

function channelCard(channel) {
  const formats = channel.productionDefaults.formats || [channel.productionDefaults.aspectRatio === '9:16' ? 'shorts' : 'landscape'];
  const ranges = channel.productionDefaults.durationRanges || {};
  const isAi = channel.productionDefaults.imageSource === 'ai';
  const mediaBadge = isAi
    ? `<span class="badge accent">🎨 ${escapeHtml(channelStyleLabel(channel.productionDefaults.imageStyle))}</span>`
    : '<span class="badge">🌐 Stock Media</span>';
  const yt = channel.youtube || {};
  const ytStrip = yt.connected
    ? `<div class="youtube-strip"><div><strong style="color:var(--green)">YouTube connected</strong><div class="muted" style="margin:2px 0 0;font-size:11px">${escapeHtml(yt.channelTitle || yt.channelId || 'Linked account')}</div></div><div class="actions" style="margin:0"><button data-channel-action="connect" data-id="${channel.id}">Switch</button><button class="danger" data-channel-action="disconnect" data-id="${channel.id}">Disconnect</button></div></div>`
    : `<div class="youtube-strip"><div><strong>YouTube not linked</strong><div class="muted" style="margin:2px 0 0;font-size:11px">Connect to enable analytics sync &amp; scheduled uploads</div></div><div class="actions" style="margin:0"><button class="primary-action" data-channel-action="connect" data-id="${channel.id}">Connect YouTube</button></div></div>`;
  return `<article class="channel-card"><div class="card-top"><div><p class="eyebrow">${escapeHtml(channel.handle || channel.language || 'CHANNEL')}</p><h3>${escapeHtml(channel.name)}</h3><p>${escapeHtml(channel.niche)}</p></div><span class="status-dot ${channel.automation.enabled ? 'ready' : ''}" title="${channel.automation.enabled ? 'Automation active' : 'Automation paused'}"></span></div><div class="badge-row">${formats.map((f) => `<span class="badge accent">${escapeHtml(f)}</span>`).join('')}<span class="badge">${escapeHtml(label(channel.archetype))}</span><span class="badge">${escapeHtml(label(channel.automation.approvalMode))}</span>${mediaBadge}${channel.automation.autoPublish ? '<span class="badge green">Auto-Publish</span>' : ''}</div>${ytStrip}<p class="card-copy">${escapeHtml(channel.targetAudience)}</p><div class="channel-stats"><div><span>Shorts range</span><strong>${ranges.shorts ? `${durationLabel(ranges.shorts.min)}–${durationLabel(ranges.shorts.max)}` : 'Disabled'}</strong></div><div><span>Landscape range</span><strong>${ranges.landscape ? `${durationLabel(ranges.landscape.min)}–${durationLabel(ranges.landscape.max)}` : 'Disabled'}</strong></div><div><span>Automation</span><strong>${channel.automation.enabled ? 'Active' : 'Paused'}</strong></div><div><span>Schedule (${escapeHtml(channel.automation.timezone)})</span><strong>${escapeHtml(channel.automation.scheduleCron)}</strong></div></div>${channel.automation.lastError ? `<p class="error-text" style="margin-top:8px">Scheduler error: ${escapeHtml(channel.automation.lastError)}</p>` : ''}<div class="actions"><button class="primary-action" data-channel-action="ideas" data-id="${channel.id}">Ideas</button><button data-channel-action="brainstorm" data-id="${channel.id}">Generate ideas</button><button data-channel-action="analytics" data-id="${channel.id}">Analytics</button><button data-channel-action="edit" data-id="${channel.id}">Edit</button><button data-channel-action="toggle" data-id="${channel.id}">${channel.automation.enabled ? 'Pause' : 'Enable'} automation</button><button class="danger" data-channel-action="delete" data-id="${channel.id}">Delete</button></div></article>`;
}

function renderChannels() {
  $('channelCount').textContent = state.channels.length;
  $('channelGrid').innerHTML = !state.authenticated
    ? '<div class="empty">Sign in to load channel profiles.</div>'
    : state.channels.length ? state.channels.map(channelCard).join('') : '<div class="empty">No channel profiles yet. Create one to unlock autonomous ideation, packaging, production, and scheduling.</div>';
  const options = state.channels.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  for (const filterId of ['videoChannelFilter', 'calendarChannelFilter']) {
    const el = $(filterId);
    if (!el) continue;
    const prev = el.value;
    const extra = filterId === 'videoChannelFilter' ? '<option value="default">Default profile</option>' : '';
    el.innerHTML = `<option value="">All channels</option>${extra}${options}`;
    if ([...el.options].some((option) => option.value === prev)) el.value = prev;
  }
  const currentProfile = $('profileId').value;
  $('profileId').innerHTML = '<option value="default">Default profile</option>' + options;
  if ([...$('profileId').options].some((option) => option.value === currentProfile)) $('profileId').value = currentProfile;
  const emptyOption = state.authenticated ? 'Create a channel first' : 'Sign in required';
  $('ideaChannel').innerHTML = options || `<option value="">${emptyOption}</option>`;
  $('performanceChannel').innerHTML = options || `<option value="">${emptyOption}</option>`;
  if (state.selectedChannelId && state.channels.some((c) => c.id === state.selectedChannelId)) $('ideaChannel').value = state.selectedChannelId;
  else state.selectedChannelId = state.channels[0]?.id || null;
  if (state.selectedChannelId) $('performanceChannel').value = state.selectedChannelId;
  if ($('youtubePublishingStatus')) $('youtubePublishingStatus').textContent = state.publishingEnabled ? 'Enabled' : 'Disabled (Calendar & Download mode)';
  renderVideos();
  renderProductionInsights();
}

async function loadChannels() {
  if (!state.authenticated) { renderChannels(); return; }
  try {
    const result = await api('/v1/channels');
    state.channels = result.channels || [];
    state.publishingEnabled = Boolean(result.publishingEnabled);
    renderChannels();
  } catch (error) {
    handleApiError(error);
  }
}

function ideaCard(idea) {
  const canProduce = ['draft', 'approved', 'failed'].includes(idea.status);
  const canEdit = ['draft', 'approved', 'failed'].includes(idea.status);
  const titleOptions = (idea.titleCandidates || []).map((item) => `<option value="${escapeHtml(item.text)}" ${item.selected ? 'selected' : ''}>${item.selected ? '★ ' : ''}${escapeHtml(item.text)} · ${item.score}</option>`).join('');
  const thumbnailOptions = (idea.thumbnailCandidates || []).map((item) => `<option value="${escapeHtml(item.concept)}" ${item.selected ? 'selected' : ''}>${item.selected ? '★ ' : ''}${escapeHtml(label(item.variant))}${item.overlayText ? ` · ${escapeHtml(item.overlayText)}` : ''}</option>`).join('');
  const market = idea.marketEvidence || {};
  const scheduledBadge = idea.publishAt ? `<span class="badge green">Calendar: ${escapeHtml(dateLabel(idea.publishAt))}</span>` : '<span class="badge">Unscheduled</span>';
  return `<article class="idea-card" data-idea-card="${idea.id}"><div class="card-top"><div><div class="badge-row compact"><span class="badge accent">${escapeHtml(idea.format)}</span><span class="badge">${durationLabel(idea.durationSeconds)}</span><span class="badge">${escapeHtml(label(idea.trafficStrategy))}</span>${scheduledBadge}</div></div><div class="idea-score">${idea.compositeScore}<small>/40</small></div></div><h3>${escapeHtml(idea.title)}</h3><p class="card-copy"><strong>Hook:</strong> ${escapeHtml(idea.spokenHook)}</p><div class="idea-detail"><strong>Keyword</strong> · ${escapeHtml(idea.primaryKeyword)}<br><strong>Why it wins</strong> · ${escapeHtml(idea.whyThisIdea)}<br><strong>Thumbnail</strong> · ${escapeHtml(idea.thumbnailConcept)}<br><strong>Market</strong> · ${market.mode === 'observed_search_results' ? `${market.observedResults || 0} observed results` : 'Channel profile inputs'}</div>${titleOptions && thumbnailOptions ? `<div class="experiment-picker"><label class="field"><span>Title winner (auto-selected ★)</span><select data-experiment-title>${titleOptions}</select></label><label class="field"><span>Thumbnail winner (auto-selected ★)</span><select data-experiment-thumbnail>${thumbnailOptions}</select></label><button data-idea-action="experiment" data-id="${idea.id}">Save selection</button></div>` : ''}<div class="badge-row"><span class="badge">Retention ${idea.retentionScore}</span><span class="badge">Title ${idea.titleScore}</span><span class="badge">${escapeHtml(idea.status)}</span>${idea.packagingEdited ? '<span class="badge accent">Custom edited</span>' : '<span class="badge green">Auto-picked</span>'}</div><div class="actions">${idea.status === 'draft' ? `<button class="primary-action" data-idea-action="approve" data-id="${idea.id}">Approve</button><button data-idea-action="reject" data-id="${idea.id}">Reject</button>` : ''}${canEdit ? `<button data-idea-action="edit" data-channel="${idea.channelId}" data-id="${idea.id}">Edit / Schedule</button>` : ''}${canProduce ? `<button class="primary-action" data-idea-action="produce" data-id="${idea.id}">Produce video</button>` : ''}${idea.videoId ? `<button data-idea-action="video" data-video-id="${idea.videoId}">View video</button>` : ''}${!['queued', 'producing', 'publishing'].includes(idea.status) ? `<button class="danger" data-idea-action="delete" data-channel="${idea.channelId}" data-id="${idea.id}">Delete</button>` : ''}</div></article>`;
}

function renderCalendar() {
  const items = state.calendarItems || [];
  const channelFilter = $('calendarChannelFilter')?.value || '';
  const statusFilter = $('calendarStatusFilter')?.value || '';
  const filtered = items.filter((item) =>
    (!channelFilter || item.channelId === channelFilter)
    && (!statusFilter || item.status === statusFilter));

  if ($('overviewCalendar')) {
    const upcoming = items.filter((item) => ['approved', 'queued', 'producing', 'ready', 'publishing'].includes(item.status)).slice(0, 4);
    $('overviewCalendar').innerHTML = upcoming.length
      ? upcoming.map((item) => `<article class="calendar-row"><div class="slot-time"><strong>${item.publishAt ? escapeHtml(dateLabel(item.publishAt)) : 'Unscheduled slot'}</strong><small>${escapeHtml(item.channelName)} · ${escapeHtml(item.format)}</small></div><div><strong>${escapeHtml(item.title)}</strong><div class="badge-row compact" style="margin:6px 0 0"><span class="badge ${item.status === 'ready' || item.status === 'published' ? 'green' : 'amber'}">${escapeHtml(label(item.status))}</span><span class="badge">${durationLabel(item.durationSeconds)}</span></div></div><div class="actions" style="margin:0">${item.videoId && item.status === 'ready' ? `<button class="primary-action" data-video-action="review" data-id="${item.videoId}">Review</button>` : ''}<button data-calendar-edit="${item.id}" data-channel="${item.channelId}">Schedule</button></div></article>`).join('')
      : '<div class="empty">No scheduled releases yet. Enable automation on a channel or schedule an idea.</div>';
  }

  const container = $('calendarContainer');
  if (!container) return;

  const isMonth = state.calendarView === 'month';
  if ($('calendarPrevMonth')) $('calendarPrevMonth').hidden = !isMonth;
  if ($('calendarNextMonth')) $('calendarNextMonth').hidden = !isMonth;
  if ($('calendarMonthLabel')) {
    $('calendarMonthLabel').hidden = !isMonth;
    $('calendarMonthLabel').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(state.calendarMonth);
  }

  if (!isMonth) {
    container.innerHTML = filtered.length
      ? `<div class="calendar-agenda">${filtered.map((item) => {
        const readyActions = item.videoId && item.status === 'ready'
          ? `<button class="primary-action" data-video-action="review" data-id="${item.videoId}">Preview</button><button data-video-action="download" data-id="${item.videoId}">Download MP4</button>${state.publishingEnabled && item.youtubeConnected ? `<button class="primary-action" data-calendar-publish="${item.id}" data-channel="${item.channelId}">Publish to YouTube</button>` : ''}`
          : '';
        const produceBtn = ['draft', 'approved', 'failed'].includes(item.status)
          ? `<button data-calendar-produce="${item.id}" data-channel="${item.channelId}">Produce now</button>`
          : '';
        return `<article class="calendar-row"><div class="slot-time"><strong>${item.publishAt ? escapeHtml(dateLabel(item.publishAt)) : 'Unscheduled'}</strong><small>${escapeHtml(item.channelName)} · ${escapeHtml(item.timezone || 'UTC')}</small></div><div><div class="badge-row compact"><span class="badge ${item.status === 'ready' || item.status === 'published' ? 'green' : item.status === 'failed' || item.status === 'publish_failed' ? 'red' : 'amber'}">${escapeHtml(label(item.status))}</span><span class="badge accent">${escapeHtml(item.format)}</span><span class="badge">${durationLabel(item.durationSeconds)}</span>${item.youtubeVideoId ? `<span class="badge green">YouTube: ${escapeHtml(item.youtubeVideoId)}</span>` : ''}</div><h3 style="margin:4px 0;font-size:16px">${escapeHtml(item.title)}</h3><p class="muted" style="margin:0;font-size:12px">Thumbnail: ${escapeHtml(item.thumbnailConcept)}</p>${item.error ? `<p class="error-text" style="margin-top:6px">${escapeHtml(item.error)}</p>` : ''}</div><div class="actions" style="margin:0">${readyActions}${produceBtn}<button data-calendar-edit="${item.id}" data-channel="${item.channelId}">Edit / Reschedule</button></div></article>`;
      }).join('')}</div>`
      : '<div class="empty">No calendar entries match the selected filters.</div>';
    return;
  }

  const year = state.calendarMonth.getFullYear();
  const month = state.calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const todayKey = new Date().toISOString().slice(0, 10);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="calendar-weekday">${d}</div>`).join('');
  const byDay = new Map();
  for (const item of filtered) {
    const key = (item.publishAt || item.createdAt || '').slice(0, 10);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  }
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const dayItems = byDay.get(key) || [];
    const muted = day.getMonth() !== month ? 'muted-day' : '';
    const isToday = key === todayKey ? 'today' : '';
    const chips = dayItems.map((item) => `<button type="button" class="calendar-chip ${escapeHtml(item.status)}" data-calendar-edit="${item.id}" data-channel="${item.channelId}"><strong>${escapeHtml(item.channelName)}</strong><br>${escapeHtml(item.title)}</button>`).join('');
    cells.push(`<div class="calendar-cell ${muted} ${isToday}"><div class="calendar-day-num"><span>${day.getDate()}</span><span>${dayItems.length ? `${dayItems.length}` : ''}</span></div>${chips}</div>`);
  }
  container.innerHTML = `<div class="calendar-month-grid">${weekdays}${cells.join('')}</div>`;
}

async function loadCalendar() {
  if (!state.authenticated) { state.calendarItems = []; renderCalendar(); return; }
  try {
    const result = await api('/v1/calendar');
    state.calendarItems = result.items || [];
    renderCalendar();
  } catch (error) {
    handleApiError(error);
  }
}

function renderAlerts() {
  const data = state.alertsData || { counts: { total: 0, critical: 0, error: 0, warning: 0 }, alerts: [] };
  const counts = data.counts || { total: 0, critical: 0, error: 0, warning: 0 };
  if ($('alertsNavBadge')) {
    $('alertsNavBadge').hidden = counts.total === 0;
    $('alertsNavBadge').textContent = String(counts.total);
  }
  if ($('overviewAlertBanner')) {
    const urgent = (data.alerts || [])[0];
    $('overviewAlertBanner').hidden = counts.total === 0;
    if (urgent) {
      $('overviewAlertTitle').textContent = `${counts.total} active alert${counts.total === 1 ? '' : 's'} (${counts.critical} critical)`;
      $('overviewAlertMessage').textContent = `${urgent.title}: ${urgent.message}`;
    }
  }
  if ($('alertsTotalCount')) $('alertsTotalCount').textContent = String(counts.total);
  if ($('alertsCriticalCount')) $('alertsCriticalCount').textContent = String(counts.critical);
  if ($('alertsErrorCount')) $('alertsErrorCount').textContent = String(counts.error);
  if ($('alertsWarningCount')) $('alertsWarningCount').textContent = String(counts.warning);

  const list = $('alertsList');
  if (!list) return;
  const filtered = (data.alerts || []).filter((item) => state.alertFilter === 'all' || item.severity === state.alertFilter);
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">All systems healthy. No active errors or alerts.</div>';
    return;
  }
  list.innerHTML = filtered.map((alert) => {
    const actionBtns = [];
    if (alert.videoId && alert.category !== 'youtube') {
      actionBtns.push(`<button class="primary-action" data-alert-action="retry-video" data-video-id="${escapeHtml(alert.videoId)}">Retry video</button>`);
      actionBtns.push(`<button class="danger" data-alert-action="delete-video" data-video-id="${escapeHtml(alert.videoId)}">Delete video</button>`);
    }
    if (alert.action?.type === 'calendar') {
      actionBtns.push(`<a href="/dashboard/calendar" class="primary">Open Calendar</a>`);
    }
    if (alert.channelId && alert.channelId !== 'default') {
      actionBtns.push(`<button data-alert-action="edit-channel" data-channel-id="${escapeHtml(alert.channelId)}">Edit channel</button>`);
    }
    if (alert.action?.type === 'youtube_connect' && alert.channelId) {
      actionBtns.push(`<button class="primary-action" data-channel-action="connect" data-id="${escapeHtml(alert.channelId)}">Reconnect YouTube</button>`);
    }
    if (alert.action?.type === 'settings') {
      actionBtns.push(`<a href="/dashboard/settings">Open Settings</a>`);
    }
    if (alert.action?.type === 'production') {
      actionBtns.push(`<a href="/dashboard/production">Manage Productions</a>`);
    }
    return `<article class="alert-card ${escapeHtml(alert.severity)}"><div><div class="badge-row compact"><span class="badge ${alert.severity === 'warning' ? 'amber' : 'red'}">${escapeHtml(alert.severity)}</span><span class="badge">${escapeHtml(alert.category)}</span>${alert.channelName ? `<span class="badge accent">${escapeHtml(alert.channelName)}</span>` : ''}${alert.code ? `<span class="badge">${escapeHtml(alert.code)}</span>` : ''}</div><h3>${escapeHtml(alert.title)}</h3><p>${escapeHtml(alert.message)}</p><div class="meta" style="margin-top:6px">${alert.stage ? `Stage: ${escapeHtml(alert.stage)} · ` : ''}${alert.createdAt ? dateLabel(alert.createdAt) : ''}</div></div><div class="actions" style="margin:0">${actionBtns.join('')}</div></article>`;
  }).join('');
}

async function loadAlerts() {
  if (!state.authenticated) return;
  try {
    state.alertsData = await api('/v1/alerts');
    renderAlerts();
  } catch (error) {
    handleApiError(error);
  }
}

function renderPerformance() {
  $('performanceGrid').innerHTML = state.performance.length ? state.performance.map((item) => `<article class="idea-card"><div class="card-top"><div class="badge-row compact"><span class="badge accent">${escapeHtml(item.format)}</span><span class="badge">${durationLabel(item.durationSeconds)}</span></div><span class="meta">${dateLabel(item.capturedAt)}</span></div><h3>${escapeHtml(item.title || item.videoId || 'Untitled video')}</h3><div class="channel-stats"><div><span>Views</span><strong>${Number(item.views || 0).toLocaleString()}</strong></div><div><span>CTR</span><strong>${item.clickThroughRate == null ? '—' : `${item.clickThroughRate}%`}</strong></div><div><span>Viewed</span><strong>${item.averageViewPercentage == null ? '—' : `${item.averageViewPercentage}%`}</strong></div><div><span>Subscribers</span><strong>${Number(item.subscribersGained || 0).toLocaleString()}</strong></div></div></article>`).join('') : '<div class="empty">No performance snapshots yet. Add results after a video has collected meaningful data.</div>';
}

function renderPerformanceSummary() {
  const summary = state.performanceSummary;
  if (!summary?.sampleSize) {
    $('performanceSummary').innerHTML = '<div class="empty">Import YouTube Analytics CSV results or click Sync YouTube. Three comparable videos establish a directional baseline; ten or more are needed before treating a pattern as reliable.</div>';
    return;
  }
  const cards = Object.entries(summary.formats || {}).map(([format, item]) => `<article><span>${escapeHtml(label(format))} · ${escapeHtml(label(item.confidence))}</span><strong>${item.weightedCtr == null ? '—' : `${item.weightedCtr}% CTR`}</strong><small>${item.weightedAverageViewedPercentage == null ? 'Retention unavailable' : `${item.weightedAverageViewedPercentage}% viewed`} · ${item.samples} video${item.samples === 1 ? '' : 's'}</small></article>`);
  cards.unshift(`<article><span>Total evidence</span><strong>${summary.sampleSize}</strong><small>Unique videos with usable performance data</small></article>`);
  cards.push(`<article><span>Evidence target</span><strong>${Math.max(0, 10 - summary.sampleSize)}</strong><small>${summary.sampleSize >= 10 ? 'Reliable sample target reached.' : 'More comparable videos needed for 10-video target.'}</small></article>`);
  const nextTest = summary.guidance?.nextExperiments?.[0];
  cards.push(`<article><span>Strategy confidence</span><strong>${escapeHtml(label(summary.guidance?.evidenceLevel || 'insufficient'))}</strong><small>${nextTest ? `Next test: ${escapeHtml(label(nextTest.variant))}` : escapeHtml(summary.guidance?.caution || 'Keep collecting comparable results.')}</small></article>`);
  $('performanceSummary').innerHTML = cards.join('');
}

async function loadPerformance() {
  const channelId = $('performanceChannel').value || state.selectedChannelId;
  if (!state.authenticated || !channelId) { state.performance = []; state.performanceSummary = null; renderPerformance(); renderPerformanceSummary(); return; }
  try {
    const [result, summary] = await Promise.all([api(`/v1/channels/${channelId}/performance`), api(`/v1/channels/${channelId}/performance/summary`)]);
    state.performance = result.snapshots || [];
    state.performanceSummary = summary;
    renderPerformance();
    renderPerformanceSummary();
  } catch (error) {
    handleApiError(error);
  }
}

function openYoutubePopup(url) {
  const popup = window.open(url, 'youtube-oauth', 'width=640,height=780,noopener,noreferrer');
  const timer = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(timer);
      void Promise.all([loadChannels(), loadAlerts(), loadCalendar()]);
    }
  }, 900);
}

async function syncYoutubeAnalytics() {
  const channelId = $('performanceChannel').value || state.selectedChannelId;
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) return toast('Create or select a channel first');
  if (!channel.youtube.connected) {
    try {
      const result = await api(`/v1/channels/${channelId}/youtube/connect`);
      openYoutubePopup(result.authorizationUrl);
      $('csvImportMessage').textContent = 'Finish YouTube authorization in the popup, then click Sync YouTube again.';
    } catch (error) { handleApiError(error); }
    return;
  }
  const button = $('syncYoutubeAnalytics');
  button.disabled = true;
  $('csvImportMessage').textContent = 'Synchronizing the last 90 days...';
  try {
    const result = await api(`/v1/channels/${channelId}/youtube/analytics/sync`, { method: 'POST', body: JSON.stringify({ days: 90 }) });
    $('csvImportMessage').textContent = `Synchronized ${result.imported} video${result.imported === 1 ? '' : 's'} through ${result.endDate}.`;
    toast('YouTube Analytics synchronized');
    await Promise.all([loadChannels(), loadPerformance(), loadAlerts()]);
  } catch (error) {
    $('csvImportMessage').textContent = error.message;
    handleApiError(error);
  } finally {
    button.disabled = false;
  }
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
    $('performanceTitle').value = '';
    toast('Performance saved');
    await loadPerformance();
  } catch (error) { $('performanceMessage').textContent = error.message; handleApiError(error); }
}

async function importAnalyticsCsv(event) {
  event.preventDefault();
  const channelId = $('performanceChannel').value || state.selectedChannelId;
  const file = $('analyticsCsv').files?.[0];
  if (!channelId) return toast('Create or select a channel first');
  if (!file) return toast('Choose a YouTube Analytics CSV file');
  const button = $('importAnalytics');
  button.disabled = true;
  $('csvImportMessage').textContent = 'Importing analytics...';
  try {
    const result = await api(`/v1/channels/${channelId}/performance/import`, {
      method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text(),
    });
    $('csvImportMessage').textContent = `Imported ${result.imported} video${result.imported === 1 ? '' : 's'}${result.skipped ? `; skipped ${result.skipped} invalid row${result.skipped === 1 ? '' : 's'}` : ''}.`;
    $('analyticsCsv').value = '';
    toast('Analytics imported');
    await loadPerformance();
  } catch (error) {
    $('csvImportMessage').textContent = error.message;
    handleApiError(error);
  } finally { button.disabled = false; }
}

function renderIdeas() {
  $('ideaGrid').innerHTML = state.ideas.length
    ? state.ideas.map(ideaCard).join('')
    : `<div class="empty">${!state.authenticated ? 'Sign in to load ideas.' : state.selectedChannelId ? 'No ideas yet. Run the strategic idea generator.' : 'Create a channel before generating ideas.'}</div>`;
}

async function loadIdeas() {
  state.selectedChannelId = $('ideaChannel').value || state.selectedChannelId;
  if (!state.authenticated || !state.selectedChannelId) { state.ideas = []; renderIdeas(); return; }
  try {
    const status = $('ideaStatusFilter')?.value;
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    const result = await api(`/v1/channels/${state.selectedChannelId}/ideas${suffix}`);
    state.ideas = result.ideas || [];
    renderIdeas();
  } catch (error) { handleApiError(error); }
}

async function checkHealth() {
  if (!state.authenticated) {
    $('healthText').textContent = 'Sign in required';
    $('workerText').textContent = 'Administrator session';
    $('keyState').textContent = 'Sign in required';
    return;
  }
  try {
    const ready = await api('/ready');
    $('healthDot').classList.toggle('ready', Boolean(ready.ready));
    $('healthDot').classList.toggle('error', !ready.ready);
    $('healthText').textContent = ready.ready ? 'System ready' : 'Service degraded';
    const workers = ready.queue?.workerCount ?? ready.queue?.workers ?? '—';
    $('workerText').textContent = `${workers} worker${workers === 1 ? '' : 's'} connected`;
    $('keyState').textContent = state.user?.email || 'Securely connected';
    $('apiStatus').textContent = ready.ready ? 'Ready' : 'Degraded';
    $('workerStatus').textContent = workers;
    $('storageStatus').textContent = ready.storage?.type || ready.storage?.status || 'Available';
  } catch (error) {
    const required = error.body?.preflight?.required || {};
    const failures = Object.values(required).filter((item) => item && item.healthy === false).map((item) => item.message || item.code);
    if (failures.length) {
      $('healthDot').classList.remove('ready');
      $('healthDot').classList.add('error');
      $('healthText').textContent = 'Setup required';
      $('workerText').textContent = failures[0];
      $('apiStatus').textContent = 'Degraded';
      toast(failures[0]);
    } else {
      handleApiError(error);
      $('apiStatus').textContent = 'Unavailable';
    }
  }
}

function handleApiError(error) {
  if (error.status === 401) {
    state.authenticated = false;
    state.user = null;
    state.videos = [];
    state.selectedVideos.clear();
    state.channels = [];
    state.ideas = [];
    state.calendarItems = [];
    state.performance = [];
    state.performanceSummary = null;
    state.selectedChannelId = null;
    $('keyState').textContent = 'Session expired';
    for (const url of state.thumbs.values()) URL.revokeObjectURL(url);
    state.thumbs.clear();
    $('settingsError').textContent = 'Your administrator session expired. Sign in again.';
    showLogin('Your session expired. Sign in again.');
    renderVideos();
    renderChannels();
    renderIdeas();
    renderCalendar();
    renderPerformance();
  }
  $('healthText').textContent = error.message;
  toast(error.message);
}

async function refreshAll() {
  if (!state.authenticated) return;
  await checkHealth();
  await Promise.all([
    singleRequest('videos', loadVideos),
    singleRequest('video-summary', loadVideoSummary),
    singleRequest('channels', loadChannels),
    singleRequest('calendar', loadCalendar),
    singleRequest('alerts', loadAlerts),
  ]);
  if (state.selectedChannelId) await Promise.all([singleRequest('ideas', loadIdeas), singleRequest('performance', loadPerformance)]);
}

async function createVideo(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type=submit]');
  button.disabled = true;
  $('formMessage').textContent = 'Submitting production…';
  try {
    const selectedChannel = state.channels.find((channel) => channel.id === $('profileId').value);
    const defaults = selectedChannel?.productionDefaults || {};
    const creative = { contentType: $('contentType').value, tone: $('tone').value, audience: selectedChannel?.targetAudience || 'general YouTube audience', language: selectedChannel?.language || 'en', pacing: 'auto', imageSource: $('imageSource').value };
    if (creative.imageSource === 'ai') Object.assign(creative, { imageProvider: defaults.imageProvider || undefined, imageModel: defaults.imageModel || undefined, imageQuality: defaults.imageQuality || undefined, imageStyle: defaults.imageStyle || undefined, customStylePrompt: defaults.customStylePrompt || undefined });
    const durationMode = $('durationMode').value;
    const output = { durationMode, aspectRatio: $('aspect').value, resolution: '1080p' };
    if (durationMode === 'exact') output.durationSeconds = Number($('duration').value);
    else {
      const format = output.aspectRatio === '9:16' ? 'shorts' : 'landscape';
      output.durationRange = defaults.durationRanges?.[format] || (format === 'shorts' ? { min: 20, max: 60 } : { min: 120, max: 600 });
    }
    const body = { prompt: $('prompt').value, profileId: $('profileId').value, niche: selectedChannel?.niche, output, creative, audio: $('voice').value !== 'auto' ? { voice: $('voice').value } : {}, subtitles: { enabled: defaults.subtitles !== false }, metadata: { source: 'dashboard', channelId: $('profileId').value, queuePriority: selectedChannel?.automation?.queuePriority || 'normal', maxPendingJobs: selectedChannel?.automation?.maxPendingJobs || 2 } };
    await api('/v1/videos', { method: 'POST', body: JSON.stringify(body) });
    event.currentTarget.reset();
    $('tone').value = 'clear, compelling, and authoritative';
    syncDurationFields();
    $('formMessage').textContent = 'Production queued successfully.';
    toast('Production queued');
    await Promise.all([loadVideos(), loadVideoSummary(), loadAlerts()]);
  } catch (error) {
    $('formMessage').textContent = error.message;
    handleApiError(error);
  } finally {
    button.disabled = false;
  }
}

function applySelectedChannelDefaults() {
  const channel = state.channels.find((item) => item.id === $('profileId').value);
  if (!channel) { syncDurationFields(); return; }
  const defaults = channel.productionDefaults;
  $('contentType').value = [...$('contentType').options].some((option) => option.value === defaults.contentType) ? defaults.contentType : 'auto';
  $('tone').value = defaults.tone;
  $('imageSource').value = defaults.imageSource;
  $('voice').value = defaults.voice || 'auto';
  if (defaults.formats.length === 1) $('aspect').value = defaults.formats[0] === 'shorts' ? '9:16' : '16:9';
  syncDurationFields();
}

function syncDurationFields() {
  const exact = $('durationMode').value === 'exact';
  $('durationField').hidden = !exact;
  $('duration').required = exact;
  if (exact) {
    $('durationHint').textContent = 'The production targets the exact number of seconds you enter.';
    return;
  }
  const channel = state.channels.find((item) => item.id === $('profileId').value);
  const format = $('aspect').value === '9:16' ? 'shorts' : 'landscape';
  const range = channel?.productionDefaults?.durationRanges?.[format] || (format === 'shorts' ? { min: 20, max: 60 } : { min: 120, max: 600 });
  $('durationHint').textContent = `AI selects ${durationLabel(range.min)}–${durationLabel(range.max)} based on topic depth.`;
}

const styleMetadata = {
  cinematic_documentary: { desc: 'Photorealistic photography, 35mm film aesthetic, natural light, realistic environments and cinematic compositions.', bestFor: 'Business stories, history, technology, science, real-world case studies', defaultModel: 'black-forest-labs/flux-schnell' },
  dark_noir: { desc: 'Deep shadows, dramatic lighting, muted colors, suspenseful atmosphere and powerful compositions.', bestFor: 'Corporate scandals, psychological mysteries, horror, true crime and business failures', defaultModel: 'black-forest-labs/flux-schnell' },
  editorial_vector: { desc: 'Clean geometric shapes, premium color palettes, strong visual metaphors and sophisticated 2D illustration.', bestFor: 'Finance, AI, technology, productivity, science and educational explainers', defaultModel: 'p-image-ideogram' },
  stickman: { desc: "Expressive stick-figure characters, minimalist environments, conceptual symbolism and cinematic framing. Not children's whiteboard drawings.", bestFor: 'Psychology, human behavior, stoicism, self-improvement and emotional storytelling', defaultModel: 'p-image-ideogram' },
  '3d_render': { desc: 'Expressive characters, dimensional environments, tactile materials and beautiful soft lighting.', bestFor: 'Educational storytelling, psychology, science concepts and character-driven explainers', defaultModel: 'black-forest-labs/flux-schnell' },
  anime: { desc: 'Expressive Japanese animation-inspired imagery, atmospheric environments, vibrant lighting and emotional compositions.', bestFor: 'Motivational stories, philosophy, personal growth, emotional journeys and heroic narratives', defaultModel: 'black-forest-labs/flux-schnell' },
  custom: { desc: 'Prompt-driven visual language defined by your custom art direction prompt below.', bestFor: 'Unique channel branding, signature creator aesthetics, bespoke art styles', defaultModel: 'black-forest-labs/flux-schnell' },
};

const allImageModels = [
  ['black-forest-labs/flux-schnell', 'FLUX.1 Schnell (Replicate · Fast & Photorealistic)'],
  ['p-image-ideogram', 'P-Image Ideogram (Ideogram · Design, Vector & Text)'],
  ['ideogram-4-5', 'Ideogram 4.5 (Ideogram · High Precision Detail)'],
  ['ideogram-4', 'Ideogram 4.0 (Ideogram · Graphic Layout)'],
];

function getProviderForModel(model) {
  return String(model || '').includes('flux') ? 'replicate' : 'ideogram';
}

function channelStyleLabel(styleId) {
  const labels = {
    cinematic_documentary: 'Cinematic Documentary', hyper_realistic: 'Cinematic Documentary',
    dark_noir: 'Dark Investigative Noir', editorial_vector: 'Modern Editorial Vector',
    stickman: 'Modern Stickman Storytelling', '3d_render': 'Stylized 3D Animation',
    anime: 'Cinematic Anime', custom: 'Custom Brand Style',
  };
  return labels[styleId] || styleId || 'Stock Media';
}

function syncChannelVisualFields(preferredModel = null) {
  const ai = $('channelImageSource').value === 'ai';
  document.querySelectorAll('.channel-ai-field').forEach((field) => { field.hidden = !ai; });
  if ($('channelStockInfo')) $('channelStockInfo').hidden = ai;
  if (!ai) return;

  const styleId = $('channelImageStyle')?.value || 'cinematic_documentary';
  const meta = styleMetadata[styleId] || styleMetadata.cinematic_documentary;
  if ($('channelStyleDescription')) $('channelStyleDescription').textContent = meta.desc;
  if ($('channelStyleBestFor')) $('channelStyleBestFor').textContent = `Best for: ${meta.bestFor}`;
  if ($('channelImageModel') && !$('channelImageModel').children.length) {
    $('channelImageModel').innerHTML = allImageModels.map(([value, text]) => `<option value="${value}">${text}</option>`).join('');
  }
  if (preferredModel && allImageModels.some(([value]) => value === preferredModel)) $('channelImageModel').value = preferredModel;
  else if (!preferredModel && meta.defaultModel) $('channelImageModel').value = meta.defaultModel;
  if ($('channelImageProvider')) $('channelImageProvider').value = getProviderForModel($('channelImageModel').value);
  if ($('channelCustomStyleField')) $('channelCustomStyleField').hidden = styleId !== 'custom';
}

function syncFormatFields() {
  const hasShorts = $('formatShorts').checked;
  const hasLandscape = $('formatLandscape').checked;
  if ($('shortDurationBox')) { $('shortDurationBox').style.opacity = hasShorts ? '1' : '0.45'; $('shortMin').disabled = !hasShorts; $('shortMax').disabled = !hasShorts; }
  if ($('landscapeDurationBox')) { $('landscapeDurationBox').style.opacity = hasLandscape ? '1' : '0.45'; $('landscapeMin').disabled = !hasLandscape; $('landscapeMax').disabled = !hasLandscape; }
}

function syncAutomationFields() {
  const enabled = $('channelAutomationEnabled').checked;
  if ($('channelAutomationFields')) $('channelAutomationFields').hidden = !enabled;
  if ($('channelAutoPublish')) {
    $('channelAutoPublish').disabled = !state.publishingEnabled;
    if (!state.publishingEnabled) {
      $('channelAutoPublish').checked = false;
      $('channelAutoPublishHint').textContent = 'Set YOUTUBE_PUBLISHING_ENABLED=true on the server to allow automatic uploads.';
    } else {
      $('channelAutoPublishHint').textContent = 'Uploads ready videos to the linked YouTube channel using their calendar slot.';
    }
  }
}

function openChannelDialog(channel = null) {
  state.editingChannelId = channel?.id || null;
  $('channelForm').reset();
  $('channelDialogTitle').textContent = channel ? 'Edit channel' : 'Create channel';
  $('channelSubmit').textContent = channel ? 'Save changes' : 'Create channel';
  $('channelError').textContent = '';
  if (channel) {
    $('channelName').value = channel.name;
    $('channelNiche').value = channel.niche;
    $('channelAudience').value = channel.targetAudience;
    $('channelPainPoints').value = (channel.audiencePainPoints || []).join(', ');
    $('channelPillars').value = channel.contentPillars.join(', ');
    $('channelArchetype').value = channel.archetype;
    $('channelSizeTier').value = channel.sizeTier;
    $('channelGoal').value = channel.primaryGoal;
    $('channelResources').value = channel.resourceLevel;
    $('channelPositioning').value = channel.positioning || '';
    $('channelDifferentiation').value = channel.differentiation || '';
    $('channelCompetitors').value = (channel.competitors || []).join(', ');
    $('formatLandscape').checked = channel.productionDefaults.formats.includes('landscape');
    $('formatShorts').checked = channel.productionDefaults.formats.includes('shorts');
    $('shortMin').value = channel.productionDefaults.durationRanges.shorts.min;
    $('shortMax').value = channel.productionDefaults.durationRanges.shorts.max;
    $('landscapeMin').value = channel.productionDefaults.durationRanges.landscape.min;
    $('landscapeMax').value = channel.productionDefaults.durationRanges.landscape.max;
    const defaults = channel.productionDefaults;
    $('channelImageSource').value = defaults.imageSource || 'stock';
    const rawStyle = defaults.imageStyle || 'cinematic_documentary';
    $('channelImageStyle').value = rawStyle === 'hyper_realistic' ? 'cinematic_documentary' : rawStyle;
    $('channelImageQuality').value = defaults.imageQuality || 'medium';
    $('channelCustomStylePrompt').value = defaults.customStylePrompt || '';
    $('channelContentType').value = defaults.contentType || 'auto';
    $('channelVoice').value = defaults.voice || 'auto';
    $('channelTone').value = defaults.tone || 'clear, compelling, and authoritative';
    $('channelSubtitles').checked = defaults.subtitles !== false;
    syncChannelVisualFields(defaults.imageModel);
    $('channelAutomationEnabled').checked = channel.automation.enabled;
    $('channelAutoScheduleCalendar').checked = channel.automation.autoScheduleCalendar !== false;
    $('channelCron').value = channel.automation.scheduleCron;
    $('channelPublishCron').value = channel.automation.publishScheduleCron || '';
    $('channelTimezone').value = channel.automation.timezone;
    $('channelApproval').value = channel.automation.approvalMode;
    $('channelQueuePriority').value = channel.automation.queuePriority || 'normal';
    $('channelMaxPending').value = channel.automation.maxPendingJobs || 2;
    $('channelAutoReplenish').checked = channel.automation.autoReplenishIdeas !== false;
    $('channelAutoPublish').checked = Boolean(channel.automation.autoPublish);
    $('channelPublishPrivacy').value = channel.automation.publishPrivacy || 'private';
  } else {
    $('formatLandscape').checked = true;
    $('formatShorts').checked = true;
    $('shortMin').value = 20;
    $('shortMax').value = 60;
    $('landscapeMin').value = 120;
    $('landscapeMax').value = 600;
    $('channelCron').value = '0 12 * * *';
    $('channelPublishCron').value = '';
    $('channelTimezone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    $('channelQueuePriority').value = 'normal';
    $('channelMaxPending').value = 2;
    $('channelAutoScheduleCalendar').checked = true;
    $('channelAutoReplenish').checked = true;
    $('channelAutoPublish').checked = false;
    $('channelPublishPrivacy').value = 'private';
    $('channelImageSource').value = 'stock';
    $('channelImageStyle').value = 'cinematic_documentary';
    $('channelImageQuality').value = 'medium';
    $('channelCustomStylePrompt').value = '';
    $('channelContentType').value = 'auto';
    $('channelVoice').value = 'auto';
    $('channelSubtitles').checked = true;
    syncChannelVisualFields();
  }
  syncFormatFields();
  syncAutomationFields();
  $('channelDialog').showModal();
}

async function createChannel(event) {
  event.preventDefault();
  event.stopPropagation();
  const formats = [...($('formatLandscape').checked ? ['landscape'] : []), ...($('formatShorts').checked ? ['shorts'] : [])];
  if (!formats.length) { $('channelError').textContent = 'Select at least one video format.'; return; }
  if (formats.includes('shorts') && Number($('shortMin').value) > Number($('shortMax').value)) {
    $('channelError').textContent = 'Shorts minimum duration cannot exceed maximum duration.';
    return;
  }
  if (formats.includes('landscape') && Number($('landscapeMin').value) > Number($('landscapeMax').value)) {
    $('channelError').textContent = 'Landscape minimum duration cannot exceed maximum duration.';
    return;
  }
  const submit = $('channelSubmit');
  submit.disabled = true;
  const imageSource = $('channelImageSource').value;
  const isAi = imageSource === 'ai';
  const selectedStyle = isAi ? $('channelImageStyle').value : null;
  const selectedModel = isAi ? $('channelImageModel').value : null;
  const selectedProvider = isAi ? getProviderForModel(selectedModel) : null;
  const selectedQuality = isAi ? $('channelImageQuality').value : null;
  const customPrompt = isAi && selectedStyle === 'custom' ? $('channelCustomStylePrompt').value.trim() : '';

  if (isAi && selectedStyle === 'custom' && !customPrompt) {
    $('channelError').textContent = 'Please enter a custom art direction prompt for your custom brand style.';
    submit.disabled = false;
    return;
  }

  const publishCronValue = $('channelPublishCron').value.trim();
  const body = {
    name: $('channelName').value,
    niche: $('channelNiche').value,
    archetype: $('channelArchetype').value,
    sizeTier: $('channelSizeTier').value,
    primaryGoal: $('channelGoal').value,
    resourceLevel: $('channelResources').value,
    positioning: $('channelPositioning').value,
    differentiation: $('channelDifferentiation').value,
    competitors: $('channelCompetitors').value.split(',').map((x) => x.trim()).filter(Boolean),
    targetAudience: $('channelAudience').value,
    audiencePainPoints: $('channelPainPoints').value.split(',').map((x) => x.trim()).filter(Boolean),
    contentPillars: $('channelPillars').value.split(',').map((x) => x.trim()).filter(Boolean),
    productionDefaults: {
      formats, durationMode: 'llm',
      durationRanges: {
        shorts: { min: Number($('shortMin').value), max: Number($('shortMax').value) },
        landscape: { min: Number($('landscapeMin').value), max: Number($('landscapeMax').value) },
      },
      contentType: $('channelContentType').value,
      voice: $('channelVoice').value,
      tone: $('channelTone').value,
      subtitles: $('channelSubtitles').checked,
      imageSource,
      imageProvider: isAi ? selectedProvider : null,
      imageModel: isAi ? selectedModel : null,
      imageQuality: isAi ? selectedQuality : null,
      imageStyle: isAi ? (selectedStyle || 'cinematic_documentary') : null,
      customStylePrompt: isAi ? customPrompt : '',
    },
    automation: {
      enabled: $('channelAutomationEnabled').checked,
      scheduleCron: $('channelCron').value,
      publishScheduleCron: publishCronValue || null,
      timezone: $('channelTimezone').value,
      approvalMode: $('channelApproval').value,
      queuePriority: $('channelQueuePriority').value,
      maxPendingJobs: Number($('channelMaxPending').value),
      autoScheduleCalendar: $('channelAutoScheduleCalendar').checked,
      autoReplenishIdeas: $('channelAutoReplenish').checked,
      autoPublish: state.publishingEnabled ? $('channelAutoPublish').checked : false,
      publishPrivacy: $('channelPublishPrivacy').value,
    },
  };
  try {
    const editing = state.editingChannelId;
    const channel = await api(editing ? `/v1/channels/${editing}` : '/v1/channels', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    $('channelDialog').close();
    event.currentTarget.reset();
    state.editingChannelId = null;
    state.selectedChannelId = channel.id;
    toast(editing ? 'Channel updated' : 'Channel created');
    await Promise.all([loadChannels(), loadIdeas(), loadCalendar(), loadAlerts()]);
  } catch (error) {
    $('channelError').textContent = error.message;
    handleApiError(error);
  } finally {
    submit.disabled = false;
  }
}

function openDeleteConfirm(ids) {
  state.pendingDeleteIds = [...new Set(ids)].filter(Boolean);
  if (!state.pendingDeleteIds.length) return;
  $('confirmDeleteSummary').textContent = state.pendingDeleteIds.length === 1
    ? `Permanently delete video ${state.pendingDeleteIds[0]} and all generated MP4s, thumbnails, run intermediates, and database records?`
    : `Permanently delete ${state.pendingDeleteIds.length} selected videos and all their generated MP4s, thumbnails, run intermediates, and database records?`;
  $('confirmDeleteDialog').showModal();
}

async function executeConfirmedDelete(event) {
  event.preventDefault();
  const ids = [...state.pendingDeleteIds];
  if (!ids.length) { $('confirmDeleteDialog').close(); return; }
  const submitBtn = $('confirmDeleteSubmit');
  submitBtn.disabled = true;
  try {
    if (ids.length === 1) {
      await api(`/v1/videos/${ids[0]}`, { method: 'DELETE' });
    } else {
      await api('/v1/videos/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    }
    ids.forEach((id) => state.selectedVideos.delete(id));
    state.pendingDeleteIds = [];
    $('confirmDeleteDialog').close();
    toast(`Deletion started for ${ids.length} video${ids.length === 1 ? '' : 's'}`);
    await Promise.all([loadVideos(), loadVideoSummary(), loadAlerts(), loadCalendar(), loadIdeas()]);
  } catch (error) {
    handleApiError(error);
  } finally {
    submitBtn.disabled = false;
  }
}

async function videoAction(button) {
  const { videoAction: action, id } = button.dataset;
  const video = state.videos.find((v) => v.id === id);
  button.disabled = true;
  try {
    if (action === 'download') {
      toast('Starting video download…');
      const a = document.createElement('a');
      a.href = `/v1/videos/${id}/download`;
      a.download = `${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (action === 'review') {
      const result = await api(`/v1/videos/${id}/result`);
      $('reviewVideo').src = `/v1/videos/${id}/download?inline=1`;
      $('reviewTitle').textContent = result.title || video?.id || 'Video';
      const pkg = result.package;
      $('packageDetails').innerHTML = pkg
        ? `<strong>${escapeHtml(pkg.title || result.title || '')}</strong><p>${escapeHtml(pkg.description || '')}</p>`
        : '<p>Publish package created with the completed video.</p>';
      $('reviewDialog').showModal();
      return;
    }
    if (action === 'cancel') await api(`/v1/videos/${id}/cancel`, { method: 'POST', body: '{}' });
    if (action === 'retry') await api(`/v1/videos/${id}/retry`, { method: 'POST', body: '{}' });
    if (action === 'retry-stage') await api(`/v1/videos/${id}/retry`, { method: 'POST', body: JSON.stringify({ resumeFrom: button.parentElement.querySelector('[data-retry-stage]').value }) });
    if (action === 'resync-captions' && confirm('Re-align subtitles to the narration and rerender this video?')) await api(`/v1/videos/${id}/retry`, { method: 'POST', body: JSON.stringify({ resumeFrom: 'alignment' }) });
    if (action === 'visual-diagnostics') { window.open(`/v1/videos/${id}/visual-diagnostics`, '_blank', 'noopener,noreferrer'); return; }
    if (action === 'delete') { openDeleteConfirm([id]); return; }
    await Promise.all([loadVideos(), loadVideoSummary(), loadAlerts(), loadCalendar()]);
  } catch (error) {
    handleApiError(error);
  } finally {
    button.disabled = false;
  }
}

async function brainstorm(channelId = state.selectedChannelId) {
  if (!channelId) return toast('Create or select a channel first');
  const button = $('brainstorm');
  button.disabled = true;
  try {
    toast('Generating strategic ideas…');
    const result = await api(`/v1/channels/${channelId}/ideas/brainstorm`, { method: 'POST', body: JSON.stringify({ count: 6, useAi: true }) });
    state.selectedChannelId = channelId;
    state.ideas = result.ideas || [];
    renderChannels();
    renderIdeas();
    toast('Strategic ideas ready');
  } catch (error) {
    handleApiError(error);
  } finally {
    button.disabled = false;
  }
}

const channelPage = (page, channelId = state.selectedChannelId) => `/dashboard/${page}${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`;

async function channelAction(button) {
  const { channelAction: action, id } = button.dataset;
  state.selectedChannelId = id;
  const channel = state.channels.find((item) => item.id === id);
  try {
    if (action === 'ideas') { location.href = channelPage('ideas', id); return; }
    if (action === 'brainstorm') { await brainstorm(id); location.href = channelPage('ideas', id); return; }
    if (action === 'analytics') { location.href = channelPage('analytics', id); return; }
    if (action === 'connect') {
      const result = await api(`/v1/channels/${id}/youtube/connect`);
      openYoutubePopup(result.authorizationUrl);
      return;
    }
    if (action === 'disconnect' && confirm(`Disconnect YouTube from ${channel?.name || id}?`)) {
      await api(`/v1/channels/${id}/youtube/disconnect`, { method: 'POST', body: '{}' });
      toast('YouTube disconnected');
      await Promise.all([loadChannels(), loadCalendar(), loadAlerts()]);
      return;
    }
    if (action === 'edit' && channel) { openChannelDialog(channel); return; }
    if (action === 'toggle' && channel) {
      await api(`/v1/channels/${id}`, { method: 'PATCH', body: JSON.stringify({ automation: { enabled: !channel.automation.enabled } }) });
      toast(channel.automation.enabled ? 'Automation paused' : 'Automation enabled');
      await Promise.all([loadChannels(), loadAlerts()]);
      return;
    }
    if (action === 'delete' && channel && confirm(`Delete ${channel.name}, its ideas, and its analytics? Generated videos will remain available.`)) {
      await api(`/v1/channels/${id}`, { method: 'DELETE' });
      state.selectedChannelId = null;
      state.ideas = [];
      state.performance = [];
      state.performanceSummary = null;
      toast('Channel deleted');
      await Promise.all([loadChannels(), loadCalendar(), loadAlerts()]);
      renderIdeas();
      renderPerformance();
      return;
    }
  } catch (error) {
    handleApiError(error);
  }
}

function openIdeaEditDialog(channelId, ideaId) {
  const idea = state.ideas.find((item) => item.id === ideaId) || state.calendarItems.find((item) => item.id === ideaId);
  if (!idea) return;
  state.editingIdea = { channelId: channelId || idea.channelId, ideaId: idea.id, status: idea.status };
  const lockedPackaging = !['draft', 'approved', 'failed'].includes(idea.status);
  $('editIdeaTitle').value = idea.title || '';
  $('editIdeaTitle').disabled = lockedPackaging;
  $('editIdeaHook').value = idea.spokenHook || '';
  $('editIdeaHook').disabled = lockedPackaging;
  $('editIdeaThumbnail').value = idea.thumbnailConcept || '';
  $('editIdeaThumbnail').disabled = lockedPackaging;
  $('editIdeaPublishAt').value = toLocalDateTimeInput(idea.publishAt);
  $('editIdeaStatus').value = ['draft', 'approved', 'rejected'].includes(idea.status) ? idea.status : 'approved';
  $('editIdeaStatus').disabled = lockedPackaging;
  $('ideaEditError').textContent = lockedPackaging ? 'Packaging fields are locked after production starts, but you can still update the Calendar date & time.' : '';
  $('ideaEditDialog').showModal();
}

async function saveIdeaEdit(event) {
  event.preventDefault();
  if (!state.editingIdea) return;
  const { channelId, ideaId, status } = state.editingIdea;
  const lockedPackaging = !['draft', 'approved', 'failed'].includes(status);
  const publishValue = $('editIdeaPublishAt').value;
  const body = {
    publishAt: publishValue ? new Date(publishValue).toISOString() : null,
  };
  if (!lockedPackaging) {
    body.title = $('editIdeaTitle').value.trim();
    body.spokenHook = $('editIdeaHook').value.trim();
    body.thumbnailConcept = $('editIdeaThumbnail').value.trim();
    body.status = $('editIdeaStatus').value;
  }
  try {
    await api(`/v1/channels/${channelId}/ideas/${ideaId}`, { method: 'PATCH', body: JSON.stringify(body) });
    $('ideaEditDialog').close();
    state.editingIdea = null;
    toast('Idea & schedule updated');
    await Promise.all([loadIdeas(), loadCalendar()]);
  } catch (error) {
    $('ideaEditError').textContent = error.message;
  }
}

async function ideaAction(button) {
  const action = button.dataset.ideaAction;
  const id = button.dataset.id;
  const channelId = button.dataset.channel || state.selectedChannelId;
  const base = `/v1/channels/${channelId}/ideas/${id}`;
  try {
    if (action === 'edit') { openIdeaEditDialog(channelId, id); return; }
    if (action === 'approve' || action === 'reject') await api(base, { method: 'PATCH', body: JSON.stringify({ status: action === 'approve' ? 'approved' : 'rejected' }) });
    if (action === 'experiment') {
      const card = button.closest('[data-idea-card]');
      await api(base, { method: 'PATCH', body: JSON.stringify({ selectedTitle: card.querySelector('[data-experiment-title]').value, selectedThumbnailConcept: card.querySelector('[data-experiment-thumbnail]').value }) });
    }
    if (action === 'produce') await api(`${base}/produce`, { method: 'POST', body: '{}' });
    if (action === 'delete') {
      if (!confirm('Delete this idea from the backlog and calendar?')) return;
      await api(base, { method: 'DELETE' });
    }
    if (action === 'video') { location.href = `/dashboard/production?videoId=${encodeURIComponent(button.dataset.videoId)}`; return; }
    await Promise.all([loadIdeas(), loadVideos(), loadCalendar()]);
    toast(label(action) + ' complete');
  } catch (error) {
    handleApiError(error);
  }
}

function renderAdminUsers(users = []) {
  $('adminUserList').innerHTML = `<p class="eyebrow">ACTIVE ADMINS</p><h2>${users.length} account${users.length === 1 ? '' : 's'}</h2>` + users.map((user) => `<div class="admin-row"><div><strong>${escapeHtml(user.email)}</strong><small>${escapeHtml(user.role)} · ${dateLabel(user.createdAt)}</small></div>${user.email !== state.user?.email ? `<button class="button danger ghost sm" data-admin-delete="${encodeURIComponent(user.email)}">Remove</button>` : '<span class="badge accent">Current</span>'}</div>`).join('');
}

async function loadAdminUsers() {
  if (!state.authenticated) return;
  try { renderAdminUsers((await api('/auth/users')).users || []); }
  catch (error) { if (error.status !== 401) $('adminUserError').textContent = error.message; }
}

async function saveAdminUser(event) {
  event.preventDefault();
  $('adminUserError').textContent = '';
  try {
    await api('/auth/users', { method: 'POST', body: JSON.stringify({ email: $('adminUserEmail').value, password: $('adminUserPassword').value }) });
    event.currentTarget.reset();
    toast('Administrator saved');
    await loadAdminUsers();
  } catch (error) { $('adminUserError').textContent = error.message; }
}

async function deleteAdminUser(button) {
  const email = decodeURIComponent(button.dataset.adminDelete || '');
  if (!email || !confirm(`Remove administrator ${email}?`)) return;
  try { await api(`/auth/users/${encodeURIComponent(email)}`, { method: 'DELETE' }); toast('Administrator removed'); await loadAdminUsers(); }
  catch (error) { $('adminUserError').textContent = error.message; }
}

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-video-select]');
  if (checkbox) {
    const id = checkbox.dataset.videoSelect;
    if (checkbox.checked) state.selectedVideos.add(id);
    else state.selectedVideos.delete(id);
    const card = checkbox.closest('[data-video-card]');
    if (card) card.classList.toggle('selected', checkbox.checked);
    syncBulkBar();
  }
});

document.addEventListener('click', (event) => {
  const video = event.target.closest('[data-video-action]');
  const channel = event.target.closest('[data-channel-action]');
  const idea = event.target.closest('[data-idea-action]');
  const admin = event.target.closest('[data-admin-delete]');
  const calEdit = event.target.closest('[data-calendar-edit]');
  const calProduce = event.target.closest('[data-calendar-produce]');
  const calPublish = event.target.closest('[data-calendar-publish]');
  const calViewBtn = event.target.closest('[data-calendar-view]');
  const alertFilterBtn = event.target.closest('[data-alert-filter]');
  const alertActionBtn = event.target.closest('[data-alert-action]');

  if (video) void videoAction(video);
  if (channel) void channelAction(channel);
  if (idea) void ideaAction(idea);
  if (admin) void deleteAdminUser(admin);
  if (calEdit) openIdeaEditDialog(calEdit.dataset.channel, calEdit.dataset.calendarEdit);
  if (calProduce) {
    void api(`/v1/channels/${calProduce.dataset.channel}/ideas/${calProduce.dataset.calendarProduce}/produce`, { method: 'POST', body: '{}' })
      .then(() => { toast('Production queued'); return Promise.all([loadCalendar(), loadVideos()]); })
      .catch(handleApiError);
  }
  if (calPublish) {
    void api(`/v1/channels/${calPublish.dataset.channel}/ideas/${calPublish.dataset.calendarPublish}/publish`, { method: 'POST', body: '{}' })
      .then(() => { toast('YouTube upload queued'); return Promise.all([loadCalendar(), loadAlerts()]); })
      .catch(handleApiError);
  }
  if (calViewBtn) {
    state.calendarView = calViewBtn.dataset.calendarView;
    document.querySelectorAll('[data-calendar-view]').forEach((el) => el.classList.toggle('active', el === calViewBtn));
    renderCalendar();
  }
  if (alertFilterBtn) {
    state.alertFilter = alertFilterBtn.dataset.alertFilter;
    document.querySelectorAll('[data-alert-filter]').forEach((el) => el.classList.toggle('active', el === alertFilterBtn));
    renderAlerts();
  }
  if (alertActionBtn) {
    const action = alertActionBtn.dataset.alertAction;
    if (action === 'retry-video') {
      void api(`/v1/videos/${alertActionBtn.dataset.videoId}/retry`, { method: 'POST', body: '{}' })
        .then(() => { toast('Retry queued'); return Promise.all([loadAlerts(), loadVideos()]); })
        .catch(handleApiError);
    }
    if (action === 'delete-video') openDeleteConfirm([alertActionBtn.dataset.videoId]);
    if (action === 'edit-channel') {
      const target = state.channels.find((c) => c.id === alertActionBtn.dataset.channelId);
      if (target) openChannelDialog(target);
    }
  }
});

$('createForm').addEventListener('submit', createVideo);
$('channelForm').addEventListener('submit', createChannel);
$('ideaEditForm').addEventListener('submit', saveIdeaEdit);
$('confirmDeleteForm').addEventListener('submit', executeConfirmedDelete);
$('performanceForm').addEventListener('submit', savePerformance);
$('refreshPerformance').addEventListener('click', loadPerformance);
$('csvImportForm').addEventListener('submit', importAnalyticsCsv);
$('syncYoutubeAnalytics').addEventListener('click', syncYoutubeAnalytics);
$('newChannel').addEventListener('click', () => openChannelDialog());
$('brainstorm').addEventListener('click', () => brainstorm());
$('refreshIdeas').addEventListener('click', loadIdeas);
$('refreshVideos').addEventListener('click', loadVideos);
$('refreshCalendar').addEventListener('click', loadCalendar);
$('refreshAlerts').addEventListener('click', loadAlerts);
$('calendarPrevMonth').addEventListener('click', () => { state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() - 1, 1); renderCalendar(); });
$('calendarNextMonth').addEventListener('click', () => { state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + 1, 1); renderCalendar(); });
$('calendarChannelFilter').addEventListener('change', renderCalendar);
$('calendarStatusFilter').addEventListener('change', renderCalendar);
$('selectAllVideos').addEventListener('click', () => { state.videos.forEach((v) => state.selectedVideos.add(v.id)); renderVideos(); });
$('selectFailedVideos').addEventListener('click', () => { state.selectedVideos.clear(); state.videos.filter((v) => v.status === 'failed' || v.status === 'cancelled').forEach((v) => state.selectedVideos.add(v.id)); renderVideos(); });
$('bulkSelectCompleted').addEventListener('click', () => { state.videos.filter((v) => v.status === 'completed').forEach((v) => state.selectedVideos.add(v.id)); renderVideos(); });
$('bulkClearSelection').addEventListener('click', () => { state.selectedVideos.clear(); renderVideos(); });
$('bulkDeleteVideos').addEventListener('click', () => openDeleteConfirm([...state.selectedVideos]));
$('loadMoreVideos').addEventListener('click', () => singleRequest('videos-more', () => loadVideos({ append: true })));
$('videoChannelFilter').addEventListener('change', () => { state.videoCursor = null; void singleRequest('videos-filter', loadVideos); });
$('videoStatusFilter').addEventListener('change', () => { state.videoCursor = null; void singleRequest('videos-filter', loadVideos); });
$('videoFormatFilter').addEventListener('change', () => { state.videoCursor = null; void singleRequest('videos-filter', loadVideos); });
for (const id of ['videoDateFrom', 'videoDateTo', 'videoDurationMin', 'videoDurationMax']) $(id).addEventListener('change', () => { state.videoCursor = null; void singleRequest('videos-filter', loadVideos); });
$('ideaStatusFilter').addEventListener('change', () => void singleRequest('ideas-filter', loadIdeas));
$('ideaChannel').addEventListener('change', () => { state.selectedChannelId = $('ideaChannel').value; history.replaceState(null, '', channelPage('ideas')); void loadIdeas(); });
$('performanceChannel').addEventListener('change', () => { state.selectedChannelId = $('performanceChannel').value; history.replaceState(null, '', channelPage('analytics')); void loadPerformance(); });
$('profileId').addEventListener('change', applySelectedChannelDefaults);
$('durationMode').addEventListener('change', syncDurationFields);
$('aspect').addEventListener('change', syncDurationFields);
$('channelImageSource').addEventListener('change', () => syncChannelVisualFields());
$('channelImageStyle').addEventListener('change', () => syncChannelVisualFields());
$('channelImageModel').addEventListener('change', () => { if ($('channelImageProvider')) $('channelImageProvider').value = getProviderForModel($('channelImageModel').value); });
$('channelAutomationEnabled').addEventListener('change', syncAutomationFields);
$('formatLandscape').addEventListener('change', syncFormatFields);
$('formatShorts').addEventListener('change', syncFormatFields);
$('openSettings').addEventListener('click', () => { location.href = '/dashboard/settings'; });
$('menuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
$('loginForm').addEventListener('submit', login);
$('loginDialog').addEventListener('cancel', (event) => { if (!state.authenticated) event.preventDefault(); });
$('logoutButton').addEventListener('click', logout);
$('adminUserForm').addEventListener('submit', saveAdminUser);
$('closeReview').addEventListener('click', () => $('reviewDialog').close());
$('reviewDialog').addEventListener('close', () => { $('reviewVideo').pause(); $('reviewVideo').removeAttribute('src'); $('reviewVideo').load(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.authenticated) void refreshAll(); });
$('performanceViewed').max = '1000';

setPage();
renderVideos();
renderChannels();
renderIdeas();
renderCalendar();
renderAlerts();
renderPerformance();
renderPerformanceSummary();
syncDurationFields();
renderProductionInsights();

if (await restoreSession()) {
  await refreshAll();
  await loadAdminUsers();
}

state.poll = setInterval(() => {
  if (!state.authenticated || document.hidden) return;
  state.pollCount += 1;
  const hasActiveVideos = state.videos.some((v) => !terminal.has(v.status));
  if (hasActiveVideos || state.pollCount % 6 === 0) {
    void singleRequest('videos', loadVideos);
    if (state.pollCount % 6 === 0) {
      void singleRequest('video-summary', loadVideoSummary);
      void singleRequest('alerts', loadAlerts);
      void singleRequest('calendar', loadCalendar);
    }
  }
  if (state.selectedChannelId && state.ideas.some((idea) => ['queued', 'producing'].includes(idea.status))) void singleRequest('ideas', loadIdeas);
  if (state.pollCount % 6 === 0 && state.channels.some((channel) => channel.automation?.enabled)) void singleRequest('channels', loadChannels);
}, 10000);
