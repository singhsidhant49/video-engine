import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Evidence Paper / Leaked Document Shot Primitive (Vox & Johnny Harris style).
 * Features authentic physics, paper fiber textures, editorial serif typography,
 * and an animated rough SVG yellow highlighter stroke with zero corner clipping.
 */
export const EvidencePaperShot = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const headline = params.headline || 'INTERNAL MEMO CONFIRMS FRAUD';
  const source = params.source || 'CLASSIFIED INTERNAL AUDIT — CONFIDENTIAL';
  const snippet = params.snippet || 'Executives were explicitly warned of insolvency months prior to liquidation.';
  const stampText = params.stampText || 'CONFIDENTIAL';
  const accentColor = params.accentColor || '#dc2626';

  const slamSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 190, mass: 0.7 },
  });

  const stampSpring = spring({
    frame: relFrame - 12,
    fps,
    config: { damping: 14, stiffness: 240, mass: 0.5 },
  });

  // SVG Highlighter Stroke Dashoffset progress
  const pathLength = 600;
  const strokeOffset = interpolate(relFrame, [12, 38], [pathLength, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Responsive font sizes based on text length to prevent overflow
  const headlineLen = headline.length;
  const headlineFontSize = headlineLen > 35 ? '28px' : (headlineLen > 22 ? '34px' : '38px');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '30px 24px',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Background Cinematic Spotlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(245, 158, 11, 0.12) 0%, #030408 85%)',
        }}
      />

      {/* Slamming Document Stack inside 76% Safe Width (Zero Corner Clipping) */}
      <div
        style={{
          transform: `scale(${slamSpring}) rotate(-1.0deg)`,
          width: '100%',
          maxWidth: '78%',
          background: '#f8f6f0',
          color: '#0f172a',
          padding: '42px 34px 50px 34px',
          borderRadius: '10px',
          boxShadow: '0 25px 70px rgba(0,0,0,0.9), 0 0 35px rgba(0,0,0,0.85)',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Paper Texture Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `radial-gradient(#d6cebe 1.5px, transparent 1.5px)`,
            backgroundSize: '14px 14px',
            opacity: 0.35,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />

        {/* Document Header / Masthead */}
        <div
          style={{
            borderBottom: '2px solid #1e293b',
            paddingBottom: '12px',
            marginBottom: '22px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '13px', fontWeight: '800', letterSpacing: '2px', textTransform: 'uppercase', color: '#475569' }}>
            {source}
          </div>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '13px', fontWeight: '800', color: accentColor, letterSpacing: '1px' }}>
            DOC #492-X
          </div>
        </div>

        {/* Big Editorial Serif Headline */}
        <div
          style={{
            fontFamily: "'Playfair Display', 'Cinzel', Georgia, serif",
            fontSize: headlineFontSize,
            fontWeight: '900',
            lineHeight: '1.25',
            letterSpacing: '-0.3px',
            marginBottom: '22px',
            color: '#090d16',
            position: 'relative',
            zIndex: 2,
            wordBreak: 'break-word',
          }}
        >
          {headline}
        </div>

        {/* Highlighted Evidence Passage */}
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: '22px',
            fontWeight: '600',
            fontStyle: 'italic',
            lineHeight: '1.4',
            color: '#1e293b',
            padding: '4px 6px',
            zIndex: 2,
            wordBreak: 'break-word',
          }}
        >
          {/* Animated SVG Highlighter */}
          <svg
            style={{
              position: 'absolute',
              inset: '-6px -10px',
              width: 'calc(100% + 20px)',
              height: 'calc(100% + 12px)',
              pointerEvents: 'none',
              zIndex: 1,
              mixBlendMode: 'multiply',
            }}
            viewBox="0 0 600 60"
            preserveAspectRatio="none"
          >
            <path
              d="M 5,30 Q 150,22 300,32 T 595,28"
              fill="none"
              stroke="rgba(250, 204, 21, 0.75)"
              strokeWidth="48"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={pathLength}
              strokeDashoffset={strokeOffset}
            />
          </svg>

          <span style={{ position: 'relative', zIndex: 3 }}>
            "{snippet}"
          </span>
        </div>

        {/* Red Classified Rubber Stamp */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '26px',
            transform: `scale(${Math.max(0, stampSpring)}) rotate(8deg)`,
            border: `3px solid ${accentColor}`,
            color: accentColor,
            padding: '4px 12px',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '16px',
            fontWeight: '900',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            borderRadius: '4px',
            opacity: 0.95,
            boxShadow: `0 4px 15px ${accentColor}33`,
            zIndex: 10,
          }}
        >
          {stampText}
        </div>
      </div>
    </div>
  );
};
