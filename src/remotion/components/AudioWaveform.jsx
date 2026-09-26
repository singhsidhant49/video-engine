import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const AudioWaveform = ({ barCount = 18, color = '#38bdf8' }) => {
  const frame = useCurrentFrame();

  const bars = Array.from({ length: barCount }).map((_, i) => {
    // Generate realistic multi-sine wave motion per bar
    const wave = Math.sin((frame / 4) + i * 0.5) * Math.cos((frame / 6) + i * 0.3);
    const height = interpolate(wave, [-1, 1], [12, 60]);
    return height;
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '12px 20px',
        borderRadius: '30px',
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {bars.map((h, index) => (
        <div
          key={index}
          style={{
            width: '6px',
            height: `${h}px`,
            backgroundColor: color,
            borderRadius: '4px',
            boxShadow: `0 0 10px ${color}`,
            transition: 'height 0.05s ease-in-out',
          }}
        />
      ))}
    </div>
  );
};
