import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const TerminalScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const relFrame = Math.max(0, frame - startFrame);

  const command = params.command || 'docker compose up -d';
  const outputs = params.output || [
    'Container web-frontend-1 Starting...',
    'Container api-gateway-1 Starting...',
    'Container redis-cache-1 Starting...',
    'Container postgres-db-1 Starting...',
    '✔ All 4 services healthy on port 8080'
  ];

  const typedCount = Math.floor(
    interpolate(relFrame, [0, 25], [0, command.length], { extrapolateRight: 'clamp' })
  );
  const visibleCmd = command.slice(0, typedCount);
  const visibleOutputs = outputs.filter((_, idx) => relFrame > 30 + idx * 10);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#070a12',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Fira Code', 'Courier New', monospace",
        overflow: 'hidden',
      }}
    >
      {/* Full Width Terminal Header */}
      <div
        style={{
          width: '100%',
          padding: '24px 36px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderBottom: '2px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#27c93f' }} />
        </div>
        <div style={{ fontSize: '24px', fontWeight: '700', color: '#94a3b8' }}>
          developer@cloud-vps: ~
        </div>
        <div style={{ fontSize: '20px', color: '#10b981', fontWeight: 'bold' }}>
          ● BASH TERMINAL
        </div>
      </div>

      {/* Terminal Main Output Canvas */}
      <div style={{ flex: 1, padding: '52px 48px', fontSize: '34px', lineHeight: '1.7', color: '#f8fafc' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '32px' }}>
          <span style={{ color: '#10b981', fontWeight: '900' }}>$</span>
          <span style={{ color: '#ffffff', fontWeight: '700' }}>{visibleCmd}</span>
          {typedCount < command.length && (
            <span style={{ width: '14px', height: '36px', background: '#10b981', display: 'inline-block' }} />
          )}
        </div>

        {/* Output lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {visibleOutputs.map((line, idx) => (
            <div
              key={idx}
              style={{
                color: idx === outputs.length - 1 ? '#34d399' : '#94a3b8',
                fontWeight: idx === outputs.length - 1 ? '900' : '500',
                fontSize: idx === outputs.length - 1 ? '32px' : '28px',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
