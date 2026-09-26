import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ChartScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relFrame = Math.max(0, frame - startFrame);

  const cardScale = spring({
    frame: relFrame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });

  const title = params.title || 'Throughput Benchmark';
  const labelA = params.labelA || 'Single Thread';
  const valA = params.valA || 150;
  const labelB = params.labelB || 'Multi Thread (Cluster)';
  const valB = params.valB || 1850;

  const maxVal = Math.max(valA, valB);

  // Animated bar growth
  const barAWidth = interpolate(relFrame, [0, 40], [0, (valA / maxVal) * 100], { extrapolateRight: 'clamp' });
  const barBWidth = interpolate(relFrame, [10, 50], [0, (valB / maxVal) * 100], { extrapolateRight: 'clamp' });

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
        border: '3px solid rgba(245, 158, 11, 0.5)',
        boxShadow: '0 35px 90px rgba(0, 0, 0, 0.9), 0 0 60px rgba(245, 158, 11, 0.25)',
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
            color: '#fbbf24',
            background: 'rgba(245, 158, 11, 0.2)',
            padding: '8px 24px',
            borderRadius: '30px',
            marginBottom: '16px',
            border: '1.5px solid rgba(245, 158, 11, 0.4)',
          }}
        >
          DATA BENCHMARK
        </div>
        <h1 style={{ fontSize: '48px', fontWeight: '900', color: '#ffffff' }}>{title}</h1>
      </div>

      {/* Bar A */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '26px', fontWeight: '800', color: '#cbd5e1', marginBottom: '12px' }}>
          <span>{labelA}</span>
          <span>{valA} req/sec</span>
        </div>
        <div style={{ width: '100%', height: '36px', borderRadius: '18px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden' }}>
          <div style={{ width: `${barAWidth}%`, height: '100%', background: 'linear-gradient(90deg, #64748b, #94a3b8)', borderRadius: '18px' }} />
        </div>
      </div>

      {/* Bar B (Highlight winner) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '28px', fontWeight: '900', color: '#fbbf24', marginBottom: '12px' }}>
          <span>🚀 {labelB}</span>
          <span>{valB} req/sec</span>
        </div>
        <div style={{ width: '100%', height: '44px', borderRadius: '22px', background: 'rgba(255, 255, 255, 0.1)', overflow: 'hidden', border: '2px solid #fbbf24' }}>
          <div style={{ width: `${barBWidth}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #ef4444)', borderRadius: '22px', boxShadow: '0 0 20px #f59e0b' }} />
        </div>
      </div>
    </div>
  );
};
