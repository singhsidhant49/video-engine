import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';
import { captionBand, Kicker } from './editorial.jsx';

/** Any CSS colour at `pct`% opacity (palette colours are hsl() strings). */
const tint = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** Index of the most recently revealed item — the one the narration is on. */
const activeIndex = (frame, ats) => ats.reduce((acc, at, i) => (frame >= at ? i : acc), -1);

function Stage({ children, theme, justify = 'center' }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: theme.safe.left,
        right: theme.safe.right,
        top: theme.safe.top,
        bottom: theme.safe.bottom + captionBand(theme),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
      }}
    >
      {children}
    </div>
  );
}

// ─── Numbered list — attention follows the narration ──────────────────────

function ListStack({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title, items, ats } = clip.overlay;
  const active = activeIndex(frame, ats);
  const maxW = theme.width - theme.safe.left - theme.safe.right - theme.u(120);
  const longest = items.reduce((a, b) => (a.length > b.length ? a : b), '');
  const size = fitSize(longest, maxW * (theme.isVertical ? 1 : 0.8), theme.isVertical ? theme.size.h2 * 1.15 : theme.size.h1, { lines: 2, ratio: glyphRatio(theme.style) });
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <div style={{ marginBottom: theme.u(48) }}><Kicker text={title} at={Math.max(0, (ats[0] ?? 10) - 10)} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(theme.isVertical ? 44 : 30) }}>
          {items.map((item, i) => {
            const shown = frame >= ats[i];
            const isActive = i === active;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: theme.u(34), ...reveal(theme.style.motion.reveal, frame, ats[i], theme.unit), opacity: shown ? (isActive ? 1 : 0.38) : 0 }}>
                <div style={{ fontFamily: theme.font.mono, fontSize: theme.size.label * 1.1, color: theme.palette.accent, minWidth: theme.u(70) }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ ...t.display, fontSize: size, lineHeight: 1.05 }}>{item}</div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

/** Cards: each item a tile with a large index — grid in 16:9, stacked tiles in 9:16. */
function ListCards({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title, items, ats } = clip.overlay;
  const active = activeIndex(frame, ats);
  const vertical = theme.isVertical;
  const areaW = theme.width - theme.safe.left - theme.safe.right;
  const cols = vertical ? 1 : Math.min(items.length, items.length === 4 ? 2 : 3);
  const gap = theme.u(28);
  const cardW = (areaW - gap * (cols - 1)) / cols;
  const longest = items.reduce((a, b) => (a.length > b.length ? a : b), '');
  const size = fitSize(longest, cardW - theme.u(80), vertical ? theme.size.h2 : theme.size.h2 * 1.1, { lines: 3, ratio: glyphRatio(theme.style) });
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <div style={{ marginBottom: theme.u(44) }}><Kicker text={title} at={Math.max(0, (ats[0] ?? 10) - 10)} /></div>}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cardW}px)`, gap }}>
          {items.map((item, i) => {
            const isActive = i === active;
            return (
              <div key={i} style={{ background: isActive ? theme.palette.accentSoft : theme.palette.bgRaised, border: `${theme.u(2)}px solid ${isActive ? theme.palette.accent : theme.palette.line}`, padding: `${theme.u(vertical ? 34 : 40)}px ${theme.u(40)}px`, display: 'flex', flexDirection: vertical ? 'row' : 'column', alignItems: vertical ? 'center' : 'flex-start', gap: theme.u(vertical ? 34 : 18), minHeight: vertical ? 0 : theme.u(260), ...reveal(theme.style.motion.reveal, frame, ats[i], theme.unit), opacity: frame < ats[i] ? 0 : 1 }}>
                <div style={{ ...t.display, fontSize: theme.size.h1 * 0.95, color: isActive ? theme.palette.accent : theme.palette.muted, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ ...t.display, fontSize: size, lineHeight: 1.06, opacity: i <= active ? 1 : 0.5 }}>{item}</div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

/** Ledger: editorial rules between items, oversized light numerals — quiet, documentary. */
function ListLedger({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title, items, ats } = clip.overlay;
  const active = activeIndex(frame, ats);
  const maxW = theme.width - theme.safe.left - theme.safe.right - theme.u(200);
  const longest = items.reduce((a, b) => (a.length > b.length ? a : b), '');
  const size = fitSize(longest, maxW * (theme.isVertical ? 1 : 0.75), theme.isVertical ? theme.size.h2 * 1.1 : theme.size.h1 * 0.9, { lines: 2, ratio: glyphRatio(theme.style) });
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <div style={{ ...t.label, color: theme.palette.accent, marginBottom: theme.u(30), ...reveal('fade', frame, Math.max(0, (ats[0] ?? 10) - 10), theme.unit) }}>{title}</div>}
        {items.map((item, i) => {
          const rule = progress(frame, ats[i] - 4, 18, ease.inOut);
          return (
            <div key={i}>
              <div style={{ height: 1, width: `${rule * 100}%`, background: theme.palette.line }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: theme.u(40), padding: `${theme.u(theme.isVertical ? 34 : 24)}px 0`, opacity: frame < ats[i] ? 0 : i === active ? 1 : 0.42, ...reveal('fade', frame, ats[i], theme.unit) }}>
                <div style={{ fontFamily: theme.font.display, fontWeight: 300, fontSize: size * 1.25, lineHeight: 1, color: i === active ? theme.palette.accent : theme.palette.muted, width: theme.u(140), fontVariantNumeric: 'tabular-nums' }}>{i + 1}</div>
                <div style={{ ...t.display, fontSize: size, lineHeight: 1.08 }}>{item}</div>
              </div>
            </div>
          );
        })}
        <div style={{ height: 1, width: `${progress(frame, ats[items.length - 1] + 6, 18, ease.inOut) * 100}%`, background: theme.palette.line }} />
      </Stage>
    </AbsoluteFill>
  );
}

export function ListShot({ clip }) {
  if (clip.variant === 'cards') return <ListCards clip={clip} />;
  if (clip.variant === 'ledger') return <ListLedger clip={clip} />;
  return <ListStack clip={clip} />;
}

// ─── Process — nodes light up as each step is spoken ──────────────────────

export function ProcessShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { steps, ats } = clip.overlay;
  const active = activeIndex(frame, ats);
  const vertical = theme.isVertical;
  const n = steps.length;
  // Continuous line progress toward the active node.
  const lineP = ats.reduce((acc, at, i) => (i === 0 ? acc : acc + progress(frame, at - 6, 16, ease.inOut)), 0) / Math.max(1, n - 1);
  const node = theme.u(vertical ? 72 : 56);
  const colW = (theme.width - theme.safe.left - theme.safe.right) / n;
  const titleSize = vertical ? theme.size.h1 * 0.9 : fitSize(steps.reduce((a, b) => (a.title.length > b.title.length ? a : b)).title, colW * 0.9, theme.size.h2, { lines: 2, ratio: glyphRatio(theme.style) });
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        <div style={{ position: 'relative', display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? theme.u(96) : 0 }}>
          {/* rail */}
          <div style={{ position: 'absolute', background: theme.palette.line, ...(vertical ? { left: node / 2 - 1, top: node / 2, bottom: node / 2, width: 2 } : { top: node / 2 - 1, left: colW / 2, right: colW / 2, height: 2 }) }} />
          <div style={{ position: 'absolute', background: theme.palette.accent, ...(vertical ? { left: node / 2 - 2, top: node / 2, width: 4, height: `calc((100% - ${node}px) * ${lineP})` } : { top: node / 2 - 2, left: colW / 2, height: 4, width: `calc((100% - ${colW}px) * ${lineP})` }) }} />
          {steps.map((s, i) => {
            const on = i <= active;
            const isActive = i === active;
            return (
              <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: vertical ? 'row' : 'column', alignItems: vertical ? 'flex-start' : 'center', textAlign: vertical ? 'left' : 'center', gap: theme.u(34), width: vertical ? 'auto' : colW, opacity: frame >= ats[i] - 2 ? 1 : 0.28 }}>
                <div style={{ width: node, height: node, flexShrink: 0, borderRadius: '50%', border: `${theme.u(3)}px solid ${on ? theme.palette.accent : theme.palette.line}`, background: isActive ? theme.palette.accent : theme.palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: theme.font.mono, fontSize: theme.size.small, color: isActive ? theme.palette.bg : theme.palette.text, transform: `scale(${1 + 0.12 * progress(frame, ats[i], 10) - 0.12 * (i < active ? 1 : 0)})` }}>
                  {i + 1}
                </div>
                <div style={{ ...reveal(theme.style.motion.reveal, frame, ats[i], theme.unit), paddingTop: vertical ? theme.u(2) : 0 }}>
                  <div style={{ ...t.display, fontSize: titleSize, lineHeight: 1.04, color: isActive || !on ? theme.palette.text : theme.palette.muted }}>{s.title}</div>
                  {s.detail && <div style={{ ...t.body, color: theme.palette.muted, marginTop: theme.u(12), fontSize: theme.size.body }}>{s.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

// ─── Timeline — the camera travels along the rail ─────────────────────────

export function TimelineShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { events, ats } = clip.overlay;
  const vertical = theme.isVertical;
  const spacing = theme.u(vertical ? 330 : 520);
  // Travel position: eased steps toward each event as it is spoken.
  const pos = ats.reduce((acc, at, i) => (i === 0 ? acc : acc + progress(frame, at - 8, 22, ease.inOut)), 0);
  const active = activeIndex(frame, ats);
  const centre = vertical ? (theme.height - theme.safe.bottom - captionBand(theme) + theme.safe.top) / 2 : theme.width / 2;
  const offset = centre - pos * spacing - (vertical ? theme.u(60) : 0);
  const railStart = theme.safe.left + theme.u(30);
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <AbsoluteFill>
        <div style={{ position: 'absolute', background: theme.palette.line, ...(vertical ? { left: railStart, top: 0, bottom: 0, width: 2 } : { top: '52%', left: 0, right: 0, height: 2 }) }} />
        {events.map((e, i) => {
          const at = vertical ? { top: offset + i * spacing, left: railStart } : { left: offset + i * spacing, top: '52%' };
          const on = i <= active;
          return (
            <div key={i} style={{ position: 'absolute', ...at }}>
              <div style={{ position: 'absolute', width: theme.u(26), height: theme.u(26), borderRadius: '50%', left: -theme.u(13), top: -theme.u(13), background: on ? theme.palette.accent : theme.palette.bg, border: `${theme.u(3)}px solid ${on ? theme.palette.accent : theme.palette.line}` }} />
              <div
                style={{
                  position: 'absolute',
                  ...(vertical ? { left: theme.u(56), top: -theme.u(70), width: theme.width - railStart - theme.safe.right - theme.u(60) } : { left: -theme.u(220), width: theme.u(440), bottom: theme.u(44), textAlign: 'center' }),
                  opacity: i === active ? 1 : on ? 0.45 : 0.25,
                  ...reveal('rise', frame, ats[i] - 4, theme.unit),
                }}
              >
                <div style={{ ...t.display, fontSize: theme.size.h1 * 1.1, color: theme.palette.accent, textTransform: 'none' }}>{e.date}</div>
                <div style={{ ...t.body, fontSize: theme.size.body * 1.05, marginTop: theme.u(8) }}>{e.label}</div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Chart — real series, drawn on the spoken beat ────────────────────────

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1e-9, v)));
  return Math.ceil(v / p) * p;
}

/**
 * Share of a whole (adapted from the RVE "Donut Chart" template, MIT): segments
 * draw in order, the largest share is named in the centre, legend follows.
 */
function ShareChart({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title, unit, points, at, drawFrames } = clip.overlay;
  const vertical = theme.isVertical;
  const R = theme.u(vertical ? 300 : 280), stroke = theme.u(vertical ? 84 : 76);
  const C = 2 * Math.PI * R;
  const total = points.reduce((s, p) => s + p.value, 0);
  const shades = points.map((_, i) => (i === 0 ? theme.palette.accent : `color-mix(in srgb, ${theme.palette.accent} ${Math.max(18, 70 - i * 17)}%, ${theme.palette.bgRaised})`));
  const lead = points.reduce((a, b) => (a.value >= b.value ? a : b));
  const segFrames = drawFrames / points.length;
  let offset = 0;
  const size = R * 2 + stroke;
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <div style={{ marginBottom: theme.u(40) }}><Kicker text={title} at={Math.max(0, at - 12)} /></div>}
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: theme.u(vertical ? 60 : 110) }}>
          <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
            <svg width={size} height={size}>
              <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={theme.palette.line} strokeWidth={stroke} opacity={0.35} />
              {points.map((p, i) => {
                const len = (p.value / total) * C;
                const q = progress(frame, at + i * segFrames, segFrames, ease.inOut);
                const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={shades[i]} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len * q - theme.u(4))} ${C}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
                offset += len;
                return el;
              })}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: progress(frame, at + segFrames * 0.6, 14) }}>
              <div style={{ ...t.display, fontSize: theme.size.display * 0.8, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{Math.round(lead.value)}{unit === '%' || !unit ? '%' : ` ${unit}`}</div>
              <div style={{ ...t.label, marginTop: theme.u(10) }}>{lead.label}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(22) }}>
            {points.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: theme.u(20), opacity: progress(frame, at + i * segFrames + segFrames * 0.5, 12) }}>
                <div style={{ width: theme.u(26), height: theme.u(26), background: shades[i] }} />
                <div style={{ ...t.body, fontSize: theme.size.body * 1.05 }}>{p.label}</div>
                <div style={{ ...t.body, color: theme.palette.muted, fontVariantNumeric: 'tabular-nums' }}>{p.value}{unit === '%' || !unit ? '%' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

/**
 * Ranking (adapted from the RVE "Progress Bars" template, MIT): horizontal bars
 * grow in rank order with value labels — readable with long labels, unlike columns.
 */
function RankChart({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { title, unit, points, at, drawFrames } = clip.overlay;
  const areaW = theme.width - theme.safe.left - theme.safe.right;
  const max = Math.max(...points.map((p) => p.value));
  const barH = theme.u(theme.isVertical ? 30 : 26);
  const step = drawFrames / Math.max(1, points.length);
  const fmt = (v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <div style={{ marginBottom: theme.u(46) }}><Kicker text={title} at={Math.max(0, at - 12)} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(theme.isVertical ? 40 : 30) }}>
          {points.map((p, i) => {
            const q = progress(frame, at + i * step, Math.max(12, step * 1.6), ease.out);
            return (
              <div key={i} style={{ opacity: Math.min(1, q * 3) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.u(12) }}>
                  <div style={{ ...t.body, fontWeight: 600, fontSize: theme.size.body * 1.05 }}>{p.label}</div>
                  <div style={{ ...t.display, fontSize: theme.size.h2 * 0.85, fontVariantNumeric: 'tabular-nums', color: i === 0 ? theme.palette.accent : theme.palette.text }}>{fmt(p.value * q)}</div>
                </div>
                <div style={{ height: barH, background: theme.palette.bgRaised, width: '100%' }}>
                  <div style={{ height: '100%', width: `${(p.value / max) * 100 * q}%`, background: i === 0 ? theme.palette.accent : `color-mix(in srgb, ${theme.palette.accent} 45%, ${theme.palette.bgRaised})` }} />
                </div>
              </div>
            );
          })}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

export function ChartShot({ clip }) {
  if (clip.overlay.type === 'share') return <ShareChart clip={clip} />;
  if (clip.overlay.type === 'rank') return <RankChart clip={clip} />;
  return <SeriesChart clip={clip} />;
}

function SeriesChart({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { type, title, unit, points, at, drawFrames } = clip.overlay;
  const p = progress(frame, at, drawFrames, ease.inOut);
  const W = theme.width - theme.safe.left - theme.safe.right;
  const H = theme.isVertical ? theme.height * 0.36 : theme.height * 0.5;
  const minV = Math.min(0, ...points.map((d) => d.value));
  const maxV = niceMax(Math.max(...points.map((d) => d.value)));
  const x = (i) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v) => H - ((v - minV) / (maxV - minV || 1)) * H;
  const last = points[points.length - 1];
  const shownIndex = Math.min(points.length - 1, Math.floor(p * (points.length - 1) + 0.0001));
  const current = type === 'line' ? points[shownIndex] : last;
  const fmt = (v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
  const trendUp = last.value >= points[0].value;
  const color = theme.palette.accent;
  const ct = theme.style.chart || { stroke: 6, area: 0.32, grid: 'thirds', marker: 'dot' };
  const gridLines = { none: [0], baseline: [0], thirds: [0, 0.5, 1], full: [0, 0.25, 0.5, 0.75, 1] }[ct.grid] || [0, 0.5, 1];
  const line = points.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        {title && <Kicker text={title} at={Math.max(0, at - 12)} />}
        <div style={{ ...t.display, fontSize: theme.size.display * 0.8, fontVariantNumeric: 'tabular-nums', margin: `${theme.u(20)}px 0 ${theme.u(48)}px`, opacity: frame >= at ? 1 : 0 }}>
          {fmt(current.value)} <span style={{ ...t.label, fontSize: theme.size.label, color: trendUp ? theme.palette.positive : theme.palette.negative }}>{current.label}</span>
        </div>
        <svg width={W} height={H + theme.u(60)} style={{ overflow: 'visible' }}>
          {gridLines.map((g) => (
            <line key={g} x1={0} x2={W} y1={y(minV + (maxV - minV) * g)} y2={y(minV + (maxV - minV) * g)} stroke={theme.palette.line} strokeWidth={g === 0 ? 2 : 1} />
          ))}
          {type === 'bar'
            ? points.map((d, i) => {
                const bw = (W / points.length) * 0.62;
                const bp = progress(frame, at + i * Math.max(2, drawFrames / points.length / 1.5), drawFrames * 0.6, ease.out);
                const h = (H - y(d.value)) * bp;
                return (
                  <g key={i}>
                    <rect x={(i + 0.19) * (W / points.length)} y={H - h} width={bw} height={h} fill={i === points.length - 1 ? color : theme.palette.muted} opacity={i === points.length - 1 ? 1 : 0.55} />
                    <text x={(i + 0.5) * (W / points.length)} y={H + theme.u(44)} fill={theme.palette.muted} fontFamily={theme.font.text} fontSize={theme.size.small} textAnchor="middle">{d.label}</text>
                  </g>
                );
              })
            : (
              <>
                <defs>
                  <linearGradient id={`area-${clip.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={ct.area} />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                  <clipPath id={`reveal-${clip.id}`}><rect x={-10} y={-40} width={(W + 20) * p} height={H + 80} /></clipPath>
                </defs>
                <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#area-${clip.id})`} clipPath={`url(#reveal-${clip.id})`} />
                <path d={line} fill="none" stroke={color} strokeWidth={theme.u(ct.stroke)} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} />
                {p > 0 && ct.marker !== 'none' && (() => {
                  const mx = x(p * (points.length - 1));
                  const my = interpolate(p * (points.length - 1), points.map((_, i) => i), points.map((d) => y(d.value)));
                  const r = theme.u(ct.stroke * 2);
                  return ct.marker === 'square' ? <rect x={mx - r} y={my - r} width={r * 2} height={r * 2} fill={color} /> : <circle cx={mx} cy={my} r={r} fill={color} />;
                })()}
                {[0, points.length - 1].map((i) => (
                  <text key={i} x={x(i)} y={H + theme.u(48)} fill={theme.palette.muted} fontFamily={theme.font.text} fontSize={theme.size.small} textAnchor={i === 0 ? 'start' : 'end'}>{points[i].label}</text>
                ))}
              </>
            )}
        </svg>
      </Stage>
    </AbsoluteFill>
  );
}

// ─── Comparison ────────────────────────────────────────────────────────────

function CompareColumns({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { left, right, leftTone, rightTone, leftAt, rightAt } = clip.overlay;
  const toneColor = (tone, fallback) => (tone === 'negative' ? theme.palette.negative : tone === 'positive' ? theme.palette.positive : fallback);
  const vertical = theme.isVertical;
  const areaW = theme.width - theme.safe.left - theme.safe.right;
  const colW = vertical ? areaW : areaW / 2 - theme.u(60);
  const size = fitSize([left.title, right.title].reduce((a, b) => (a.length > b.length ? a : b)), colW, theme.size.h1, { lines: 2, ratio: glyphRatio(theme.style) });
  const divider = progress(frame, leftAt + 4, 24, ease.inOut);
  const side = (s, tone, fallback, at, focus) => (
    <div style={{ width: colW, ...reveal(theme.style.motion.reveal, frame, at, theme.unit), opacity: frame < at ? 0 : focus ? 1 : 0.6 }}>
      <div style={{ width: theme.u(56), height: theme.u(6), background: toneColor(tone, fallback), marginBottom: theme.u(26) }} />
      <div style={{ ...t.display, fontSize: size, lineHeight: 1.02 }}>{s.title}</div>
      {s.detail && <div style={{ ...t.body, color: theme.palette.muted, marginTop: theme.u(16) }}>{s.detail}</div>}
    </div>
  );
  const rightFocused = frame >= rightAt;
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.55} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      {clip.bed && <Shade where="full" strength={0.5} />}
      <Stage theme={theme}>
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: theme.u(vertical ? 70 : 120), alignItems: vertical ? 'stretch' : 'flex-start', position: 'relative' }}>
          {side(left, leftTone, theme.palette.accent, leftAt, !rightFocused)}
          <div style={{ position: 'absolute', background: theme.palette.line, ...(vertical ? { left: 0, top: '50%', height: 2, width: `${divider * 100}%` } : { left: '50%', top: 0, width: 2, height: `${divider * 100}%` }) }} />
          {side(right, rightTone, theme.palette.counter, rightAt, true)}
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

/** Versus: two tone-tinted halves split by a hard edge; the side being spoken takes the light. */
function CompareVersus({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { left, right, leftTone, rightTone, leftAt, rightAt } = clip.overlay;
  const vertical = theme.isVertical;
  const tone = (x, fb) => (x === 'negative' ? theme.palette.negative : x === 'positive' ? theme.palette.positive : fb);
  const lc = tone(leftTone, theme.palette.accent), rc = tone(rightTone, theme.palette.counter);
  const split = progress(frame, rightAt - 6, 18, ease.inOut); // 0: left owns the frame → 1: halves
  const focusRight = frame >= rightAt;
  const half = vertical ? theme.height : theme.width;
  const edge = interpolate(split, [0, 1], [half * 0.82, half * 0.5]);
  const areaW = vertical ? theme.width - theme.safe.left - theme.safe.right : theme.width / 2 - theme.safe.left - theme.u(60);
  const size = fitSize([left.title, right.title].reduce((a, b) => (a.length > b.length ? a : b)), areaW, theme.size.display * 0.85, { lines: 2, ratio: glyphRatio(theme.style) });
  const panel = (s, color, at, focused, pos) => (
    <div style={{ position: 'absolute', ...pos, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: vertical ? `0 ${theme.safe.right}px 0 ${theme.safe.left}px` : `0 ${theme.u(70)}px 0 ${theme.safe.left}px`, opacity: frame < at ? 0 : focused ? 1 : 0.55, ...reveal(theme.style.motion.reveal, frame, at, theme.unit) }}>
      <div style={{ width: theme.u(64), height: theme.u(6), background: color, marginBottom: theme.u(26) }} />
      <div style={{ ...t.display, fontSize: size, lineHeight: 1 }}>{s.title}</div>
      {s.detail && <div style={{ ...t.body, color: theme.palette.muted, marginTop: theme.u(18), fontSize: theme.size.body * 1.05 }}>{s.detail}</div>}
    </div>
  );
  const leftRect = vertical ? { left: 0, right: 0, top: 0, height: edge } : { top: 0, bottom: 0, left: 0, width: edge };
  const rightRect = vertical ? { left: 0, right: 0, top: edge, bottom: 0 } : { top: 0, bottom: 0, left: edge, right: 0 };
  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      <div style={{ position: 'absolute', ...leftRect, background: `linear-gradient(${vertical ? '180deg' : '90deg'}, ${tint(lc, 16)}, ${tint(lc, 5)})`, borderRight: vertical ? 'none' : `${theme.u(4)}px solid ${lc}`, borderBottom: vertical ? `${theme.u(4)}px solid ${lc}` : 'none' }} />
      <div style={{ position: 'absolute', ...rightRect, background: `linear-gradient(${vertical ? '180deg' : '90deg'}, ${tint(rc, 5)}, ${tint(rc, 16)})`, opacity: split }} />
      {panel(left, lc, leftAt, !focusRight, { ...leftRect, ...(vertical ? { paddingBottom: 0 } : {}) })}
      {panel(right, rc, rightAt, true, { ...rightRect, ...(vertical ? { bottom: theme.safe.bottom + captionBand(theme) } : {}) })}
    </AbsoluteFill>
  );
}

export function CompareShot({ clip }) {
  // Versus owns the whole frame; fall back to columns when there's a photo bed to show.
  if (clip.variant === 'versus' && !clip.bed) return <CompareVersus clip={clip} />;
  return <CompareColumns clip={clip} />;
}

// ─── Phone notification / message ─────────────────────────────────────────

export function UiShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { app, title, body, at } = clip.overlay;
  const p = progress(frame, at, 18);
  const w = theme.isVertical ? theme.width * 0.86 : theme.width * 0.4;
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.3} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      <Shade where="top" strength={0.45} />
      <div
        style={{
          position: 'absolute',
          left: (theme.width - w) / 2,
          top: theme.isVertical ? theme.height * 0.22 : theme.height * 0.2,
          width: w,
          borderRadius: theme.u(44),
          background: 'rgba(242, 242, 246, 0.9)',
          color: '#111',
          padding: `${theme.u(32)}px ${theme.u(36)}px`,
          boxShadow: `0 ${theme.u(30)}px ${theme.u(80)}px rgba(0,0,0,0.45)`,
          transform: `translateY(${(1 - p) * -theme.u(160)}px)`,
          opacity: p,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.u(16), marginBottom: theme.u(14) }}>
          <div style={{ width: theme.u(52), height: theme.u(52), borderRadius: theme.u(14), background: theme.palette.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: theme.u(28) }}>{app[0]}</div>
          <div style={{ fontSize: theme.u(28), fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.6, flex: 1 }}>{app}</div>
          <div style={{ fontSize: theme.u(26), opacity: 0.5 }}>now</div>
        </div>
        <div style={{ fontSize: theme.u(40), fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontSize: theme.u(36), fontWeight: 400, lineHeight: 1.3, marginTop: theme.u(6), opacity: 0.85 }}>{body}</div>
      </div>
    </AbsoluteFill>
  );
}

// ─── Code ──────────────────────────────────────────────────────────────────

const KEYWORDS = /\b(const|let|var|function|return|async|await|import|from|export|if|else|for|while|class|new|def|in|of|try|catch|SELECT|FROM|WHERE|JOIN|interface|type)\b/g;

function highlight(line, palette) {
  const parts = [];
  const re = /(\/\/.*$|#.*$)|("[^"]*"|'[^']*'|`[^`]*`)|\b(const|let|var|function|return|async|await|import|from|export|if|else|for|while|class|new|def|in|of|try|catch|SELECT|FROM|WHERE|JOIN|interface|type)\b/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    if (m.index > last) parts.push(<span key={last}>{line.slice(last, m.index)}</span>);
    const color = m[1] ? palette.muted : m[2] ? palette.counter : palette.accent;
    parts.push(<span key={m.index + 'm'} style={{ color }}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(<span key={last + 'e'}>{line.slice(last)}</span>);
  return parts;
}

export function CodeShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { code, language, from, to } = clip.overlay;
  const chars = Math.floor(interpolate(frame, [from, Math.max(from + 1, to)], [0, code.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const visible = code.slice(0, chars);
  const lines = code.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const w = theme.width - theme.safe.left - theme.safe.right;
  const fontSize = Math.min(theme.size.body * 0.9, Math.floor((w - theme.u(96)) / (Math.max(24, longest) * 0.6)));
  KEYWORDS.lastIndex = 0;
  return (
    <AbsoluteFill>
      <Ground texture={null} durationInFrames={clip.durationInFrames} />
      <Stage theme={theme}>
        <div style={{ background: theme.palette.bgRaised, border: `1px solid ${theme.palette.line}`, borderRadius: theme.u(20), overflow: 'hidden', boxShadow: `0 ${theme.u(30)}px ${theme.u(70)}px rgba(0,0,0,0.4)`, ...reveal('rise', frame, 0, theme.unit, 14) }}>
          <div style={{ padding: `${theme.u(22)}px ${theme.u(40)}px`, borderBottom: `1px solid ${theme.palette.line}`, fontFamily: theme.font.mono, fontSize: theme.size.small, color: theme.palette.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{language}</div>
          <pre style={{ margin: 0, padding: `${theme.u(36)}px ${theme.u(40)}px`, fontFamily: theme.font.mono, fontSize, lineHeight: 1.5, color: theme.palette.text, whiteSpace: 'pre-wrap' }}>
            {visible.split('\n').map((l, i, arr) => (
              <div key={i}>{highlight(l, theme.palette)}{i === arr.length - 1 && chars < code.length && <span style={{ background: theme.palette.accent, opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2 }}>&nbsp;</span>}</div>
            ))}
          </pre>
        </div>
      </Stage>
    </AbsoluteFill>
  );
}

export function GroundShot({ clip }) {
  return <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />;
}
