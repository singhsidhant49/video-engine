import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const DiagramScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame - startFrame);

  const title = params.title || params.heading || 'Architecture Data Flow';
  const nodes = params.nodes || ['Frontend Client', 'API Gateway', 'Backend Microservice', 'Database Cluster'];

  // Traveling packet progress along vertical pipeline
  const packetProgress = interpolate(relFrame % 50, [0, 50], [0, 100]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at 50% 30%, #150d2a 0%, #070312 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 48px',
        fontFamily: "'Outfit', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          fontSize: '22px',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '3px',
          color: '#c084fc',
          background: 'rgba(168, 85, 247, 0.25)',
          padding: '10px 32px',
          borderRadius: '40px',
          marginBottom: '28px',
          border: '2px solid rgba(168, 85, 247, 0.5)',
        }}
      >
        SYSTEM ARCHITECTURE
      </div>

      <h1
        style={{
          fontSize: '56px',
          fontWeight: '900',
          color: '#ffffff',
          marginBottom: '60px',
          textAlign: 'center',
          lineHeight: '1.15',
          letterSpacing: '-1px',
        }}
      >
        {title}
      </h1>

      {/* Nodes Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', alignItems: 'center', width: '100%', maxWidth: '850px' }}>
        {nodes.map((nodeName, idx) => {
          const nodeSpring = spring({
            frame: relFrame - (idx * 8),
            fps,
            config: { damping: 14, stiffness: 200 },
          });

          return (
            <React.Fragment key={idx}>
              {/* Node Card */}
              <div
                style={{
                  transform: `scale(${Math.max(0, nodeSpring)})`,
                  width: '100%',
                  padding: '32px 40px',
                  borderRadius: '28px',
                  background: idx === 0 ? 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)' :
                              idx === nodes.length - 1 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                              'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
                  border: '2.5px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                  fontSize: '36px',
                  fontWeight: '900',
                  color: '#ffffff',
                  textAlign: 'center',
                  letterSpacing: '-0.5px',
                }}
              >
                {nodeName}
              </div>

              {/* Animated Connecting Beam with Moving Packet */}
              {idx < nodes.length - 1 && (
                <div style={{ width: '6px', height: '48px', background: 'rgba(168, 85, 247, 0.5)', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '-9px',
                      top: `${packetProgress}%`,
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#c084fc',
                      boxShadow: '0 0 25px #c084fc',
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
