import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';
import { captionBand, Kicker } from './editorial.jsx';

/** Index of the most recently revealed item — the one the narration is on. */
const activeIndex = (frame, ats = []) => {
  let idx = 0;
  for (let i = 0; i < ats.length; i++) {
    if (frame >= ats[i]) idx = i;
  }
  return idx;
};

function StructuredBackground({ clip }) {
  if (clip.bed && clip.bed.length > 0) {
    return (
      <>
        <Bed shots={clip.bed} />
        <Shade where="all" strength={0.75} />
      </>
    );
  }
  return <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} mode={clip.overlay?.backgroundMode || 'neutralDark'} />;
}

function Stage({ children, theme, justify = 'center' }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: theme.safe.left,
        right: theme.safe.right,
        top: theme.safe.top,
        bottom: theme.safe.bottom + captionBand(theme) * 0.7,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
      }}
    >
      {children}
    </div>
  );
}

// ─── Editorial Numbered List ───────────────────────────────────────────────

function ListLedger({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title = 'KEY TAKEAWAYS', items = [], ats = [] } = clip.overlay || {};
  const active = activeIndex(frame, ats);
  const maxW = theme.width - theme.safe.left - theme.safe.right - theme.u(160);
  const longest = items.reduce((a, b) => (String(a).length > String(b).length ? a : b), '');
  const size = fitSize(longest, maxW * (theme.isVertical ? 1 : 0.78), theme.isVertical ? theme.size.h2 * 1.1 : theme.size.h1 * 0.9, { lines: 2, ratio: glyphRatio(theme.style) });

  return (
    <AbsoluteFill>
      <StructuredBackground clip={clip} />
      <Stage theme={theme}>
        {title && (
          <div style={{ marginBottom: theme.u(32) }}>
            <Kicker text={title} at={0} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.map((item, i) => {
            const isCurrent = i === active;
            const isPast = i < active;
            // CRITICAL FIX: All items are visible from frame 1 so the screen is NEVER pitch black!
            const itemOpacity = isCurrent ? 1 : isPast ? 0.65 : 0.32;
            const ruleProgress = progress(frame, Math.max(0, (ats[i] ?? (i * 20)) - 6), 16, ease.inOut);

            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Precision architectural hairline rule */}
                <div style={{ height: 1, width: `${Math.max(0.15, ruleProgress) * 100}%`, background: isCurrent ? theme.palette.accent : theme.palette.line }} />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: theme.u(36),
                    padding: `${theme.u(theme.isVertical ? 28 : 22)}px 0`,
                    opacity: itemOpacity,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      fontFamily: theme.font.mono,
                      fontSize: size * 0.85,
                      lineHeight: 1,
                      color: isCurrent ? theme.palette.accent : theme.palette.muted,
                      width: theme.u(70),
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ ...t.display, fontSize: size, lineHeight: 1.12, color: isCurrent ? theme.palette.text : theme.palette.muted }}>
                    {item}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ height: 1, width: '100%', background: theme.palette.line }} />
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

function ListStack({ clip }) {
  return <ListLedger clip={clip} />;
}

export function ListShot({ clip }) {
  return <ListLedger clip={clip} />;
}

// ─── Technical Process / Workflow Stages ───────────────────────────────────

export function ProcessShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { steps = [], ats = [] } = clip.overlay || {};
  const active = activeIndex(frame, ats);
  const vertical = theme.isVertical;
  const n = Math.max(1, steps.length);
  const colW = (theme.width - theme.safe.left - theme.safe.right - theme.u(24 * (n - 1))) / n;

  return (
    <AbsoluteFill>
      <StructuredBackground clip={clip} />
      <Stage theme={theme}>
        <div style={{ marginBottom: theme.u(vertical ? 28 : 36) }}>
          <Kicker text={clip.overlay?.title || "TECHNICAL SEQUENCE // EXECUTION"} at={0} />
        </div>

        {/* Clean editorial stage columns / vertical mobile cascade */}
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: theme.u(vertical ? 28 : 24), flex: vertical ? 1 : 'unset', justifyContent: vertical ? 'space-around' : 'flex-start' }}>
          {steps.map((step, i) => {
            const isCurrent = i === active;
            const isPast = i < active;
            const stageOpacity = isCurrent ? 1 : isPast ? 0.78 : 0.52;
            const progressSweep = progress(frame, Math.max(0, (ats[i] ?? (i * 16)) - 4), 16, ease.inOut);

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  width: vertical ? '100%' : colW,
                  opacity: stageOpacity,
                  borderLeft: vertical ? `3px solid ${isCurrent ? theme.palette.accent : theme.palette.line}` : 'none',
                  paddingLeft: vertical ? theme.u(16) : 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {/* Precision top accent rule (landscape) */}
                {!vertical && (
                  <div style={{ height: theme.u(3), width: `${Math.max(0.18, progressSweep) * 100}%`, background: isCurrent ? theme.palette.accent : theme.palette.line, marginBottom: theme.u(18) }} />
                )}

                {/* Monospace phase tag */}
                <div style={{ ...t.label, fontFamily: theme.font.mono, color: isCurrent ? theme.palette.accent : theme.palette.muted, fontSize: theme.size.label * (vertical ? 1.15 : 0.95), marginBottom: theme.u(6) }}>
                  PHASE // {String(i + 1).padStart(2, '0')}
                </div>

                {/* Stage title */}
                <div style={{ ...t.display, fontSize: theme.size.h2 * (vertical ? 1.05 : 0.88), lineHeight: 1.15, color: isCurrent ? theme.palette.text : theme.palette.muted }}>
                  {step.title || step.label}
                </div>

                {/* Technical detail */}
                {(step.detail || step.desc) && (
                  <div style={{ ...t.body, color: theme.palette.muted, fontSize: theme.size.body * (vertical ? 1.0 : 0.88), marginTop: theme.u(8), lineHeight: 1.35 }}>
                    {step.detail || step.desc}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────

export function TimelineShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { events = [], ats = [] } = clip.overlay || {};
  const active = activeIndex(frame, ats);
  const vertical = theme.isVertical;
  const n = Math.max(1, events.length);

  return (
    <AbsoluteFill>
      <StructuredBackground clip={clip} />
      <Stage theme={theme}>
        <div style={{ marginBottom: theme.u(40) }}>
          <Kicker text="CHRONOLOGY // HISTORICAL MILESTONES" at={0} />
        </div>

        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: theme.u(vertical ? 32 : 36) }}>
          {events.map((e, i) => {
            const isCurrent = i === active;
            const isPast = i < active;
            const opacity = isCurrent ? 1 : isPast ? 0.65 : 0.32;
            const ruleP = progress(frame, Math.max(0, (ats[i] ?? (i * 20)) - 6), 18, ease.inOut);

            return (
              <div key={i} style={{ flex: 1, opacity, display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: theme.u(3), width: `${Math.max(0.15, ruleP) * 100}%`, background: isCurrent ? theme.palette.accent : theme.palette.line, marginBottom: theme.u(16) }} />
                <div style={{ fontFamily: theme.font.display, fontSize: theme.size.h1 * 0.95, color: isCurrent ? theme.palette.accent : theme.palette.muted, lineHeight: 1 }}>
                  {e.date}
                </div>
                <div style={{ ...t.body, fontSize: theme.size.body, marginTop: theme.u(12), color: isCurrent ? theme.palette.text : theme.palette.muted }}>
                  {e.label}
                </div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

// ─── Comparison ────────────────────────────────────────────────────────────

export function CompareShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { left = { title: 'BEFORE', items: [] }, right = { title: 'AFTER', items: [] }, leftAt = 2, rightAt = 16 } = clip.overlay || {};

  // Frame-0 Validity: Bound animation timing so opponent never takes 8+ seconds to appear!
  const boundedRightAt = Math.min(Number.isFinite(rightAt) ? rightAt : 16, (Number.isFinite(leftAt) ? leftAt : 2) + 16);
  const pLeft = progress(frame, leftAt, 16, ease.out);
  const pRight = progress(frame, boundedRightAt, 16, ease.out);

  const leftItems = left.items || (left.detail ? [left.detail] : left.desc ? [left.desc] : []);
  const rightItems = right.items || (right.detail ? [right.detail] : right.desc ? [right.desc] : []);

  return (
    <AbsoluteFill>
      <StructuredBackground clip={clip} />
      <Stage theme={theme}>
        <div style={{ marginBottom: theme.u(theme.isVertical ? 24 : 32) }}>
          <Kicker text="COMPARATIVE ANALYSIS" at={0} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: theme.isVertical ? 'column' : 'row',
            gap: theme.u(theme.isVertical ? 32 : 44),
            position: 'relative',
            alignItems: 'stretch',
          }}
        >
          {/* Left Column (Frame-0 Subdued Baseline: 0.48 opacity) */}
          <div
            style={{
              flex: 1,
              opacity: 0.48 + 0.52 * pLeft,
              borderLeft: !theme.isVertical ? `3px solid ${theme.palette.muted}` : 'none',
              borderTop: theme.isVertical ? `2px solid ${theme.palette.muted}` : 'none',
              paddingLeft: !theme.isVertical ? theme.u(20) : 0,
              paddingTop: theme.isVertical ? theme.u(14) : 0,
            }}
          >
            <div style={{ borderBottom: `1px solid ${theme.palette.line}`, paddingBottom: theme.u(12), marginBottom: theme.u(16) }}>
              <div style={{ ...t.display, fontSize: theme.size.h2 * (theme.isVertical ? 1.05 : 0.95), color: theme.palette.text, fontWeight: 700 }}>
                {left.title}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(14) }}>
              {leftItems.map((item, idx) => (
                <div key={idx} style={{ ...t.body, fontSize: theme.size.body * (theme.isVertical ? 1.05 : 0.95), color: theme.palette.muted, lineHeight: 1.35 }}>
                  — {item}
                </div>
              ))}
            </div>
          </div>

          {/* Precision Dividing Rule with Center Tension Badge */}
          {!theme.isVertical ? (
            <div style={{ width: 1, background: theme.palette.line, position: 'relative', alignSelf: 'stretch' }}>
              <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', background: theme.palette.bg, border: `1px solid ${theme.palette.line}`, padding: '4px 10px', fontFamily: theme.font.mono, fontSize: theme.size.label * 0.85, color: theme.palette.accent }}>
                VS
              </div>
            </div>
          ) : (
            <div style={{ height: 1, background: theme.palette.line, position: 'relative', margin: `${theme.u(8)}px 0` }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: theme.palette.bg, border: `1px solid ${theme.palette.line}`, padding: '2px 8px', fontFamily: theme.font.mono, fontSize: theme.size.label * 0.85, color: theme.palette.accent }}>
                VS
              </div>
            </div>
          )}

          {/* Right Column (Frame-0 Subdued Baseline: 0.48 opacity) */}
          <div
            style={{
              flex: 1,
              opacity: 0.48 + 0.52 * pRight,
              borderLeft: !theme.isVertical ? `3px solid ${theme.palette.accent}` : 'none',
              borderTop: theme.isVertical ? `2px solid ${theme.palette.accent}` : 'none',
              paddingLeft: !theme.isVertical ? theme.u(20) : 0,
              paddingTop: theme.isVertical ? theme.u(14) : 0,
            }}
          >
            <div style={{ borderBottom: `1px solid ${theme.palette.accent}`, paddingBottom: theme.u(12), marginBottom: theme.u(16) }}>
              <div style={{ ...t.display, fontSize: theme.size.h2 * (theme.isVertical ? 1.05 : 0.95), color: theme.palette.accent, fontWeight: 700 }}>
                {right.title}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(14) }}>
              {rightItems.map((item, idx) => (
                <div key={idx} style={{ ...t.body, fontSize: theme.size.body * (theme.isVertical ? 1.05 : 0.95), color: theme.palette.text, lineHeight: 1.35 }}>
                  ✦ {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

// ─── Chart ─────────────────────────────────────────────────────────────────

export function ChartShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title = 'METRIC TREND', values = [20, 45, 78, 120], labels = ['Q1', 'Q2', 'Q3', 'Q4'], at = 4, drawFrames = 24 } = clip.overlay || {};
  const p = progress(frame, at, drawFrames, ease.out);
  const maxVal = Math.max(...values, 1);
  const chartH = theme.u(theme.isVertical ? 240 : 280);

  return (
    <AbsoluteFill>
      <StructuredBackground clip={clip} />
      <Stage theme={theme}>
        <div style={{ marginBottom: theme.u(28) }}>
          <Kicker text={title} at={0} />
        </div>
        <div style={{ height: chartH, display: 'flex', alignItems: 'flex-end', gap: theme.u(theme.isVertical ? 24 : 44), borderBottom: `1px solid ${theme.palette.line}`, paddingBottom: theme.u(10) }}>
          {values.map((v, i) => {
            const h = (v / maxVal) * chartH * 0.85 * p;
            const isLast = i === values.length - 1;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ ...t.label, fontFamily: theme.font.mono, color: isLast ? theme.palette.accent : theme.palette.muted, marginBottom: theme.u(8), opacity: p > 0.5 ? 1 : 0 }}>
                  {v}
                </div>
                <div style={{ width: '60%', height: h, background: isLast ? theme.palette.accent : theme.palette.bgRaised, border: `1px solid ${isLast ? theme.palette.accent : theme.palette.line}` }} />
                <div style={{ ...t.label, marginTop: theme.u(12), color: isLast ? theme.palette.text : theme.palette.muted }}>
                  {labels[i] || `T${i + 1}`}
                </div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

export function UiShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { app = 'ALERT', title = '', body = '', at = 4 } = clip.overlay || {};
  const p = progress(frame, at, 16);
  const w = theme.isVertical ? theme.width * 0.88 : theme.width * 0.44;

  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        <div
          style={{
            width: w,
            margin: '0 auto',
            background: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${theme.palette.line}`,
            padding: `${theme.u(32)}px ${theme.u(36)}px`,
            opacity: p,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.u(12), marginBottom: theme.u(14) }}>
            <div style={{ width: theme.u(8), height: theme.u(8), borderRadius: '50%', background: theme.palette.accent }} />
            <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.small, color: theme.palette.accent, letterSpacing: '0.12em' }}>{app.toUpperCase()}</div>
          </div>
          <div style={{ fontSize: theme.size.h2 * 0.85, fontWeight: 700, color: theme.palette.text }}>{title}</div>
          <div style={{ fontSize: theme.size.body * 0.95, color: theme.palette.muted, marginTop: theme.u(8), lineHeight: 1.35 }}>{body}</div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

export function CodeShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { code = '', language = 'CODE', from = 0, to = 60 } = clip.overlay || {};
  const chars = Math.floor(interpolate(frame, [from, Math.max(from + 1, to)], [0, code.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const visible = code.slice(0, chars);

  return (
    <AbsoluteFill>
      <Ground texture={null} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        <div style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid ${theme.palette.line}`, padding: `${theme.u(28)}px ${theme.u(34)}px` }}>
          <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.small, color: theme.palette.accent, marginBottom: theme.u(14) }}>// {language.toUpperCase()}</div>
          <pre style={{ margin: 0, fontFamily: theme.font.mono, fontSize: theme.size.body * 0.85, color: theme.palette.text, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {visible}
          </pre>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

export function GroundShot({ clip }) {
  return <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />;
}
