import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const StatsCard = ({
  heading = '',
  statLabel = 'Performance Boost',
  statValue = '10,000x',
  subheading = '',
  accentColor = '#ec4899',
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const cardScale = spring({
    frame: relFrame,
    fps,
    config: { damping: 12, stiffness: 190 },
  });

  const statPulse = interpolate(Math.sin(relFrame / 6), [-1, 1], [0.95, 1.05]);

  return (
    <div
      style={{
        transform: `scale(${cardScale})`,
        width: '94%',
        maxWidth: '980px',
        margin: '0 auto',
        padding: '56px 44px',
        borderRadius: '36px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(30px)',
        border: `3px solid ${accentColor}77`,
        boxShadow: `0 40px 100px rgba(0,0,0,0.9), 0 0 70px ${accentColor}44`,
        textAlign: 'center',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <h2
        style={{
          fontSize: '38px',
          fontWeight: '900',
          color: '#f8fafc',
          marginBottom: '32px',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
        }}
      >
        {heading || 'Key Benchmark Result'}
      </h2>

      {/* Massive Glowing Stat Card Container */}
      <div
        style={{
          display: 'inline-block',
          transform: `scale(${statPulse})`,
          padding: '36px 64px',
          borderRadius: '32px',
          background: `linear-gradient(135deg, ${accentColor}35 0%, rgba(15, 23, 42, 0.85) 100%)`,
          border: `3px solid ${accentColor}`,
          boxShadow: `0 0 50px ${accentColor}66`,
          marginBottom: '28px',
        }}
      >
        <div
          style={{
            fontSize: '110px',
            fontWeight: '900',
            color: '#ffffff',
            lineHeight: '1',
            letterSpacing: '-3px',
            textShadow: `0 0 40px ${accentColor}`,
          }}
        >
          {statValue}
        </div>
        <div
          style={{
            fontSize: '26px',
            fontWeight: '800',
            color: accentColor,
            textTransform: 'uppercase',
            marginTop: '16px',
            letterSpacing: '2px',
          }}
        >
          {statLabel}
        </div>
      </div>

      {subheading && (
        <p style={{ fontSize: '28px', color: '#cbd5e1', fontWeight: '600', lineHeight: '1.4' }}>
          {subheading}
        </p>
      )}
    </div>
  );
};
