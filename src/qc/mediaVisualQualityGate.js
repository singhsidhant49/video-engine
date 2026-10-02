const intersects = (a, b) => a && b && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function evaluateMediaVisualQuality({ solvedScene, motionPlan, mediaSceneSpec }) {
  const warnings = [];
  const primary = solvedScene.mediaGeometry.media_primary;
  const subject = primary?.subjectSafeRegion;
  const caption = solvedScene.captionBox;
  const mediaArea = primary ? primary.rect.width * primary.rect.height / (solvedScene.viewport.width * solvedScene.viewport.height) : 0;
  if (!primary) warnings.push({ code: 'tiny_media_region', severity: 'hard' });
  const minimumMediaArea = mediaSceneSpec.strategy === 'TWO_MEDIA_COMPARE' ? .16 : .24;
  if (mediaArea < minimumMediaArea) warnings.push({ code: 'tiny_media_region', severity: 'hard', ratio: mediaArea });
  if (intersects(subject, caption)) warnings.push({ code: 'subject_caption_collision', severity: 'hard' });
  if (mediaSceneSpec.textNeed === 'HEADLINE' && !solvedScene.elements.media_headline) warnings.push({ code: 'unnecessary_headline', severity: 'editorial', detail: 'Requested headline did not survive layout.' });
  if (mediaSceneSpec.textNeed === 'NONE' && solvedScene.elements.media_headline) warnings.push({ code: 'unnecessary_headline', severity: 'editorial' });
  if (mediaSceneSpec.assets[0].safeTextRegions.length && mediaSceneSpec.textNeed !== 'NONE' && mediaSceneSpec.strategy === 'FULL_BLEED' && intersects(subject, solvedScene.elements.media_headline)) warnings.push({ code: 'poor_negative_space_use', severity: 'hard' });
  if (mediaSceneSpec.assets[0].orientation === 'portrait' && solvedScene.format === 'landscape' && mediaSceneSpec.strategy === 'FULL_BLEED' && (mediaSceneSpec.assets[0].cropFitness || 0) < .7) warnings.push({ code: 'awkward_portrait_treatment', severity: 'hard' });
  if (mediaSceneSpec.assets[0].type === 'video' && mediaSceneSpec.assets[0].motionPresent !== false && mediaSceneSpec.cameraIntent !== 'STATIC') warnings.push({ code: 'unnecessary_camera_motion', severity: 'hard' });
  if (mediaSceneSpec.cameraIntent !== 'STATIC' && !motionPlan.tracks.some((track) => track.property.startsWith('camera'))) warnings.push({ code: 'unnecessary_camera_motion', severity: 'editorial', detail: 'Camera intent lacks a solved track.' });
  if (mediaSceneSpec.alternateAssetRequest) warnings.push({ code: 'composition_incompatible', severity: 'hard', assetId: mediaSceneSpec.primaryAssetId });
  if (mediaSceneSpec.strategy === 'EDITORIAL_SPLIT' && mediaArea < .42) warnings.push({ code: 'generic_split_layout', severity: 'editorial' });
  if (mediaSceneSpec.strategy === 'EVIDENCE_FRAME' && mediaSceneSpec.assets[0].evidenceStrength != null && mediaSceneSpec.assets[0].evidenceStrength < .45) warnings.push({ code: 'asset_relevance', severity: 'hard' });
  
  // Requirement 22: Reject large meaningless empty regions
  if (mediaSceneSpec.textNeed === 'NONE' && mediaArea < 0.45 && mediaSceneSpec.strategy !== 'TWO_MEDIA_COMPARE') {
    warnings.push({ code: 'meaningless_empty_region', severity: 'hard', detail: 'Large empty canvas region without supporting text or intentional composition.' });
  }

  // Requirement 23: Shorts media occupancy
  if (solvedScene.format === 'shorts' && primary && primary.rect.height < solvedScene.viewport.height * 0.58 && mediaSceneSpec.textNeed === 'NONE') {
    warnings.push({ code: 'shorts_under_occupancy', severity: 'hard', detail: 'Media occupies insufficient portion of 9:16 vertical canvas.' });
  }

  if (mediaSceneSpec.assets[0].src?.includes('unresolved') || mediaSceneSpec.assets[0].assetId?.includes('unresolved')) {
    warnings.push({ code: 'unresolved_media', severity: 'hard', detail: 'Shot media could not be resolved from providers.' });
  }

  const hard = warnings.filter((warning) => warning.severity === 'hard');
  const score = Math.max(1, Number((5 - hard.length * 1.2 - (warnings.length - hard.length) * .45).toFixed(2)));
  const publishable = hard.length === 0 && score >= 3.75;
  const repairMap = { subject_caption_collision: 'CHANGE_CAPTION_POSITION', poor_negative_space_use: 'MOVE_TEXT', awkward_portrait_treatment: 'CHANGE_LAYOUT', unnecessary_camera_motion: 'MAKE_STATIC', composition_incompatible: 'USE_ALTERNATE_ASSET', tiny_media_region: 'CHANGE_TO_FULL_BLEED', generic_split_layout: 'CHANGE_LAYOUT', asset_relevance: 'CHANGE_MEDIA_ROLE', unresolved_media: 'USE_ALTERNATE_ASSET' };
  return { version: 1, shotId: solvedScene.shotId, solvedSceneId: solvedScene.id, publishable, strength: publishable && warnings.length === 0 ? 'STRONG' : publishable ? 'ACCEPTABLE' : score >= 2.5 ? 'WEAK' : 'FAILED', averageScore: score,
    scores: { assetRelevance: hard.some((w) => ['asset_relevance', 'unresolved_media'].includes(w.code)) ? 1 : 5, cropQuality: hard.some((w) => ['composition_incompatible', 'awkward_portrait_treatment'].includes(w.code)) ? 2 : 5, subjectVisibility: intersects(subject, caption) ? 2 : 5, composition: mediaArea < .24 ? 2 : 5, hierarchy: 5, textCoexistence: hard.some((w) => w.code === 'poor_negative_space_use') ? 2 : 5, captionCoexistence: intersects(subject, caption) ? 1 : 5, cameraBehavior: warnings.some((w) => w.code === 'unnecessary_camera_motion') ? 2 : 5, motionRestraint: mediaSceneSpec.cameraIntent === 'STATIC' ? 5 : 4, transitionQuality: mediaSceneSpec.transitionIntent.entry === 'CUT' ? 5 : 4, mobileQuality: solvedScene.format === 'shorts' && solvedScene.formatPolicy.interactionSafeApplied ? 5 : 4 },
    meaningfulOccupancy: { ratio: mediaArea, bounds: primary?.rect || null }, warnings,
    repairRequest: publishable ? null : { requested: true, actions: [...new Set(warnings.map((w) => repairMap[w.code]).filter(Boolean))], requiresRecompile: true },
    alternateAssetRequest: mediaSceneSpec.alternateAssetRequest, summary: publishable ? 'Media framing, text, caption, and camera behavior are publishable.' : 'Media composition requires another solve or an alternate asset.' };
}
