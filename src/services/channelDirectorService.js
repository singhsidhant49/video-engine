import { brainstormGrowthIdeas } from './youtubeGrowthService.js';

const now = () => new Date().toISOString();

export class ChannelDirectorService {
  constructor({ store, videoService }) { this.store = store; this.videoService = videoService; }

  async brainstorm(ownerId, channelId, { count = 5, useAi = true, autoApprove = false } = {}) {
    const channel = await this.store.getChannel(ownerId, channelId);
    if (!channel) throw Object.assign(new Error('Channel not found'), { status: 404, code: 'CHANNEL_NOT_FOUND' });
    const [history, performance] = await Promise.all([
      this.store.listIdeas(ownerId, channelId),
      typeof this.store.listPerformance === 'function' ? this.store.listPerformance(ownerId, channelId, { limit: 100 }) : [],
    ]);
    const generated = await brainstormGrowthIdeas(channel, { count, history, performance, useAi });
    const ideas = [];
    for (const item of generated) {
      const timestamp = now();
      const idea = {
        id: this.store.createId('idea', item.title), channelId, ...item,
        status: autoApprove ? 'approved' : 'draft', videoId: null, youtubeVideoId: null,
        publishAt: null, error: null, createdAt: timestamp, updatedAt: timestamp,
      };
      ideas.push(await this.store.putIdea(ownerId, idea));
    }
    return ideas;
  }

  buildVideoRequest(channel, idea) {
    const d = channel.productionDefaults;
    const prompt = `Create a complete, publishable ${idea.format === 'shorts' ? 'YouTube Short' : 'landscape YouTube video'} titled "${idea.title}" using a retention-engineered Claude-YouTube structure.
Primary keyword: ${idea.primaryKeyword}
Traffic strategy: ${idea.trafficStrategy}
Opening spoken line (use verbatim in the first 5 seconds): "${idea.spokenHook}"
Narrative arc: ${idea.narrativeArc}
Content pillar: ${idea.contentPillar}
Channel niche: ${channel.niche}
Target audience: ${channel.targetAudience}
Target duration: ${idea.durationSeconds} seconds. Rationale: ${idea.durationRationale}
Thumbnail promise: ${idea.thumbnailConcept}
Why this idea: ${idea.whyThisIdea}
Evidence basis: ${idea.evidenceSource}

SCRIPT CONTRACT:
1. Grab at 0-5s: begin with the result, tension, action, or contradiction. No greeting, logo intro, or "in this video".
2. Promise at 5-15s: state the concrete viewer outcome and immediately prove the title and thumbnail are truthful.
3. Stakes at 15-30s: explain the practical or emotional cost of leaving.
4. Put the strongest material early and late. Every block must add information, end with a micro-summary, and create a forward hook.
5. ${idea.format === 'shorts' ? 'Use visual or verbal resets every 2-3 seconds, one tight open loop, a rapid payoff, and loop-compatible final wording.' : 'Use meaningful pattern interrupts around every 30 seconds, a soft content-linked CTA only after value delivery, and a retention re-hook around 60%.'}
6. Resolve every open loop with a strong final payoff. Never end with empty thanks or generic inspiration.
7. Spoken narration must be natural prose. Production cues must never be spoken aloud.
8. Never fabricate facts, demand, trends, quotations, statistics, or sources. Qualify uncertainty and omit unsupported specifics.
9. Use the primary keyword naturally near the beginning without keyword stuffing.
10. Meet the duration because the topic warrants it; never repeat or pad to fill time.`;
    const creative = {
      contentType: d.contentType, tone: d.tone, audience: channel.targetAudience, pacing: 'auto',
      imageSource: d.imageSource,
    };
    if (d.imageProvider) creative.imageProvider = d.imageProvider;
    if (d.imageModel) creative.imageModel = d.imageModel;
    if (d.imageQuality) creative.imageQuality = d.imageQuality;
    if (d.imageSource === 'ai') {
      creative.imageStyle = d.imageStyle;
      if (d.customStylePrompt) creative.customStylePrompt = d.customStylePrompt;
    }
    const audio = {};
    if (d.voice && d.voice !== 'auto') audio.voice = d.voice;
    if (d.music && d.music !== 'auto') audio.music = d.music;
    return {
      prompt, profileId: channel.id, niche: channel.niche,
      output: { durationSeconds: idea.durationSeconds, aspectRatio: idea.format === 'shorts' ? '9:16' : '16:9', resolution: '1080p' },
      creative, audio, subtitles: { enabled: d.subtitles },
      metadata: {
        source: 'channel-director', channelId: channel.id, ideaId: idea.id, title: idea.title,
        format: idea.format, trafficStrategy: idea.trafficStrategy, primaryKeyword: idea.primaryKeyword,
        thumbnailConcept: idea.thumbnailConcept,
      },
    };
  }

  async produce(ownerId, channelId, ideaId) {
    const [channel, idea] = await Promise.all([this.store.getChannel(ownerId, channelId), this.store.getIdea(ownerId, ideaId)]);
    if (!channel || !idea || idea.channelId !== channelId) throw Object.assign(new Error('Idea not found'), { status: 404, code: 'IDEA_NOT_FOUND' });
    if (!['draft', 'approved', 'failed'].includes(idea.status)) throw Object.assign(new Error(`Idea cannot be produced while ${idea.status}`), { status: 409, code: 'IDEA_NOT_PRODUCIBLE' });
    const created = idea.status === 'failed' && idea.videoId && typeof this.videoService.retry === 'function'
      ? await this.videoService.retry(ownerId, idea.videoId)
      : await this.videoService.create(ownerId, this.buildVideoRequest(channel, idea), `channel:${channelId}:idea:${ideaId}`);
    const updated = { ...idea, status: 'queued', videoId: created.job.id, error: null, updatedAt: now() };
    await this.store.putIdea(ownerId, updated);
    return { idea: updated, video: created.job, reused: created.reused };
  }
}
