import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Archival Documentary Shot Primitive.
 * Features Layer 3 Aspect Ratio Fixer:
 * - Background ambient duplicate blurred with blur(26px) brightness(0.35)
 * - Foreground image centered at safe 82% width (never clipped on edges)
 * - Subtle border rounding, drop shadow, and smooth Vox-style camera glide.
 */
export const ArchivalDocumentaryShot = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame - startFrame);

  const mediaUrl = params.mediaUrl || params.imageUrl || 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=1080&auto=format&fit=crop';
  const panDirection = params.panDirection || 'push_in';
  const dateStamp = params.dateStamp || params.badge || params.locationTag || '';
  const accentColor = params.accentColor || params.palette?.primary || '#38bdf8';

  // Subtle Camera Motion Choreography (Restricted within safe canvas)
  let transform = '';
  if (panDirection === 'pan_left') {
    const panX = interpolate(relFrame, [0, 180], [15, -20], { extrapolateRight: 'clamp' });
    const zoom = interpolate(relFrame, [0, 180], [1.01, 1.08], { extrapolateRight: 'clamp' });
    transform = `scale(${zoom}) translateX(${panX}px) rotateY(-1deg)`;
  } else if (panDirection === 'pan_right') {
    const panX = interpolate(relFrame, [0, 180], [-20, 15], { extrapolateRight: 'clamp' });
    const zoom = interpolate(relFrame, [0, 180], [1.01, 1.08], { extrapolateRight: 'clamp' });
    transform = `scale(${zoom}) translateX(${panX}px) rotateY(1deg)`;
  } else if (panDirection === 'pull_out') {
    const zoom = interpolate(relFrame, [0, 180], [1.08, 1.01], { extrapolateRight: 'clamp' });
    transform = `scale(${zoom})`;
  } else {
    // Default: Cinematic Push-In
    const zoom = interpolate(relFrame, [0, 180], [1.0, 1.07], { extrapolateRight: 'clamp' });
    const panY = interpolate(relFrame, [0, 180], [0, -15], { extrapolateRight: 'clamp' });
    transform = `scale(${zoom}) translateY(${panY}px)`;
  }

  const badgeSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 16, stiffness: 200 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#020408',
      }}
    >
      {/* 1. Blurred Background Duplicate (Fill Canvas) */}
      <div
        style={{
          position: 'absolute',
          inset: '-15%',
          width: '130%',
          height: '130%',
          backgroundImage: `url(${mediaUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(26px) brightness(0.35)',
          transform: 'scale(1.1)',
        }}
      />

      {/* 2. Sharp Foreground Media with Safe 82% Width */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 24px',
          zIndex: 20,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: '82%',
            height: '76%',
            maxWidth: '840px',
            backgroundImage: `url(${mediaUrl})`,
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.75), 0 0 1px 1px rgba(255,255,255,0.08)',
            transform: transform,
            transformStyle: 'preserve-3d',
          }}
        />
      </div>

      {/* 3. Broadcast Location / Date Stamp */}
      {dateStamp && (
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '10%',
            transform: `scale(${badgeSpring})`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '20px',
            background: 'rgba(5, 8, 15, 0.88)',
            backdropFilter: 'blur(16px)',
            border: `1.5px solid ${accentColor}88`,
            boxShadow: `0 8px 30px rgba(0,0,0,0.8), 0 0 20px ${accentColor}33`,
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            fontSize: '16px',
            fontWeight: '800',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#f8fafc',
            zIndex: 60,
          }}
        >
          <span style={{ color: accentColor }}>●</span>
          <span>{dateStamp}</span>
        </div>
      )}
    </div>
  );
};
