import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Animated Stat Counter & KPI Dashboard (ReactVideoEditor style).
 * Features:
 * - Smooth spring-animated number counter ($0 -> $14.2B, 0% -> 94.8%)
 * - Glowing KPI card with trend badge (+340% / -82%)
 * - Subtext and source attribution
 */
export const StatCounterScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const title = params.headline || params.title || 'KEY PERFORMANCE METRIC';
  const targetNum = params.targetValue || params.statNumber || 85;
  const prefix = params.prefix || '';
  const suffix = params.suffix || '%';
  const label = params.statLabel || params.label || 'GLOBAL MARKET SHARE';
  const trend = params.trend || '+142%';
  const isPositive = !trend.startsWith('-');
  const accentColor = params.accentColor || '#38bdf8';

  const cardSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 16, stiffness: 180, mass: 0.6 },
  });

  // Smooth count-up animation
  const countProgress = interpolate(relFrame, [5, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const currentDisplayNum = typeof targetNum === 'number' 
    ? (targetNum * countProgress).toFixed(targetNum % 1 !== 0 ? 1 : 0)
    : params.statValue || '85%';

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
      <div
        style={{
          transform: `scale(${cardSpring})`,
          width: '100%',
          maxWidth: '82%',
          background: 'rgba(10, 15, 30, 0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          boxShadow: `0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px ${accentColor}25`,
          padding: '36px 28px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Glow ambient highlight */}
        <div
          style={{
            position: 'absolute',
            top: '-50%',
            left: '20%',
            width: '60%',
            height: '100%',
            background: `radial-gradient(circle, ${accentColor}33 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        {/* Top category pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '6px 16px',
            borderRadius: '100px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '12px',
            fontWeight: '700',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: '#94a3b8',
            marginBottom: '20px',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: accentColor }} />
          {title}
        </div>

        {/* Massive Counting Number */}
        <div
          style={{
            fontFamily: "'Inter Tight', 'Plus Jakarta Sans', sans-serif",
            fontSize: '76px',
            fontWeight: '900',
            letterSpacing: '-2px',
            lineHeight: '1.05',
            color: '#ffffff',
            textShadow: `0 0 30px ${accentColor}88, 0 4px 15px rgba(0,0,0,0.8)`,
            marginBottom: '14px',
          }}
        >
          {prefix}{currentDisplayNum}{suffix}
        </div>

        {/* Label & Trend Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '16px',
              fontWeight: '700',
              color: '#e2e8f0',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {label}
          </span>

          {trend && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: isPositive ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)',
                color: isPositive ? '#10b981' : '#f43f5e',
                border: `1px solid ${isPositive ? '#10b98144' : '#f43f5e44'}`,
                padding: '3px 10px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '800',
              }}
            >
              {isPositive ? '▲' : '▼'} {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
