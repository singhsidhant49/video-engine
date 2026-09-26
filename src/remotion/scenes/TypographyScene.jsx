import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Editorial Headline Typography Primitive.
 * Features spacious typography, safe bounds (780px max width), and dynamic topic palette integration.
 */
export const TypographyScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const scale = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 190, mass: 0.6 },
  });

  const mainText = params.mainText || params.heading || 'BREAKTHROUGH DISCOVERY';
  const subText = params.subText || 'INSIGHT BRIEFING';
  const accentColor = params.accentColor || params.palette?.primary || '#38bdf8';
  const mediaUrl = params.mediaUrl || params.imageUrl || null;

  // Responsive headline scaling based on length
  const textLen = mainText.length;
  const headlineFontSize = textLen > 32 ? '36px' : (textLen > 20 ? '46px' : '56px');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        fontFamily: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
        textAlign: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. Blurred Background Media */}
      {mediaUrl && (
        <div
          style={{
            position: 'absolute',
            inset: '-10%',
            width: '120%',
            height: '120%',
            backgroundImage: `url(${mediaUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.20) contrast(1.15) blur(16px)',
          }}
        />
      )}

      {/* 2. Atmospheric Spotlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${accentColor}30 0%, #030612 85%)`,
          mixBlendMode: mediaUrl ? 'overlay' : 'normal',
        }}
      />

      {/* 3. Typography Content Container (780px Safe MaxWidth) */}
      <div
        style={{
          transform: `scale(${scale})`,
          width: '100%',
          maxWidth: '780px',
          zIndex: 10,
          padding: '0 24px',
          boxSizing: 'border-box',
        }}
      >
        {subText && (
          <div
            style={{
              fontSize: '18px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '3.5px',
              color: accentColor,
              marginBottom: '20px',
              textShadow: `0 0 20px ${accentColor}`,
            }}
          >
            {subText}
          </div>
        )}

        <h1
          style={{
            fontSize: headlineFontSize,
            fontWeight: '900',
            color: '#ffffff',
            lineHeight: '1.2',
            textTransform: 'uppercase',
            letterSpacing: '-1px',
            textShadow: `0 10px 40px rgba(0,0,0,0.9), 0 0 35px ${accentColor}55`,
            margin: 0,
            wordBreak: 'break-word',
          }}
        >
          {mainText}
        </h1>
      </div>
    </div>
  );
};
