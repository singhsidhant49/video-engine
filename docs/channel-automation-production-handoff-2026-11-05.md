# Channel automation production handoff — 2026-11-05

## Implemented

- Tenant-scoped channel profiles and idea records with PostgreSQL persistence and atomic local JSON fallback.
- Twenty-one hook formulas, mobile-title scoring, retention directives, AI brainstorming, and deterministic offline fallback.
- Manual approval, rejection, production linking, status reconciliation, and idempotent video-job creation.
- Timezone-aware five-field cron scheduling with atomic per-minute claims.
- Dashboard channel network, idea desk, approval, production, YouTube connection, publishing, and publish-time controls.
- YouTube Data API OAuth with signed expiring state, AES-256-GCM refresh-token encryption, token refresh,
  resumable MP4 upload, thumbnail upload, private-by-default uploads, and future publication times.
- Removed the unauthenticated API-secret endpoint. Dashboard credentials now use browser session storage only.

## Required operator setup

1. Deploy the Compose stack with PostgreSQL and Redis; do not use the JSON/in-process fallbacks for production.
2. Put the API behind an HTTPS reverse proxy. Keep direct port 3000 access private.
3. Configure a Google Cloud OAuth Web client with YouTube Data API v3 enabled. Register the exact HTTPS
   `YOUTUBE_REDIRECT_URI` ending in `/oauth/youtube/callback`.
4. Generate independent 32+ character values for `YOUTUBE_OAUTH_STATE_SECRET` and
   `YOUTUBE_TOKEN_ENCRYPTION_KEY`. Back up the encryption secret securely; losing it requires reconnecting channels.
5. Complete Google OAuth consent-screen verification when publishing for accounts outside the test-user list.
6. Set YouTube API quota alerts. A video upload has significant quota cost, and retries must be supervised when
   Google accepted bytes but the final response was lost.
7. Keep channel automation on manual approval until a representative set of real videos passes human editorial,
   factual, rights, and brand review.
8. Run the full production benchmark again. The checked-in 2026-10-16 benchmark failed the 95% first-pass gate
   and is not release evidence for the current code.

## Safe defaults

- Scheduling disabled.
- Approval mode `manual_approval`.
- YouTube autopublishing disabled.
- YouTube privacy `private`.
- No OAuth token or API credential is returned by channel APIs.

These defaults are intentional. Production readiness still depends on real provider credentials, infrastructure,
Google approval/quota, backup and restore drills, staging soak tests, and human acceptance of generated output.
