import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Metric Hero Shot Primitive.
 * Features spacious typography, radiant glow effects, zero edge clipping (780px safe maxWidth),
 * and dynamic topic palette integration.
 */
export const MetricHeroScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const scale = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 180, mass: 0.6 },
  });

  const pulse = interpolate(Math.sin(relFrame / 7), [-1, 1], [0.985, 1.015]);

  const statValue = params.statValue || params.value || '$10,000,000';
  const statLabel = params.statLabel || params.label || 'ANNUAL REVENUE';
  const headline = params.headline || params.heading || 'Market Valuation Impact';
  const accentColor = params.accentColor || params.palette?.primary || '#f59e0b';
  const mediaUrl = params.mediaUrl || params.imageUrl || null;

  // Responsive font sizing based on character length
  const valLength = statValue.length;
  const statFontSize = valLength > 13 ? '58px' : (valLength > 8 ? '74px' : '92px');

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
      {/* 1. Blurred Ambient Topic Background */}
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
            filter: 'blur(16px) brightness(0.20) contrast(1.15)',
          }}
        />
      )}

      {/* 2. Volumetric Radial Spotlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${accentColor}35 0%, rgba(2, 4, 10, 0.88) 65%, #010206 100%)`,
        }}
      />

      {/* 3. Hero Content Container with Safe Zone Padding (780px MaxWidth) */}
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
        {statLabel && (
          <div
            style={{
              display: 'inline-block',
              fontSize: '18px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '3px',
              color: accentColor,
              marginBottom: '16px',
              textShadow: `0 0 20px ${accentColor}`,
            }}
          >
            {statLabel}
          </div>
        )}

        {/* Scaled & Clamped Glowing Stat Hero */}
        <div
          style={{
            transform: `scale(${pulse})`,
            fontSize: statFontSize,
            fontWeight: '900',
            color: '#ffffff',
            lineHeight: '1.08',
            letterSpacing: '-1.5px',
            textShadow: `0 0 45px ${accentColor}, 0 4px 20px #000, 0 10px 40px rgba(0,0,0,0.9)`,
            WebkitTextStroke: '1px rgba(255,255,255,0.15)',
            marginBottom: '22px',
            wordBreak: 'break-word',
            maxWidth: '100%',
          }}
        >
          {statValue}
        </div>

        {headline && (
          <h2
            style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#e2e8f0',
              letterSpacing: '-0.5px',
              lineHeight: '1.3',
              maxWidth: '720px',
              margin: '0 auto',
              textShadow: '0 4px 20px rgba(0,0,0,0.9)',
              wordBreak: 'break-word',
            }}
          >
            {headline}
          </h2>
        )}
      </div>
    </div>
  );
};
