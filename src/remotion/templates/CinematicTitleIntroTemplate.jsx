import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Cinematic Title Intro Template (ReactVideoEditor style).
 * Animated title card with growing underline, category badge, and subtitle for opening shots.
 */
export const CinematicTitleIntroTemplate = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const title = params.title || params.headline || 'THE UNTOLD STORY';
  const subtitle = params.subtitle || params.subText || 'A Documentary Investigation';
  const tag = params.tag || params.category || 'EPISODE 01';
  const accentColor = params.accentColor || '#fbbf24';

  const titleSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.7 },
  });

  const underlineWidth = interpolate(relFrame, [10, 40], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const tagOpacity = interpolate(relFrame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const subOpacity = interpolate(relFrame, [18, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 24px',
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {/* Category Pill */}
      <div
        style={{
          opacity: tagOpacity,
          transform: `translateY(${interpolate(tagOpacity, [0, 1], [15, 0])}px)`,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(16px)',
          padding: '6px 18px',
          borderRadius: '100px',
          border: `1px solid ${accentColor}66`,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: '13px',
          fontWeight: '800',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: accentColor,
          marginBottom: '20px',
        }}
      >
        <span>●</span> {tag}
      </div>

      {/* Main Cinematic Title */}
      <div
        style={{
          transform: `scale(${titleSpring})`,
          maxWidth: '85%',
          fontFamily: "'Playfair Display', 'Cinzel', 'Outfit', Georgia, serif",
          fontSize: title.length > 30 ? '38px' : (title.length > 18 ? '46px' : '56px'),
          fontWeight: '900',
          lineHeight: '1.15',
          letterSpacing: '-0.5px',
          color: '#ffffff',
          textShadow: '0 4px 25px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.8)',
          marginBottom: '16px',
          position: 'relative',
        }}
      >
        {title}
      </div>

      {/* Growing Underline Accent */}
      <div
        style={{
          width: `${underlineWidth}%`,
          maxWidth: '240px',
          height: '4px',
          background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
          borderRadius: '2px',
          boxShadow: `0 0 15px ${accentColor}`,
          marginBottom: '18px',
        }}
      />

      {/* Subtitle / Context */}
      <div
        style={{
          opacity: subOpacity,
          transform: `translateY(${interpolate(subOpacity, [0, 1], [10, 0])}px)`,
          maxWidth: '78%',
          fontFamily: "'Plus Jakarta Sans', 'Inter Tight', sans-serif",
          fontSize: '18px',
          fontWeight: '600',
          color: '#cbd5e1',
          letterSpacing: '0.3px',
          lineHeight: '1.4',
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
