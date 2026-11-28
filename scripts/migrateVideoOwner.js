import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';
import { config } from '../src/config/index.js';

const ownerForCredential = (credential) => {
  const value = String(credential || '').trim();
  const separator = value.indexOf(':');
  const account = separator > 0 ? value.slice(0, separator) : '';
  return /^[a-zA-Z0-9_-]{3,64}$/.test(account)
    ? `acct_${account}`
    : `acct_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
};
const oldKey = process.env.OLD_VIDEO_API_KEY;
const newKey = String(process.env.NEW_VIDEO_API_KEY || process.env.VIDEO_API_KEYS || '').split(',')[0].trim();

if (!newKey) {
  throw new Error('Set NEW_VIDEO_API_KEY or VIDEO_API_KEYS before running this migration');
}

const oldOwner = oldKey ? ownerForCredential(oldKey) : null;
const newOwner = ownerForCredential(newKey);

let pgMigrated = 0;
if (process.env.DATABASE_URL) {
  try {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('video-owner-key-migration-v1'))");
      const whereClause = oldOwner ? 'WHERE owner_id=$2' : 'WHERE owner_id != $1';
      const params = oldOwner ? [newOwner, oldOwner] : [newOwner];
      const jobs = await client.query(`
        UPDATE video_jobs
        SET owner_id=$1,
            document=jsonb_set(document, '{ownerId}', to_jsonb($1::text), true),
            updated_at=now()
        ${whereClause}
      `, params);
      const operations = await client.query(`
        UPDATE video_operations
        SET owner_id=$1,
            document=jsonb_set(document, '{ownerId}', to_jsonb($1::text), true),
            updated_at=now()
        ${whereClause}
      `, params);
      let channelsMigrated = 0;
      const channelTable = await client.query("SELECT to_regclass('public.channels') AS channels, to_regclass('public.channel_ideas') AS ideas");
      if (channelTable.rows[0]?.channels && channelTable.rows[0]?.ideas) {
        const sourceFilter = oldOwner ? 'owner_id=$2' : 'owner_id != $1';
        await client.query(`
          INSERT INTO channels(owner_id,id,data,updated_at)
          SELECT $1,id,data,updated_at FROM channels WHERE ${sourceFilter}
          ON CONFLICT(owner_id,id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at
        `, params);
        const ideas = await client.query(`UPDATE channel_ideas SET owner_id=$1 WHERE ${sourceFilter}`, params);
        const removed = await client.query(`DELETE FROM channels WHERE ${sourceFilter}`, params);
        channelsMigrated = ideas.rowCount + removed.rowCount;
      }
      await client.query('COMMIT');
      pgMigrated = jobs.rowCount + operations.rowCount + channelsMigrated;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.warn('Postgres migration warning:', error.message);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.warn('Postgres connection failed, skipping db migration:', error.message);
  }
}

// File job store migration
let fileJobsMigrated = 0;
const jobsDir = path.join(config.rendersDir, 'api', 'jobs');
try {
  const files = await fs.readdir(jobsDir);
  for (const f of files.filter((name) => name.endsWith('.json'))) {
    const file = path.join(jobsDir, f);
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (oldOwner ? data.ownerId === oldOwner : data.ownerId !== newOwner) {
        data.ownerId = newOwner;
        await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
        fileJobsMigrated++;
      }
    } catch {}
  }
} catch {}

const operationsDir = path.join(config.rendersDir, 'api', 'operations');
try {
  const files = await fs.readdir(operationsDir);
  for (const f of files.filter((name) => name.endsWith('.json'))) {
    const file = path.join(operationsDir, f);
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (oldOwner ? data.ownerId === oldOwner : data.ownerId !== newOwner) {
        data.ownerId = newOwner;
        await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch {}
  }
} catch {}

let fileChannelsMigrated = 0;
for (const filename of ['channels.json', 'ideas.json']) {
  const file = path.join(config.channelsDir, filename);
  try {
    const rows = JSON.parse(await fs.readFile(file, 'utf8'));
    let changed = false;
    for (const row of rows) {
      if (oldOwner ? row.ownerId === oldOwner : row.ownerId !== newOwner) {
        row.ownerId = newOwner; changed = true; fileChannelsMigrated++;
      }
    }
    if (changed) await fs.writeFile(file, JSON.stringify(rows, null, 2), 'utf8');
  } catch {}
}

console.log(JSON.stringify({ pgMigrated, fileJobsMigrated, fileChannelsMigrated, ownerId: newOwner }));

