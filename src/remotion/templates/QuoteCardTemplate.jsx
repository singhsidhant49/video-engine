import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Editorial Quote Card Template (ReactVideoEditor style).
 * Features big serif quotation marks, author attribution, citation, and smooth typography entrance.
 */
export const QuoteCardTemplate = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const quote = params.quote || params.snippet || 'The library was not burned in a single day, but slowly eroded over centuries of neglect.';
  const author = params.author || params.source || 'Dr. Carl Sagan';
  const role = params.role || params.citation || 'Cosmos: A Personal Voyage (1980)';
  const accentColor = params.accentColor || '#fbbf24';

  const cardSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 17, stiffness: 170, mass: 0.6 },
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
          transform: `scale(${cardSpring})`,
          width: '100%',
          maxWidth: '82%',
          background: 'rgba(12, 16, 28, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '24px',
          border: '1.5px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 30px 70px rgba(0,0,0,0.85)',
          padding: '40px 32px',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Giant Serif Quotation Mark Accent */}
        <div
          style={{
            position: 'absolute',
            top: '-10px',
            left: '20px',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '110px',
            color: accentColor,
            opacity: 0.25,
            lineHeight: '1',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          “
        </div>

        {/* Quote Content */}
        <div
          style={{
            fontFamily: "'Newsreader', 'Playfair Display', Georgia, serif",
            fontSize: quote.length > 90 ? '22px' : (quote.length > 50 ? '26px' : '30px'),
            fontWeight: '600',
            fontStyle: 'italic',
            lineHeight: '1.35',
            color: '#f8fafc',
            marginBottom: '28px',
            position: 'relative',
            zIndex: 2,
            wordBreak: 'break-word',
          }}
        >
          "{quote}"
        </div>

        {/* Author Divider */}
        <div
          style={{
            width: '60px',
            height: '3px',
            background: accentColor,
            borderRadius: '2px',
            marginBottom: '16px',
          }}
        />

        {/* Author and Role */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: '18px',
              fontWeight: '800',
              color: '#ffffff',
              letterSpacing: '-0.2px',
            }}
          >
            {author}
          </div>
          {role && (
            <div
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: '13px',
                fontWeight: '600',
                color: '#94a3b8',
                marginTop: '3px',
                letterSpacing: '0.5px',
              }}
            >
              {role}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
