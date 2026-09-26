import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const BrowserScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame - startFrame);

  const url = params.url || 'https://google.com';
  const title = params.title || params.heading || 'Web Request Pipeline';

  const typedCount = Math.floor(
    interpolate(relFrame, [0, 30], [0, url.length], { extrapolateRight: 'clamp' })
  );
  const visibleUrl = url.slice(0, typedCount);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#090d16',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Outfit', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* Edge-to-Edge Chrome Header Bar */}
      <div
        style={{
          width: '100%',
          padding: '24px 36px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '2px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ff5f56' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#27c93f' }} />
        </div>

        {/* Full Width Address Bar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 24px',
            borderRadius: '20px',
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1.5px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
            fontSize: '26px',
            fontWeight: '700',
            fontFamily: "'Fira Code', monospace",
          }}
        >
          <span style={{ color: '#10b981' }}>🔒</span>
          <span>{visibleUrl}</span>
          {typedCount < url.length && (
            <span style={{ width: '10px', height: '26px', background: '#38bdf8', display: 'inline-block' }} />
          )}
        </div>
      </div>

      {/* Main Full-Screen Browser Rendering Area */}
      <div
        style={{
          flex: 1,
          padding: '60px 48px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'radial-gradient(circle at 50% 40%, #0e1726 0%, #050811 100%)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '56px',
            fontWeight: '900',
            color: '#ffffff',
            lineHeight: '1.2',
            marginBottom: '20px',
            letterSpacing: '-1px',
          }}
        >
          {title}
        </div>

        <p style={{ fontSize: '28px', color: '#94a3b8', fontWeight: '600', marginBottom: '48px', maxWidth: '800px' }}>
          Real-Time Browser Document Object Model (DOM) Rendering Engine
        </p>

        {/* Animated Web Component Tiles */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            width: '100%',
            maxWidth: '850px',
          }}
        >
          <div
            style={{
              padding: '28px 36px',
              borderRadius: '24px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '2px solid #38bdf8',
              color: '#ffffff',
              fontSize: '30px',
              fontWeight: '800',
              boxShadow: '0 0 30px rgba(56, 189, 248, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}
          >
            <span>⚡ HTTP/3 QUIC Protocol Connection</span>
            <span style={{ color: '#10b981', fontWeight: '900' }}>Active</span>
          </div>

          <div
            style={{
              padding: '28px 36px',
              borderRadius: '24px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '2px solid #10b981',
              color: '#ffffff',
              fontSize: '30px',
              fontWeight: '800',
              boxShadow: '0 0 30px rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
            }}
          >
            <span>🛡️ TLS 1.3 Cryptographic Handshake</span>
            <span style={{ color: '#10b981', fontWeight: '900' }}>2ms Latency</span>
          </div>
        </div>
      </div>
    </div>
  );
};
