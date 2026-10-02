import { fitSemanticText } from './textMeasurement.js';
import { createSemanticTextVariants } from '../semanticText.js';

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const box = (x, y, width, height) => ({ x: Math.round(x), y: Math.round(y), width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) });

export function hierarchyFor(element, geometry, viewport) {
  const tier = element.importance === 'primary' ? 'PRIMARY' : element.importance === 'secondary' ? 'SECONDARY'
    : element.importance === 'supporting' ? 'SUPPORTING' : 'DECORATIVE';
  const base = { PRIMARY: 0.72, SECONDARY: 0.54, SUPPORTING: 0.34, DECORATIVE: 0.14 }[tier];
  const areaRatio = geometry && viewport ? (geometry.width * geometry.height) / (viewport.width * viewport.height) : 0;
  const contrastBoost = ['accent', 'text'].includes(element.styleTokenRefs?.color) ? 0.08 : 0;
  const positionBoost = geometry && viewport && geometry.y < viewport.height * 0.45 ? 0.04 : 0;
  return {
    tier,
    visualWeight: Number(clamp(base + Math.min(0.12, areaRatio * 0.7) + contrastBoost + positionBoost, 0, 1).toFixed(3)),
    reasons: [`importance:${element.importance}`, `role:${element.semanticRole}`, `area:${areaRatio.toFixed(3)}`, contrastBoost ? 'high-contrast' : 'neutral-contrast'],
  };
}

export function solveTextElement(element, targetBox, ctx, options = {}) {
  const variants = element.textVariants || createSemanticTextVariants(String(element.content || ''));
  const result = fitSemanticText({
    variants,
    fontFamily: String(element.styleTokenRefs.fontFamily),
    fontWeight: Number(element.styleTokenRefs.fontWeight) || 600,
    maxFontSize: options.maxFontSize,
    minFontSize: options.minFontSize || ctx.typeMinimums.supporting,
    lineHeight: options.lineHeight || 1.15,
    maxWidth: Math.max(1, targetBox.width),
    maxHeight: Math.max(1, targetBox.height),
    maxLines: options.maxLines || element.constraints.maxLines || 2,
    letterSpacing: Number(element.styleTokenRefs.letterSpacing) || 0,
  });
  const solvedElement = {
    ...element, content: result.text, ...targetBox, zIndex: options.zIndex ?? 3,
    parentId: element.constraints.parentId || null,
  };
  solvedElement.visualHierarchy = hierarchyFor(solvedElement, targetBox, ctx.viewport);
  return {
    element: solvedElement,
    layout: {
      elementId: element.id, fontFamily: String(element.styleTokenRefs.fontFamily),
      fontWeight: Number(element.styleTokenRefs.fontWeight) || 600, fontSize: result.fontSize,
      lineHeight: options.lineHeight || 1.15, lineBreaks: result.lineBreaks || [], boxWidth: Math.max(1, targetBox.width), boxHeight: Math.max(1, targetBox.height),
      measuredWidth: result.actualWidth || 0, measuredHeight: result.actualHeight || 0, metricsSource: result.metricsSource || 'unavailable',
      constraintUnsatisfied: result.constraintUnsatisfied, fitStatus: result.fitStatus,
      reductionTier: result.reductionTier || 'FULL',
    },
  };
}

export function addSolvedElement(target, element, geometry, ctx, zIndex = 1) {
  const solved = { ...element, ...geometry, zIndex, parentId: element.constraints.parentId || null };
  solved.visualHierarchy = hierarchyFor(solved, geometry, ctx.viewport);
  target[element.id] = solved;
  return solved;
}

export function occupancyFrom(elements, region, predicate = () => true) {
  const boxes = Object.values(elements).filter((element) => predicate(element) && element.width > 0 && element.height > 0);
  if (!boxes.length) return { ratio: 0, bounds: box(region.x, region.y, 0, 0) };
  const minX = Math.min(...boxes.map((item) => item.x)), minY = Math.min(...boxes.map((item) => item.y));
  const maxX = Math.max(...boxes.map((item) => item.x + item.width)), maxY = Math.max(...boxes.map((item) => item.y + item.height));
  const bounds = box(minX, minY, maxX - minX, maxY - minY);
  return { ratio: Number(((bounds.width * bounds.height) / Math.max(1, region.width * region.height)).toFixed(3)), bounds };
}

