import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ConceptCard = ({
  heading = '',
  subheading = '',
  highlights = [],
  accentColor = '#38bdf8',
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const cardScale = spring({
    frame: relFrame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  return (
    <div
      style={{
        transform: `scale(${cardScale})`,
        width: '94%',
        maxWidth: '980px',
        margin: '0 auto',
        padding: '52px 44px',
        borderRadius: '32px',
        background: 'rgba(11, 17, 32, 0.94)',
        backdropFilter: 'blur(30px)',
        border: `3px solid ${accentColor}66`,
        boxShadow: `0 35px 90px rgba(0, 0, 0, 0.9), 0 0 60px ${accentColor}33`,
        textAlign: 'center',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      {/* Neon Badge */}
      <div
        style={{
          display: 'inline-block',
          fontSize: '20px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '2.5px',
          color: accentColor,
          background: `${accentColor}25`,
          padding: '10px 28px',
          borderRadius: '40px',
          marginBottom: '28px',
          border: `1.5px solid ${accentColor}66`,
          boxShadow: `0 0 20px ${accentColor}33`,
        }}
      >
        CORE CONCEPT
      </div>

      {/* Main Large Title */}
      <h1
        style={{
          fontSize: '56px',
          fontWeight: '900',
          color: '#ffffff',
          lineHeight: '1.2',
          marginBottom: '20px',
          letterSpacing: '-1px',
          textShadow: `0 4px 20px rgba(0,0,0,0.8), 0 0 30px ${accentColor}44`,
        }}
      >
        {heading}
      </h1>

      {/* Subheading */}
      {subheading && (
        <p
          style={{
            fontSize: '28px',
            color: '#cbd5e1',
            lineHeight: '1.5',
            marginBottom: '36px',
            fontWeight: '600',
          }}
        >
          {subheading}
        </p>
      )}

      {/* High-Impact Feature Pill Items */}
      {highlights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
          {highlights.map((item, idx) => {
            const itemSpring = spring({
              frame: relFrame - (idx * 6 + 10),
              fps,
              config: { damping: 14, stiffness: 210 },
            });

            return (
              <div
                key={idx}
                style={{
                  transform: `scale(${Math.max(0, itemSpring)})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  padding: '22px 28px',
                  borderRadius: '20px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: `2px solid ${accentColor}44`,
                  boxShadow: `0 10px 30px rgba(0,0,0,0.4)`,
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: accentColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    fontWeight: '900',
                    color: '#090d16',
                    flexShrink: 0,
                    boxShadow: `0 0 15px ${accentColor}`,
                  }}
                >
                  ✓
                </div>
                <span style={{ fontSize: '28px', fontWeight: '800', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                  {item}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
