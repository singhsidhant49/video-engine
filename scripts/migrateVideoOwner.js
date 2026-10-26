import crypto from 'node:crypto';
import 'dotenv/config';
import pg from 'pg';

const ownerForKey = (key) => `acct_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
const oldKey = process.env.OLD_VIDEO_API_KEY;
const newKey = String(process.env.NEW_VIDEO_API_KEY || process.env.VIDEO_API_KEYS || '').split(',')[0].trim();

if (!oldKey || !newKey) {
  throw new Error('Set OLD_VIDEO_API_KEY and NEW_VIDEO_API_KEY (or VIDEO_API_KEYS) before running this migration');
}

const oldOwner = ownerForKey(oldKey);
const newOwner = ownerForKey(newKey);
if (oldOwner === newOwner) {
  console.log('No migration required: both keys map to the same owner.');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('video-owner-key-migration-v1'))");
  const jobs = await client.query(`
    UPDATE video_jobs
    SET owner_id=$1,
        document=jsonb_set(document, '{ownerId}', to_jsonb($1::text), true),
        updated_at=now()
    WHERE owner_id=$2
  `, [newOwner, oldOwner]);
  const operations = await client.query(`
    UPDATE video_operations
    SET owner_id=$1,
        document=jsonb_set(document, '{ownerId}', to_jsonb($1::text), true),
        updated_at=now()
    WHERE owner_id=$2
  `, [newOwner, oldOwner]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ jobsMigrated: jobs.rowCount, operationsMigrated: operations.rowCount, ownerId: newOwner }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
