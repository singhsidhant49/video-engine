import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Broadcast-Grade Editorial Subtitle Engine.
 * - Positioned strictly inside the platform-safe lower-third zone (18% bottom for vertical).
 * - Safe maxWidth (78%) and responsive font clamping to prevent ANY edge cut-offs.
 * - Glassmorphic high-contrast backdrop pill for 100% legibility on bright & dark backgrounds.
 * - Dynamic active word highlights tailored to the topic palette.
 */
export const AnimatedCaptions = ({ 
  subtitles = [], 
  format = 'shorts', 
  activeColor = '#fbbf24',
  pillBackground = 'rgba(4, 7, 15, 0.88)',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeSubtitle = subtitles.find(
    (sub) => frame >= sub.startFrame && frame <= sub.endFrame
  );

  if (!activeSubtitle) return null;

  const frameOffset = Math.max(0, frame - activeSubtitle.startFrame);
  const chunkSpring = spring({
    frame: frameOffset,
    fps,
    config: { damping: 20, stiffness: 220, mass: 0.4 },
  });

  const isVertical = format === 'shorts';
  const wordsList = activeSubtitle.words && activeSubtitle.words.length > 0 
    ? activeSubtitle.words 
    : activeSubtitle.text.split(' ').map(w => ({ word: w }));

  // Dynamic font sizing based on character count to prevent overflow
  const charCount = activeSubtitle.text.length;
  const fontSize = isVertical
    ? (charCount > 28 ? '30px' : (charCount > 18 ? '36px' : '40px'))
    : (charCount > 35 ? '26px' : '32px');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: isVertical ? '18%' : '10%',
        left: '50%',
        transform: `translateX(-50%) scale(${chunkSpring})`,
        width: '100%',
        maxWidth: isVertical ? '80%' : '74%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          background: pillBackground,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: isVertical ? '12px 24px' : '10px 20px',
          borderRadius: '22px',
          border: '1.5px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
          fontFamily: "'Plus Jakarta Sans', 'Inter Tight', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: fontSize,
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: '-0.3px',
          lineHeight: '1.25',
          textAlign: 'center',
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}
      >
        {wordsList.map((item, idx) => {
          const isWordActive = item.startFrame !== undefined 
            ? (frame >= item.startFrame && frame <= item.endFrame)
            : false;

          const baseColor = '#f8fafc';
          const color = isWordActive ? activeColor : baseColor;
          const scale = isWordActive ? 1.06 : 1.0;

          return (
            <span
              key={idx}
              style={{
                display: 'inline-block',
                margin: '2px 6px',
                color: color,
                transform: `scale(${scale})`,
                transition: 'transform 0.08s ease, color 0.08s ease',
                textShadow: isWordActive
                  ? `0 0 20px ${activeColor}99, 0 2px 10px #000000`
                  : '0 2px 10px rgba(0, 0, 0, 0.95)',
                filter: isWordActive ? `drop-shadow(0 0 8px ${activeColor}88)` : 'none',
              }}
            >
              {item.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
