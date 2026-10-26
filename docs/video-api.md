# Video API v1

## Contract

`POST /v1/videos` accepts a prompt and optional source, output, creative, audio, subtitle, and metadata settings. It returns before generation starts. A `channel` is not required; the internal production profile is inferred when creative settings are `auto`.

Detailed production prompts are supported up to 50,000 characters. The complete HTTP JSON body remains bounded by `VIDEO_API_MAX_REQUEST_BYTES` (1 MB by default).

```json
{
  "prompt": "Explain how compound interest works",
  "sourceData": { "annualRate": "8%" },
  "output": { "durationSeconds": 120, "aspectRatio": "16:9", "resolution": "1080p" },
  "creative": {
    "contentType": "explainer",
    "tone": "clear and trustworthy",
    "audience": "general audience",
    "pacing": "balanced",
    "style": "data_driven"
  },
  "audio": { "voice": "af_bella" },
  "subtitles": { "enabled": true },
  "metadata": { "externalId": "order-123" }
}
```

Supported routes:

```text
POST   /v1/videos
GET    /v1/videos
GET    /v1/videos/:id
GET    /v1/videos/:id/result
GET    /v1/videos/:id/download
POST   /v1/videos/:id/cancel
POST   /v1/videos/:id/retry
DELETE /v1/videos/:id
GET    /v1/operations/:id
GET    /health
GET    /ready
```

Send `Authorization: Bearer <key>` on `/v1` routes. `VIDEO_API_KEYS` may contain comma-separated keys. Production startup fails closed if no key is configured. Send a stable `Idempotency-Key` on creation; reuse with the same request returns the original job, while reuse with a different request returns `409`.

All API errors use JSON, including malformed and oversized request bodies:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed",
    "details": [{ "path": ["prompt"], "message": "Too big" }]
  }
}
```

In PowerShell, `Invoke-RestMethod` places this response in the exception's `ErrorDetails.Message`. Log it from a `catch` block with `$_.ErrorDetails.Message`.

Retry keeps the same video ID and resumes from validated checkpoints. It does not create a second generation or repeat completed stages unless checkpoint validation determines that they are stale.

For local PowerShell use, monitor and download a video into `renders/downloads` with:

```powershell
.\scripts\monitorAndDownload.ps1 -VideoId "vid_example" -ApiKey "your-api-key"
```

The pipeline's canonical output is already stored directly under `renders`. The download script uses `renders/downloads` so an API download never creates an MP4 in the repository root.

## Permanent deletion

There is one deletion type. `DELETE /v1/videos/:id` returns an asynchronous operation. The output becomes unavailable, active generation is cancelled, and the worker removes the MP4, partial renders, run directory, narration, subtitles, media copies, previews, plans, timelines, QC artifacts, checkpoints, and video job record. Deletion paths are derived from server-owned IDs and manifests and are constrained to the configured renders root.

Shared caches, models, fonts, profiles, and media-bank inputs are not video-owned and are not removed. A minimal operation record remains temporarily so the caller can observe completion; it contains no prompt or generated content.

## Deployment boundary

The included store and queue are durable for one Node.js service instance. They deliberately preserve the existing CLI and `createFacelessVideo()` behavior. Before running multiple API/worker machines, replace `FileJobStore` with a transactional database, the in-process queue with a shared leased queue, and local render output with object storage. Keep the service and API interfaces unchanged.
