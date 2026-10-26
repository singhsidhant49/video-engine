# Docker production deployment

The production topology separates request handling from video generation:

```text
Browser / client -> API + dashboard -> PostgreSQL
                                |      (jobs, idempotency, operations)
                                v
                              Redis / BullMQ -> worker -> shared video volume
                                                   |
                                                   +-> Kokoro TTS
```

PostgreSQL is the durable source of truth. Redis carries generation and deletion
work. The API never renders a video itself. The API and worker share the
`video_data` volume so completed files, run artifacts, and thumbnails survive
container restarts. `DELETE /v1/videos/:id` is the only deletion contract: the
worker cancels active work, removes all files for that video, and deletes its
database record.

## First start

1. Merge the values from `.env.docker.example` into the repository `.env` file.
   Replace `VIDEO_API_KEYS` and `POSTGRES_PASSWORD` with long random secrets and
   add the provider keys used by generation. Do not commit `.env`.
2. Start the stack:

   ```powershell
   docker compose up -d --build
   docker compose ps
   docker compose logs -f api worker
   ```

3. Open `http://localhost:3000`. Enter one configured API key in the dashboard.
   The dashboard creates jobs, monitors progress, reviews results, downloads
   videos, retries failures, cancels active work, and permanently deletes videos.

4. Check runtime health:

   ```powershell
   Invoke-RestMethod http://localhost:3000/health
   Invoke-RestMethod http://localhost:3000/ready
   npm run test:docker:infra
   ```

`/health` proves the API process is alive. `/ready` succeeds only when the
database, Redis queue, and at least one worker are available.

## Operations

Scale workers on the same machine with:

```powershell
docker compose up -d --scale worker=2
```

Stop containers without deleting data:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless all job records, queues, generated
videos, and caches are intentionally being destroyed. Back up the
`videoforge_postgres_data` and `videoforge_video_data` volumes before upgrades.

Named Docker volumes are appropriate for the current single-host deployment.
Before deploying workers on multiple hosts, replace the shared video-volume
adapter with S3-compatible object storage and use signed, expiring download URLs.
PostgreSQL and Redis may then move to managed services without changing the
public video API.

## Multi-user migration

The API-key owner hash is already stored as `owner_id` on every job, so one key
cannot access another key's jobs. This supports the current private,
multiple-channel workflow. A public multi-user release should add user and
organization tables, hashed and rotatable API-key records, scopes, per-plan
quotas, request rate limiting, usage metering, audit logs, and billing. These
features sit in front of the existing owner-scoped service and do not require a
generation-pipeline rewrite.

Before an internet-facing launch, also add TLS through a reverse proxy, managed
secrets, webhook delivery, metrics and alerts, automated backups, retention
policies, provider retry policies, and sustained load, recovery, and security
testing.
