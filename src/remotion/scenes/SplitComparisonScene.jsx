import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Split Comparison (Versus / Before vs After) Primitive.
 * Features strict safe bounds, spacious typography, and contrasting thematic gradients.
 */
export const SplitComparisonScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame);

  const topSpring = spring({
    frame: relFrame,
    fps,
    config: { damping: 18, stiffness: 180 },
  });

  const bottomSpring = spring({
    frame: relFrame - 8,
    fps,
    config: { damping: 18, stiffness: 180 },
  });

  const topTitle = params.topTitle || '❌ TRADITIONAL METHOD';
  const topDesc = params.topDesc || 'Manual slow execution, high costs, high errors';
  const bottomTitle = params.bottomTitle || '⚡ AI AUTOMATION PIPELINE';
  const bottomDesc = params.bottomDesc || '100x faster, zero manual work, scales infinitely';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Plus Jakarta Sans', 'Inter Tight', system-ui, sans-serif",
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Split Half: Negative / Before */}
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 24px',
          background: 'radial-gradient(ellipse at 50% 60%, rgba(244, 63, 94, 0.18) 0%, rgba(15, 23, 42, 0.95) 75%)',
          textAlign: 'center',
          transform: `scale(${Math.max(0.8, topSpring)})`,
          opacity: Math.min(1, topSpring),
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: '32px',
            fontWeight: '900',
            color: '#f43f5e',
            marginBottom: '10px',
            letterSpacing: '-0.5px',
            textShadow: '0 0 30px rgba(244, 63, 94, 0.6), 0 4px 15px #000',
            maxWidth: '780px',
            wordBreak: 'break-word',
          }}
        >
          {topTitle}
        </div>
        <div
          style={{
            fontSize: '20px',
            color: '#cbd5e1',
            fontWeight: '600',
            lineHeight: '1.35',
            maxWidth: '720px',
            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            wordBreak: 'break-word',
          }}
        >
          {topDesc}
        </div>
      </div>

      {/* Luminous Horizontal Divider & VS Emblem */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '4px',
          background: 'linear-gradient(90deg, transparent 0%, #38bdf8 30%, #ffffff 50%, #38bdf8 70%, transparent 100%)',
          boxShadow: '0 0 25px #38bdf8',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            padding: '6px 20px',
            borderRadius: '20px',
            background: '#ffffff',
            color: '#070a14',
            fontSize: '18px',
            fontWeight: '900',
            letterSpacing: '3px',
            boxShadow: '0 0 30px #ffffff, 0 10px 25px rgba(0,0,0,0.8)',
          }}
        >
          VS
        </div>
      </div>

      {/* Bottom Split Half: Positive / Winner */}
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 24px',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(16, 185, 129, 0.20) 0%, rgba(15, 23, 42, 0.95) 75%)',
          textAlign: 'center',
          transform: `scale(${Math.max(0.8, bottomSpring)})`,
          opacity: Math.min(1, bottomSpring),
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: '34px',
            fontWeight: '900',
            color: '#34d399',
            marginBottom: '10px',
            letterSpacing: '-0.5px',
            textShadow: '0 0 35px rgba(16, 185, 129, 0.7), 0 4px 15px #000',
            maxWidth: '780px',
            wordBreak: 'break-word',
          }}
        >
          {bottomTitle}
        </div>
        <div
          style={{
            fontSize: '20px',
            color: '#f8fafc',
            fontWeight: '600',
            lineHeight: '1.35',
            maxWidth: '720px',
            textShadow: '0 2px 10px rgba(0,0,0,0.8)',
            wordBreak: 'break-word',
          }}
        >
          {bottomDesc}
        </div>
      </div>
    </div>
  );
};
