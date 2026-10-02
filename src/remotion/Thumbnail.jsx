import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from 'remotion';

export const ThumbnailComposition = ({ packageData, conceptIndex = 0 }) => {
  const concept = packageData?.thumbnails?.[conceptIndex] || {
    overlayText: 'THE HIDDEN TRUTH',
    mainSubject: 'Core Subject',
    palette: {
      background: '#0B1020',
      text: '#FFFFFF',
      accent: '#F5C542',
    },
  };

  const bg = concept.palette?.background || '#0B1020';
  const textColor = concept.palette?.text || '#FFFFFF';
  const accentColor = concept.palette?.accent || '#F5C542';

  const words = (concept.overlayText || 'REVOLUTIONARY TECH').split(/\s+/);
  const heroText = words.slice(0, 3).join(' ');
  const subText = words.slice(3).join(' ');

  return (
    <AbsoluteFill
      style={{
        background: bg,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '60px 80px',
        fontFamily: "'Outfit', 'Inter', sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Background Radial Glow */}
      <div
        style={{
          position: 'absolute',
          right: '15%',
          top: '20%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
      />

      {/* Left Typography Block */}
      <div
        style={{
          flex: 1.2,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '24px',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: accentColor,
            color: '#000',
            fontWeight: 900,
            fontSize: '32px',
            padding: '10px 24px',
            borderRadius: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            alignSelf: 'flex-start',
            boxShadow: `0 8px 30px ${accentColor}66`,
          }}
        >
          {heroText}
        </div>

        {subText && (
          <h1
            style={{
              fontSize: '68px',
              fontWeight: 900,
              color: textColor,
              lineHeight: 1.05,
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              textShadow: '0 4px 20px rgba(0,0,0,0.8)',
            }}
          >
            {subText}
          </h1>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginTop: '12px',
          }}
        >
          <div style={{ width: '48px', height: '6px', background: accentColor, borderRadius: '3px' }} />
          <span style={{ fontSize: '26px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em' }}>
            {packageData?.title?.slice(0, 36) || 'SPECIAL REPORT'}
          </span>
        </div>
      </div>

      {/* Right Subject Visual Container */}
      <div
        style={{
          flex: 0.9,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {concept.heroImage ? (
          <div
            style={{
              width: '440px',
              height: '560px',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 40px ${accentColor}33`,
              border: `3px solid rgba(255,255,255,0.15)`,
            }}
          >
            {typeof concept.heroImage === 'string' && concept.heroImage.endsWith('.mp4') ? (
              <OffthreadVideo
                src={staticFile(concept.heroImage)}
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <Img
                src={staticFile(concept.heroImage)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              width: '400px',
              height: '400px',
              borderRadius: '32px',
              background: `linear-gradient(135deg, ${accentColor}22, rgba(255,255,255,0.05))`,
              border: `2px solid ${accentColor}66`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 20px 50px rgba(0,0,0,0.6)`,
            }}
          >
            <span style={{ fontSize: '72px' }}>⚡</span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', marginTop: '16px', textTransform: 'uppercase' }}>
              {concept.mainSubject || 'KEY REVELATION'}
            </span>
          </div>
        )}
      </div>

      {/* Safe margin protector (bottom right timestamp shield) */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          width: '140px',
          height: '45px',
          background: 'transparent',
        }}
      />
    </AbsoluteFill>
  );
};
