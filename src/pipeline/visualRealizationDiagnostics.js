const STRUCTURED = new Set(['stat', 'compare', 'list', 'process', 'timeline', 'chart', 'quote', 'document', 'ui', 'code', 'statement', 'chapter']);
const PHOTO = new Set(['image', 'montage']);

const rate = (values) => {
  if (values.length < 2) return 0;
  let repeats = 0;
  for (let index = 1; index < values.length; index++) if (values[index] === values[index - 1]) repeats++;
  return Number((repeats / (values.length - 1)).toFixed(3));
};

function longestRun(values, predicate) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

const distribution = (values) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));

export function buildVisualRealizationDiagnostics(timeline) {
  const clips = timeline.clips || timeline.scenes || [];
  const shots = timeline.realizedShots || clips.flatMap((clip) => clip.shots || []);
  const families = shots.map((shot) => shot.family);
  const variants = shots.map((shot) => `${shot.family}:${shot.variant}`);
  const layouts = shots.map((shot) => shot.layout || shot.presentation?.layout || `${shot.family}:${shot.variant}`);
  const moves = shots.map((shot) => shot.presentation?.cameraMove || shot.move?.type || 'static');
  const transitions = clips.map((clip) => clip.enter?.type || 'cut');
  const assetIds = shots.map((shot) => shot.asset?.src).filter(Boolean);
  const staticShots = shots.filter((shot) => (shot.presentation?.cameraMove || shot.move?.type) === 'static');
  const staticSeconds = staticShots.map((shot) => {
    const overlay = shot.overlay || {};
    const revealFrames = [overlay.at, overlay.leftAt, overlay.rightAt, overlay.highlightAt, overlay.authorAt, overlay.to,
      ...(overlay.ats || []), ...(overlay.wordAts || []), ...(overlay.stackAts || [])].filter(Number.isFinite);
    const lastReveal = revealFrames.length ? Math.min(shot.durationInFrames, Math.max(...revealFrames) + 12) : 0;
    return Math.max(0, shot.durationInFrames - lastReveal) / timeline.fps;
  });
  const mediaTypes = shots.map((shot) => PHOTO.has(shot.family) || shot.asset ? 'media' : 'procedural');
  const densities = shots.map((shot) => shot.presentation?.visualDensity || 'MEDIUM');
  const movementStates = shots.map((shot) => shot.presentation?.movementState || ((shot.presentation?.cameraMove || shot.move?.type) === 'static' ? 'STATIC' : 'SUBTLE'));

  const longHolds = shots
    .filter((shot) => (shot.durationInFrames / timeline.fps) >= 4.5)
    .map((shot) => ({
      shotId: shot.id || shot.storyboardShotId,
      family: shot.family,
      durationSec: Number((shot.durationInFrames / timeline.fps).toFixed(2)),
      cameraMove: shot.presentation?.cameraMove || shot.move?.type,
      hasMedia: Boolean(shot.asset),
    }));

  const textHeavyShots = shots
    .filter((shot) => {
      const o = shot.overlay || {};
      return (o.words?.length > 10) || (o.items?.length > 4) || (o.headline?.length > 45);
    })
    .map((shot) => ({
      shotId: shot.id || shot.storyboardShotId,
      family: shot.family,
      textLength: shot.overlay?.headline?.length || shot.overlay?.words?.length || 0,
    }));

  return {
    shotCount: shots.length,
    familyRepetitionRate: rate(families),
    variantRepetitionRate: rate(variants),
    layoutRepetitionRate: rate(layouts),
    cameraMoveRepetitionRate: rate(moves),
    assetReuseRate: assetIds.length ? Number((1 - new Set(assetIds).size / assetIds.length).toFixed(3)) : 0,
    consecutiveStructuredCount: longestRun(families, (family) => STRUCTURED.has(family)),
    consecutivePhotoCount: longestRun(families, (family) => PHOTO.has(family)),
    consecutiveFamilyRuns: {
      structured: longestRun(families, (family) => STRUCTURED.has(family)),
      photo: longestRun(families, (family) => PHOTO.has(family)),
    },
    consecutiveMotionRuns: longestRun(moves, (move) => move !== 'static'),
    averageStaticHold: Number((staticSeconds.reduce((sum, seconds) => sum + seconds, 0) / Math.max(1, staticSeconds.length)).toFixed(2)),
    longestStaticHold: Number(Math.max(0, ...staticSeconds).toFixed(2)),
    mediaVsProceduralDistribution: distribution(mediaTypes),
    proceduralVsMediaRatio: mediaTypes.filter((m) => m === 'procedural').length / Math.max(1, mediaTypes.length),
    visualDensityDistribution: distribution(densities),
    visualDensity: distribution(densities),
    movementStateDistribution: distribution(movementStates),
    familyDistribution: distribution(families),
    variantDistribution: distribution(variants),
    layoutDistribution: distribution(layouts),
    cameraDistribution: distribution(moves),
    cameraMoveDistribution: distribution(moves),
    transitionDistribution: distribution(transitions),
    captionModes: [timeline.captions?.mode || 'phrase'],
    longHolds,
    textHeavyShots,
  };
}

export function buildVisualDesignDiagnostics(timeline) {
  return buildVisualRealizationDiagnostics(timeline);
}
