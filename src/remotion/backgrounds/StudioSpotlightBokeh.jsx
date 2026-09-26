import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * Studio Spotlight & Floating Bokeh Dust Background.
 * Ideal for Business, Wealth, History, Crime, and Editorial Storytelling.
 */
export const StudioSpotlightBokeh = ({
  accentColor = '#f59e0b',
  bgColor = '#0a0d18',
  bgMediaUrl = null,
}) => {
  const frame = useCurrentFrame();

  const pulse = interpolate(Math.sin(frame * 0.05), [-1, 1], [0.92, 1.08]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: bgColor,
        overflow: 'hidden',
      }}
    >
      {/* 1. Ambient Topic Photo Scrim */}
      {bgMediaUrl && (
        <div
          style={{
            position: 'absolute',
            inset: '-10%',
            width: '120%',
            height: '120%',
            backgroundImage: `url(${bgMediaUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px) brightness(0.22) contrast(1.18)',
            opacity: 0.9,
          }}
        />
      )}

      {/* 2. Volumetric Studio Spotlight */}
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: '50%',
          width: '800px',
          height: '800px',
          transform: `translate(-50%, -50%) scale(${pulse})`,
          background: `radial-gradient(circle, ${accentColor}28 0%, transparent 65%)`,
          filter: 'blur(45px)',
          pointerEvents: 'none',
        }}
      />

      {/* 3. Floating Bokeh Particles */}
      {[1, 2, 3, 4, 5].map((i) => {
        const y = (frame * (0.4 + i * 0.15) + i * 150) % 1920;
        const x = 120 + ((i * 180 + frame * 0.2) % 800);
        const size = 12 + i * 8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${y}px`,
              left: `${x}px`,
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: '50%',
              background: accentColor,
              opacity: 0.15 + (i % 3) * 0.08,
              filter: 'blur(8px)',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
};
