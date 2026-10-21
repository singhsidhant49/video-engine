import { EditorialVisualBeatSchema } from '../models/editorialVisualBeat.schema.js';
import { MediaShotPlanSchema } from '../models/mediaShotPlan.schema.js';

const purposeMap = {
  hook: 'HOOK', context: 'CONTEXT', evidence: 'EVIDENCE', example: 'EXAMPLE', subject: 'ENTITY', entity: 'ENTITY',
  location: 'LOCATION', action: 'ACTION', detail: 'DETAIL', contrast: 'CONTRAST', chapter: 'CHAPTER', payoff: 'PAYOFF', conclusion: 'CONCLUSION',
};
const reasonMap = {
  newIdea: 'NEW_IDEA', newEntity: 'NEW_ENTITY', newEvidence: 'NEW_EVIDENCE', newLocation: 'NEW_LOCATION', newExample: 'NEW_EXAMPLE',
  newAction: 'NEW_ACTION', detailChange: 'DETAIL_SHIFT', newDetail: 'DETAIL_SHIFT', emotionalShift: 'EMOTIONAL_SHIFT', sectionChange: 'CHAPTER_CHANGE',
  reveal: 'EMOTIONAL_SHIFT', montageProgression: 'MONTAGE_PROGRESSION', continuation: 'CONTINUATION', comparisonPivot: 'NEW_IDEA',
};

export function createEditorialVisualBeat({ shot, scene, timing, alignedWords = [], visualChangeReason }) {
  const role = String(shot.role || scene.purpose || '').toLowerCase();
  const purpose = purposeMap[role] || purposeMap[String(scene.purpose || '').toLowerCase()] || 'CONTEXT';
  const preferredMediaType = shot.asset?.type === 'video' ? 'REAL_VIDEO'
    : shot.family === 'montage' ? 'MONTAGE'
      : shot.assetIntent === 'document' ? 'DOCUMENT_IMAGE' : 'REAL_IMAGE';
  return EditorialVisualBeatSchema.parse({
    id: `beat_${shot.storyboardShotId || shot.id}`,
    shotId: shot.storyboardShotId || shot.id,
    narrationRange: { startFrame: timing.startFrame, endFrame: timing.endFrame },
    phraseIds: alignedWords.map((word, index) => String(word.phraseId || `phrase_${index}`)).filter((value, index, values) => values.indexOf(value) === index),
    editorialPurpose: purpose,
    viewerNeed: shot.evidenceRequirement === 'required' ? 'See credible visual evidence for the narrated claim.' : `See ${shot.visualConcept || scene.visualIntent || 'the narrated idea'} clearly.`,
    primaryConcept: shot.visualConcept || scene.visualIntent || scene.narration || 'Editorial context',
    entityIds: (shot.entities || scene.entity ? shot.entities || [scene.entity?.name].filter(Boolean) : []).map(String),
    visualChangeReason: reasonMap[visualChangeReason] || 'NEW_IDEA',
    preferredMediaType,
    evidenceRequirement: ['required', 'preferred'].includes(shot.evidenceRequirement) ? shot.evidenceRequirement : 'none',
    emotionalTone: scene.tone || 'neutral',
    energy: Math.max(0, Math.min(1, Number(scene.intensity || 3) / 5)),
    complexity: scene.informationDensity >= 4 ? 'HIGH' : scene.informationDensity <= 2 ? 'LOW' : 'MEDIUM',
    minimumComprehensionTime: Math.max(0.8, Math.min(timing.durationInFrames / 30, preferredMediaType === 'MONTAGE' ? 1.2 : 2.5)),
  });
}

const strategyMap = {
  FULL_BLEED: 'FULL_BLEED_MEDIA_WITH_SUBTITLE', EDITORIAL_SPLIT: 'EDITORIAL_SPLIT', MEDIA_DOMINANT_SPLIT: 'EDITORIAL_SPLIT',
  DETAIL_FOCUS: 'DETAIL_FOCUS', IMAGE_PLUS_STAT: 'MEDIA_WITH_STAT', IMAGE_PLUS_CALLOUT: 'MEDIA_WITH_CALLOUT',
  EVIDENCE_FRAME: 'FULL_BLEED_MEDIA_WITH_SUBTITLE', TWO_MEDIA_COMPARE: 'TWO_MEDIA_COMPARE', LAYERED_MEDIA: 'EDITORIAL_SPLIT',
  BACKGROUND_MEDIA: 'FULL_BLEED_MEDIA_WITH_SUBTITLE', MONTAGE: 'MONTAGE',
};
const cameraReason = { SUBTLE_PUSH: 'increaseFocus', SUBTLE_PULL: 'emotionalEmphasis', SLOW_PAN: 'followSubject', FOCAL_PAN: 'followSubject', DETAIL_CROP: 'moveToDetail', REFRAME: 'reframeForText' };

export function createMediaShotPlan({ beat, mediaSceneSpec, solvedScene, shot, rejectedAlternatives = [], visualQuality = null }) {
  const geometry = solvedScene.mediaGeometry.media_primary;
  const camera = solvedScene.cameraPaths.media_primary;
  const transitionAnchor = mediaSceneSpec.transitionIntent.anchor || shot.transitionAnchor || null;
  const reason = beat.visualChangeReason;
  const transition = (type) => ({ type, durationInFrames: type === 'CUT' ? 0 : 8, reason, anchor: transitionAnchor });
  const textElement = solvedScene.elements.media_stat || solvedScene.elements.media_headline || solvedScene.elements.media_source || null;
  const annotation = solvedScene.annotationGeometry.media_annotation || null;
  return MediaShotPlanSchema.parse({
    version: 1,
    shotId: beat.shotId,
    editorialBeatId: beat.id,
    editorialPurpose: beat.editorialPurpose,
    assetId: geometry.assetId,
    assetType: geometry.mediaType === 'video' ? 'VIDEO' : 'IMAGE',
    mediaRole: mediaSceneSpec.mediaRole === 'MONTAGE' ? 'MONTAGE_ITEM' : mediaSceneSpec.mediaRole === 'COMPARISON' ? 'CONTEXT' : mediaSceneSpec.mediaRole,
    startFrame: shot.startFrame,
    durationInFrames: shot.durationInFrames,
    compositionStrategy: beat.editorialPurpose === 'CHAPTER' ? 'CHAPTER_HEADING' : strategyMap[mediaSceneSpec.strategy] || 'FULL_BLEED_MEDIA_WITH_SUBTITLE',
    cropPlan: { crop: geometry.crop, objectPosition: geometry.objectPosition, subjectSafeRegion: geometry.subjectSafeRegion || null },
    cameraPlan: { mode: camera.behavior === 'MATCH_MOVE' ? 'REFRAME' : camera.behavior, reason: camera.behavior === 'STATIC' ? null : cameraReason[camera.behavior] || 'increaseFocus', start: camera.start, end: camera.end },
    textOverlayPlan: textElement ? { elementId: textElement.id, geometry: { x: textElement.x, y: textElement.y, width: textElement.width, height: textElement.height }, purpose: mediaSceneSpec.textNeed } : null,
    subtitlePlan: { position: mediaSceneSpec.captionPosition, geometry: solvedScene.captionBox, animation: 'DIRECT_REPLACE', maximumLines: 2 },
    annotationPlan: annotation ? { type: mediaSceneSpec.annotationNeed, geometry: annotation } : null,
    transitionIn: transition(mediaSceneSpec.transitionIntent.entry === 'MATCH_MOVE' ? 'MATCH_CUT' : mediaSceneSpec.transitionIntent.entry),
    transitionOut: transition(mediaSceneSpec.transitionIntent.exit === 'MATCH_MOVE' ? 'MATCH_CUT' : mediaSceneSpec.transitionIntent.exit),
    visualChangeReason: reason,
    transitionAnchor,
    qualityTier: mediaSceneSpec.assets[0].qualityTier,
    minimumReadFrames: textElement ? Math.max(24, Math.min(90, String(textElement.content || '').split(/\s+/).length * 9)) : 0,
    minimumFinalHoldFrames: 8,
    rejectedAlternatives,
    qualityVerdict: visualQuality?.strength || 'ACCEPTABLE',
    repairHistory: (solvedScene.repairHistory || []).map((item) => ({ action: String(item.action || 'UNKNOWN'), reason: String(item.reason || item.detail || 'bounded composition repair') })),
  });
}
