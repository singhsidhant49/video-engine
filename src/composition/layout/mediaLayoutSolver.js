import { SolvedSceneSchema } from '../../models/solvedScene.schema.js';
import { addSolvedElement, box, hierarchyFor, occupancyFrom, solveTextElement } from './solvedHelpers.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const topology = (strategy) => ({ FULL_BLEED: 'full-bleed-media', EDITORIAL_SPLIT: 'editorial-split-media', MEDIA_DOMINANT_SPLIT: 'media-dominant-split', DETAIL_FOCUS: 'detail-focus-media', IMAGE_PLUS_STAT: 'image-plus-stat', IMAGE_PLUS_CALLOUT: 'image-plus-callout', EVIDENCE_FRAME: 'evidence-frame-media', TWO_MEDIA_COMPARE: 'two-media-compare', LAYERED_MEDIA: 'layered-media', BACKGROUND_MEDIA: 'background-media', MONTAGE: 'montage-media' })[strategy];

function regionFor(strategy, ctx, index, count, textNeed = 'NONE', visualPolicy = null) {
  const { width: W, height: H } = ctx.viewport, capY = ctx.captionRegion.y;
  if (strategy === 'FULL_BLEED' || strategy === 'DETAIL_FOCUS' || strategy === 'BACKGROUND_MEDIA' || strategy === 'MONTAGE' || strategy === 'IMAGE_PLUS_STAT' || strategy === 'IMAGE_PLUS_CALLOUT') return box(0, 0, W, H);
  if (visualPolicy?.allowSplitLayout === false && strategy !== 'TWO_MEDIA_COMPARE') return box(0, 0, W, H);
  if (strategy === 'TWO_MEDIA_COMPARE') {
    const gap = ctx.spacingScale.sm;
    if (ctx.orientation === 'vertical') return box(ctx.safeArea.left, ctx.safeArea.top + index * ((capY - ctx.safeArea.top - gap) / 2 + gap), W - ctx.safeArea.left - ctx.safeArea.right, (capY - ctx.safeArea.top - gap) / 2);
    return box(ctx.safeArea.left + index * ((W - ctx.safeArea.left - ctx.safeArea.right - gap) / 2 + gap), ctx.safeArea.top, (W - ctx.safeArea.left - ctx.safeArea.right - gap) / 2, capY - ctx.safeArea.top);
  }
  if (strategy === 'LAYERED_MEDIA') {
    if (ctx.orientation === 'landscape') {
      const targetW = Math.round(H * 9 / 16);
      return box(Math.round((W - targetW) / 2), 0, targetW, H);
    }
    return visualPolicy?.allowSplitLayout === false ? box(0, 0, W, H) : box(0, 0, W, Math.round(capY * .66));
  }
  const mediaFraction = strategy === 'EVIDENCE_FRAME' ? .72 : .68;
  return ctx.orientation === 'vertical'
    ? box(0, 0, W, Math.round(capY * mediaFraction))
    : box(Math.round(W * (1 - mediaFraction)), 0, Math.round(W * mediaFraction), H);
}

function coverCrop(asset, target) {
  const sourceAspect = asset.aspectRatio || target.width / target.height;
  const targetAspect = target.width / Math.max(1, target.height);
  let width = 1, height = 1;
  if (sourceAspect > targetAspect) width = targetAspect / sourceAspect;
  else height = sourceAspect / targetAspect;
  const focal = asset.focalPoint || { x: .5, y: .5 };
  let x = clamp(focal.x - width / 2, 0, 1 - width), y = clamp(focal.y - height / 2, 0, 1 - height);
  const protectedBounds = [asset.subjectBounds, ...(asset.faceBounds || []), ...(asset.protectedRegions || [])].filter(Boolean);
  for (const subject of protectedBounds) {
    if (subject.width <= width) x = clamp(x, Math.max(0, subject.x + subject.width - width), Math.min(subject.x, 1 - width));
    if (subject.height <= height) y = clamp(y, Math.max(0, subject.y + subject.height - height), Math.min(subject.y, 1 - height));
  }
  return { x, y, width, height, objectPosition: { x: focal.x, y: focal.y } };
}

function projectRect(source, crop, target) {
  if (!source) return null;
  return box(target.x + (source.x - crop.x) / crop.width * target.width, target.y + (source.y - crop.y) / crop.height * target.height, source.width / crop.width * target.width, source.height / crop.height * target.height);
}

function unionRects(rects) {
  const valid = rects.filter(Boolean);
  if (!valid.length) return null;
  const x = Math.min(...valid.map((item) => item.x)), y = Math.min(...valid.map((item) => item.y));
  const right = Math.max(...valid.map((item) => item.x + item.width)), bottom = Math.max(...valid.map((item) => item.y + item.height));
  return box(x, y, right - x, bottom - y);
}

function textSide(spec, ctx) {
  const safe = spec.assets[0].safeTextRegions;
  if (safe.some((item) => item.includes('left'))) return 'left';
  if (safe.some((item) => item.includes('right'))) return 'right';
  return ctx.orientation === 'landscape' ? 'left' : 'bottom';
}

function captionBox(spec, ctx, subjects) {
  const base = { ...ctx.captionRegion };
  const protectedSubjects = subjects.filter(Boolean);
  const overlaps = (candidate, subject) => subject.x < candidate.x + candidate.width && subject.x + subject.width > candidate.x && subject.y < candidate.y + candidate.height && subject.y + subject.height > candidate.y;
  if (!protectedSubjects.some((subject) => overlaps(base, subject))) return base;

  // In vertical (Shorts) orientation, subtitles must ALWAYS remain horizontally centered across the safe reading band.
  // Never move subtitles to top-left, bottom-left, or split columns on mobile.
  if (ctx.orientation === 'vertical' || spec?.format === 'shorts') {
    const minSafeTop = ctx.safeArea.top + Math.round(ctx.height * 0.16);
    const lowestSubjectY = Math.min(...protectedSubjects.map((s) => s.y));
    const candidateAbove = box(base.x, Math.max(minSafeTop, lowestSubjectY - base.height - ctx.spacingScale.md), base.width, base.height);
    if (!protectedSubjects.some((subject) => overlaps(candidateAbove, subject))) {
      return candidateAbove;
    }
    const candidateStepUp = box(base.x, Math.max(minSafeTop, base.y - base.height - ctx.spacingScale.md), base.width, base.height);
    if (!protectedSubjects.some((subject) => overlaps(candidateStepUp, subject))) {
      return candidateStepUp;
    }
    return base;
  }

  // In landscape orientation:
  const sideWidth = Math.round(base.width * .46);
  const lowestSubjectY = Math.min(...protectedSubjects.map((s) => s.y));
  const candidateAboveSubject = box(base.x, Math.max(ctx.safeArea.top, lowestSubjectY - base.height - ctx.spacingScale.sm), base.width, base.height);
  const candidates = [
    candidateAboveSubject,
    box(base.x, Math.max(ctx.safeArea.top, base.y - base.height - ctx.spacingScale.sm), base.width, base.height),
    box(base.x, base.y, sideWidth, base.height),
    box(base.x + base.width - sideWidth, base.y, sideWidth, base.height),
    box(base.x, ctx.safeArea.top, sideWidth, base.height),
    box(base.x + base.width - sideWidth, ctx.safeArea.top, sideWidth, base.height),
  ];
  for (const subject of protectedSubjects) {
    const leftWidth = subject.x - base.x - ctx.spacingScale.sm;
    const rightX = subject.x + subject.width + ctx.spacingScale.sm;
    const rightWidth = base.x + base.width - rightX;
    if (leftWidth >= base.width * .3) candidates.push(box(base.x, base.y, leftWidth, base.height));
    if (rightWidth >= base.width * .3) candidates.push(box(rightX, base.y, rightWidth, base.height));
  }
  return candidates.find((candidate) => !protectedSubjects.some((subject) => overlaps(candidate, subject))) || candidates.sort((a, b) => protectedSubjects.filter((subject) => overlaps(a, subject)).length - protectedSubjects.filter((subject) => overlaps(b, subject)).length)[0];
}

export function solveMediaLayout(composition, mediaSceneSpec, ctx) {
  const elements = {}, textLayout = {}, mediaGeometry = {}, cameraPaths = {}, annotationGeometry = {};
  const source = new Map(composition.elements.map((item) => [item.id, item]));
  const rootRegion = box(0, 0, ctx.width, ctx.captionRegion.y);
  addSolvedElement(elements, source.get('media_root'), rootRegion, ctx, 0);
  mediaSceneSpec.assets.forEach((asset, index) => {
    const id = index ? `media_support_${index}` : 'media_primary';
    const target = regionFor(mediaSceneSpec.strategy, ctx, index, mediaSceneSpec.assets.length, mediaSceneSpec.textNeed, mediaSceneSpec.visualPolicy);
    const cropResult = coverCrop(asset, target);
    const solved = addSolvedElement(elements, source.get(id), target, ctx, index + 1);
    const protectedBounds = [asset.subjectBounds, ...(asset.faceBounds || []), ...(asset.protectedRegions || [])].filter(Boolean);
    const subjectSafeRegion = unionRects(protectedBounds.map((region) => projectRect(region, cropResult, target)));
    mediaGeometry[id] = { assetId: asset.assetId, src: asset.src, mediaType: asset.type, rect: target, crop: { x: cropResult.x, y: cropResult.y, width: cropResult.width, height: cropResult.height }, objectPosition: cropResult.objectPosition, scale: 1, transformOrigin: `${Math.round(cropResult.objectPosition.x * 100)}% ${Math.round(cropResult.objectPosition.y * 100)}%`, subjectSafeRegion,
      treatment: { scrim: mediaSceneSpec.textNeed !== 'NONE' ? 'subtle-gradient' : 'none', brightness: 1, contrast: 1, tintOpacity: 0, vignette: mediaSceneSpec.mediaRole === 'ATMOSPHERE' ? .12 : 0 }, sourceDimensions: asset.dimensions, nativeMotion: asset.type === 'video' && asset.motionPresent !== false, activeRange: (() => { const cut = mediaSceneSpec.montage?.cuts.find((item) => item.assetId === asset.assetId); return cut ? { startFrame: cut.startFrame, endFrame: cut.endFrame } : null; })() };
    const focus = asset.focalPoint || { x: .5, y: .5 };
    const behavior = asset.type === 'video' && asset.motionPresent !== false ? 'STATIC' : mediaSceneSpec.cameraIntent;
    const scales = behavior === 'SUBTLE_PUSH' ? [1, 1.025] : behavior === 'SUBTLE_PULL' ? [1.025, 1] : behavior === 'DETAIL_CROP' ? [1, 1.12] : [1, 1];
    const dx = behavior === 'FOCAL_PAN' ? .035 : 0;
    cameraPaths[id] = { behavior, start: { scale: scales[0], focusX: clamp(focus.x - dx, 0, 1), focusY: focus.y }, end: { scale: scales[1], focusX: clamp(focus.x + dx, 0, 1), focusY: focus.y }, rationale: behavior === 'STATIC' ? (asset.type === 'video' ? 'Preserve native video motion.' : 'The frame communicates without synthetic movement.') : `Camera behavior supports ${mediaSceneSpec.mediaRole.toLowerCase()} intent.` };
    solved.visualHierarchy = hierarchyFor(solved, target, ctx.viewport);
  });
  const primarySubject = mediaGeometry.media_primary.subjectSafeRegion;
  const side = textSide(mediaSceneSpec, ctx);
  const media = mediaGeometry.media_primary.rect;
  let textRegion;
  const isFullBleedMedia = media.x === 0 && media.y === 0 && media.width === ctx.width && media.height === ctx.height;
  if (isFullBleedMedia || ['FULL_BLEED', 'BACKGROUND_MEDIA', 'LAYERED_MEDIA', 'IMAGE_PLUS_STAT', 'IMAGE_PLUS_CALLOUT'].includes(mediaSceneSpec.strategy) || mediaSceneSpec.visualPolicy?.allowSplitLayout === false) {
    if (ctx.orientation === 'vertical') {
      textRegion = box(ctx.safeArea.left, ctx.safeArea.top + 60, ctx.width - ctx.safeArea.left - ctx.safeArea.right, Math.round(ctx.height * .32));
    } else {
      textRegion = side === 'right' ? box(Math.round(ctx.width * .55), ctx.safeArea.top, Math.round(ctx.width * .38), Math.round(ctx.height * .36)) : box(ctx.safeArea.left, ctx.safeArea.top, Math.round(ctx.width * .40), Math.round(ctx.height * .36));
    }
  } else if (ctx.orientation === 'vertical') {
    textRegion = box(ctx.safeArea.left, media.y + media.height + ctx.spacingScale.md, ctx.width - ctx.safeArea.left - ctx.safeArea.right, Math.max(80, ctx.captionRegion.y - media.y - media.height - ctx.spacingScale.lg));
  } else {
    textRegion = side === 'right' ? box(media.x + media.width + ctx.spacingScale.lg, ctx.safeArea.top, ctx.width - media.x - media.width - ctx.safeArea.right - ctx.spacingScale.lg, ctx.captionRegion.y - ctx.safeArea.top) : box(ctx.safeArea.left, ctx.safeArea.top, Math.max(100, media.x - ctx.safeArea.left - ctx.spacingScale.lg), ctx.captionRegion.y - ctx.safeArea.top);
  }
  for (const [id, maxFont, minFont] of [['media_headline', ctx.orientation === 'vertical' ? 64 : 58, ctx.typeMinimums.primary], ['media_stat', ctx.orientation === 'vertical' ? 104 : 92, ctx.typeMinimums.primary], ['media_source', 22, ctx.typeMinimums.source]]) {
    if (!source.has(id)) continue;
    const target = id === 'media_source' ? box(textRegion.x, textRegion.y + textRegion.height - 44, textRegion.width, 36) : textRegion;
    const result = solveTextElement(source.get(id), target, ctx, { maxFontSize: maxFont, minFontSize: minFont, maxLines: id === 'media_stat' ? 2 : 3, lineHeight: 1.06, zIndex: 4 });
    elements[id] = result.element; textLayout[id] = result.layout;
  }
  if (source.has('media_annotation')) {
    const target = primarySubject || media;
    const labelBox = box(target.x > ctx.width / 2 ? Math.max(ctx.safeArea.left, target.x - 330) : Math.min(ctx.width - ctx.safeArea.right - 300, target.x + target.width + 28), clamp(target.y, ctx.safeArea.top, ctx.captionRegion.y - 100), 300, 82);
    const result = solveTextElement(source.get('media_annotation'), labelBox, ctx, { maxFontSize: ctx.orientation === 'vertical' ? 30 : 25, minFontSize: ctx.typeMinimums.supporting, maxLines: 2, zIndex: 5 });
    elements.media_annotation = result.element; textLayout.media_annotation = result.layout;
    annotationGeometry.media_annotation = { ...labelBox, targetX: target.x + target.width / 2, targetY: target.y + target.height / 2 };
  }
  const cap = captionBox(mediaSceneSpec, ctx, Object.values(mediaGeometry).map((geometry) => geometry.subjectSafeRegion));
  const warnings = [];
  if (mediaSceneSpec.alternateAssetRequest) warnings.push('alternate_asset_required');
  if (primarySubject && (primarySubject.x < media.x - 1 || primarySubject.y < media.y - 1 || primarySubject.x + primarySubject.width > media.x + media.width + 1 || primarySubject.y + primarySubject.height > media.y + media.height + 1)) warnings.push('subject_crop_risk');
  const scene = { version: 1, id: `solved_${composition.shotId}_${ctx.format}`, shotId: composition.shotId, format: ctx.format, viewport: ctx.viewport, topology: topology(mediaSceneSpec.strategy), elements, connectorRoutes: [], textLayout,
    occupancy: occupancyFrom(elements, rootRegion, (item) => item.id !== 'media_root'), constraintsSatisfied: !warnings.includes('alternate_asset_required'), warnings, constraintUnsatisfied: mediaSceneSpec.alternateAssetRequest ? [{ elementId: 'media_primary', constraint: 'professional_crop', detail: 'No publishable crop exists for this format.' }] : [], repairHistory: [],
    regions: { primary: rootRegion, captions: cap, title: box(ctx.safeArea.left, ctx.safeArea.top, ctx.maximumContentWidth, 0) }, chartCoordinateSystem: null, annotationGeometry, captionBox: cap, backgroundSelection: 'charcoal',
    formatPolicy: { orientation: ctx.orientation, interactionSafeApplied: ctx.format === 'shorts', maximumConcepts: mediaSceneSpec.mediaRole === 'MONTAGE' ? 5 : 3, maximumTicks: 0 }, complexity: { level: composition.complexityBudget.level, mainTargets: composition.complexityBudget.mainTargets, supportElements: composition.complexityBudget.supportElements, relationships: composition.complexityBudget.relationships, withinBudget: true }, mediaGeometry, cameraPaths };
  return SolvedSceneSchema.parse(scene);
}
