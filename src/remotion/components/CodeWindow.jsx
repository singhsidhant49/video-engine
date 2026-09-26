import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const CodeWindow = ({
  title = 'solution.js',
  code = '',
  language = 'javascript',
  heading = '',
  subheading = '',
  accentColor = '#38bdf8',
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const popIn = spring({
    frame: relFrame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  const totalChars = code.length || 1;
  const typedCount = Math.floor(
    interpolate(relFrame, [0, 40], [0, totalChars], { extrapolateRight: 'clamp' })
  );

  const visibleCode = code.slice(0, typedCount);
  const codeLines = visibleCode.split('\n');

  return (
    <div
      style={{
        transform: `scale(${popIn})`,
        width: '94%',
        maxWidth: '1000px',
        margin: '0 auto',
        borderRadius: '28px',
        background: 'rgba(10, 15, 29, 0.95)',
        backdropFilter: 'blur(30px)',
        border: `3px solid ${accentColor}66`,
        boxShadow: `0 35px 90px rgba(0, 0, 0, 0.9), 0 0 60px ${accentColor}33`,
        overflow: 'hidden',
        fontFamily: "'Fira Code', 'Courier New', monospace",
      }}
    >
      {/* Visual Header Banner if heading present */}
      {heading && (
        <div
          style={{
            padding: '24px 32px',
            background: `linear-gradient(135deg, ${accentColor}22 0%, rgba(15, 23, 42, 0.6) 100%)`,
            borderBottom: `2px solid ${accentColor}33`,
            fontFamily: "'Outfit', sans-serif",
          }}
        >
          <div style={{ fontSize: '38px', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.5px' }}>
            {heading}
          </div>
          {subheading && (
            <div style={{ fontSize: '22px', fontWeight: '600', color: '#94a3b8', marginTop: '6px' }}>
              {subheading}
            </div>
          )}
        </div>
      )}

      {/* Mac VS Code Window Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          padding: '20px 32px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: '700',
            color: '#f8fafc',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: '800',
            textTransform: 'uppercase',
            color: accentColor,
            background: `${accentColor}25`,
            padding: '6px 16px',
            borderRadius: '12px',
            border: `1px solid ${accentColor}55`,
          }}
        >
          {language}
        </div>
      </div>

      {/* Code Text Body */}
      <div style={{ padding: '36px 40px', fontSize: '32px', lineHeight: '1.65', overflowX: 'auto' }}>
        {codeLines.map((line, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              gap: '24px',
              whiteSpace: 'pre-wrap',
              background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
              padding: '4px 8px',
              borderRadius: '8px',
            }}
          >
            <span style={{ color: '#475569', userSelect: 'none', width: '36px', textAlign: 'right', fontWeight: 'bold' }}>
              {idx + 1}
            </span>
            <span style={{ color: colorizeCode(line), fontWeight: '600' }}>
              {line}
              {idx === codeLines.length - 1 && typedCount < totalChars && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '32px',
                    background: accentColor,
                    marginLeft: '6px',
                    verticalAlign: 'middle',
                    boxShadow: `0 0 12px ${accentColor}`,
                  }}
                />
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Rich Syntax Highlighter Colors
function colorizeCode(line) {
  if (line.includes('//') || line.includes('❌') || line.includes('✅')) return '#94a3b8'; // Comments
  if (line.includes('const') || line.includes('let') || line.includes('function') || line.includes('return') || line.includes('import') || line.includes('from') || line.includes('async') || line.includes('await')) return '#ec4899'; // Pink Keywords
  if (line.includes('(') || line.includes(')') || line.includes('=>')) return '#38bdf8'; // Cyan Functions
  if (line.includes("'") || line.includes('"') || line.includes('`')) return '#a3e635'; // Lime Strings
  return '#f8fafc';
}
