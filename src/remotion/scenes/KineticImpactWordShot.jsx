import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Kinetic Impact Word Shot Primitive.
 * Features safe proportional typography (never clipped at viewport edges),
 * shockwave lighting, and dynamic topic palette integration.
 */
export const KineticImpactWordShot = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const word = params.word || params.mainText || 'INNOVATION';
  const subText = params.subText || '';
  const accentColor = params.accentColor || params.palette?.primary || '#f43f5e';
  const mediaUrl = params.mediaUrl || params.imageUrl || null;

  const impactSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 220, mass: 0.5 },
  });

  // Micro-damped shockwave camera shake on impact (frames 0 to 6)
  const shake = relFrame < 6 ? Math.sin(relFrame * 3.0) * (6 - relFrame) * 1.5 : 0;

  // Responsive font size based on word length to guarantee it never cuts off
  const wordLen = word.length;
  const wordFontSize = wordLen > 10 ? '58px' : (wordLen > 7 ? '74px' : (wordLen > 5 ? '88px' : '102px'));

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
        padding: '40px 24px',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
        transform: `translate(${shake}px, ${shake * 0.5}px)`,
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
            filter: 'blur(16px) brightness(0.22) contrast(1.18)',
          }}
        />
      )}

      {/* 2. Background Shockwave Glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${accentColor}35 0%, #020409 75%)`,
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '780px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          padding: '0 20px',
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
              marginBottom: '18px',
              textShadow: `0 0 25px ${accentColor}`,
              textAlign: 'center',
              maxWidth: '90%',
            }}
          >
            {subText}
          </div>
        )}

        {/* Scaled Word with Clean Letter Spacing */}
        <div
          style={{
            transform: `scale(${impactSpring})`,
            fontSize: wordFontSize,
            fontWeight: '900',
            lineHeight: '1.05',
            letterSpacing: '-1.5px',
            textTransform: 'uppercase',
            color: '#ffffff',
            textAlign: 'center',
            textShadow: `0 0 50px ${accentColor}, 0 10px 40px rgba(0,0,0,0.9)`,
            WebkitTextStroke: '1px rgba(255,255,255,0.15)',
            maxWidth: '100%',
            wordBreak: 'break-word',
          }}
        >
          {word}
        </div>
      </div>
    </div>
  );
};
