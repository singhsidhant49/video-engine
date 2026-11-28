import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { z } from 'zod-api';
import { config } from '../config/index.js';

const { Pool } = pg;

export const THUMBNAIL_PROVIDER_CATALOG = Object.freeze({
  ideogram: {
    id: 'ideogram',
    label: 'Ideogram (Recommended for high-CTR thumbnails)',
    models: [
      { id: 'p-image-ideogram', label: 'P-Image Ideogram (Fast · Great Quality)' },
      { id: 'ideogram-4-5', label: 'Ideogram 4.5 (Highest Detail)' },
      { id: 'ideogram-4', label: 'Ideogram 4.0 (Crisp Composition)' },
      { id: 'ideogram-3', label: 'Ideogram 3.0' },
      { id: 'V_2_TURBO', label: 'Ideogram v2 Turbo' },
      { id: 'V_2', label: 'Ideogram v2' },
    ],
  },
  replicate: {
    id: 'replicate',
    label: 'FLUX (Replicate)',
    models: [
      { id: 'black-forest-labs/flux-schnell', label: 'FLUX.1 Schnell (Fast · Low Cost)' },
      { id: 'black-forest-labs/flux-dev', label: 'FLUX.1 Dev (Higher Detail)' },
    ],
  },
});

export const ThumbnailSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['ideogram', 'replicate']).default('ideogram'),
  model: z.string().trim().min(1).max(100).default('p-image-ideogram'),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  fallbackToFlux: z.boolean().default(true),
  fallbackModel: z.string().trim().min(1).max(100).default('black-forest-labs/flux-schnell'),
}).strict();

export const StudioSettingsSchema = z.object({
  thumbnail: ThumbnailSettingsSchema.default(() => ThumbnailSettingsSchema.parse({})),
  updatedAt: z.string().datetime().optional(),
}).strict();

export const StudioSettingsPatchSchema = z.object({
  thumbnail: ThumbnailSettingsSchema.partial().optional(),
}).strict();

function normalizeSettings(raw = {}) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return StudioSettingsSchema.parse({
    ...data,
    thumbnail: ThumbnailSettingsSchema.parse(data.thumbnail || {}),
  });
}

export class StudioSettingsStore {
  constructor({
    pool = null,
    connectionString = config.server.databaseUrl,
    file = path.join(config.rendersDir, 'studio_settings.json'),
  } = {}) {
    this.ownsPool = Boolean(!pool && connectionString);
    this.pool = pool || (connectionString ? new Pool({ connectionString, max: 3 }) : null);
    this.file = file;
    this.writeChain = Promise.resolve();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    if (this.pool) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS studio_settings (
          owner_id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);
    } else {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
    }
    this.initialized = true;
  }

  async get(ownerId) {
    if (!this.initialized) await this.init();
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT data FROM studio_settings WHERE owner_id=$1', [ownerId]);
      return normalizeSettings(rows[0]?.data);
    }
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return normalizeSettings(raw?.[ownerId]);
    } catch {
      return normalizeSettings({});
    }
  }

  async update(ownerId, patch) {
    if (!this.initialized) await this.init();
    const parsedPatch = StudioSettingsPatchSchema.parse(patch || {});
    const existing = await this.get(ownerId);
    const next = StudioSettingsSchema.parse({
      thumbnail: { ...existing.thumbnail, ...(parsedPatch.thumbnail || {}) },
      updatedAt: new Date().toISOString(),
    });
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO studio_settings(owner_id, data, updated_at) VALUES($1, $2::jsonb, $3)
         ON CONFLICT(owner_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at`,
        [ownerId, JSON.stringify(next), next.updatedAt],
      );
      return next;
    }
    const write = this.writeChain.then(async () => {
      let current = {};
      try {
        current = JSON.parse(await fs.readFile(this.file, 'utf8'));
      } catch {}
      current[ownerId] = next;
      const tmp = `${this.file}.tmp-${process.pid}-${Date.now()}`;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(current, null, 2));
      await fs.rename(tmp, this.file);
    });
    this.writeChain = write.catch(() => {});
    await write;
    return next;
  }

  async close() {
    if (this.ownsPool && this.pool) await this.pool.end().catch(() => {});
  }
}
