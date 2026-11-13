import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { ChannelPerformanceSnapshotSchema, ChannelProfileSchema, ChannelVideoIdeaSchema } from '../models/channel.schema.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const safeId = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

export class ChannelStore {
  constructor({ rootDir, connectionString = process.env.DATABASE_URL, pool = null } = {}) {
    this.rootDir = rootDir;
    this.pool = pool || (connectionString ? new pg.Pool({ connectionString }) : null);
    this.ownsPool = Boolean(!pool && connectionString);
    this.channelsFile = rootDir ? path.join(rootDir, 'channels.json') : null;
    this.ideasFile = rootDir ? path.join(rootDir, 'ideas.json') : null;
    this.performanceFile = rootDir ? path.join(rootDir, 'performance.json') : null;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.pool) {
      await this.pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'channels'
          ) AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns WHERE table_name = 'channels' AND column_name = 'owner_id'
          ) THEN
            RAISE EXCEPTION 'Legacy channels schema detected without owner_id. Refusing destructive startup migration; back up the database and run an explicit channel-owner migration.';
          END IF;
        END $$;
        CREATE TABLE IF NOT EXISTS channels (
          owner_id TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY(owner_id, id)
        );
        CREATE TABLE IF NOT EXISTS channel_ideas (
          owner_id TEXT NOT NULL, id TEXT NOT NULL, channel_id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY(owner_id, id), FOREIGN KEY(owner_id, channel_id) REFERENCES channels(owner_id, id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS channel_ideas_channel_idx ON channel_ideas(owner_id, channel_id, updated_at DESC);
        CREATE TABLE IF NOT EXISTS channel_performance (
          owner_id TEXT NOT NULL, id TEXT NOT NULL, channel_id TEXT NOT NULL, data JSONB NOT NULL, captured_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY(owner_id, id), FOREIGN KEY(owner_id, channel_id) REFERENCES channels(owner_id, id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS channel_performance_channel_idx ON channel_performance(owner_id, channel_id, captured_at DESC);
      `);
      return;
    }
    if (!this.rootDir) throw new Error('ChannelStore requires rootDir when DATABASE_URL is absent');
    await fs.mkdir(this.rootDir, { recursive: true });
    await this.#ensureFile(this.channelsFile);
    await this.#ensureFile(this.ideasFile);
    await this.#ensureFile(this.performanceFile);
  }

  async #ensureFile(file) {
    try { await fs.access(file); } catch { await this.#atomicWrite(file, []); }
  }

  async #read(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async #atomicWrite(file, value) {
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2));
    await fs.rename(tmp, file);
  }

  #write(task) {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.catch(() => {});
    return run;
  }

  async listChannels(ownerId) {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM channels WHERE owner_id=$1 ORDER BY updated_at DESC', [ownerId]);
      return rows.map(({ data }) => ChannelProfileSchema.parse(data));
    }
    return (await this.#read(this.channelsFile)).filter((row) => row.ownerId === ownerId).map((row) => ChannelProfileSchema.parse(row.data));
  }

  async listAllChannels() {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT owner_id, data FROM channels ORDER BY updated_at DESC');
      return rows.map((row) => ({ ownerId: row.owner_id, channel: ChannelProfileSchema.parse(row.data) }));
    }
    return (await this.#read(this.channelsFile)).map((row) => ({ ownerId: row.ownerId, channel: ChannelProfileSchema.parse(row.data) }));
  }

  async getChannel(ownerId, id) {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM channels WHERE owner_id=$1 AND id=$2', [ownerId, id]);
      return rows[0] ? ChannelProfileSchema.parse(rows[0].data) : null;
    }
    const row = (await this.#read(this.channelsFile)).find((item) => item.ownerId === ownerId && item.id === id);
    return row ? ChannelProfileSchema.parse(row.data) : null;
  }

  async putChannel(ownerId, value) {
    const channel = ChannelProfileSchema.parse(value);
    if (this.pool) {
      await this.pool.query(`INSERT INTO channels(owner_id,id,data,updated_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at`,
      [ownerId, channel.id, channel, channel.updatedAt]);
      return channel;
    }
    return this.#write(async () => {
      const rows = await this.#read(this.channelsFile);
      const next = rows.filter((row) => !(row.ownerId === ownerId && row.id === channel.id));
      next.push({ ownerId, id: channel.id, data: clone(channel) });
      await this.#atomicWrite(this.channelsFile, next);
      return channel;
    });
  }

  async deleteChannel(ownerId, id) {
    if (this.pool) {
      const result = await this.pool.query('DELETE FROM channels WHERE owner_id=$1 AND id=$2', [ownerId, id]);
      return result.rowCount > 0;
    }
    return this.#write(async () => {
      const [channels, ideas, performance] = await Promise.all([this.#read(this.channelsFile), this.#read(this.ideasFile), this.#read(this.performanceFile)]);
      const found = channels.some((row) => row.ownerId === ownerId && row.id === id);
      await Promise.all([
        this.#atomicWrite(this.channelsFile, channels.filter((row) => !(row.ownerId === ownerId && row.id === id))),
        this.#atomicWrite(this.ideasFile, ideas.filter((row) => !(row.ownerId === ownerId && row.channelId === id))),
        this.#atomicWrite(this.performanceFile, performance.filter((row) => !(row.ownerId === ownerId && row.channelId === id))),
      ]);
      return found;
    });
  }

  async claimSchedule(ownerId, id, at = new Date()) {
    const minute = Math.floor(at.getTime() / 60_000);
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT data FROM channels WHERE owner_id=$1 AND id=$2 FOR UPDATE', [ownerId, id]);
        if (!rows[0]) { await client.query('ROLLBACK'); return null; }
        const channel = ChannelProfileSchema.parse(rows[0].data);
        const previous = channel.automation.lastScheduledAt ? Math.floor(new Date(channel.automation.lastScheduledAt).getTime() / 60_000) : -1;
        if (previous >= minute) { await client.query('ROLLBACK'); return null; }
        channel.automation.lastScheduledAt = at.toISOString(); channel.automation.lastError = null; channel.updatedAt = at.toISOString();
        await client.query('UPDATE channels SET data=$3,updated_at=$4 WHERE owner_id=$1 AND id=$2', [ownerId, id, channel, channel.updatedAt]);
        await client.query('COMMIT'); return channel;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    }
    return this.#write(async () => {
      const rows = await this.#read(this.channelsFile);
      const index = rows.findIndex((row) => row.ownerId === ownerId && row.id === id);
      if (index < 0) return null;
      const channel = ChannelProfileSchema.parse(rows[index].data);
      const previous = channel.automation.lastScheduledAt ? Math.floor(new Date(channel.automation.lastScheduledAt).getTime() / 60_000) : -1;
      if (previous >= minute) return null;
      channel.automation.lastScheduledAt = at.toISOString(); channel.automation.lastError = null; channel.updatedAt = at.toISOString();
      rows[index] = { ownerId, id, data: clone(channel) };
      await this.#atomicWrite(this.channelsFile, rows); return channel;
    });
  }

  async listIdeas(ownerId, channelId) {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM channel_ideas WHERE owner_id=$1 AND channel_id=$2 ORDER BY updated_at DESC', [ownerId, channelId]);
      return rows.map(({ data }) => ChannelVideoIdeaSchema.parse(data));
    }
    return (await this.#read(this.ideasFile)).filter((row) => row.ownerId === ownerId && row.channelId === channelId)
      .map((row) => ChannelVideoIdeaSchema.parse(row.data)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getIdea(ownerId, id) {
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM channel_ideas WHERE owner_id=$1 AND id=$2', [ownerId, id]);
      return rows[0] ? ChannelVideoIdeaSchema.parse(rows[0].data) : null;
    }
    const row = (await this.#read(this.ideasFile)).find((item) => item.ownerId === ownerId && item.id === id);
    return row ? ChannelVideoIdeaSchema.parse(row.data) : null;
  }

  async putIdea(ownerId, value) {
    const idea = ChannelVideoIdeaSchema.parse(value);
    if (this.pool) {
      await this.pool.query(`INSERT INTO channel_ideas(owner_id,id,channel_id,data,updated_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(owner_id,id) DO UPDATE SET channel_id=EXCLUDED.channel_id,data=EXCLUDED.data,updated_at=EXCLUDED.updated_at`,
      [ownerId, idea.id, idea.channelId, idea, idea.updatedAt]);
      return idea;
    }
    return this.#write(async () => {
      const rows = await this.#read(this.ideasFile);
      const next = rows.filter((row) => !(row.ownerId === ownerId && row.id === idea.id));
      next.push({ ownerId, id: idea.id, channelId: idea.channelId, data: clone(idea) });
      await this.#atomicWrite(this.ideasFile, next);
      return idea;
    });
  }

  async listPerformance(ownerId, channelId, { limit = 100 } = {}) {
    const bounded = Math.max(1, Math.min(500, Number(limit) || 100));
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM channel_performance WHERE owner_id=$1 AND channel_id=$2 ORDER BY captured_at DESC LIMIT $3', [ownerId, channelId, bounded]);
      return rows.map(({ data }) => ChannelPerformanceSnapshotSchema.parse(data));
    }
    return (await this.#read(this.performanceFile)).filter((row) => row.ownerId === ownerId && row.channelId === channelId)
      .map((row) => ChannelPerformanceSnapshotSchema.parse(row.data)).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, bounded);
  }

  async putPerformance(ownerId, value) {
    const snapshot = ChannelPerformanceSnapshotSchema.parse(value);
    if (this.pool) {
      await this.pool.query(`INSERT INTO channel_performance(owner_id,id,channel_id,data,captured_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(owner_id,id) DO UPDATE SET channel_id=EXCLUDED.channel_id,data=EXCLUDED.data,captured_at=EXCLUDED.captured_at`,
      [ownerId, snapshot.id, snapshot.channelId, snapshot, snapshot.capturedAt]);
      return snapshot;
    }
    return this.#write(async () => {
      const rows = await this.#read(this.performanceFile);
      const next = rows.filter((row) => !(row.ownerId === ownerId && row.id === snapshot.id));
      next.push({ ownerId, id: snapshot.id, channelId: snapshot.channelId, data: clone(snapshot) });
      await this.#atomicWrite(this.performanceFile, next);
      return snapshot;
    });
  }

  createId(prefix, label = '') {
    return `${prefix}-${safeId(label).slice(0, 35) || 'item'}-${crypto.randomBytes(4).toString('hex')}`;
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
