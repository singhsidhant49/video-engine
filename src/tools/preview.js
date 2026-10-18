import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../config/index.js';
import { classifyRenderedMotion, renderedMotionThreshold } from '../qc/renderQc.js';

export const isBlankRenderedFrame = ({ mean, deviation }) => mean < 3 && deviation < 1.5;

/**
 * Render stills from a run's timeline.json at relative points of every clip
 * and tile them into <run>/preview/contact.png. Returns the contact sheet path.
 */
export async function renderContactSheet(runDir, { scale = 0.4, ats = [0.2, 0.85], cols, timeline: customTimeline, outputFilename = 'contact.png', clean = false } = {}) {
  const timeline = customTimeline || JSON.parse(await fs.readFile(path.join(runDir, 'timeline.json'), 'utf8'));
  const outDir = path.join(runDir, 'preview');
  if (clean) {
    await fs.rm(outDir, { recursive: true, force: true });
  }
  await fs.mkdir(outDir, { recursive: true });
  const prefix = outputFilename.replace(/\.png$/, '');
  for (const existing of await fs.readdir(outDir)) {
    if (existing === outputFilename || (existing.startsWith(`${prefix}_`) && existing.endsWith('.png'))) {
      await fs.rm(path.join(outDir, existing), { force: true });
    }
  }
  const serveUrl = await bundle({ entryPoint: path.join(config.rootDir, 'src/remotion/index.jsx'), publicDir: path.join(runDir, 'public'), ignoreRegisterRootWarning: true });
  const id = timeline.format === 'shorts' ? 'DynamicShorts' : 'LandscapeExplainer';
  const composition = await selectComposition({ serveUrl, id, inputProps: { timeline } });

  const files = [];
  for (const c of timeline.clips) {
    const start = c.from + c.cutAt;
    const end = c.from + c.durationInFrames - (c.exit.frames || 0);
    for (const a of ats) {
      const frame = Math.min(timeline.durationInFrames - 1, Math.round(start + (end - start) * a));
      const file = path.join(outDir, `${prefix}_${String(frame).padStart(5, '0')}_${c.id}-${c.family}-${c.variant || ''}.png`);
      await renderStill({ composition, serveUrl, inputProps: { timeline }, frame, output: file, scale });
      files.push(file);
    }
  }
  const meta = await sharp(files[0]).metadata();
  const n = cols ? Math.min(cols, files.length) : (timeline.format === 'shorts' ? Math.min(8, files.length) : Math.min(4, files.length));
  const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).toBuffer(), left: (i % n) * meta.width, top: Math.floor(i / n) * meta.height })));
  const sheet = path.join(outDir, outputFilename);
  await sharp({ create: { width: meta.width * n, height: meta.height * Math.ceil(files.length / n), channels: 3, background: '#222' } }).composite(tiles).png().toFile(sheet);
  return sheet;
}

/**
 * Generates structured contact sheet diagnostics exposing editorial usefulness per shot
 * and top rejected candidates for critical/failing shots (Sections 43, 44).
 */
export async function generateContactSheetDiagnostics(runDir, {
  timeline,
  editorialAssetJudgments = {},
  editorialUsefulnessRecords = {},
  requestReports = [],
} = {}) {
  const outDir = path.join(runDir, 'preview');
  await fs.mkdir(outDir, { recursive: true });

  const shots = timeline?.realizedShots || (timeline?.clips || []).flatMap((c) => c.shots || []);
  const shotDiagnostics = [];

  for (const shot of shots) {
    const shotId = shot.id || shot.storyboardShotId;
    const visualRole = shot.visibleNeed?.visualRole || shot.visualRole || 'CONTEXT';
    const judgment = shot.asset?.editorialJudgment || editorialAssetJudgments[shotId] || {};
    const usefulness = judgment.editorialUsefulness || {};
    const candidateRecord = Object.values(editorialUsefulnessRecords).find((r) => r.shotId === shotId) || {};

    const reqReport = requestReports.find((r) => r.storyboardShotId === shotId);
    const rejectedCandidates = (reqReport?.rejectedTopCandidates || []).slice(0, 3).map((rej) => ({
      candidateId: rej.candidateId,
      label: rej.label || '',
      semanticClass: rej.classification || 'WRONG',
      usefulnessVerdict: rej.usefulnessVerdict || 'WEAK',
      reason: (rej.gates || []).join('; ') || (rej.penalties || []).join('; ') || 'failed editorial gate',
    }));

    shotDiagnostics.push({
      shotId,
      visualRole,
      matchClass: judgment.classification || shot.asset?.matchClass || 'DIRECT',
      usefulnessVerdict: usefulness.verdict || candidateRecord.usefulnessVerdict || 'USEFUL',
      communicationValue: usefulness.communicationValue ?? candidateRecord.communicationValue ?? 0.7,
      specificity: usefulness.specificity ?? candidateRecord.specificity ?? 0.6,
      genericness: usefulness.genericness ?? candidateRecord.genericness ?? 0.1,
      distractionRisk: usefulness.distractionRisk ?? candidateRecord.distractionRisk ?? 0.05,
      viewerGain: usefulness.viewerGain || candidateRecord.viewerGain || judgment.selectionReason || 'Illustrates beat context',
      rejectedCandidates,
    });
  }

  const jsonPath = path.join(outDir, 'contact-sheet-diagnostics.json');
  await fs.writeFile(jsonPath, JSON.stringify(shotDiagnostics, null, 2));

  // Build clean visual HTML report
  const rows = shotDiagnostics.map((s) => `
    <tr style="border-bottom: 1px solid #334155;">
      <td style="padding: 8px; font-weight: bold; color: #94a3b8;">${s.shotId}</td>
      <td style="padding: 8px;"><span style="background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${s.visualRole}</span></td>
      <td style="padding: 8px;"><span style="color: ${s.matchClass === 'DIRECT' ? '#4ade80' : s.matchClass === 'CONTEXTUAL' ? '#60a5fa' : '#f59e0b'};">${s.matchClass}</span></td>
      <td style="padding: 8px; font-weight: bold; color: ${s.usefulnessVerdict === 'STRONG' || s.usefulnessVerdict === 'ESSENTIAL' ? '#4ade80' : s.usefulnessVerdict === 'USEFUL' ? '#38bdf8' : '#f87171'};">${s.usefulnessVerdict}</td>
      <td style="padding: 8px;">${(s.communicationValue * 100).toFixed(0)}%</td>
      <td style="padding: 8px;">${(s.specificity * 100).toFixed(0)}%</td>
      <td style="padding: 8px; color: ${s.genericness > 0.4 ? '#f59e0b' : '#94a3b8'};">${(s.genericness * 100).toFixed(0)}%</td>
      <td style="padding: 8px; color: ${s.distractionRisk > 0.4 ? '#f87171' : '#94a3b8'};">${(s.distractionRisk * 100).toFixed(0)}%</td>
      <td style="padding: 8px; font-size: 12px; color: #cbd5e1; max-width: 320px;">${s.viewerGain}</td>
    </tr>
  `).join('\n');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Editorial Usefulness Contact Sheet Diagnostics</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
          table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
          th { background: #0f172a; text-align: left; padding: 12px 8px; font-size: 12px; text-transform: uppercase; color: #94a3b8; }
        </style>
      </head>
      <body>
        <h2>Editorial Usefulness & Quality Gating Diagnostics</h2>
        <table>
          <thead>
            <tr>
              <th>Shot ID</th>
              <th>Visual Role</th>
              <th>Match Class</th>
              <th>Usefulness</th>
              <th>Comm. Value</th>
              <th>Specificity</th>
              <th>Genericness</th>
              <th>Distraction</th>
              <th>Viewer Gain</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `;
  const htmlPath = path.join(outDir, 'contact-sheet-diagnostics.html');
  await fs.writeFile(htmlPath, htmlContent);

  return { jsonPath, htmlPath, shotDiagnostics };
}

/** Verify the actual rendered preview frames before an expensive full render. */
export async function verifyRenderedContactFrames(runDir, { timeline, prefix = 'contact-post-repair', production = true } = {}) {
  const outDir = path.join(runDir, 'preview');
  const names = (await fs.readdir(outDir)).filter((name) => name.startsWith(`${prefix}_`) && name.endsWith('.png'));
  const frames = [];
  for (const name of names) {
    const file = path.join(outDir, name);
    const image = sharp(file);
    const stats = await image.stats();
    const channels = stats.channels || [];
    const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / Math.max(1, channels.length);
    const deviation = channels.reduce((sum, channel) => sum + channel.stdev, 0) / Math.max(1, channels.length);
    const clip = (timeline.clips || []).find((entry) => name.includes(`_${entry.id}-`));
    const asset = clip?.asset || clip?.shots?.find((shot) => shot.asset)?.asset || null;
    const failures = [];
    // A legitimately dark shot (space, night footage, a dark room) can have a
    // very low mean while still containing substantial visible detail. Treat a
    // frame as blank only when it is both dark and nearly uniform. This mirrors
    // the post-render QC rule and avoids rejecting dark editorial photography.
    if (isBlankRenderedFrame({ mean, deviation })) failures.push('blank_or_near_blank_render');
    if (asset?.unresolved || asset?.source === 'unresolved') failures.push('unresolved_asset_reached_renderer');
    if (asset?.editorialJudgment?.accepted === false) failures.push('unapproved_asset_reached_renderer');
    const { data: motionPixels } = await sharp(file)
      .resize(72, 128, { fit: 'fill' })
      .extract({ left: 0, top: 0, width: 72, height: 96 })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push({ file: path.relative(runDir, file).split(path.sep).join('/'), clipId: clip?.id || null, meanLuminance: Number(mean.toFixed(2)), pixelDeviation: Number(deviation.toFixed(2)), failures, motionPixels });
  }
  const pixelDiff = (a, b) => {
    let total = 0;
    for (let index = 0; index < a.length; index++) total += Math.abs(a[index] - b[index]);
    return total / Math.max(1, a.length);
  };
  const motionReviews = [];
  for (const clip of timeline.clips || []) {
    const samples = frames.filter((frame) => frame.clipId === clip.id);
    if (samples.length < 2) continue;
    const differences = [];
    for (let index = 1; index < samples.length; index++) differences.push(pixelDiff(samples[index - 1].motionPixels, samples[index].motionPixels));
    differences.push(pixelDiff(samples[0].motionPixels, samples.at(-1).motionPixels));
    const nativeMotion = (clip.shots || []).some((shot) => shot.asset?.type === 'video');
    const motionPlans = (clip.shots || []).map((shot) => timeline.motionPlans?.[shot.motionPlanId]).filter(Boolean);
    const expectedMotion = nativeMotion || motionPlans.some((plan) => {
      return (plan?.tracks || []).some((track) =>
        ['cameraScale', 'cameraFocusX', 'cameraFocusY', 'reveal', 'draw'].includes(track.property)
        && Math.abs(Number(track.to) - Number(track.from)) > 0.0001);
    });
    const darkestMean = Math.min(...samples.map((sample) => sample.meanLuminance));
    const threshold = renderedMotionThreshold({
      meanLuminance: darkestMean,
      tracks: motionPlans.flatMap((plan) => plan.tracks || []),
      durationInFrames: Math.max(0, ...motionPlans.map((plan) => plan.durationInFrames || 0)),
      nativeMotion,
    });
    const review = { clipId: clip.id, ...classifyRenderedMotion({ differences, expectedMotion, nativeMotion, threshold }) };
    motionReviews.push(review);
    if (review.frozen) samples.forEach((sample) => sample.failures.push('planned_motion_not_visible'));
  }
  const failures = frames.flatMap((frame) => frame.failures.map((code) => ({ frame: frame.file, clipId: frame.clipId, code })));
  if (!frames.length) failures.push({ frame: null, clipId: null, code: 'no_rendered_contact_frames' });
  const serializableFrames = frames.map(({ motionPixels, ...frame }) => frame);
  const report = { version: 2, inspectedRenderedPixels: true, frameCount: frames.length, passed: failures.length === 0, failures, motionReviews, frames: serializableFrames };
  await fs.writeFile(path.join(outDir, 'rendered-semantic-qa.json'), JSON.stringify(report, null, 2));
  if (production && !report.passed) throw new Error(`Rendered-frame semantic QA failed: ${failures.map((item) => item.code).join(', ')}`);
  return report;
}

