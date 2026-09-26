import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Broadcast-Style Lower Third Template (ReactVideoEditor style).
 * Overlay with speaker name, professional title, animated border accent, and background photo spotlight.
 */
export const LowerThirdTemplate = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const name = params.name || params.speaker || 'ALEXANDER THE GREAT';
  const role = params.role || params.title || 'FOUNDER & MILITARY COMMANDER';
  const location = params.location || 'ALEXANDRIA, 331 BC';
  const mediaUrl = params.mediaUrl || params.imageUrl || null;
  const accentColor = params.accentColor || '#fbbf24';

  const slideSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 170, mass: 0.5 },
  });

  const barScale = interpolate(relFrame, [0, 20], [0, 1], {
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
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Central Media Avatar / Archival Still */}
      {mediaUrl && (
        <div
          style={{
            width: '260px',
            height: '260px',
            borderRadius: '24px',
            overflow: 'hidden',
            border: `3px solid ${accentColor}88`,
            boxShadow: `0 20px 50px rgba(0,0,0,0.85), 0 0 30px ${accentColor}33`,
            marginBottom: '32px',
            transform: `scale(${slideSpring})`,
          }}
        >
          <img
            src={mediaUrl}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}

      {/* Broadcast Lower Third Pill */}
      <div
        style={{
          transform: `translateY(${interpolate(slideSpring, [0, 1], [40, 0])}px) scale(${slideSpring})`,
          width: '100%',
          maxWidth: '82%',
          background: 'rgba(8, 12, 22, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '18px',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 1px 1px rgba(255, 255, 255, 0.05)',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Vertical Accent Bar */}
        <div
          style={{
            width: '5px',
            height: '100%',
            position: 'absolute',
            left: 0,
            top: 0,
            background: accentColor,
            transform: `scaleY(${barScale})`,
            transformOrigin: 'top',
            boxShadow: `0 0 12px ${accentColor}`,
          }}
        />

        <div style={{ paddingLeft: '8px', flex: 1 }}>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', 'Inter Tight', sans-serif",
              fontSize: '24px',
              fontWeight: '900',
              color: '#ffffff',
              letterSpacing: '-0.3px',
              textTransform: 'uppercase',
              lineHeight: '1.2',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '14px',
              fontWeight: '700',
              color: accentColor,
              letterSpacing: '1px',
              textTransform: 'uppercase',
              marginTop: '4px',
            }}
          >
            {role}
          </div>
          {location && (
            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '12px',
                fontWeight: '600',
                color: '#94a3b8',
                letterSpacing: '0.8px',
                marginTop: '2px',
              }}
            >
              📍 {location}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
