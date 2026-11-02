# Client production handoff — 2026-10-30

## Implemented release hardening

- Removed the embedded dashboard API secret and the unauthenticated session-token endpoint.
- Bearer credentials are header-only; URL/query credentials are rejected.
- Protected readiness details in production and added per-account API rate limiting.
- Added named account credentials so key rotation does not create a new tenant identity.
- Added request-ID response headers, strict JSON errors, bounded requests, job admission limits, pagination, cancellation, retry and deletion contracts.
- Added production job deadlines, transient queue retry/backoff and live run-lock heartbeats.
- Prevented retry from force-breaking a live render lock.
- Render output is written to a partial file and atomically published after encoding completes.
- Every completed render now has a persistent SHA-256/size delivery manifest and credits artifact available from authenticated API routes.
- Disabled shared script, TTS, alignment and search caches by default in production; added scheduled cache cleanup.
- Hardened remote-media downloads against private IPv4/IPv6 targets, DNS resolution to private addresses, unsafe redirects, oversized responses and permanent circuit-breaker lockout.
- Removed production source bind mounts, required explicit secrets and an immutable Kokoro image, defaulted the API bind to localhost, and added read-only containers, dropped capabilities, resource limits and no-new-privileges.
- Chromium sandbox bypass is no longer the default.

## Visual and editorial quality changes

- Repeated adjacent stills inherit the prior camera end state instead of restarting their animation.
- Same-image ghost dissolves are replaced with continuity cuts.
- Scene-boundary transitions can use only edit handles allocated before timeline layout, preventing unbacked/late dissolves.
- Still-image camera motion is capped at four percent and vertical focal motion is rendered correctly.
- Render QC now samples edit boundaries and blocks repeated-image resets, blank boundary frames, harsh dissolve luminance jumps and unsafe video loops.
- Documentary, explainer, story and audiobook profiles now enforce stronger native-video/structured-visual mixes and shorter photo runs.
- Clients may explicitly request a clean master without burned-in subtitles.
- Script prompts now include a final editorial revision gate, source prompt-injection isolation, a larger bounded source context, causal retention rules and representation correctness.
- Story and audiobook use separate direction. Audiobook long-form planning now creates an immutable character/location/chronology bible and carries substantially more narrative context between chapters.

## Mandatory deployment actions (environment/operator owned)

These cannot be completed safely by source-code changes because they require production credentials, infrastructure and client/legal decisions:

1. Rotate every API key that was ever embedded or exposed. Configure `VIDEO_API_KEYS` as `client-name:new-random-secret` (32+ characters).
2. Set a strong unique `POSTGRES_PASSWORD` and pin `KOKORO_IMAGE` to a reviewed immutable SHA-256 digest.
3. Put the localhost-bound API behind an HTTPS reverse proxy or private authenticated gateway. Do not expose port 3000 directly to the public internet.
4. Configure encrypted PostgreSQL and volume backups, then complete and record a restore drill.
5. Confirm media/book-text rights and the client's retention/deletion policy. Keep the generated credits and delivery manifest with every delivered MP4.
6. Run the locked multi-genre production benchmark with real provider credentials, including full-length audiobook prompts, and obtain blinded human approval for relevance, continuity, motion, narration and factual accuracy.
7. Rotate provider credentials after staging certification and monitor queue depth, disk usage, provider errors and failed QC checks in the deployment platform.

## Release decision

Automated tests are necessary but not sufficient evidence of creative quality. A client release is approved only after the deployment actions above and a human-reviewed render from the exact production environment pass. Exact factual claims remain editorially sourced but require a human fact-check before client publication.

## Verification completed in this change

- Full automated suite: 364 passed, 0 failed.
- JavaScript syntax checks passed for the modified server, pipeline, renderer-support and worker modules.
- Docker Compose production configuration parsed successfully with validation-only secrets and an immutable image reference.
- A real Remotion/Chromium smoke encode produced a valid H.264, 1920×1080, 30 fps MP4; the temporary artifact was removed after probing.
- `git diff --check` passed.
