import pg from 'pg';

const { Pool } = pg;

/** PostgreSQL-backed job store. Documents stay schema-flexible while indexed
 * ownership, status and idempotency fields remain efficient and enforceable. */
export class PostgresJobStore {
  constructor({ connectionString = process.env.DATABASE_URL, pool = null } = {}) {
    if (!pool && !connectionString) throw new Error('DATABASE_URL is required for the PostgreSQL job store');
    this.pool = pool || new Pool({ connectionString, max: Number(process.env.POSTGRES_POOL_SIZE || 10) });
    this.ownsPool = !pool;
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS video_jobs (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        status text NOT NULL,
        idempotency_key text,
        request_hash text NOT NULL,
        document jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_owner_idempotency_idx
        ON video_jobs(owner_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS video_jobs_owner_created_idx ON video_jobs(owner_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS video_jobs_status_idx ON video_jobs(status);
      CREATE TABLE IF NOT EXISTS video_operations (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        video_id text NOT NULL,
        status text NOT NULL,
        document jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS video_operations_video_idx ON video_operations(owner_id, video_id);
    `);
  }

  async health() {
    try {
      await this.pool.query('SELECT 1');
      return { healthy: true, type: 'postgresql' };
    } catch (error) {
      return { healthy: false, type: 'postgresql', code: error?.code || 'DATABASE_UNAVAILABLE' };
    }
  }

  async putJob(job) {
    await this.pool.query(`
      INSERT INTO video_jobs (id, owner_id, status, idempotency_key, request_hash, document, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
      ON CONFLICT (id) DO UPDATE SET owner_id=EXCLUDED.owner_id,
        status=CASE
          WHEN video_jobs.status='delete_requested' AND EXCLUDED.status<>'delete_requested' THEN video_jobs.status
          WHEN video_jobs.status='cancel_requested' AND EXCLUDED.status NOT IN ('cancelled','delete_requested') THEN video_jobs.status
          ELSE EXCLUDED.status END,
        idempotency_key=EXCLUDED.idempotency_key, request_hash=EXCLUDED.request_hash,
        document=CASE
          WHEN video_jobs.status='delete_requested' AND EXCLUDED.status<>'delete_requested' THEN video_jobs.document
          WHEN video_jobs.status='cancel_requested' AND EXCLUDED.status NOT IN ('cancelled','delete_requested') THEN video_jobs.document
          ELSE EXCLUDED.document END,
        updated_at=EXCLUDED.updated_at
    `, [job.id, job.ownerId, job.status, job.idempotencyKey || null, job.requestHash || '', JSON.stringify(job), job.createdAt || new Date().toISOString(), job.updatedAt || new Date().toISOString()]);
    return job;
  }

  /** Atomically applies idempotency and admission limits across API replicas. */
  async createJob(job, { maxQueuedJobs, maxOwnerPendingJobs } = {}) {
    const client = await this.pool.connect();
    const pending = ['queued', 'preparing', 'processing', 'cancel_requested'];
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('video-job-admission-v1'))");
      if (job.idempotencyKey) {
        const existing = await client.query(
          'SELECT document FROM video_jobs WHERE owner_id=$1 AND idempotency_key=$2 LIMIT 1 FOR UPDATE',
          [job.ownerId, job.idempotencyKey],
        );
        if (existing.rows[0]?.document) {
          await client.query('COMMIT');
          return { inserted: false, existing: existing.rows[0].document };
        }
      }
      const counts = await client.query(
        'SELECT count(*)::int AS global_pending, count(*) FILTER (WHERE owner_id=$1)::int AS owner_pending FROM video_jobs WHERE status = ANY($2::text[])',
        [job.ownerId, pending],
      );
      const { global_pending: globalPending, owner_pending: ownerPending } = counts.rows[0];
      if (globalPending >= maxQueuedJobs) {
        await client.query('ROLLBACK');
        return { inserted: false, limit: 'global' };
      }
      if (ownerPending >= maxOwnerPendingJobs) {
        await client.query('ROLLBACK');
        return { inserted: false, limit: 'owner' };
      }
      await client.query(`
        INSERT INTO video_jobs (id, owner_id, status, idempotency_key, request_hash, document, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
      `, [job.id, job.ownerId, job.status, job.idempotencyKey || null, job.requestHash, JSON.stringify(job), job.createdAt, job.updatedAt]);
      await client.query('COMMIT');
      return { inserted: true, job };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async getJob(id) {
    const result = await this.pool.query('SELECT document FROM video_jobs WHERE id=$1', [id]);
    return result.rows[0]?.document || null;
  }

  async deleteJob(id) { await this.pool.query('DELETE FROM video_jobs WHERE id=$1', [id]); }

  /** Atomically marks a video for deletion and creates its durable operation. */
  async requestDeletion(ownerId, videoId, operation) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`video-delete:${videoId}`]);
      const selected = await client.query('SELECT document FROM video_jobs WHERE id=$1 FOR UPDATE', [videoId]);
      const job = selected.rows[0]?.document || null;
      if (!job) {
        const previous = await client.query(
          'SELECT document FROM video_operations WHERE owner_id=$1 AND video_id=$2 ORDER BY created_at DESC LIMIT 1',
          [ownerId, videoId],
        );
        await client.query('COMMIT');
        return { job: null, operation: previous.rows[0]?.document || null };
      }
      if (job.ownerId !== ownerId) {
        await client.query('COMMIT');
        return { forbidden: true, job: null, operation: null };
      }
      if (job.deletionOperationId) {
        const existing = await client.query('SELECT document FROM video_operations WHERE id=$1', [job.deletionOperationId]);
        await client.query('COMMIT');
        return { job, operation: existing.rows[0]?.document || null };
      }
      job.status = 'delete_requested';
      job.stage = 'delete_requested';
      job.deletionOperationId = operation.id;
      job.updatedAt = operation.updatedAt;
      await client.query(
        'UPDATE video_jobs SET status=$2, document=$3::jsonb, updated_at=$4 WHERE id=$1',
        [videoId, job.status, JSON.stringify(job), job.updatedAt],
      );
      await client.query(`
        INSERT INTO video_operations (id, owner_id, video_id, status, document, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
      `, [operation.id, operation.ownerId, operation.videoId, operation.status, JSON.stringify(operation), operation.createdAt, operation.updatedAt]);
      await client.query('COMMIT');
      return { job, operation };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async listJobs() {
    const result = await this.pool.query('SELECT document FROM video_jobs ORDER BY created_at DESC');
    return result.rows.map((row) => row.document);
  }

  async findByIdempotency(ownerId, key) {
    if (!key) return null;
    const result = await this.pool.query('SELECT document FROM video_jobs WHERE owner_id=$1 AND idempotency_key=$2 LIMIT 1', [ownerId, key]);
    return result.rows[0]?.document || null;
  }

  async putOperation(operation) {
    await this.pool.query(`
      INSERT INTO video_operations (id, owner_id, video_id, status, document, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, document=EXCLUDED.document, updated_at=EXCLUDED.updated_at
    `, [operation.id, operation.ownerId, operation.videoId, operation.status, JSON.stringify(operation), operation.createdAt || new Date().toISOString(), operation.updatedAt || new Date().toISOString()]);
    return operation;
  }

  async getOperation(id) {
    const result = await this.pool.query('SELECT document FROM video_operations WHERE id=$1', [id]);
    return result.rows[0]?.document || null;
  }

  async listOperations() {
    const result = await this.pool.query('SELECT document FROM video_operations ORDER BY created_at DESC');
    return result.rows.map((row) => row.document);
  }

  async findDeletion(ownerId, videoId) {
    const result = await this.pool.query('SELECT document FROM video_operations WHERE owner_id=$1 AND video_id=$2 ORDER BY created_at DESC LIMIT 1', [ownerId, videoId]);
    return result.rows[0]?.document || null;
  }

  async close() { if (this.ownsPool) await this.pool.end(); }
}
