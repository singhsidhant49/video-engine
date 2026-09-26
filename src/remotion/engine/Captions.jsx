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
  if (!captions || captions.mode === 'none') return null;

  const idx = captions.chunks.findIndex((c) => frame >= c.startFrame && frame < c.endFrame);
  if (idx < 0) return null;
  const chunk = captions.chunks[idx];
  const prev = captions.chunks[idx - 1];

  // Yield to big on-screen type.
  let yieldAlpha = 1;
  for (const [a, b] of captions.hidden) {
    yieldAlpha = Math.min(yieldAlpha, interpolate(frame, [a - 4, a + 2, b - 2, b + 4], [1, 0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  }
  if (yieldAlpha <= 0) return null;
  const afterSilence = !prev || chunk.startFrame - prev.endFrame > 2;
  const enter = afterSilence ? interpolate(frame, [chunk.startFrame, chunk.startFrame + 3], [0, 1], { extrapolateRight: 'clamp' }) : 1;

  const highlight = captions.mode === 'highlight';
  const fontSize = Math.round(size.caption * style.captions.scale);
  const upper = style.captions.case === 'upper';
  const shadow = `0 ${theme.u(3)}px ${theme.u(14)}px rgba(0,0,0,0.85), 0 0 ${theme.u(2)}px rgba(0,0,0,0.9)`;

  return (
    <div
      style={{
        position: 'absolute',
        left: safe.left,
        right: isVertical ? safe.right * 0.6 : safe.right,
        bottom: safe.bottom + (isVertical ? theme.u(40) : 0),
        display: 'flex',
        justifyContent: 'center',
        textAlign: 'center',
        opacity: enter * yieldAlpha,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: highlight ? theme.font.display : theme.font.text,
          fontWeight: style.captions.weight,
          fontSize,
          lineHeight: 1.18,
          letterSpacing: highlight ? '-0.01em' : '0',
          textTransform: upper ? 'uppercase' : 'none',
          color: palette.text,
          textShadow: shadow,
          maxWidth: isVertical ? '100%' : '78%',
          textWrap: 'balance',
        }}
      >
        {chunk.words.map((w, i) => {
          const spoken = frame >= w.startFrame;
          const active = spoken && (frame < w.endFrame || i === chunk.words.length - 1 || frame < chunk.words[i + 1]?.startFrame);
          return (
            <span key={i} style={{ color: highlight && active ? palette.accent : palette.text, opacity: highlight && !spoken ? 0.7 : 1 }}>
              {w.text}{i < chunk.words.length - 1 ? ' ' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
