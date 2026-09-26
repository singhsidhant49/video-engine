import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ProcessFlowScene = ({ params = {}, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = Math.max(0, frame - startFrame);

  const title = params.title || params.heading || 'Step-by-Step Blueprint';
  const steps = params.steps || [
    { num: '01', title: 'Data Ingestion', desc: 'Real-time pipeline indexing' },
    { num: '02', title: 'AI Processing', desc: 'Sub-millisecond inference' },
    { num: '03', title: 'Automated Output', desc: 'Zero manual human intervention' },
  ];

  const packetProgress = interpolate(relFrame % 45, [0, 45], [0, 100]);

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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '70px 44px',
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
          color: '#38bdf8',
          background: 'rgba(56, 189, 248, 0.2)',
          padding: '10px 32px',
          borderRadius: '40px',
          marginBottom: '24px',
          border: '2px solid rgba(56, 189, 248, 0.4)',
        }}
      >
        EXECUTION ROADMAP
      </div>

      <h1
        style={{
          fontSize: '54px',
          fontWeight: '900',
          color: '#ffffff',
          marginBottom: '52px',
          textAlign: 'center',
          letterSpacing: '-1px',
        }}
      >
        {title}
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', width: '100%', maxWidth: '880px' }}>
        {steps.map((step, idx) => {
          const itemSpring = spring({
            frame: relFrame - (idx * 8 + 4),
            fps,
            config: { damping: 14, stiffness: 200 },
          });

          return (
            <React.Fragment key={idx}>
              <div
                style={{
                  transform: `scale(${Math.max(0, itemSpring)})`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                  padding: '28px 36px',
                  borderRadius: '28px',
                  background: idx === steps.length - 1 ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%)' : 'rgba(15, 23, 42, 0.9)',
                  border: idx === steps.length - 1 ? '2.5px solid #38bdf8' : '1.5px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                }}
              >
                <div
                  style={{
                    fontSize: '32px',
                    fontWeight: '900',
                    color: '#090d16',
                    background: '#38bdf8',
                    padding: '12px 24px',
                    borderRadius: '20px',
                    flexShrink: 0,
                    boxShadow: '0 0 20px rgba(56, 189, 248, 0.5)',
                  }}
                >
                  {step.num || `0${idx + 1}`}
                </div>
                <div>
                  <div style={{ fontSize: '34px', fontWeight: '900', color: '#ffffff' }}>
                    {step.title}
                  </div>
                  {step.desc && (
                    <div style={{ fontSize: '24px', color: '#94a3b8', fontWeight: '600', marginTop: '6px' }}>
                      {step.desc}
                    </div>
                  )}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div style={{ width: '4px', height: '24px', background: 'rgba(56, 189, 248, 0.4)', alignSelf: 'center', position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: `${packetProgress}%`,
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#38bdf8',
                      boxShadow: '0 0 15px #38bdf8',
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
