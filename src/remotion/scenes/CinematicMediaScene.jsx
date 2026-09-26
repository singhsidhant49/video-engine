import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const CinematicMediaScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame - startFrame);

  // Ken Burns dynamic camera drift & zoom
  const zoom = interpolate(relFrame, [0, 180], [1, 1.2], { extrapolateRight: 'clamp' });
  const panY = interpolate(relFrame, [0, 180], [0, -40], { extrapolateRight: 'clamp' });

  const badgeSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 14, stiffness: 200 },
  });

  const mediaUrl = params.mediaUrl || params.imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080&auto=format&fit=crop';
  const heading = params.heading || params.title || '';
  const subHeading = params.subHeading || params.badge || '';
  const accentColor = params.accentColor || '#38bdf8';

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
      {/* 1. Full-Screen Cinematic Imagery with Ken Burns Motion */}
      <div
        style={{
          position: 'absolute',
          inset: '-5%',
          width: '110%',
          height: '110%',
          backgroundImage: `url(${mediaUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          transform: `scale(${zoom}) translateY(${panY}px)`,
          filter: 'brightness(0.9) contrast(1.15)',
        }}
      />

      {/* 2. Cinematic Gradient Vignettes for Maximum Readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, rgba(4, 7, 17, 0.65) 0%, rgba(4, 7, 17, 0.1) 30%, rgba(4, 7, 17, 0.2) 65%, rgba(4, 7, 17, 0.9) 100%)',
        }}
      />

      {/* 3. Broadcast Documentary Typography (No Card Box) */}
      {heading && (
        <div
          style={{
            position: 'absolute',
            top: '26%',
            left: '50%',
            transform: `translateX(-50%) scale(${badgeSpring})`,
            width: '90%',
            textAlign: 'center',
            zIndex: 60,
          }}
        >
          {subHeading && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '18px',
                fontWeight: '900',
                textTransform: 'uppercase',
                letterSpacing: '3px',
                color: accentColor,
                background: 'rgba(9, 13, 24, 0.75)',
                backdropFilter: 'blur(16px)',
                padding: '8px 24px',
                borderRadius: '30px',
                marginBottom: '16px',
                border: `1.5px solid ${accentColor}88`,
                boxShadow: `0 8px 25px rgba(0, 0, 0, 0.6), 0 0 20px ${accentColor}33`,
              }}
            >
              <span>●</span>
              <span>{subHeading}</span>
            </div>
          )}

          <div
            style={{
              fontSize: '56px',
              fontWeight: '900',
              color: '#ffffff',
              lineHeight: '1.15',
              letterSpacing: '-1px',
              textShadow: '0 4px 16px #000000, 0 8px 30px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.8)',
              WebkitTextStroke: '1px rgba(0,0,0,0.4)',
            }}
          >
            {heading}
          </div>
        </div>
      )}
    </div>
  );
};
