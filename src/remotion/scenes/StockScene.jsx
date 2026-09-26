import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const StockScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - startFrame);

  // Smooth cinematic camera zoom
  const zoom = interpolate(relFrame, [0, 150], [1, 1.18], { extrapolateRight: 'clamp' });

  const mediaUrl = params.mediaUrl || 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1080&auto=format&fit=crop';
  const overlayText = params.overlayText || params.heading || '';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {/* 1. Full-Bleed 1080x1920 Stock Media */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${mediaUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `scale(${zoom})`,
          filter: 'brightness(0.85) contrast(1.1)',
        }}
      />

      {/* 2. Cinematic Gradient Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(5, 8, 15, 0.4) 0%, transparent 40%, rgba(5, 8, 15, 0.85) 100%)',
        }}
      />

      {/* 3. Floating Bold Headline Banner */}
      {overlayText && (
        <div
          style={{
            position: 'absolute',
            top: '35%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '88%',
            textAlign: 'center',
            padding: '32px 40px',
            borderRadius: '28px',
            background: 'rgba(9, 13, 22, 0.85)',
            backdropFilter: 'blur(24px)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 30px 80px rgba(0, 0, 0, 0.9), 0 0 40px rgba(56, 189, 248, 0.3)',
          }}
        >
          <div
            style={{
              fontSize: '48px',
              fontWeight: '900',
              color: '#ffffff',
              lineHeight: '1.2',
              letterSpacing: '-0.5px',
              textShadow: '0 4px 20px rgba(0,0,0,0.9)',
            }}
          >
            {overlayText}
          </div>
        </div>
      )}
    </div>
  );
};
