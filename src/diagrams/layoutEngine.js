/**
 * Milestone 13 — Format-Aware Layout Engine for Editorial Diagrams
 * 
 * Computes deterministic, collision-free geometry, anchor positions, and
 * visual density for both 16:9 Landscape and 9:16 Mobile Vertical viewports.
 */

import { DIAGRAM_GRAMMARS, NODE_IMPORTANCE } from './diagramGrammar.js';
import { createFormatLayoutContext as createCompositionFormatContext } from '../composition/layout/formatContext.js';

/**
 * Creates format context with safe zones and caption area reserved.
 */
export function createFormatLayoutContext({ width = 1920, height = 1080, format = 'landscape', safeArea = null, captionBand = 120 }) {
  const base = createCompositionFormatContext({ width, height, format, captionReserve: captionBand });
  const isVertical = base.orientation === 'vertical';
  const safe = safeArea || base.safeArea;
  const captionArea = base.captionRegion;
  const primaryVisualArea = base.primaryVisualRegion;

  return {
    ...base,
    width: base.viewport.width,
    height: base.viewport.height,
    aspectRatio: base.viewport.width / base.viewport.height,
    isVertical,
    format: isVertical ? 'vertical' : 'landscape',
    safe,
    safeArea: safe,
    captionArea,
    primaryVisualArea,
    // Mobile-first readable typography scale
    typography: {
      headline: Math.round(isVertical ? width * 0.068 : height * 0.045),
      kicker: Math.round(isVertical ? width * 0.034 : height * 0.024),
      primaryNode: Math.round(isVertical ? width * 0.056 : height * 0.038),
      secondaryNode: Math.round(isVertical ? width * 0.044 : height * 0.030),
      supportText: Math.round(isVertical ? width * 0.034 : height * 0.022),
      connectorLabel: Math.round(isVertical ? width * 0.032 : height * 0.020),
    },
  };
}

/**
 * Solves node placements, bounding boxes, and connector routes.
 * 
 * @param {Object} spec - DiagramSpec
 * @param {Object} ctx - FormatLayoutContext
 * @returns {Object} Solved layout with nodes, connectors, and coverage diagnostics
 */
export function solveDiagramLayout(spec, ctx) {
  const { grammar, nodes, edges } = spec;
  const { isVertical, primaryVisualArea } = ctx;
  const { x: areaX, y: areaY, width: areaW, height: areaH } = primaryVisualArea;

  let positionedNodes = [];
  let connectorRoutes = [];

  switch (grammar) {
    case DIAGRAM_GRAMMARS.COMPARISON:
    case DIAGRAM_GRAMMARS.RELATIONSHIP:
      positionedNodes = solveComparisonLayout(nodes, ctx, grammar);
      break;

    case DIAGRAM_GRAMMARS.CYCLE:
      positionedNodes = solveCycleLayout(nodes, ctx);
      break;

    case DIAGRAM_GRAMMARS.PIPELINE:
    case DIAGRAM_GRAMMARS.SYSTEM_ARCHITECTURE:
      positionedNodes = solvePipelineLayout(nodes, ctx, grammar);
      break;

    case DIAGRAM_GRAMMARS.NETWORK:
      positionedNodes = solveNetworkLayout(nodes, ctx);
      break;

    case DIAGRAM_GRAMMARS.HIERARCHY:
    case DIAGRAM_GRAMMARS.STACK:
    case DIAGRAM_GRAMMARS.FUNNEL:
      positionedNodes = solveHierarchyLayout(nodes, ctx, grammar);
      break;

    case DIAGRAM_GRAMMARS.CAUSE_EFFECT:
    case DIAGRAM_GRAMMARS.FLOW:
    default:
      positionedNodes = solveFlowLayout(nodes, ctx);
      break;
  }

  // Normalize node properties for universal accessibility (box, anchor, x, y, w, h, ax, ay)
  const normalizedNodes = positionedNodes.map((n) => {
    const box = n.box || { x: 0, y: 0, width: 200, height: 100 };
    const ax = n.anchor?.center?.x ?? n.anchor?.top?.x ?? n.anchor?.left?.x ?? (box.x + box.width / 2);
    const ay = n.anchor?.center?.y ?? n.anchor?.top?.y ?? n.anchor?.left?.y ?? (box.y + box.height / 2);
    return {
      ...n,
      box,
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
      ax,
      ay,
    };
  });

  // Resolve node lookup map
  const nodeMap = new Map(normalizedNodes.map((n) => [n.id, n]));

  // Compute connectors with exact anchor points
  connectorRoutes = edges.map((edge) => {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) return null;

    return computeConnectorGeometry(fromNode, toNode, edge, ctx, grammar);
  }).filter(Boolean);

  // Compute meaningful vertical occupancy
  let verticalCoverageRatio = 0;
  if (normalizedNodes.length > 0) {
    const minY = Math.min(...normalizedNodes.map((n) => n.box.y));
    const maxY = Math.max(...normalizedNodes.map((n) => n.box.y + n.box.height));
    const verticalSpan = Math.max(0, maxY - minY);
    verticalCoverageRatio = Number((verticalSpan / Math.max(1, areaH)).toFixed(3));
  }

  return {
    grammar,
    ctx,
    nodes: normalizedNodes,
    connectors: connectorRoutes,
    verticalCoverageRatio,
    isCoverageAdequate: verticalCoverageRatio >= (isVertical ? 0.45 : 0.35),
  };
}

// ─── 1. Comparison & Polar Relationship Solver ──────────────────────────────
function solveComparisonLayout(nodes, ctx, grammar) {
  const { isVertical, primaryVisualArea, typography } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const n1 = nodes[0] || { id: 'node_1', label: 'System A' };
  const n2 = nodes[1] || { id: 'node_2', label: 'System B' };

  if (isVertical) {
    // Mobile 9:16: Top vs Bottom Duel with collision / conflict center
    const blockH = Math.round(aH * 0.36);
    const blockW = aW;
    const gap = Math.round(aH * 0.14);

    return [
      {
        ...n1,
        box: { x: aX, y: aY + Math.round(aH * 0.04), width: blockW, height: blockH },
        anchor: { top: { x: aX + blockW / 2, y: aY + Math.round(aH * 0.04) }, bottom: { x: aX + blockW / 2, y: aY + Math.round(aH * 0.04) + blockH } },
        align: 'center',
        tone: 'accent',
      },
      {
        ...n2,
        box: { x: aX, y: aY + Math.round(aH * 0.04) + blockH + gap, width: blockW, height: blockH },
        anchor: { top: { x: aX + blockW / 2, y: aY + Math.round(aH * 0.04) + blockH + gap }, bottom: { x: aX + blockW / 2, y: aY + Math.round(aH * 0.04) + 2 * blockH + gap } },
        align: 'center',
        tone: 'cool',
      },
    ];
  }

  // 16:9 Landscape: Symmetrical Left vs Right with dividing rule
  const colW = Math.round(aW * 0.44);
  const gap = Math.round(aW * 0.12);
  const blockH = Math.round(aH * 0.65);
  const startY = aY + Math.round((aH - blockH) / 2);

  return [
    {
      ...n1,
      box: { x: aX, y: startY, width: colW, height: blockH },
      anchor: { right: { x: aX + colW, y: startY + blockH / 2 }, left: { x: aX, y: startY + blockH / 2 } },
      align: 'left',
      tone: 'accent',
    },
    {
      ...n2,
      box: { x: aX + colW + gap, y: startY, width: colW, height: blockH },
      anchor: { left: { x: aX + colW + gap, y: startY + blockH / 2 }, right: { x: aX + 2 * colW + gap, y: startY + blockH / 2 } },
      align: 'right',
      tone: 'cool',
    },
  ];
}

// ─── 2. Cycle Solver ────────────────────────────────────────────────────────
function solveCycleLayout(nodes, ctx) {
  const { isVertical, primaryVisualArea } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const count = Math.max(3, nodes.length);
  const centerX = aX + aW / 2;
  const centerY = aY + aH * (isVertical ? 0.48 : 0.50);

  // In vertical 9:16, use tall ellipse to optimize vertical height occupancy
  const rx = Math.round(aW * (isVertical ? 0.38 : 0.32));
  const ry = Math.round(aH * (isVertical ? 0.35 : 0.28));

  return nodes.map((node, i) => {
    // Start at top (-PI/2) and rotate clockwise
    const angle = -Math.PI / 2 + (i / count) * (2 * Math.PI);
    const cx = centerX + rx * Math.cos(angle);
    const cy = centerY + ry * Math.sin(angle);
    const nodeW = Math.round(isVertical ? aW * 0.42 : aW * 0.24);
    const nodeH = Math.round(isVertical ? aH * 0.11 : aH * 0.14);

    return {
      ...node,
      angle,
      box: {
        x: Math.round(cx - nodeW / 2),
        y: Math.round(cy - nodeH / 2),
        width: nodeW,
        height: nodeH,
      },
      anchor: {
        center: { x: Math.round(cx), y: Math.round(cy) },
        outward: {
          x: Math.round(cx + (nodeW / 2) * Math.cos(angle)),
          y: Math.round(cy + (nodeH / 2) * Math.sin(angle)),
        },
      },
    };
  });
}

// ─── 3. Pipeline & Loopback Solver ──────────────────────────────────────────
function solvePipelineLayout(nodes, ctx, grammar) {
  const { isVertical, primaryVisualArea } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const count = nodes.length;

  if (isVertical) {
    // Vertical staggered pipeline: nodes stack down, return loop ascends on right
    const nodeH = Math.round(aH * (0.68 / Math.max(count, 3)));
    const nodeW = Math.round(aW * 0.78);
    const gap = Math.round((aH * 0.76 - count * nodeH) / Math.max(1, count - 1));
    const startX = aX + Math.round(aW * 0.04);

    return nodes.map((node, i) => {
      const y = aY + Math.round(aH * 0.06) + i * (nodeH + gap);
      return {
        ...node,
        stageNumber: i + 1,
        box: { x: startX, y, width: nodeW, height: nodeH },
        anchor: {
          top: { x: startX + nodeW / 2, y },
          bottom: { x: startX + nodeW / 2, y: y + nodeH },
          right: { x: startX + nodeW, y: y + nodeH / 2 },
          left: { x: startX, y: y + nodeH / 2 },
        },
      };
    });
  }

  // Landscape 16:9 horizontal pipeline with spacious bus
  const usableW = Math.round(aW * 0.90);
  const gap = Math.round(aW * (count <= 3 ? 0.08 : 0.04));
  const nodeW = Math.round((usableW - (count - 1) * gap) / count);
  const nodeH = Math.round(aH * 0.32);
  const y = aY + Math.round((aH - nodeH) / 2);

  return nodes.map((node, i) => {
    const x = aX + Math.round(aW * 0.05) + i * (nodeW + gap);
    return {
      ...node,
      stageNumber: i + 1,
      box: { x, y, width: nodeW, height: nodeH },
      anchor: {
        left: { x, y: y + nodeH / 2 },
        right: { x: x + nodeW, y: y + nodeH / 2 },
        top: { x: x + nodeW / 2, y },
        bottom: { x: x + nodeW / 2, y: y + nodeH },
      },
    };
  });
}

// ─── 4. Flow & Causal Chain Solver ──────────────────────────────────────────
function solveFlowLayout(nodes, ctx) {
  const { isVertical, primaryVisualArea } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const count = nodes.length;

  if (isVertical) {
    const nodeH = Math.round((aH * 0.72) / count);
    const gap = Math.round((aH * 0.16) / Math.max(1, count - 1));

    return nodes.map((node, i) => {
      const y = aY + Math.round(aH * 0.04) + i * (nodeH + gap);
      return {
        ...node,
        box: { x: aX, y, width: aW, height: nodeH },
        anchor: {
          top: { x: aX + aW / 2, y },
          bottom: { x: aX + aW / 2, y: y + nodeH },
        },
      };
    });
  }

  // Landscape
  const nodeW = Math.round((aW * 0.85) / count);
  const gap = Math.round((aW * 0.15) / Math.max(1, count - 1));
  const nodeH = Math.round(aH * 0.36);
  const y = aY + Math.round((aH - nodeH) / 2);

  return nodes.map((node, i) => {
    const x = aX + i * (nodeW + gap);
    return {
      ...node,
      box: { x, y, width: nodeW, height: nodeH },
      anchor: {
        left: { x, y: y + nodeH / 2 },
        right: { x: x + nodeW, y: y + nodeH / 2 },
      },
    };
  });
}

// ─── 5. Network / Hub & Satellite Solver ────────────────────────────────────
function solveNetworkLayout(nodes, ctx) {
  const { isVertical, primaryVisualArea } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const hub = nodes[0] || { id: 'hub', label: 'Central Hub' };
  const satellites = nodes.slice(1);

  const cx = aX + aW / 2;
  const cy = aY + aH * (isVertical ? 0.44 : 0.50);
  const hubW = Math.round(isVertical ? aW * 0.48 : aW * 0.28);
  const hubH = Math.round(isVertical ? aH * 0.16 : aH * 0.22);

  const positionedHub = {
    ...hub,
    importance: NODE_IMPORTANCE.PRIMARY,
    box: { x: Math.round(cx - hubW / 2), y: Math.round(cy - hubH / 2), width: hubW, height: hubH },
    anchor: { center: { x: cx, y: cy } },
  };

  const rx = Math.round(aW * (isVertical ? 0.38 : 0.36));
  const ry = Math.round(aH * (isVertical ? 0.34 : 0.30));

  const positionedSatellites = satellites.map((sat, i) => {
    const angle = (i / Math.max(1, satellites.length)) * (2 * Math.PI) - Math.PI / 2;
    const sx = Math.round(cx + rx * Math.cos(angle));
    const sy = Math.round(cy + ry * Math.sin(angle));
    const satW = Math.round(isVertical ? aW * 0.40 : aW * 0.20);
    const satH = Math.round(isVertical ? aH * 0.10 : aH * 0.12);

    return {
      ...sat,
      box: { x: Math.round(sx - satW / 2), y: Math.round(sy - satH / 2), width: satW, height: satH },
      anchor: { center: { x: sx, y: sy } },
    };
  });

  return [positionedHub, ...positionedSatellites];
}

// ─── 6. Hierarchy / Stack / Funnel Solver ───────────────────────────────────
function solveHierarchyLayout(nodes, ctx, grammar) {
  const { isVertical, primaryVisualArea } = ctx;
  const { x: aX, y: aY, width: aW, height: aH } = primaryVisualArea;
  const count = nodes.length;
  const layerH = Math.round((aH * 0.72) / count);
  const gap = Math.round((aH * 0.12) / Math.max(1, count - 1));

  return nodes.map((node, i) => {
    // For Funnel, width tapers downwards
    const taper = grammar === DIAGRAM_GRAMMARS.FUNNEL ? 1 - (i / count) * 0.42 : 1;
    const w = Math.round((isVertical ? aW * 0.94 : aW * 0.78) * taper);
    const x = aX + Math.round((aW - w) / 2);
    const y = aY + Math.round(aH * 0.06) + i * (layerH + gap);

    return {
      ...node,
      layerIndex: i,
      box: { x, y, width: w, height: layerH },
      anchor: {
        top: { x: aX + aW / 2, y },
        bottom: { x: aX + aW / 2, y: y + layerH },
      },
    };
  });
}

// ─── 7. Connector Geometry Resolver ────────────────────────────────────────
function computeConnectorGeometry(fromNode, toNode, edge, ctx, grammar) {
  const { isVertical } = ctx;
  let p1, p2, pathData;

  if (grammar === DIAGRAM_GRAMMARS.CYCLE) {
    p1 = fromNode.anchor.center;
    p2 = toNode.anchor.center;
    // Curved arc connecting radial neighbors
    pathData = `M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2} ${(p1.y + p2.y) / 2} ${p2.x} ${p2.y}`;
  } else if (isVertical) {
    p1 = fromNode.anchor?.bottom || { x: fromNode.box.x + fromNode.box.width / 2, y: fromNode.box.y + fromNode.box.height };
    p2 = toNode.anchor?.top || { x: toNode.box.x + toNode.box.width / 2, y: toNode.box.y };
    // Check if loopback (bottom to top)
    if (p1.y > p2.y) {
      const loopX = ctx.primaryVisualArea.x + ctx.primaryVisualArea.width;
      pathData = `M ${fromNode.box.x + fromNode.box.width} ${fromNode.box.y + fromNode.box.height / 2} H ${loopX} V ${toNode.box.y + toNode.box.height / 2} H ${toNode.box.x + toNode.box.width}`;
    } else {
      pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }
  } else {
    // Landscape
    p1 = fromNode.anchor?.right || { x: fromNode.box.x + fromNode.box.width, y: fromNode.box.y + fromNode.box.height / 2 };
    p2 = toNode.anchor?.left || { x: toNode.box.x, y: toNode.box.y + toNode.box.height / 2 };
    // Check if loopback (right to left)
    if (p1.x > p2.x) {
      const loopY = ctx.primaryVisualArea.y + ctx.primaryVisualArea.height + 20;
      pathData = `M ${fromNode.box.x + fromNode.box.width / 2} ${fromNode.box.y + fromNode.box.height} V ${loopY} H ${toNode.box.x + toNode.box.width / 2} V ${toNode.box.y + toNode.box.height}`;
    } else {
      pathData = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
    }
  }

  return {
    id: edge.id,
    from: fromNode.id,
    to: toNode.id,
    label: edge.label || null,
    path: pathData,
    pathData,
    relationship: edge.relationship,
    direction: edge.direction,
    fromX: p1.x,
    fromY: p1.y,
    toX: p2.x,
    toY: p2.y,
    p1,
    p2,
  };
}
