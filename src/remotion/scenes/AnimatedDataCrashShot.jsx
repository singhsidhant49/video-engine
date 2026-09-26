import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Animated Data Crash / Surge Shot Primitive.
 * Features safe chart width, responsive header metrics, and dynamic topic palette integration.
 */
export const AnimatedDataCrashShot = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const direction = params.direction || 'crash';
  const isCrash = direction === 'crash';
  const themeColor = params.accentColor || (isCrash ? '#f43f5e' : '#10b981');

  const headline = params.headline || (isCrash ? 'MARKET COLLAPSE' : 'EXPONENTIAL GROWTH');
  const startValStr = params.startValue || (isCrash ? '$120.00' : '$1.50');
  const endValStr = params.endValue || (isCrash ? '$4.20' : '$850.00');
  const deltaPct = params.delta || (isCrash ? '-96.5%' : '+56,000%');
  const mediaUrl = params.mediaUrl || params.imageUrl || null;

  // Animation Progress
  const progress = interpolate(relFrame, [5, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pathLength = 1200;
  const strokeDashoffset = interpolate(progress, [0, 1], [pathLength, 0]);

  // Points plotted safely between X: 140 and X: 940 (inside 1080 canvas)
  const linePath = isCrash
    ? 'M 140 470 C 280 450, 400 500, 520 630 C 640 770, 760 920, 940 1060'
    : 'M 140 1060 C 280 990, 440 940, 580 800 C 720 650, 820 510, 940 450';

  const areaPath = `${linePath} L 940 1300 L 140 1300 Z`;

  const cameraShake = isCrash && relFrame > 45 && relFrame < 58
    ? Math.sin(relFrame * 2.5) * 3
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        overflow: 'hidden',
        fontFamily: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
        transform: `translateY(${cameraShake}px)`,
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
            filter: 'blur(16px) brightness(0.20) contrast(1.15)',
          }}
        />
      )}

      {/* 2. Background Volumetric Glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, ${themeColor}25 0%, #020409 85%)`,
        }}
      />

      {/* 3. Header Metric Bar inside Strict Safe Bounds (80% Width) */}
      <div
        style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          maxWidth: '820px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          borderBottom: '2px solid rgba(255,255,255,0.14)',
          paddingBottom: '16px',
          zIndex: 20,
          boxSizing: 'border-box',
        }}
      >
        <div>
          <div style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '2.5px', color: '#94a3b8', textTransform: 'uppercase' }}>
            {headline}
          </div>
          <div style={{ fontSize: '46px', fontWeight: '900', color: '#ffffff', letterSpacing: '-1.5px', marginTop: '4px' }}>
            {progress < 0.5 ? startValStr : endValStr}
          </div>
        </div>

        <div
          style={{
            fontSize: '26px',
            fontWeight: '900',
            color: themeColor,
            background: `${themeColor}22`,
            padding: '6px 16px',
            borderRadius: '14px',
            border: `1.5px solid ${themeColor}`,
            boxShadow: `0 0 25px ${themeColor}44`,
          }}
        >
          {deltaPct}
        </div>
      </div>

      {/* Dynamic SVG Line & Area */}
      <svg
        viewBox="0 0 1080 1600"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 10,
        }}
      >
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path
          d={areaPath}
          fill="url(#areaGradient)"
          opacity={progress}
        />

        <path
          d={linePath}
          fill="none"
          stroke={themeColor}
          strokeWidth="7"
          strokeDasharray={pathLength}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          filter={`drop-shadow(0 0 15px ${themeColor}99)`}
        />
      </svg>
    </div>
  );
};
