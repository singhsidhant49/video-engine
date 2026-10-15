# Video Generation Engine: Production Readiness Audit

Date: 2026-10-13

Scope: reusable prompt/data-to-video engine for multiple YouTube channels. Curated image-bank and video-bank work is intentionally excluded.

## Implemented in this audit

1. A versioned structured `VideoBrief` contract now accepts a prompt, optional source data, format, duration, style, voice, and channel profile.
2. A channel profile now carries content type, audience, editorial tone, and pacing mode without hard-coding a specific YouTube channel.
3. Content-aware production profiles distinguish documentary, investigative, explainer, educational, tutorial, meditation, audiobook, motivational, story, and Shorts pacing.
4. Shot planning now uses profile-specific minimum holds and maximum still durations instead of one global cut rhythm.
5. Meditation/audiobook edits hold imagery longer; documentary edits use cinematic pacing; explainers use balanced pacing; educational formats can be more energetic.
6. Timeline timing inherits the selected minimum hold, preventing authored shots from collapsing into fast micro-cuts around word boundaries.
7. Production QC now blocks a render when too many shots are materially shorter than the chosen profile or when a 10-second window exceeds its cut budget.
8. Structured source data is supplied to the director prompt and is included in checkpoint invalidation.
9. Audience, tone, content type, and pacing are supplied to the director prompt and persisted in run artifacts.
10. CLI and HTTP entry points accept the same structured request shape.
11. Resume safety invalidates stale stages when source data or the production profile changes.
12. The contract advertises only currently supported language/caption behavior: English narration with subtitles.

## P0: required before unattended production

### Editorial and factual integrity

1. Add claim-to-source entailment verification. A URL existing is not proof that it supports the narrated claim.
2. Add source freshness and accessibility checks before rendering.
3. Preserve source-data provenance down to individual sentences, claims, captions, and visual requests.
4. Separate fact, interpretation, allegation, prediction, and creative language in the content schema.
5. Require stricter medical, legal, financial, political, and current-events policies.
6. Detect contradictions between supplied data, generated narration, captions, and packaging text.

### Narration and audio direction

7. Insert real authored silence for meditation, breath work, body scans, dramatic stories, and audiobooks. Slower TTS alone is insufficient.
8. Add per-content-type punctuation and pause policies instead of relying entirely on TTS interpretation.
9. Add pronunciation dictionaries for names, acronyms, technical terms, dates, and foreign words.
10. Detect mispronunciations, repeated phrases, clipped phonemes, long silences, and unnatural sentence joins after synthesis.
11. Validate voice availability before an expensive run begins.
12. Add music selection by channel/content profile, with licence verification and mood/energy matching.
13. Add true audio peak, integrated loudness, speech intelligibility, and music masking checks on the final encoded MP4.

### Visual pacing and continuity

14. Add a cross-scene pacing repair pass. Current profile-aware planning prevents most fast cuts, but QC can only block—not yet merge—overactive adjacent scenes.
15. Distinguish native-motion video holds from still-image holds in every pacing rule.
16. Score whether each visual change introduces meaningful new information; suppress cuts that only swap to a similar image.
17. Add section-level rhythm arcs: faster hook, stable explanation, deliberate reveal, and slower payoff.
18. Detect subject-scale whiplash, color-temperature jumps, repeated compositions, and abrupt location changes.
19. Validate the actual visible frame throughout a shot, not only selected contact-sheet frames.
20. Add optical-flow/frozen-frame inspection for the final encoded video.
21. Add face, logo, text, watermark, and unsafe-crop checks across the full shot duration.

### Reliability and recovery

22. Classify failures as retryable, provider-specific, content-repairable, render-retryable, or terminal.
23. Add bounded automatic retries with exponential backoff and circuit breakers per external service.
24. Make every stage idempotent and verify artifact checksums before reuse.
25. Add cancellation that safely terminates TTS, downloads, bundling, and FFmpeg/Remotion child processes.
26. Add disk-space and dependency health checks before generation starts.
27. Add retention and cleanup policies for failed runs, temporary chunks, caches, previews, and final outputs.
28. Persist the exact engine version, prompt version, model, voice, dependency versions, and configuration hash for reproducibility.

### Final publishability gate

29. Require final MP4 existence, decodability, expected dimensions, duration, frame rate, audio stream, and fast-start metadata.
30. Sample the complete final render at scene boundaries and random interior frames.
31. Verify captions against final audio after encoding, including order, timing, safe areas, and reading speed.
32. Verify final narration completeness and chapter packaging against the approved plan.
33. Generate one machine-readable publishability verdict with explicit blocking reasons.
34. Require an optional human approval checkpoint for high-risk niches and first videos from a new profile.

## P1: required for a multi-channel engine

### Channel configuration

35. Store named, versioned channel profiles outside source code.
36. Add channel rules for audience, vocabulary level, hook style, narrative structure, prohibited language, CTA policy, visual rhythm, voice, captions, music, and branding.
37. Separate channel defaults from per-video overrides with a deterministic precedence order.
38. Add profile validation and migration when the schema changes.
39. Add golden reference videos and measurable acceptance ranges per channel.
40. Prevent content or configuration leakage between channels and runs.

### Content-type direction

41. Add explicit narrative structures for documentary, investigation, explainer, tutorial, listicle, biography, story, meditation, and audiobook content.
42. Make scene count, evidence density, hook duration, payoff structure, and CTA behavior profile-driven.
43. Add long-form chapter planning that does not speak chapter numbers unless requested.
44. Add supplied-script mode, supplied-outline mode, supplied-data mode, and supplied-audio mode as first-class validated inputs.
45. Add revision instructions so an application can request targeted changes without regenerating unrelated stages.

### Quality evaluation

46. Build a fixed evaluation corpus covering every supported content type, duration, format, and style.
47. Add regression metrics for relevance, cut rate, shot duration percentiles, repetition, narration completeness, subtitle timing, audio quality, and render integrity.
48. Compare new engine versions against previous outputs before deployment.
49. Add deterministic synthetic fixtures for provider outages, malformed model output, short audio, long audio, corrupt media, and render interruption.
50. Track false-positive and false-negative rates for editorial asset rejection.

## P2: scale, operations, and future application integration

51. Replace the synchronous HTTP generation request with an asynchronous job API.
52. Add create/status/events/cancel/retry/result endpoints with stable job IDs.
53. Add idempotency keys so application retries cannot create duplicate expensive jobs.
54. Add authentication, authorization, rate limits, request-size limits, and safe path handling.
55. Add a persistent queue and worker concurrency limits for TTS, downloads, render, and analysis workloads.
56. Add structured logs, stage timings, service health, token usage, render cost, failure rates, and quality metrics.
57. Add webhooks or event streams for stage progress and completion.
58. Add resource quotas by channel/application and cost ceilings per video.
59. Add containerized deployment manifests and startup health/readiness checks.
60. Add output storage abstraction so local disk can later be replaced by object storage.

## Explicitly not yet supported

1. Multilingual writing, TTS, alignment, captions, and QA.
2. Multiple speakers or dialogue direction.
3. AI-generated image/video providers in production.
4. Automatic publishing to YouTube.
5. Fully asynchronous application-facing job orchestration.

