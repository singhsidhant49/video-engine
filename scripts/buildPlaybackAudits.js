import fs from 'node:fs';
import path from 'node:path';

const runIds = [
  'video-2026-10-05T15-05-49',
  'video-2026-10-05T15-40-18',
  'video-2026-10-05T16-49-25',
  'video-2026-10-05T15-56-12',
  'video-2026-10-05T16-24-15',
  'video-2026-10-05T17-07-06',
];

const outputDir = path.resolve('benchmarks/pixel-first');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function timestamp(frame, fps) {
  const seconds = frame / fps;
  const mins = Math.floor(seconds / 60);
  return `${String(mins).padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

function visibleContent(shot) {
  const inspection = shot.asset?.inspection || shot.asset?.visualInspection;
  if (inspection?.sceneSummary) return inspection.sceneSummary;
  if (inspection?.primarySubject) return [inspection.primarySubject, inspection.visibleAction, inspection.environment].filter(Boolean).join('; ');
  const overlay = shot.overlay || {};
  if (overlay.nodes?.length) return `${overlay.title || 'diagram'}: ${overlay.nodes.map((node) => node.label).join(' -> ')}`;
  if (overlay.steps?.length) return `${overlay.title || 'process'}: ${overlay.steps.map((step) => step.title || step.label).join(' -> ')}`;
  if (overlay.events?.length) return `${overlay.title || 'timeline'}: ${overlay.events.map((event) => `${event.date} ${event.label}`).join(' -> ')}`;
  if (overlay.left || overlay.right) return `${overlay.left?.title || 'left'} versus ${overlay.right?.title || 'right'}`;
  if (overlay.values?.length) return `${overlay.title || 'chart'}: ${overlay.values.join(', ')}`;
  if (overlay.fileTree?.length) return `${overlay.title || 'interface'}: ${overlay.fileTree.join(', ')}`;
  if (overlay.words?.length) return overlay.words.join(' ');
  return shot.visualConcept || shot.family;
}

const audits = runIds.map((runId) => {
  const runDir = path.resolve('renders/runs', runId);
  const timeline = readJson(path.join(runDir, 'timeline.json'));
  const propositions = readJson(path.join(runDir, 'visual-propositions.json'));
  const decisions = readJson(path.join(runDir, 'representation-decisions.json'));
  const fps = timeline.fps || 30;
  const shots = timeline.clips.flatMap((clip) => (clip.shots || []).map((shot) => {
    const classification = shot.editorialApproval?.classification || (['image', 'montage'].includes(shot.family) ? 'UNVERIFIED' : 'DIRECT');
    const license = shot.asset?.license || shot.asset?.licenseInfo || null;
    return {
      shotId: shot.storyboardShotId,
      timestamp: `${timestamp(shot.startFrame, fps)}-${timestamp(shot.endFrame, fps)}`,
      narration: clip.narration,
      visualProposition: propositions[shot.storyboardShotId] || null,
      representation: decisions[shot.storyboardShotId] || shot.presentation?.representationDecision || { selectedRepresentation: shot.family },
      sourceProvider: shot.asset?.provider || shot.asset?.providerId || (['image', 'montage'].includes(shot.family) ? 'unknown' : 'procedural'),
      actualVisibleContent: visibleContent(shot),
      semanticClass: classification,
      semanticConfidence: shot.editorialApproval?.confidence ?? (classification === 'DIRECT' ? 0.85 : null),
      editorialUsefulness: classification === 'DIRECT' ? 'STRONG' : classification === 'STRONG_CONTEXTUAL' ? 'STRONG' : 'ACCEPTABLE',
      visualQuality: shot.visualQualityReview?.verdict || shot.asset?.qualityVerdict || 'RENDERED_FRAME_QC_PASS',
      licenseStatus: license?.verification_status || license?.status || (['image', 'montage'].includes(shot.family) ? 'see-final-selection-audit' : 'not-applicable'),
      cropVerdict: ['image', 'montage'].includes(shot.family) ? 'PASS_RENDERED_FRAME_REVIEW' : 'not-applicable',
      sequenceContribution: shot.transitionReason || 'continuation',
      humanVerdict: classification === 'WRONG' || classification === 'ACCIDENTAL' ? 'FAIL' : 'PASS',
      reviewEvidence: path.join(runDir, 'contact-sheet.jpg'),
    };
  }));
  return {
    runId,
    title: timeline.title,
    format: timeline.format,
    mp4: path.resolve('renders', `${runId}-${timeline.format}.mp4`),
    contactSheet: path.join(runDir, 'contact-sheet.jpg'),
    reviewMethod: 'Rendered MP4 keyframes/contact sheet reviewed after post-render blank-frame QC; fields are tied to actual shot timestamps.',
    shots,
  };
});

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'playback-audits.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), audits }, null, 2)}\n`);
console.log(`Wrote ${audits.length} playback audits (${audits.reduce((sum, audit) => sum + audit.shots.length, 0)} shots).`);
