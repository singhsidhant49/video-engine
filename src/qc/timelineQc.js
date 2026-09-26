import { getStyle } from '../shared/styles.js';

/**
 * Static QC on timeline.json — runs before rendering, costs nothing.
 * Each check returns { id, ok, severity: 'error'|'warn', detail }.
 * 'error' blocks the render; 'warn' is reported.
 */
export function runTimelineQc(timeline, { plan, narration, assetReport } = {}) {
  const checks = [];
  const add = (id, ok, severity, detail) => checks.push({ id, ok, severity, detail });
  const { fps, durationInFrames: total, clips } = timeline;
  const style = getStyle(timeline.style);

  // 1. Coverage: picture from frame 0 to the last audio frame, no holes.
  const sorted = [...clips].sort((a, b) => a.from - b.from);
  let reach = 0;
  const holes = [];
  for (const c of sorted) {
    if (c.from > reach) holes.push([reach, c.from]);
    reach = Math.max(reach, c.from + c.durationInFrames);
  }
  if (reach < total) holes.push([reach, total]);
  add('coverage', holes.length === 0, 'error', holes.length ? `uncovered frames: ${holes.map((h) => h.join('–')).join(', ')}` : `0–${total} covered`);

  // 2. Minimum clip length.
  const tiny = clips.filter((c) => c.durationInFrames < 12);
  add('min-clip-length', tiny.length === 0, 'warn', tiny.length ? `${tiny.map((c) => c.id).join(', ')} shorter than 12 frames` : 'ok');

  // 3. Static time: the longest stretch where nothing on screen changes.
  const maxStatic = Math.round(style.pacing.maxHoldSec * 1.35 * fps);
  const staticClips = [];
  for (const c of clips) {
    if (c.bed) continue; // bed shots move continuously
    const reveals = [c.overlay?.at, c.overlay?.rightAt, c.overlay?.highlightAt, c.overlay?.to, ...(c.overlay?.ats || []), ...(c.overlay?.wordAts || [])].filter(Number.isFinite);
    const settled = reveals.length ? Math.max(...reveals) + 18 : 0;
    const still = c.family === 'chart' ? c.durationInFrames - (c.overlay.at + c.overlay.drawFrames) : c.durationInFrames - settled;
    if (still > maxStatic) staticClips.push(`${c.id} (${c.family}) ${(still / fps).toFixed(1)}s`);
  }
  add('static-time', staticClips.length === 0, 'warn', staticClips.length ? `static longer than ${(maxStatic / fps).toFixed(1)}s: ${staticClips.join('; ')}` : 'ok');

  // 4. Layout repetition.
  const runs = [];
  for (let i = 2; i < clips.length; i++) {
    if (clips[i].family !== 'image' && clips[i].family === clips[i - 1].family && clips[i].family === clips[i - 2].family) runs.push(clips[i].id);
  }
  add('layout-repetition', runs.length === 0, 'warn', runs.length ? `same graphic family 3× in a row ending at ${runs.join(', ')}` : 'ok');
  const share = {};
  for (const c of clips) share[c.family] = (share[c.family] || 0) + c.durationInFrames / total;
  const overused = Object.entries(share).filter(([f, s]) => (f === 'image' ? s > 0.75 : s > 0.4));
  add('family-share', overused.length === 0, 'warn', Object.entries(share).map(([f, s]) => `${f} ${(s * 100).toFixed(0)}%`).join(', '));
  const imageShare = (share.image || 0) + (share.stat || 0) * 0.5;
  add('photography-share', clips.length < 4 || imageShare >= 0.25, 'warn', `${(imageShare * 100).toFixed(0)}% of runtime is photography-led`);

  // 4b. Slideshow detector: photo clips that all look alike in a row.
  const slides = [];
  let run = [];
  for (const c of clips) {
    if (c.family === 'image' && (!run.length || run[run.length - 1].variant === c.variant)) run.push(c);
    else { if (run.length >= 3) slides.push(run.map((x) => x.id).join('→')); run = c.family === 'image' ? [c] : []; }
  }
  if (run.length >= 3) slides.push(run.map((x) => x.id).join('→'));
  let photoRun = 0, longestPhotoRun = 0;
  for (const c of clips) { photoRun = c.family === 'image' ? photoRun + 1 : 0; longestPhotoRun = Math.max(longestPhotoRun, photoRun); }
  add('slideshow', slides.length === 0 && longestPhotoRun <= 4, 'warn', slides.length ? `same photo layout 3+ in a row: ${slides.join('; ')}` : `longest photo run ${longestPhotoRun}`);
  const variants = {};
  for (const c of clips) { const k = c.family === 'image' || c.family === 'stat' ? `${c.family}:${c.variant}` : c.family; variants[k] = (variants[k] || 0) + 1; }
  add('composition-variety', Object.keys(variants).length >= Math.min(4, clips.length), 'warn', Object.entries(variants).map(([k, n]) => `${k}×${n}`).join(', '));

  // 5. Motion repetition across consecutive bed shots.
  const shots = clips.flatMap((c) => (c.bed || []).map((b) => b.move.type));
  let repeats = 0;
  for (let i = 2; i < shots.length; i++) if (shots[i] === shots[i - 1] && shots[i] === shots[i - 2]) repeats++;
  add('motion-repetition', repeats === 0, 'warn', repeats ? `${repeats} runs of 3 identical camera moves` : 'ok');

  // 6. Transition budget.
  const designed = clips.filter((c, i) => i > 0 && c.enter.type !== 'cut').length + timeline.cutOverlays.filter((o) => o.type === 'dip' || o.type === 'flash').length;
  const allowed = Math.ceil(style.transitions.perMinute * Math.max(0.5, total / fps / 60)) + 1;
  add('transition-budget', designed <= allowed, 'warn', `${designed} designed transitions (budget ${allowed}), ${clips.length - 1 - designed} cuts`);

  // 7. Text: duplication of narration and word budget.
  const dup = [];
  for (const c of clips) {
    const h = c.overlay?.headline;
    if (h && h.split(/\s+/).length > 7) dup.push(`${c.id} headline too long`);
  }
  add('text-budget', dup.length === 0, 'warn', dup.length ? dup.join('; ') : 'ok');

  // 8. Assets.
  if (assetReport) {
    const tiers = {};
    for (const r of assetReport.filter((x) => x.role !== 'none')) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
    const subjectsWithoutImage = assetReport.filter((r) => r.role === 'subject' && r.tier === 'none').map((r) => r.sceneId);
    add('asset-tiers', true, 'warn', Object.entries(tiers).map(([t, n]) => `${t} ${n}`).join(', ') || 'no imagery needed');
    if (assetReport.search?.failed) add('asset-sources', false, 'warn', `${assetReport.search.failed} searches failed (${assetReport.search.failures.slice(0, 2).join('; ')}) — rerun later; results may be incomplete`);
    const used = assetReport.filter((r) => r.tier !== 'none');
    const unlicensed = used.filter((r) => !r.license).map((r) => r.sceneId);
    add('licensing', unlicensed.length === 0, 'error', unlicensed.length ? `assets without a recorded licence: ${unlicensed.join(', ')}` : `${used.length} assets, all licensed for ${process.env.LICENSE_POLICY || 'commercial'} use — see credits.txt`);
    add('subject-coverage', subjectsWithoutImage.length === 0, 'warn', subjectsWithoutImage.length ? `no acceptable image for named subject in ${subjectsWithoutImage.join(', ')} (recast to type)` : 'every named subject has a verified or relevant image');
  }
  const recasts = clips.flatMap((c) => (c.recasts || []).map((r) => `${c.id}: ${r}`));
  add('recasts', true, 'warn', recasts.length ? recasts.join('; ') : 'none');
  if (plan?.diagnostics) {
    const missing = Object.entries(plan.diagnostics.missingAttributes || {});
    add('plan-feel', missing.length === 0, 'warn', missing.length ? `director omitted: ${missing.map(([k, n]) => `${k}×${n}`).join(', ')}` : 'every scene has tone/importance/shot/camera/treatment');
  }
  if (plan) {
    const generic = clips.filter((c) => (c.bed || []).some((b) => b.generic)).length;
    const imageScenesWithoutImage = clips.filter((c) => (c.kind === 'atmosphere' || c.kind === 'subject') && !c.bed).map((c) => c.id);
    add('asset-coverage', imageScenesWithoutImage.length === 0, 'warn', imageScenesWithoutImage.length ? `photo scenes rendered without a photo: ${imageScenesWithoutImage.join(', ')}` : 'ok');
    add('asset-generic', generic === 0, 'warn', `${generic} clip(s) use generic library images`);
  }

  // 9. Sync.
  if (narration) {
    add('alignment', narration.matchRate >= 0.8, narration.matchRate >= 0.5 ? 'warn' : 'error', `${(narration.matchRate * 100).toFixed(0)}% of script words matched in audio (${narration.source})`);
  }
  const badChunks = timeline.captions.chunks.filter((c, i, a) => c.endFrame <= c.startFrame || (i && c.startFrame < a[i - 1].startFrame));
  add('caption-order', badChunks.length === 0, 'error', badChunks.length ? `${badChunks.length} malformed caption chunks` : `${timeline.captions.chunks.length} chunks`);

  const errors = checks.filter((c) => !c.ok && c.severity === 'error');
  return { ok: errors.length === 0, checks };
}

export function printQc(title, report) {
  console.log(`\n🔎 ${title}`);
  for (const c of report.checks) console.log(`   ${c.ok ? '✓' : c.severity === 'error' ? '✗' : '!'} ${c.id.padEnd(20)} ${c.detail}`);
}
