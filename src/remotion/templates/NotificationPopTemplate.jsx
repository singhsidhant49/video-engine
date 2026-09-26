import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Interactive Notification Pop / Alert Card (ReactVideoEditor style).
 * Features spring pop physics, app icon, sender tag, time label, and headline.
 */
export const NotificationPopTemplate = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const title = params.title || params.appName || 'BREAKING NEWS ALERT';
  const sender = params.sender || params.headline || 'WALL STREET JOURNAL';
  const message = params.message || params.snippet || 'Global markets experience sudden liquidity crunch as credit freezes.';
  const time = params.time || 'JUST NOW';
  const icon = params.icon || '🚨';
  const accentColor = params.accentColor || '#f43f5e';

  const popSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 15, stiffness: 220, mass: 0.5 },
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
      <div
        style={{
          transform: `scale(${popSpring}) translateY(${interpolate(popSpring, [0, 1], [-40, 0])}px)`,
          width: '100%',
          maxWidth: '82%',
          background: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(25px)',
          WebkitBackdropFilter: 'blur(25px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(255, 255, 255, 0.16)',
          boxShadow: `0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px ${accentColor}25`,
          padding: '24px 24px',
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${accentColor} 0%, #1e1b4b 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                boxShadow: `0 4px 15px ${accentColor}44`,
              }}
            >
              {icon}
            </div>
            <div>
              <div
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: '800',
                  color: '#ffffff',
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: '11px',
                  fontWeight: '700',
                  color: accentColor,
                  letterSpacing: '0.5px',
                }}
              >
                {sender}
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '11px',
              fontWeight: '700',
              color: '#94a3b8',
              letterSpacing: '0.8px',
            }}
          >
            {time}
          </div>
        </div>

        {/* Message body */}
        <div
          style={{
            fontFamily: "'Plus Jakarta Sans', 'Inter Tight', sans-serif",
            fontSize: '18px',
            fontWeight: '600',
            lineHeight: '1.4',
            color: '#f1f5f9',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </div>
      </div>
    </div>
  );
};
