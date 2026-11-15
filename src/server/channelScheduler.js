import { rankGrowthIdeas } from '../services/youtubeGrowthService.js';
import { isAutomaticallyRetryableFailure } from './videoJobService.js';

const FIELD_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

export function parseCronField(field, min, max) {
  const values = new Set();
  for (const segment of String(field).split(',')) {
    const [rangePart, stepPart] = segment.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step: ${segment}`);
    let start; let end;
    if (rangePart === '*') { start = min; end = max; }
    else if (rangePart.includes('-')) [start, end] = rangePart.split('-').map(Number);
    else start = end = Number(rangePart);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) throw new Error(`Invalid cron field: ${segment}`);
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

export function parseCron(expression) {
  const fields = String(expression).trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Cron must have exactly five fields: minute hour day month weekday');
  return fields.map((field, index) => {
    const values = parseCronField(field, ...FIELD_RANGES[index]);
    if (index === 4 && values.has(7)) { values.delete(7); values.add(0); }
    return values;
  });
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short',
  }).formatToParts(date).reduce((all, part) => ({ ...all, [part.type]: part.value }), {});
  const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return [Number(parts.minute), Number(parts.hour) % 24, Number(parts.day), Number(parts.month), weekdays[parts.weekday]];
}

function cronMatches(expression, date, timeZone) {
  const fields = String(expression).trim().split(/\s+/);
  const sets = parseCron(expression);
  const parts = zonedParts(date, timeZone);
  const baseMatches = sets[0].has(parts[0]) && sets[1].has(parts[1]) && sets[3].has(parts[3]);
  const dayOfMonthMatches = sets[2].has(parts[2]);
  const dayOfWeekMatches = sets[4].has(parts[4]);
  const dayMatches = fields[2] === '*' ? dayOfWeekMatches : (fields[4] === '*' ? dayOfMonthMatches : (dayOfMonthMatches || dayOfWeekMatches));
  return baseMatches && dayMatches;
}

export function isCronDue(expression, date = new Date(), timeZone = 'UTC', lastScheduledAt = null) {
  if (!cronMatches(expression, date, timeZone)) return false;
  if (!lastScheduledAt) return true;
  return Math.floor(new Date(lastScheduledAt).getTime() / 60_000) < Math.floor(date.getTime() / 60_000);
}

export function findDueCronSlot(expression, date = new Date(), timeZone = 'UTC', lastScheduledAt = null, maxLookbackMinutes = 10_080) {
  const currentMinute = Math.floor(date.getTime() / 60_000);
  const lastMinute = lastScheduledAt ? Math.floor(new Date(lastScheduledAt).getTime() / 60_000) : null;
  if (cronMatches(expression, date, timeZone) && (lastMinute === null || lastMinute < currentMinute)) return new Date(currentMinute * 60_000);
  if (lastMinute === null || !Number.isFinite(lastMinute)) return null;
  const floor = Math.max(lastMinute + 1, currentMinute - Math.max(1, maxLookbackMinutes));
  for (let minute = currentMinute - 1; minute >= floor; minute--) {
    const candidate = new Date(minute * 60_000);
    if (cronMatches(expression, candidate, timeZone)) return candidate;
  }
  return null;
}

export class ChannelScheduler {
  constructor({ store, director, videoService, publisher = null, publishingEnabled = Boolean(publisher), intervalMs = 30_000 }) {
    this.store = store; this.director = director; this.videoService = videoService; this.publisher = publisher; this.publishingEnabled = publishingEnabled; this.intervalMs = intervalMs;
    this.timer = null; this.running = false;
  }
  start() { if (!this.timer) { this.timer = setInterval(() => void this.tick(), this.intervalMs); this.timer.unref?.(); void this.tick(); } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(at = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      for (const { ownerId, channel } of await this.store.listAllChannels()) {
        try {
          await this.#syncIdeas(ownerId, channel);
        } catch (error) {
          console.error(`Channel status synchronization failed for ${channel.id}:`, error);
          continue;
        }
        try { await this.#syncAnalyticsIfDue(ownerId, channel, at); }
        catch (error) { console.error(`YouTube Analytics synchronization failed for ${channel.id}:`, error); }
        const automation = channel.automation;
        if (!automation.enabled) continue;
        try {
          const nextRetry = automation.nextRetryAt ? new Date(automation.nextRetryAt) : null;
          if (nextRetry && nextRetry > at) continue;
          const retryDue = Boolean(nextRetry && automation.retrySlotAt && nextRetry <= at);
          const dueSlot = retryDue
            ? new Date(automation.retrySlotAt)
            : findDueCronSlot(automation.scheduleCron, at, automation.timezone, automation.lastScheduledAt);
          if (!dueSlot) continue;
          // Claim this minute before enqueueing. The idempotency key in produce is the second line of defense.
          const claimed = retryDue
            ? channel
            : typeof this.store.claimSchedule === 'function'
            ? await this.store.claimSchedule(ownerId, channel.id, dueSlot)
            : { ...channel, automation: { ...automation, lastScheduledAt: dueSlot.toISOString(), lastError: null }, updatedAt: at.toISOString() };
          if (!claimed) continue;
          Object.assign(channel, claimed);
          if (typeof this.store.claimSchedule !== 'function') await this.store.putChannel(ownerId, channel);
          const backlog = await this.store.listIdeas(ownerId, channel.id);
          let ideas = rankGrowthIdeas(backlog.filter((idea) => idea.status === 'approved'));
          if (automation.approvalMode === 'manual_approval') {
            if (ideas[0]) await this.director.produce(ownerId, channel.id, ideas[0].id);
            else if (!backlog.some((idea) => idea.status === 'draft')) {
              const drafts = await this.director.brainstorm(ownerId, channel.id, { count: 3, autoApprove: false });
              if (!drafts.length) throw new Error('No reviewable idea was available for this schedule');
            }
            await this.#markScheduleSuccess(ownerId, channel, at);
            continue;
          }
          if (!ideas.length) {
            const draft = rankGrowthIdeas(backlog.filter((idea) => idea.status === 'draft'))[0];
            if (draft) {
              const approved = { ...draft, status: 'approved', updatedAt: new Date().toISOString() };
              await this.store.putIdea(ownerId, approved); ideas = [approved];
            }
          }
          if (!ideas.length) ideas = rankGrowthIdeas(await this.director.brainstorm(ownerId, channel.id, { count: 3, autoApprove: true }));
          if (!ideas[0]) throw new Error('No eligible idea was available for this schedule');
          await this.director.produce(ownerId, channel.id, ideas[0].id);
          await this.#markScheduleSuccess(ownerId, channel, at);
        } catch (error) {
          await this.#markScheduleFailure(ownerId, channel, at, error);
          console.error(`Channel schedule failed for ${channel.id}:`, error);
        }
      }
    } finally { this.running = false; }
  }

  async #markScheduleSuccess(ownerId, channel, at) {
    if (!channel.automation.lastError && !channel.automation.nextRetryAt && !channel.automation.consecutiveFailures) return;
    channel.automation = {
      ...channel.automation,
      lastError: null,
      consecutiveFailures: 0,
      retrySlotAt: null,
      nextRetryAt: null,
    };
    channel.updatedAt = at.toISOString();
    await this.store.putChannel(ownerId, channel);
  }

  async #markScheduleFailure(ownerId, channel, at, error) {
    const failures = Math.min(20, Number(channel.automation.consecutiveFailures || 0) + 1);
    const canRetry = failures < 5;
    const delayMs = Math.min(6 * 60 * 60_000, 30_000 * (2 ** (failures - 1)));
    channel.automation = {
      ...channel.automation,
      lastError: String(error.message || error).slice(0, 1_000),
      consecutiveFailures: failures,
      retrySlotAt: canRetry ? (channel.automation.retrySlotAt || channel.automation.lastScheduledAt || at.toISOString()) : null,
      nextRetryAt: canRetry ? new Date(at.getTime() + delayMs).toISOString() : null,
    };
    channel.updatedAt = at.toISOString();
    await this.store.putChannel(ownerId, channel).catch(() => {});
  }

  async #syncIdeas(ownerId, channel) {
    for (const idea of await this.store.listIdeas(ownerId, channel.id)) {
      if (idea.status === 'ready' && channel.automation.autoPublish && this.publisher && this.publishingEnabled) {
        try { await this.publisher.publishIdea(ownerId, channel.id, idea.id); }
        catch (error) { console.error(`Automatic YouTube publish failed for ${idea.id}:`, error); }
        continue;
      }
      // Include persisted failures so an automatic channel can recover a job
      // that failed before an API restart or before this release was deployed.
      // Include persisted failures so an automatic channel can recover a job
      // that failed before an API restart or before this release was deployed.
      // Include persisted failures so an automatic channel can recover a job
      // that failed before an API restart or before this release was deployed.
      if (!idea.videoId || !['queued', 'producing', 'failed'].includes(idea.status)) continue;
      try {
        const video = await this.videoService.get(ownerId, idea.videoId);
        const automaticRetryLimit = Math.max(0, Number(process.env.VIDEO_AUTOMATIC_RETRY_LIMIT ?? 2));
        const shouldRecoverFailedProduction = channel.automation.enabled
          && channel.automation.approvalMode === 'automatic'
          && video.status === 'failed'
          && Number(video.retryCount || 0) < automaticRetryLimit
          && isAutomaticallyRetryableFailure(video.error);
        if (shouldRecoverFailedProduction && typeof this.videoService.retry === 'function') {
          const retried = await this.videoService.retry(ownerId, idea.videoId, { resumeFrom: video.error?.resumeFrom || null });
          await this.store.putIdea(ownerId, { ...idea, status: 'queued', error: null, updatedAt: new Date().toISOString() });
          console.warn(`Automatically retried failed production ${idea.videoId} for channel ${channel.id} (attempt ${retried.job?.retryCount || Number(video.retryCount || 0) + 1}).`);
          continue;
        }
        const status = video.status === 'completed' ? 'ready' : (video.status === 'failed' || video.status === 'cancelled' ? 'failed' : video.status === 'queued' ? 'queued' : 'producing');
        if (status !== idea.status) await this.store.putIdea(ownerId, { ...idea, status, error: video.error?.message || null, updatedAt: new Date().toISOString() });
        if (status === 'ready' && channel.automation.autoPublish && this.publisher && this.publishingEnabled) {
          try { await this.publisher.publishIdea(ownerId, channel.id, idea.id); }
          catch (error) { console.error(`Automatic YouTube publish failed for ${idea.id}:`, error); }
        }
      } catch (error) { if (error.status !== 404) throw error; }
    }
  }

  async #syncAnalyticsIfDue(ownerId, channel, at) {
    if (!channel.youtube?.connected || typeof this.publisher?.syncAnalytics !== 'function') return;
    const lastSuccess = channel.youtube.lastAnalyticsSyncAt ? new Date(channel.youtube.lastAnalyticsSyncAt).getTime() : 0;
    const lastAttempt = channel.youtube.lastAnalyticsSyncAttemptAt ? new Date(channel.youtube.lastAnalyticsSyncAttemptAt).getTime() : 0;
    const now = at.getTime();
    if (lastSuccess && now - lastSuccess < 24 * 60 * 60_000) return;
    if (lastAttempt && now - lastAttempt < 6 * 60 * 60_000) return;
    await this.publisher.syncAnalytics(ownerId, channel.id, { days: 90 });
  }
}
