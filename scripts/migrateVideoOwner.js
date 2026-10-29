import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';
import { config } from '../src/config/index.js';

const ownerForKey = (key) => `acct_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
const oldKey = process.env.OLD_VIDEO_API_KEY;
const newKey = String(process.env.NEW_VIDEO_API_KEY || process.env.VIDEO_API_KEYS || '').split(',')[0].trim();

if (!newKey) {
  throw new Error('Set NEW_VIDEO_API_KEY or VIDEO_API_KEYS before running this migration');
}

const oldOwner = oldKey ? ownerForKey(oldKey) : null;
const newOwner = ownerForKey(newKey);

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
      await client.query('COMMIT');
      pgMigrated = jobs.rowCount + operations.rowCount;
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

console.log(JSON.stringify({ pgMigrated, fileJobsMigrated, ownerId: newOwner }));

