import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { useTheme } from './theme.js';
import { evaluateMotionValue } from '../../composition/motion/motionChoreographer.js';

const tokenColor = (token, palette) => ({
  accent: palette.accent,
  text: palette.text,
  muted: palette.muted,
  surface: palette.surface || palette.bg2 || palette.bg,
  bgRaised: palette.surface || palette.bg2 || palette.bg,
  line: palette.line,
  background: palette.bg,
}[token] || token || palette.text);

function stateFor(element, motionPlan, frame) {
  const parent = element.parentId || element.id;
  const owns = (property) => motionPlan.tracks.some((track) => track.targetId === element.id && track.property === property);
  const emphasisTarget = owns('emphasis') ? element.id : parent;
  const highlightTarget = owns('highlight') ? element.id : parent;
  return {
    emphasis: evaluateMotionValue(motionPlan, emphasisTarget, 'emphasis', frame),
    opacity: evaluateMotionValue(motionPlan, element.id, 'opacity', frame),
    highlight: evaluateMotionValue(motionPlan, highlightTarget, 'highlight', frame),
    draw: evaluateMotionValue(motionPlan, parent, 'draw', frame),
    reveal: evaluateMotionValue(motionPlan, parent, 'reveal', frame),
    scale: evaluateMotionValue(motionPlan, owns('scale') ? element.id : parent, 'scale', frame) || 1,
    translateX: evaluateMotionValue(motionPlan, owns('translateX') ? element.id : parent, 'translateX', frame),
    translateY: evaluateMotionValue(motionPlan, owns('translateY') ? element.id : parent, 'translateY', frame),
  };
}

const motionTransform = (state, emphasisScale = 0) => `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale + emphasisScale})`;

function ShapePrimitive({ element, motionPlan, frame, palette }) {
  const state = stateFor(element, motionPlan, frame);
  const emphasized = Math.max(0, Math.min(1, state.emphasis));
  if (element.semanticRole === 'comparison-divider') {
    const horizontal = element.width >= element.height;
    return <div style={{ position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: horizontal ? '100%' : 2, height: horizontal ? 2 : '100%', background: palette.line }} />
      <div style={{ position: 'absolute', fontFamily: 'sans-serif', fontWeight: 800, fontSize: 18, color: palette.accent, background: palette.bg, padding: '4px 8px' }}>{element.content?.shape === 'arrow' ? '→' : 'VS'}</div>
    </div>;
  }
  if (element.semanticRole === 'comparison-field') {
    return <div style={{
      position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height,
      boxSizing: 'border-box', background: `linear-gradient(180deg, ${palette.text}05, transparent)`,
      borderTop: `3px solid color-mix(in srgb, ${palette.accent} ${Math.round(emphasized * 90)}%, ${palette.line})`,
      opacity: state.opacity, transform: motionTransform(state), transformOrigin: 'center',
    }} />;
  }
  return <div style={{
    position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height,
    zIndex: element.zIndex,
    boxSizing: 'border-box', borderRadius: Math.min(28, element.height * 0.14),
    background: `linear-gradient(145deg, ${tokenColor('surface', palette)}, ${palette.bg})`,
    border: `${Math.max(2, Math.round(2 + emphasized * 2))}px solid color-mix(in srgb, ${palette.accent} ${Math.round(emphasized * 100)}%, ${palette.line})`,
    boxShadow: `0 ${8 + emphasized * 8}px ${24 + emphasized * 20}px rgba(0,0,0,${0.18 + emphasized * 0.12}), 0 0 ${Math.round(emphasized * 18)}px color-mix(in srgb, ${palette.accent} ${Math.round(emphasized * 20)}%, transparent)`,
    opacity: state.opacity, transform: motionTransform(state, -0.015 + emphasized * 0.015), transformOrigin: 'center',
  }} />;
}

function TextPrimitive({ element, layout, motionPlan, frame, palette }) {
  const state = stateFor(element, motionPlan, frame);
  const align = element.styleTokenRefs.textAlign || (['comparison-label', 'comparison-description', 'comparison-dimension'].includes(element.semanticRole) ? 'left' : 'center');
  const highlight = Math.max(0, Math.min(1, state.highlight));
  return <div style={{
    position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height,
    zIndex: element.zIndex,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start',
    fontFamily: layout.fontFamily, fontWeight: layout.fontWeight, fontSize: layout.fontSize,
    lineHeight: layout.lineHeight, color: tokenColor(element.styleTokenRefs.color || 'text', palette),
    textAlign: align, opacity: state.opacity, letterSpacing: element.styleTokenRefs.letterSpacing || 0,
    textTransform: element.styleTokenRefs.uppercase ? 'uppercase' : 'none',
    textShadow: '0 2px 14px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.95)',
    transform: motionTransform(state, -0.01 + Math.max(0, state.emphasis) * 0.01 + highlight * 0.01), transformOrigin: 'center',
    borderLeft: element.kind === 'annotation' && element.styleTokenRefs.accentRule ? `4px solid ${palette.accent}` : undefined,
    paddingLeft: element.kind === 'annotation' && element.styleTokenRefs.accentRule ? 18 : undefined,
  }}>
    {layout.lineBreaks.map((line, index) => <div key={index} style={{ whiteSpace: 'pre', flex: '0 0 auto' }}>{line}</div>)}
  </div>;
}

function AxisPrimitive({ element, motionPlan, frame, palette, viewport }) {
  const state = stateFor(element, motionPlan, frame);
  const axis = element.content;
  const plot = axis.plot;
  const isX = axis.axis === 'x';
  const categoricalY = !isX && axis.scaleType === 'categorical';
  return <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} style={{ position: 'absolute', inset: 0, width: viewport.width, height: viewport.height, overflow: 'visible', opacity: state.opacity, transform: motionTransform(state), transformOrigin: 'center' }}>
    {isX
      ? <line x1={plot.x} y1={axis.baseline} x2={plot.x + plot.width} y2={axis.baseline} stroke={palette.line} strokeWidth="2" />
      : <line x1={categoricalY ? axis.baseline : plot.x} y1={plot.y} x2={categoricalY ? axis.baseline : plot.x} y2={plot.y + plot.height} stroke={palette.line} strokeWidth="2" />}
    {axis.ticks.map((tick, index) => isX ? <g key={index}>
      <line x1={tick.position} y1={axis.baseline} x2={tick.position} y2={axis.baseline + 8} stroke={palette.line} strokeWidth="2" />
      <text x={tick.position} y={plot.y + plot.height + axis.fontSize * 1.35} textAnchor="middle" fill={palette.muted} fontFamily={axis.fontFamily} fontSize={axis.fontSize}>{tick.label}</text>
    </g> : <g key={index}>
      <line x1={plot.x - 7} y1={tick.position} x2={categoricalY ? plot.x + 3 : plot.x + plot.width} y2={tick.position} stroke={palette.line} strokeWidth={categoricalY || index === 0 ? 2 : 1} opacity={categoricalY ? 0.75 : index === 0 ? 0.8 : 0.28} />
      <text x={plot.x - 13} y={tick.position + axis.fontSize * 0.34} textAnchor="end" fill={palette.muted} fontFamily={axis.fontFamily} fontSize={axis.fontSize}>{tick.label}</text>
    </g>)}
  </svg>;
}

function ChartMarkPrimitive({ element, motionPlan, frame, palette, viewport }) {
  const state = stateFor(element, motionPlan, frame);
  const reveal = Math.max(0, Math.min(1, state.reveal));
  const draw = Math.max(0, Math.min(1, state.draw));
  const emphasis = Math.max(0.45, Math.min(1, state.emphasis));
  const type = element.content?.geometryType || String(element.content?.chartType || '').toLowerCase();
  const markColor = element.importance === 'primary' || !element.content?.seriesIndex ? palette.accent : palette.muted;
  if (element.semanticRole === 'line-path' || element.semanticRole === 'area-path') {
    const path = element.content.pathData;
    const points = element.content.points || [];
    const areaPath = points.length > 1
      ? `${path} L ${points.at(-1).x} ${element.content.baseline} L ${points[0].x} ${element.content.baseline} Z`
      : path;
    return <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} style={{ position: 'absolute', inset: 0, width: viewport.width, height: viewport.height, overflow: 'visible' }}>
      {element.semanticRole === 'area-path' ? <path d={areaPath} fill={`${markColor}24`} stroke="none" opacity={state.opacity * reveal} /> : null}
      <path d={path} fill="none" stroke={markColor} strokeWidth={element.semanticRole === 'area-path' ? 7 : 6} strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} opacity={0.72 + emphasis * 0.28} />
    </svg>;
  }
  if (type === 'bar' || type === 'bar-horizontal' || type === 'progress' || type === 'simple_stack' || type === 'simple-stack') {
    const horizontal = type === 'bar-horizontal' || type === 'progress' || type.includes('stack');
    return <div style={{
      position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height,
      background: markColor,
      opacity: state.opacity * (0.58 + emphasis * 0.42), transform: horizontal
        ? `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale}) scaleX(${reveal})`
        : `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale}) scaleY(${reveal})`,
      transformOrigin: horizontal ? 'left center' : (element.content?.y < 0 ? 'center top' : 'center bottom'),
    }} />;
  }
  return <div style={{
    position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height, borderRadius: '50%',
    background: markColor, border: `3px solid ${palette.bg}`, boxShadow: `0 0 ${6 + emphasis * 8}px ${markColor}55`,
    opacity: state.opacity * (0.6 + emphasis * 0.4), transform: motionTransform(state, -0.28 + emphasis * 0.28),
  }} />;
}

function AnnotationPrimitive({ element, layout, motionPlan, frame, palette, geometry, viewport }) {
  const state = stateFor(element, motionPlan, frame);
  return <>
    {geometry ? <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} style={{ position: 'absolute', inset: 0, width: viewport.width, height: viewport.height, opacity: state.opacity }}>
      <path d={`M ${geometry.targetX} ${geometry.targetY} L ${geometry.x} ${geometry.y + geometry.height / 2}`} fill="none" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" />
    </svg> : null}
    <TextPrimitive element={element} layout={layout} motionPlan={motionPlan} frame={frame} palette={palette} />
  </>;
}

function ConnectorPrimitive({ route, motionPlan, frame, palette, viewport }) {
  const draw = Math.max(0, Math.min(1, evaluateMotionValue(motionPlan, route.id, 'draw', frame)));
  return <svg viewBox={`0 0 ${viewport.width} ${viewport.height}`} style={{ position: 'absolute', inset: 0, width: viewport.width, height: viewport.height, overflow: 'visible' }}>
    <defs><marker id={`arrow_${route.id}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={palette.accent} /></marker></defs>
    <path d={route.pathData} fill="none" stroke={palette.accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
      pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw} opacity={0.48 + draw * 0.52} markerEnd={draw > 0.9 ? `url(#arrow_${route.id})` : undefined} />
  </svg>;
}

const mediaSrc = (src) => /^(https?:|data:|blob:)/.test(src) ? src : staticFile(String(src).replace(/^[/\\]+/, ''));

/** Paints persisted media/crop/camera geometry; it performs no focal or layout decisions. */
export function MediaPrimitive({ element, geometry, motionPlan, frame }) {
  if (!geometry || geometry.activeRange && (frame < geometry.activeRange.startFrame || frame > geometry.activeRange.endFrame)) return null;
  const scale = evaluateMotionValue(motionPlan, element.id, 'cameraScale', frame) || 1;
  const focusX = evaluateMotionValue(motionPlan, element.id, 'cameraFocusX', frame);
  const focusY = evaluateMotionValue(motionPlan, element.id, 'cameraFocusY', frame);
  const x = Number.isFinite(focusX) ? focusX : geometry.objectPosition.x, y = Number.isFinite(focusY) ? focusY : geometry.objectPosition.y;
  const common = { width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${x * 100}% ${y * 100}%`, transform: `scale(${scale})`, transformOrigin: `${x * 100}% ${y * 100}%`, filter: `brightness(${geometry.treatment.brightness}) contrast(${geometry.treatment.contrast})` };
  return <div style={{ position: 'absolute', left: geometry.rect.x, top: geometry.rect.y, width: geometry.rect.width, height: geometry.rect.height, overflow: 'hidden', zIndex: element.zIndex }}>
    {geometry.mediaType === 'video' ? <OffthreadVideo src={mediaSrc(geometry.src)} muted style={common} /> : <Img src={mediaSrc(geometry.src)} style={common} />}
    {geometry.treatment.scrim !== 'none' ? <div style={{
      position: 'absolute', inset: 0,
      background: geometry.rect.height > geometry.rect.width
        ? 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 32%, transparent 60%)'
        : 'linear-gradient(90deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.35) 35%, transparent 65%)'
    }} /> : null}
  </div>;
}

/** Groups carry solved bounds and motion state but intentionally add no browser layout. */
export function GroupPrimitive() { return null; }

/** Pure solved-scene renderer: it consumes persisted pixels and line breaks and performs no layout. */
export function GenericSceneRenderer({ solvedScene, motionPlan }) {
  const frame = useCurrentFrame();
  const { palette } = useTheme();
  const elements = Object.values(solvedScene.elements).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const backgrounds = {
    neutralDark: palette.bg,
    charcoal: `linear-gradient(145deg, ${palette.bg}, #15181d)`,
    paperLight: palette.bg,
    softRadial: `radial-gradient(circle at 50% 42%, ${palette.accent}12, ${palette.bg} 62%)`,
    subtleTexture: `linear-gradient(135deg, ${palette.text}04 25%, transparent 25%) 0 0 / 18px 18px, ${palette.bg}`,
    technicalGrid: `linear-gradient(${palette.line}18 1px, transparent 1px), linear-gradient(90deg, ${palette.line}18 1px, transparent 1px), ${palette.bg}`,
  };
  const primaryMedia = solvedScene.mediaGeometry?.media_primary;
  const isLayeredMedia = Boolean(primaryMedia && (
    solvedScene.topology === 'layered-media' ||
    primaryMedia.rect.width < solvedScene.viewport.width ||
    primaryMedia.rect.height < solvedScene.viewport.height
  ));

  return <AbsoluteFill style={{ background: backgrounds[solvedScene.backgroundSelection] || palette.bg, backgroundSize: solvedScene.backgroundSelection === 'technicalGrid' ? '48px 48px' : undefined, overflow: 'hidden' }}>
    {isLayeredMedia && (
      <div style={{ position: 'absolute', inset: -40, overflow: 'hidden', zIndex: 0 }}>
        {primaryMedia.mediaType === 'video'
          ? <OffthreadVideo src={mediaSrc(primaryMedia.src)} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(36px) brightness(0.38) saturate(1.2)' }} />
          : <Img src={mediaSrc(primaryMedia.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(36px) brightness(0.38) saturate(1.2)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} />
      </div>
    )}
    {solvedScene.connectorRoutes.map((route) => <ConnectorPrimitive key={route.id} route={route} motionPlan={motionPlan} frame={frame} palette={palette} viewport={solvedScene.viewport} />)}
    {elements.map((element) => {
      if (element.kind === 'shape') return <ShapePrimitive key={element.id} element={element} motionPlan={motionPlan} frame={frame} palette={palette} />;
      if (element.kind === 'text' || element.kind === 'chart_label') return <TextPrimitive key={element.id} element={element} layout={solvedScene.textLayout[element.id]} motionPlan={motionPlan} frame={frame} palette={palette} />;
      if (element.kind === 'annotation') return <AnnotationPrimitive key={element.id} element={element} layout={solvedScene.textLayout[element.id]} motionPlan={motionPlan} frame={frame} palette={palette} geometry={solvedScene.annotationGeometry[element.id]} viewport={solvedScene.viewport} />;
      if (element.kind === 'chart_axis') return <AxisPrimitive key={element.id} element={element} motionPlan={motionPlan} frame={frame} palette={palette} viewport={solvedScene.viewport} />;
      if (element.kind === 'chart_mark') return <ChartMarkPrimitive key={element.id} element={element} motionPlan={motionPlan} frame={frame} palette={palette} viewport={solvedScene.viewport} />;
      if (element.kind === 'media') return <MediaPrimitive key={element.id} element={element} geometry={solvedScene.mediaGeometry?.[element.id]} motionPlan={motionPlan} frame={frame} />;
      if (element.kind === 'region') return <ShapePrimitive key={element.id} element={element} motionPlan={motionPlan} frame={frame} palette={palette} />;
      if (element.kind === 'group') return <GroupPrimitive key={element.id} />;
      return null;
    })}
  </AbsoluteFill>;
}
