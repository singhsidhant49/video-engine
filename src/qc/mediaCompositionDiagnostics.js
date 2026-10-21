const runs = (values) => {
  const output = [];
  for (const value of values) {
    const previous = output.at(-1);
    if (previous?.value === value) previous.length += 1;
    else output.push({ value, length: 1 });
  }
  return output;
};
const distribution = (values) => values.reduce((out, value) => ({ ...out, [value]: (out[value] || 0) + 1 }), {});

export function buildMediaCompositionDiagnostics({ shots, mediaSceneSpecs, visualQualityReviews, compositionFallbacks }) {
  const mediaShots = shots.filter((shot) => shot.family === 'image' || shot.family === 'montage' || shot.mediaSceneSpecId);
  const specs = Object.values(mediaSceneSpecs);
  const quality = Object.values(visualQualityReviews).filter((review) => specs.some((spec) => spec.shotId === review.shotId));
  const warningCount = (codes) => quality.flatMap((review) => review.warnings || []).filter((warning) => codes.includes(warning.code)).length;
  return { version: 1, solvedMediaCount: mediaShots.filter((shot) => shot.renderMode === 'solved').length, legacyFallbackCount: compositionFallbacks.filter((item) => item.representation === 'media').length,
    mediaRoleDistribution: distribution(specs.map((spec) => spec.mediaRole)), layoutStrategyDistribution: distribution(specs.map((spec) => spec.strategy)), cameraDistribution: distribution(specs.map((spec) => spec.cameraIntent)), captionPositionDistribution: distribution(specs.map((spec) => spec.captionPosition)),
    subjectCollisionWarnings: warningCount(['subject_caption_collision', 'camera_subject_clipped']), cropWarnings: warningCount(['awkward_portrait_treatment', 'composition_incompatible']), cameraWarnings: warningCount(['unnecessary_camera_motion', 'synthetic_motion_over_native_video']), textSafeWarnings: warningCount(['poor_negative_space_use']),
    alternateAssetRequests: specs.map((spec) => spec.alternateAssetRequest).filter(Boolean), mediaRunLengths: runs(mediaShots.map((shot) => shot.asset?.id || shot.asset?.src || 'unknown')), cameraRunLengths: runs(specs.map((spec) => spec.cameraIntent)), layoutRunLengths: runs(specs.map((spec) => spec.strategy)), qualityVerdicts: distribution(quality.map((review) => review.strength)),
    warnings: [...(runs(specs.map((spec) => spec.strategy)).some((run) => run.length >= 3) ? ['repetitive_media_layout'] : []), ...(runs(specs.map((spec) => spec.cameraIntent)).some((run) => run.value !== 'STATIC' && run.length >= 3) ? ['repetitive_camera_run'] : [])] };
}
