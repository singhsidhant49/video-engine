import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const TimelineScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const cardScale = spring({
    frame: relFrame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  const title = params.title || 'Architectural Evolution';
  const milestones = params.milestones || [
    { year: '2015', label: 'Monolith Architecture' },
    { year: '2020', label: 'Microservices & K8s' },
    { year: '2025', label: 'Edge Serverless Functions' },
  ];

  return (
    <div
      style={{
        transform: `scale(${cardScale})`,
        width: '94%',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '52px 40px',
        borderRadius: '32px',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(30px)',
        border: '3px solid rgba(56, 189, 248, 0.5)',
        boxShadow: '0 35px 90px rgba(0, 0, 0, 0.9), 0 0 60px rgba(56, 189, 248, 0.25)',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div
          style={{
            display: 'inline-block',
            fontSize: '18px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.2)',
            padding: '8px 24px',
            borderRadius: '30px',
            marginBottom: '16px',
            border: '1.5px solid rgba(56, 189, 248, 0.4)',
          }}
        >
          TIMELINE MILESTONES
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: '900', color: '#ffffff' }}>{title}</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {milestones.map((m, idx) => {
          const itemSpring = spring({
            frame: relFrame - (idx * 8 + 6),
            fps,
            config: { damping: 14, stiffness: 200 },
          });

          return (
            <div
              key={idx}
              style={{
                transform: `scale(${Math.max(0, itemSpring)})`,
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '24px 32px',
                borderRadius: '24px',
                background: idx === milestones.length - 1 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: idx === milestones.length - 1 ? '2px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div
                style={{
                  padding: '10px 20px',
                  borderRadius: '16px',
                  background: '#38bdf8',
                  color: '#090d16',
                  fontSize: '28px',
                  fontWeight: '900',
                }}
              >
                {m.year}
              </div>
              <div style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff' }}>
                {m.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
