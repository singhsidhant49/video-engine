/**
 * Aggregates live production, channel automation, YouTube, and system alerts
 * for an owner so the Studio Alerts page presents one actionable view without
 * external notification webhooks.
 */
export async function buildOwnerAlerts({
  ownerId,
  videoService,
  channelStore,
  readiness = null,
  preflight = null,
} = {}) {
  const alerts = [];
  const [channels, videoPage, summary] = await Promise.all([
    channelStore.listChannels(ownerId),
    typeof videoService.listPage === 'function'
      ? videoService.listPage(ownerId, { limit: 100, statuses: ['failed'] })
      : Promise.resolve({
        videos: (await videoService.list(ownerId, { statuses: ['failed'] })).slice(0, 100),
      }),
    typeof videoService.summary === 'function'
      ? videoService.summary(ownerId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));

  if (readiness) {
    if (readiness.storage?.healthy === false) {
      alerts.push({
        id: 'system:storage',
        severity: 'critical',
        category: 'system',
        title: 'Database / storage unavailable',
        message: 'Primary job storage health check failed.',
        action: { type: 'settings', label: 'Check settings' },
        createdAt: new Date().toISOString(),
      });
    }
    if (readiness.queue?.healthy === false || readiness.queue?.workerCount === 0) {
      alerts.push({
        id: 'system:worker',
        severity: 'critical',
        category: 'system',
        title: readiness.queue?.workerCount === 0 ? 'No active render worker connected' : 'Queue service unavailable',
        message: readiness.queue?.workerCount === 0
          ? 'Jobs will stay queued until the worker container is online.'
          : 'Redis/BullMQ queue health check failed.',
        action: { type: 'settings', label: 'Check deployment' },
        createdAt: new Date().toISOString(),
      });
    }
  }

  if (preflight?.required) {
    for (const [key, item] of Object.entries(preflight.required)) {
      if (item && item.healthy === false) {
        alerts.push({
          id: `preflight:${key}`,
          severity: 'critical',
          category: 'system',
          title: `Service preflight failed: ${key}`,
          message: item.message || item.code || `${key} is unavailable.`,
          action: { type: 'settings', label: 'Open settings' },
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  if (summary?.storageBytes > 30 * 1024 * 1024 * 1024) {
    alerts.push({
      id: 'system:storage-size',
      severity: 'warning',
      category: 'system',
      title: 'Render storage usage is high',
      message: `Completed delivery files use ${(summary.storageBytes / 1_073_741_824).toFixed(1)} GB. Use Select & Delete on Productions to remove older videos.`,
      action: { type: 'production', label: 'Manage productions' },
      createdAt: new Date().toISOString(),
    });
  }

  const ideasLists = await Promise.all(channels.map((channel) => channelStore.listIdeas(ownerId, channel.id)));
  channels.forEach((channel, idx) => {
    if (channel.automation?.lastError) {
      const fails = Number(channel.automation.consecutiveFailures || 0);
      alerts.push({
        id: `channel-sched:${channel.id}`,
        severity: fails >= 3 ? 'critical' : 'error',
        category: 'scheduler',
        channelId: channel.id,
        channelName: channel.name,
        title: `Automation error on ${channel.name}`,
        message: channel.automation.lastError,
        meta: {
          consecutiveFailures: fails,
          nextRetryAt: channel.automation.nextRetryAt || null,
        },
        action: { type: 'channel', channelId: channel.id, label: 'Edit channel' },
        createdAt: channel.updatedAt,
      });
    }
    if (channel.youtube?.analyticsSyncError) {
      alerts.push({
        id: `channel-yt-sync:${channel.id}`,
        severity: 'warning',
        category: 'youtube',
        channelId: channel.id,
        channelName: channel.name,
        title: `YouTube Analytics sync failed on ${channel.name}`,
        message: channel.youtube.analyticsSyncError,
        action: { type: 'youtube_connect', channelId: channel.id, label: 'Reconnect YouTube' },
        createdAt: channel.youtube.lastAnalyticsSyncAttemptAt || channel.updatedAt,
      });
    }
    for (const idea of ideasLists[idx] || []) {
      if (idea.status === 'publish_failed') {
        alerts.push({
          id: `idea-publish:${idea.id}`,
          severity: 'error',
          category: 'youtube',
          channelId: channel.id,
          channelName: channel.name,
          ideaId: idea.id,
          videoId: idea.videoId || null,
          title: `YouTube upload failed: ${idea.title}`,
          message: idea.error || 'YouTube upload failed.',
          action: { type: 'calendar', channelId: channel.id, ideaId: idea.id, label: 'View on Calendar' },
          createdAt: idea.updatedAt,
        });
      }
    }
  });

  for (const video of videoPage.videos || []) {
    const code = video.error?.code || 'GENERATION_FAILED';
    const isBillingOrAuth = code === 'PROVIDER_CREDITS_EXHAUSTED' || code === 'PROVIDER_AUTH_FAILED';
    const ch = channelMap.get(video.channelId);
    alerts.push({
      id: `video:${video.id}`,
      severity: isBillingOrAuth ? 'critical' : 'error',
      category: isBillingOrAuth ? 'provider' : 'production',
      videoId: video.id,
      channelId: video.channelId || 'default',
      channelName: ch?.name || (video.channelId === 'default' ? 'Default profile' : video.channelId),
      title: video.metadata?.title || video.id,
      code,
      stage: video.error?.stage || video.stage || null,
      retryCount: video.retryCount || 0,
      message: video.error?.message || 'Video generation failed',
      action: isBillingOrAuth && ch
        ? { type: 'channel', channelId: ch.id, label: 'Check channel visual provider' }
        : { type: 'video_retry', videoId: video.id, label: 'Retry video' },
      createdAt: video.updatedAt || video.createdAt,
    });
  }

  const severityWeight = { critical: 3, error: 2, warning: 1 };
  alerts.sort((a, b) =>
    (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0)
    || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      total: alerts.length,
      critical: alerts.filter((item) => item.severity === 'critical').length,
      error: alerts.filter((item) => item.severity === 'error').length,
      warning: alerts.filter((item) => item.severity === 'warning').length,
    },
    alerts,
  };
}
