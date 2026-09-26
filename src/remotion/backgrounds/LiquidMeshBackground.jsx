import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * Apple Liquid Glass Morphing Mesh Background.
 * Simulates fluid organic color blobs moving beneath a glass layer.
 */
export const LiquidMeshBackground = ({
  primaryColor = '#38bdf8',
  accentColor = '#a855f7',
  bgColor = '#030712',
  bgMediaUrl = null,
}) => {
  const frame = useCurrentFrame();

  const blob1X = interpolate(frame, [0, 900], [20, 60], { extrapolateRight: 'clamp' });
  const blob1Y = interpolate(frame, [0, 900], [25, 65], { extrapolateRight: 'clamp' });

  const blob2X = interpolate(frame, [0, 900], [70, 30], { extrapolateRight: 'clamp' });
  const blob2Y = interpolate(frame, [0, 900], [60, 20], { extrapolateRight: 'clamp' });

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
            filter: 'blur(20px) brightness(0.25) contrast(1.15)',
            opacity: 0.85,
          }}
        />
      )}

      {/* 2. Fluid Mesh Blob 1 */}
      <div
        style={{
          position: 'absolute',
          top: `${blob1Y}%`,
          left: `${blob1X}%`,
          width: '550px',
          height: '550px',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${primaryColor}40 0%, transparent 65%)`,
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      {/* 3. Fluid Mesh Blob 2 */}
      <div
        style={{
          position: 'absolute',
          top: `${blob2Y}%`,
          left: `${blob2X}%`,
          width: '500px',
          height: '500px',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${accentColor}35 0%, transparent 65%)`,
          filter: 'blur(55px)',
          pointerEvents: 'none',
        }}
      />

      {/* 4. Glass Surface Shimmer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(0,0,0,0.5) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
