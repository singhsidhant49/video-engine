/** Canonical format geometry shared by planning, layout, captions, and Remotion. */
export const FORMAT_SAFE_AREA = Object.freeze({
  shorts: Object.freeze({ top: 0.12, bottom: 0.22, left: 0.075, right: 0.12 }),
  landscape: Object.freeze({ top: 0.09, bottom: 0.10, left: 0.07, right: 0.07 }),
});

/**
 * FormatInteractionSafeArea exposes platform-safe interaction bounds (Requirement 13).
 * Top: header/search margin
 * Bottom: player controls / comments / creator bar
 * Left: platform safe margin
 * Right: platform safe margin + Shorts interaction rail clearance
 */
export function getFormatInteractionSafeArea(format, viewport = { width: 1920, height: 1080 }) {
  const isShorts = format === 'shorts' || viewport.height > viewport.width;
  const fractions = FORMAT_SAFE_AREA[isShorts ? 'shorts' : 'landscape'];
  return {
    top: Math.round(viewport.height * fractions.top),
    bottom: Math.round(viewport.height * fractions.bottom),
    left: Math.round(viewport.width * fractions.left),
    right: Math.round(viewport.width * (isShorts ? 0.16 : fractions.right)),
  };
}

const rect = (x, y, width, height) => ({ x, y, width, height });

export function createFormatLayoutContext({
  width,
  height,
  format,
  captionsEnabled = true,
  captionReserve = null,
} = {}) {
  const orientation = format === 'shorts' || height > width ? 'vertical' : 'landscape';
  const resolvedFormat = orientation === 'vertical' ? 'shorts' : 'landscape';
  const viewport = {
    width: width || (resolvedFormat === 'shorts' ? 1080 : 1920),
    height: height || (resolvedFormat === 'shorts' ? 1920 : 1080),
  };
  const fractions = FORMAT_SAFE_AREA[resolvedFormat];
  const safeArea = {
    top: Math.round(viewport.height * fractions.top),
    bottom: Math.round(viewport.height * fractions.bottom),
    left: Math.round(viewport.width * fractions.left),
    right: Math.round(viewport.width * fractions.right),
  };
  const reserve = captionsEnabled
    ? Math.round(captionReserve ?? (resolvedFormat === 'shorts' ? viewport.height * 0.105 : viewport.height * 0.11))
    : 0;
  const contentWidth = viewport.width - safeArea.left - safeArea.right;
  const contentBottom = viewport.height - safeArea.bottom - reserve;
  const titleHeight = Math.round(resolvedFormat === 'shorts' ? viewport.height * 0.075 : viewport.height * 0.09);
  const titleGap = Math.round(resolvedFormat === 'shorts' ? 28 : 22);
  const titleRegion = rect(safeArea.left, safeArea.top, contentWidth, titleHeight);
  const primaryY = titleRegion.y + titleRegion.height + titleGap;
  const primaryVisualRegion = rect(
    safeArea.left,
    primaryY,
    contentWidth,
    Math.max(1, contentBottom - primaryY),
  );
  const captionRegion = rect(
    safeArea.left,
    viewport.height - safeArea.bottom - reserve,
    contentWidth,
    reserve,
  );
  const interactionRight = resolvedFormat === 'shorts' ? Math.round(viewport.width * 0.16) : safeArea.right;
  const interactionBottom = resolvedFormat === 'shorts' ? Math.round(viewport.height * 0.20) : safeArea.bottom;
  const interactionSafeRegion = rect(
    safeArea.left,
    safeArea.top,
    viewport.width - safeArea.left - interactionRight,
    viewport.height - safeArea.top - interactionBottom,
  );
  const baseSpacing = Math.round(Math.min(viewport.width, viewport.height) / 1080 * 8);

  return {
    format: resolvedFormat,
    orientation,
    viewport,
    width: viewport.width,
    height: viewport.height,
    aspect: viewport.width / viewport.height,
    safeArea,
    captionReserve: reserve,
    captionRegion,
    titleRegion,
    primaryVisualRegion,
    interactionSafeRegion,
    minimumTypeSize: resolvedFormat === 'shorts' ? 34 : 25,
    typeMinimums: {
      primary: resolvedFormat === 'shorts' ? 38 : 28,
      secondary: resolvedFormat === 'shorts' ? 32 : 24,
      supporting: resolvedFormat === 'shorts' ? 26 : 20,
      source: resolvedFormat === 'shorts' ? 22 : 17,
    },
    spacingScale: { xs: baseSpacing, sm: baseSpacing * 2, md: baseSpacing * 3, lg: baseSpacing * 5, xl: baseSpacing * 8 },
    maximumContentWidth: contentWidth,
  };
}
