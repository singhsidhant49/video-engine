import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Polaroid / Framed Photo Stack Template (ReactVideoEditor style).
 * Features authentic paper shadow, realistic tilt physics, archival caption tape, and photo spotlight.
 */
export const PolaroidPhotoStackTemplate = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const caption = params.caption || params.headline || 'ARCHIVAL ARTIFACT #104';
  const dateStamp = params.dateStamp || params.year || 'CIRCA 48 BC';
  const mediaUrl = params.mediaUrl || params.imageUrl || 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?q=80&w=1080&auto=format&fit=crop';
  const accentColor = params.accentColor || '#fbbf24';

  const dropSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 16, stiffness: 180, mass: 0.6 },
  });

  const tilt = interpolate(relFrame, [0, 30], [-3, 2.5], {
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      {/* Polaroid Card */}
      <div
        style={{
          transform: `scale(${dropSpring}) rotate(${tilt}deg)`,
          width: '100%',
          maxWidth: '78%',
          background: '#fcfbf7',
          padding: '20px 20px 32px 20px',
          borderRadius: '12px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.6)',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* Top Washi Tape Graphic */}
        <div
          style={{
            position: 'absolute',
            top: '-14px',
            left: '35%',
            width: '30%',
            height: '28px',
            background: 'rgba(250, 204, 21, 0.45)',
            backdropFilter: 'blur(4px)',
            transform: 'rotate(-2deg)',
            borderRadius: '2px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 10,
          }}
        />

        {/* Inner Photo Container */}
        <div
          style={{
            width: '100%',
            height: '380px',
            borderRadius: '6px',
            overflow: 'hidden',
            background: '#0a0d14',
            position: 'relative',
          }}
        >
          <img
            src={mediaUrl}
            alt={caption}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'contrast(1.08) brightness(0.95)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
            }}
          />
        </div>

        {/* Handwritten / Typewriter Caption */}
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily: "'Newsreader', 'Playfair Display', Georgia, serif",
              fontSize: '20px',
              fontWeight: '700',
              fontStyle: 'italic',
              color: '#0f172a',
              letterSpacing: '-0.2px',
            }}
          >
            {caption}
          </div>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', monospace",
              fontSize: '11px',
              fontWeight: '800',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: '#64748b',
              background: '#e2e8f0',
              padding: '3px 8px',
              borderRadius: '4px',
            }}
          >
            {dateStamp}
          </div>
        </div>
      </div>
    </div>
  );
};
