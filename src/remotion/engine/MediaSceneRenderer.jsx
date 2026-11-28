import React from 'react';
import { AbsoluteFill, Img, Loop, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { useTheme } from './theme.js';
import { evaluateMotionValue } from '../../composition/motion/motionChoreographer.js';

const mediaSrc = (src) => /^(https?:|data:|blob:)/.test(src) ? src : staticFile(String(src).replace(/^[/\\]+/, ''));
const tokenColor = (token, palette) => ({ accent: palette.accent, text: palette.text, muted: palette.muted }[token] || token || palette.text);

function stateFor(element, motionPlan, frame) {
  return {
    opacity: evaluateMotionValue(motionPlan, element.id, 'opacity', frame),
    emphasis: evaluateMotionValue(motionPlan, element.id, 'emphasis', frame),
    reveal: evaluateMotionValue(motionPlan, element.id, 'reveal', frame),
    translateX: evaluateMotionValue(motionPlan, element.id, 'translateX', frame),
    translateY: evaluateMotionValue(motionPlan, element.id, 'translateY', frame),
    scale: evaluateMotionValue(motionPlan, element.id, 'scale', frame) || 1,
  };
}

function Text({ element, layout, motionPlan, frame, palette }) {
  if (!layout) return null;
  const state = stateFor(element, motionPlan, frame);
  const align = element.styleTokenRefs.textAlign || 'left';
  return <div style={{
    position: 'absolute', left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex,
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start',
    fontFamily: layout.fontFamily, fontWeight: layout.fontWeight, fontSize: layout.fontSize, lineHeight: layout.lineHeight,
    color: tokenColor(element.styleTokenRefs.color, palette), textAlign: align, opacity: state.opacity,
    textShadow: '0 2px 14px rgba(0,0,0,.85)',
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    borderLeft: element.kind === 'annotation' ? `4px solid ${palette.accent}` : undefined,
    paddingLeft: element.kind === 'annotation' ? 18 : undefined,
  }}>{layout.lineBreaks.map((line, index) => <div key={index} style={{ whiteSpace: 'pre' }}>{line}</div>)}</div>;
}

function Media({ element, geometry, motionPlan, frame }) {
  const { fps } = useVideoConfig();
  if (!geometry || geometry.activeRange && (frame < geometry.activeRange.startFrame || frame > geometry.activeRange.endFrame)) return null;
  const scale = evaluateMotionValue(motionPlan, element.id, 'cameraScale', frame) || 1;
  const focusX = evaluateMotionValue(motionPlan, element.id, 'cameraFocusX', frame);
  const focusY = evaluateMotionValue(motionPlan, element.id, 'cameraFocusY', frame);
  const x = Number.isFinite(focusX) ? focusX : geometry.objectPosition.x;
  const y = Number.isFinite(focusY) ? focusY : geometry.objectPosition.y;
  const start = Math.max(0, Number(geometry.videoTrim?.startTime) || 0);
  const end = Number(geometry.videoTrim?.endTime);
  const playbackFrames = Math.max(1, Number.isFinite(end) && end > start ? Math.round((end - start) * fps) : motionPlan.durationInFrames);
  const style = {
    width: '100%', height: '100%', objectFit: 'cover',
    objectPosition: `${geometry.objectPosition.x * 100}% ${geometry.objectPosition.y * 100}%`,
    transform: `translate3d(${(geometry.objectPosition.x - x) * geometry.rect.width}px, ${(geometry.objectPosition.y - y) * geometry.rect.height}px, 0) scale(${scale})`,
    transformOrigin: `${geometry.objectPosition.x * 100}% ${geometry.objectPosition.y * 100}%`,
    filter: `brightness(${geometry.treatment.brightness}) contrast(${geometry.treatment.contrast})`,
  };
  const content = geometry.mediaType === 'video'
    ? <Loop durationInFrames={playbackFrames}><OffthreadVideo src={mediaSrc(geometry.src)} muted trimBefore={Math.round(start * fps)} durationInFrames={playbackFrames} style={style} /></Loop>
    : <Img src={mediaSrc(geometry.src)} style={style} />;
  return <div style={{ position: 'absolute', left: geometry.rect.x, top: geometry.rect.y, width: geometry.rect.width, height: geometry.rect.height, overflow: 'hidden', zIndex: element.zIndex }}>
    {content}
    {geometry.treatment.scrim !== 'none' && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,.68), transparent 65%)' }} />}
  </div>;
}

export function MediaSceneRenderer({ solvedScene, motionPlan, frameOffset = 0 }) {
  const frame = Math.max(0, useCurrentFrame() - frameOffset);
  const { palette } = useTheme();
  const elements = Object.values(solvedScene.elements).sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
  const primary = solvedScene.mediaGeometry?.media_primary;
  const layered = Boolean(primary && (solvedScene.topology === 'layered-media' || primary.rect.width < solvedScene.viewport.width || primary.rect.height < solvedScene.viewport.height));
  return <AbsoluteFill style={{ background: `linear-gradient(145deg, ${palette.bg}, #15181d)`, overflow: 'hidden' }}>
    {layered && primary.mediaType !== 'video' && <><div style={{ position: 'absolute', inset: -40, overflow: 'hidden' }}><Img src={mediaSrc(primary.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(36px) brightness(.38)' }} /></div><AbsoluteFill style={{ background: 'rgba(0,0,0,.4)' }} /></>}
    {elements.map((element) => {
      if (element.kind === 'media') return <Media key={element.id} element={element} geometry={solvedScene.mediaGeometry?.[element.id]} motionPlan={motionPlan} frame={frame} />;
      if (element.kind === 'text' || element.kind === 'annotation') return <Text key={element.id} element={element} layout={solvedScene.textLayout[element.id]} motionPlan={motionPlan} frame={frame} palette={palette} />;
      return null;
    })}
  </AbsoluteFill>;
}
