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
  constructor({ store, director, videoService, publisher = null, intervalMs = 30_000 }) {
    this.store = store; this.director = director; this.videoService = videoService; this.publisher = publisher; this.intervalMs = intervalMs;
    this.timer = null; this.running = false;
  }
  start() { if (!this.timer) { this.timer = setInterval(() => void this.tick(), this.intervalMs); this.timer.unref?.(); void this.tick(); } }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick(at = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      for (const { ownerId, channel } of await this.store.listAllChannels()) {
        await this.#syncIdeas(ownerId, channel);
        const automation = channel.automation;
        if (!automation.enabled) continue;
        try {
          const dueSlot = findDueCronSlot(automation.scheduleCron, at, automation.timezone, automation.lastScheduledAt);
          if (!dueSlot) continue;
          // Claim this minute before enqueueing. The idempotency key in produce is the second line of defense.
          const claimed = typeof this.store.claimSchedule === 'function'
            ? await this.store.claimSchedule(ownerId, channel.id, dueSlot)
            : { ...channel, automation: { ...automation, lastScheduledAt: dueSlot.toISOString(), lastError: null }, updatedAt: at.toISOString() };
          if (!claimed) continue;
          Object.assign(channel, claimed);
          if (typeof this.store.claimSchedule !== 'function') await this.store.putChannel(ownerId, channel);
          const backlog = await this.store.listIdeas(ownerId, channel.id);
          let ideas = backlog.filter((idea) => idea.status === 'approved');
          if (automation.approvalMode === 'manual_approval') {
            if (ideas[0]) await this.director.produce(ownerId, channel.id, ideas[0].id);
            else if (!backlog.some((idea) => idea.status === 'draft')) {
              const drafts = await this.director.brainstorm(ownerId, channel.id, { count: 3, autoApprove: false });
              if (!drafts.length) throw new Error('No reviewable idea was available for this schedule');
            }
            continue;
          }
          if (!ideas.length) {
            const draft = backlog.filter((idea) => idea.status === 'draft').sort((a, b) =>
              (b.compositeScore - a.compositeScore)
              || (b.retentionScore - a.retentionScore)
              || b.createdAt.localeCompare(a.createdAt))[0];
            if (draft) {
              const approved = { ...draft, status: 'approved', updatedAt: new Date().toISOString() };
              await this.store.putIdea(ownerId, approved); ideas = [approved];
            }
          }
          if (!ideas.length) ideas = await this.director.brainstorm(ownerId, channel.id, { count: 3, autoApprove: true });
          if (!ideas[0]) throw new Error('No eligible idea was available for this schedule');
          await this.director.produce(ownerId, channel.id, ideas[0].id);
        } catch (error) {
          // A failed enqueue must not consume the schedule forever. Restore the
          // prior slot so the next tick can retry after the underlying problem clears.
          channel.automation = {
            ...channel.automation,
            lastScheduledAt: automation.lastScheduledAt,
            lastError: String(error.message || error).slice(0, 1_000),
          };
          channel.updatedAt = new Date().toISOString();
          await this.store.putChannel(ownerId, channel).catch(() => {});
          console.error(`Channel schedule failed for ${channel.id}:`, error);
        }
      }
    } finally { this.running = false; }
  }

  async #syncIdeas(ownerId, channel) {
    for (const idea of await this.store.listIdeas(ownerId, channel.id)) {
      if (idea.status === 'ready' && channel.automation.autoPublish && this.publisher) {
        try { await this.publisher.publishIdea(ownerId, channel.id, idea.id); }
        catch (error) { console.error(`Automatic YouTube publish failed for ${idea.id}:`, error); }
        continue;
      }
      if (!idea.videoId || !['queued', 'producing'].includes(idea.status)) continue;
      try {
        const video = await this.videoService.get(ownerId, idea.videoId);
        const status = video.status === 'completed' ? 'ready' : (video.status === 'failed' || video.status === 'cancelled' ? 'failed' : video.status === 'queued' ? 'queued' : 'producing');
        if (status !== idea.status) await this.store.putIdea(ownerId, { ...idea, status, error: video.error?.message || null, updatedAt: new Date().toISOString() });
        if (status === 'ready' && channel.automation.autoPublish && this.publisher) {
          try { await this.publisher.publishIdea(ownerId, channel.id, idea.id); }
          catch (error) { console.error(`Automatic YouTube publish failed for ${idea.id}:`, error); }
        }
      } catch (error) { if (error.status !== 404) throw error; }
    }
  }
}
