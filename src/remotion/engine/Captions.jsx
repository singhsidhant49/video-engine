import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { useTheme } from './theme.js';

/**
 * Phrase captions from the aligned script (always spelled as written).
 * - 'highlight': short bold chunks, the spoken word takes the accent colour
 * - 'phrase':    documentary subtitles, sentence case, no highlight
 * Captions step aside (fade) while a clip shows large on-screen type.
 * No per-chunk pop: a 3-frame fade only when a chunk follows a silence.
 */
export function Captions({ captions }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { style, palette, size, safe, isVertical } = theme;
  const mode = captions?.mode || style.captions.mode;
  if (!captions || mode === 'none' || mode === 'off' || mode === 'OFF') return null;

  const idx = captions.chunks.findIndex((c) => frame >= c.startFrame && frame < c.endFrame);
  if (idx < 0) return null;
  const chunk = captions.chunks[idx];
  const prev = captions.chunks[idx - 1];
  const policy = captions.policies?.find((item) => frame >= item.startFrame && frame < item.endFrame);
  if (policy?.mode === 'INTEGRATED' || policy?.mode === 'HIDDEN') return null;

  // Yield completely to big on-screen type, charts, stats, or headlines.
  let yieldAlpha = 1;
  for (const [a, b] of captions.hidden || []) {
    yieldAlpha = Math.min(yieldAlpha, interpolate(frame, [a - 6, a + 2, b - 2, b + 6], [1, 0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  }
  if (yieldAlpha <= 0.02) return null;

  const afterSilence = !prev || chunk.startFrame - prev.endFrame > 2;
  const enter = afterSilence ? interpolate(frame, [chunk.startFrame, chunk.startFrame + 3], [0, 1], { extrapolateRight: 'clamp' }) : 1;

  const isHighlight = mode === 'highlight' || mode === 'word_highlight' || mode === 'WORD_HIGHLIGHT';
  const subtitleStyle = policy?.style || (policy?.mode === 'COMPACT' ? 'COMPACT_CAPSULE' : (policy?.mode === 'SOFT_SCRIM' ? 'SOFT_SCRIM' : 'CLEAN_TEXT'));
  const isCompact = subtitleStyle === 'COMPACT_CAPSULE';
  const isMinimal = mode === 'minimal' || mode === 'MINIMAL' || isCompact;
  // Shorts needs larger, phone-readable typography; landscape needs consistent lower safe sizing.
  const scale = isVertical ? 0.94 : (isCompact ? 0.76 : isMinimal ? 0.78 : (style.captions.scale || 0.85));
  const fontSize = Math.round((size.caption || (isVertical ? 64 : 52)) * scale);
  const upper = !isMinimal && style.captions.case === 'upper';
  const shadow = `0 ${theme.u(2)}px ${theme.u(6)}px rgba(0,0,0,0.92), 0 ${theme.u(4)}px ${theme.u(16)}px rgba(0,0,0,0.75), 0 0 ${theme.u(2)}px rgba(0,0,0,0.98)`;

  const geometry = policy?.geometry || captions.geometry;
  const position = geometry ? {
    left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height,
  } : {
    left: safe.left,
    right: isVertical ? Math.max(safe.right * 1.15, 140) : safe.right,
    bottom: safe.bottom + (isVertical ? theme.u(16) : theme.u(8)),
  };

  let containerStyle = {};
  if (subtitleStyle === 'CLEAN_TEXT') {
    containerStyle = {
      backgroundColor: 'transparent',
      borderRadius: '0px',
      backdropFilter: 'none',
      boxShadow: 'none',
      padding: `${theme.u(2)}px ${theme.u(6)}px`,
    };
  } else if (subtitleStyle === 'SOFT_SCRIM') {
    containerStyle = {
      background: 'radial-gradient(ellipse at center, rgba(8, 10, 14, 0.52) 0%, rgba(8, 10, 14, 0.22) 65%, rgba(8, 10, 14, 0) 100%)',
      borderRadius: `${theme.u(12)}px`,
      backdropFilter: 'none',
      boxShadow: 'none',
      padding: `${theme.u(isVertical ? 8 : 6)}px ${theme.u(isVertical ? 20 : 16)}px`,
    };
  } else {
    // COMPACT_CAPSULE
    containerStyle = {
      backgroundColor: 'rgba(10, 12, 16, 0.62)',
      borderRadius: `${theme.u(isVertical ? 14 : 10)}px`,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
      padding: `${theme.u(isVertical ? 8 : 6)}px ${theme.u(isVertical ? 18 : 14)}px`,
    };
  }

  return (
    <div
      style={{
        position: 'absolute',
        ...position,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        opacity: enter * yieldAlpha,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <div
        style={{
          fontFamily: isHighlight ? theme.font.display : theme.font.text,
          fontWeight: isMinimal ? 500 : (style.captions.weight || 600),
          fontSize,
          lineHeight: 1.24,
          letterSpacing: isHighlight ? '-0.01em' : '0.01em',
          textTransform: upper ? 'uppercase' : 'none',
          color: palette.text,
          textShadow: shadow,
          maxWidth: isVertical ? '92%' : '68%',
          textWrap: 'balance',
          ...containerStyle,
        }}
      >
        {isHighlight ? (
          chunk.words.map((w, i) => {
            const spoken = frame >= w.startFrame;
            const active = spoken && (frame < w.endFrame || i === chunk.words.length - 1 || frame < chunk.words[i + 1]?.startFrame);
            return (
              <span key={i} style={{ color: active ? palette.accent : palette.text, opacity: !spoken ? 0.65 : 1 }}>
                {w.text}{i < chunk.words.length - 1 ? ' ' : ''}
              </span>
            );
          })
        ) : (
          <span>{chunk.text || chunk.words.map((w) => w.text).join(' ')}</span>
        )}
      </div>
    </div>
  );
}
