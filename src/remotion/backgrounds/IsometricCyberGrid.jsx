import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * 3D Isometric Cyber Grid Perspective Plane Background.
 * Ideal for Technology, AI, Coding, and Deep Systems topics.
 */
export const IsometricCyberGrid = ({
  accentColor = '#38bdf8',
  bgColor = '#030712',
  bgMediaUrl = null,
}) => {
  const frame = useCurrentFrame();

  const gridOffset = (frame * 1.5) % 60;

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
            filter: 'blur(22px) brightness(0.20) contrast(1.2)',
            opacity: 0.8,
          }}
        />
      )}

      {/* 2. Top Horizon Glow */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          width: '700px',
          height: '250px',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(ellipse, ${accentColor}30 0%, transparent 70%)`,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* 3. 3D Perspective Plane */}
      <div
        style={{
          position: 'absolute',
          bottom: '-20%',
          left: '-25%',
          width: '150%',
          height: '80%',
          transform: 'perspective(500px) rotateX(65deg)',
          backgroundImage: `
            linear-gradient(${accentColor}25 1.5px, transparent 1.5px),
            linear-gradient(90deg, ${accentColor}25 1.5px, transparent 1.5px)
          `,
          backgroundSize: '60px 60px',
          backgroundPosition: `0px ${gridOffset}px`,
          maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 90%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 90%)',
        }}
      />
    </div>
  );
};
