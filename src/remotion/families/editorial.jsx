import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';

/** Band reserved above the captions so on-screen type never collides with them. */
export function captionBand(theme) {
  return theme.style.captions.mode === 'none' ? 0 : theme.size.caption * theme.style.captions.scale * (theme.isVertical ? 2.9 : 2.4);
}

export function Kicker({ text, at, accent = true }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const p = progress(frame, at, 14);
  if (!text) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.u(16), ...reveal('rise', frame, at, theme.unit, 14) }}>
      {accent && <div style={{ width: theme.u(44) * p, height: theme.u(4), background: theme.palette.accent }} />}
      <div style={{ ...t.label, color: theme.palette.text, opacity: 0.92 }}>{text}</div>
    </div>
  );
}

// ─── Statistic ─────────────────────────────────────────────────────────────

function formatCount(value, p) {
  const clean = String(value).replace(/,/g, '');
  const n = parseFloat(clean);
  if (!Number.isFinite(n)) return String(value);
  const decimals = (clean.split('.')[1] || '').length;
  return (n * p).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function StatShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { value, prefix, suffix, label, direction, at, countFrames, kicker } = clip.overlay;
  const p = progress(frame, at, countFrames, ease.out);
  const wordSuffix = /^\s*[a-z]{3,}/i.test(suffix || '') ? suffix.trim() : null;
  const inlineSuffix = wordSuffix ? '' : (suffix || '');
  const finalText = `${prefix || ''}${formatCount(value, 1)}${inlineSuffix}`;
  const splitLayout = clip.overlay.variant === 'split' && clip.bed;
  const maxW = splitLayout && !theme.isVertical ? theme.width * 0.56 - theme.safe.left - theme.u(60) : theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(finalText, maxW * (theme.isVertical || splitLayout ? 1 : 0.7), theme.size.hero * (finalText.length <= 4 ? 1.7 : 1.3), { lines: 1, ratio: 0.6 });
  const align = splitLayout ? 'left' : theme.style.layout.textAlign;
  const color = direction === 'down' ? theme.palette.negative : direction === 'up' ? theme.palette.positive : theme.palette.accent;
  const settle = progress(frame, at + countFrames - 4, 18);
  // Split variant: the photograph gets its own panel; the number owns the ground.
  const split = clip.overlay.variant === 'split' && clip.bed;
  const { width: W, height: H, isVertical } = theme;
  const photoBox = split ? (isVertical ? { x: 0, y: 0, w: W, h: Math.round(H * 0.44) } : { x: Math.round(W * 0.56), y: 0, w: W - Math.round(W * 0.56), h: H }) : null;
  const numberArea = split
    ? (isVertical ? { left: theme.safe.left, right: theme.safe.right, top: photoBox.h, bottom: theme.safe.bottom + captionBand(theme) * 0.6 } : { left: theme.safe.left, right: W - photoBox.x + theme.u(60), top: 0, bottom: theme.safe.bottom + captionBand(theme) * 0.6 })
    : { left: theme.safe.left, right: theme.safe.right, top: 0, bottom: theme.safe.bottom + captionBand(theme) * 0.6 };
  return (
    <AbsoluteFill>
      {split ? (
        <>
          <Ground texture={null} durationInFrames={clip.durationInFrames} />
          <Bed shots={clip.bed} box={photoBox} />
        </>
      ) : clip.bed ? <Bed shots={clip.bed} dim={0.35} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      {!split && <Shade where="full" strength={0.62} />}
      <div
        style={{
          position: 'absolute',
          ...numberArea,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          textAlign: align,
          gap: theme.u(18),
        }}
      >
        {kicker && <Kicker text={kicker} at={Math.max(0, at - 10)} />}
        <div style={{ ...reveal('fade', frame, at - 2, theme.unit, 6) }}>
          <div style={{ ...t.display, fontFamily: theme.font.display, fontSize: size, lineHeight: 0.9, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', textTransform: 'none', whiteSpace: 'nowrap' }}>
            {prefix && <span style={{ fontSize: '0.62em', verticalAlign: '0.32em', marginRight: '0.04em', color }}>{prefix}</span>}
            {formatCount(value, p)}
            {inlineSuffix && <span style={{ fontSize: '0.5em', marginLeft: '0.06em', color }}>{inlineSuffix.trim()}</span>}
          </div>
          <div style={{ height: theme.u(8), width: `${settle * 100}%`, maxWidth: size * 2.4, background: color, marginTop: theme.u(18), marginLeft: align === 'center' ? 'auto' : 0, marginRight: align === 'center' ? 'auto' : 0 }} />
        </div>
        {wordSuffix && (
          <div style={{ ...t.display, fontSize: theme.size.h1, color, ...reveal('rise', frame, at + countFrames * 0.5, theme.unit) }}>{wordSuffix}</div>
        )}
        {label && (
          <div style={{ ...t.label, fontSize: theme.size.label * 1.4, color: theme.palette.text, opacity: 0.9, ...reveal('rise', frame, at + countFrames * 0.7, theme.unit) }}>
            {direction === 'down' ? '▼ ' : direction === 'up' ? '▲ ' : ''}{label}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// ─── Kinetic statement ─────────────────────────────────────────────────────

export function StatementShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { words, ats, kicker } = clip.overlay;
  const text = words.join(' ');
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(text, maxW, theme.size.display * (words.length <= 2 ? 1.35 : 1), { lines: Math.min(3, Math.max(1, Math.ceil(words.length / 2))), ratio: glyphRatio(theme.style) });
  const align = theme.style.layout.textAlign;
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.4} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      <Shade where={align === 'center' ? 'full' : 'left'} strength={0.6} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          right: theme.safe.right,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          textAlign: align,
          gap: theme.u(24),
        }}
      >
        {kicker && <Kicker text={kicker} at={Math.max(0, (ats[0] ?? 8) - 8)} />}
        <h1 style={{ ...t.display, fontSize: size }}>
          {words.map((w, i) => {
            const last = i === words.length - 1 && words.length > 1;
            const at = ats[i] ?? 8;
            if (clip.variant === 'highlight') {
              // Text Highlight (adapted from the RVE template, MIT): a marker sweeps behind each word as it is spoken.
              const sweep = progress(frame, at, 10, ease.inOut);
              return (
                <span key={i} style={{ position: 'relative', display: 'inline-block', marginRight: '0.24em', opacity: frame >= at - 2 ? 1 : 0.18 }}>
                  <span style={{ position: 'absolute', left: '-0.08em', right: 'auto', top: '0.12em', bottom: '0.02em', width: sweep > 0 ? `calc(${sweep * 100}% + ${sweep * 0.16}em)` : 0, background: last ? theme.palette.accent : 'color-mix(in srgb, ' + theme.palette.accent + ' 34%, transparent)', zIndex: 0 }} />
                  <span style={{ position: 'relative', zIndex: 1, color: last && sweep > 0.5 ? theme.palette.bg : theme.palette.text }}>{w}</span>
                </span>
              );
            }
            if (clip.variant === 'chars') {
              // Animated Text (adapted from the RVE template, MIT): characters rise and settle in sequence.
              return (
                <span key={i} style={{ display: 'inline-block', marginRight: '0.24em', color: last ? theme.palette.accent : theme.palette.text, whiteSpace: 'nowrap' }}>
                  {[...w].map((ch, k) => {
                    const q = progress(frame, at + k * 1.4, 12, ease.out);
                    return <span key={k} style={{ display: 'inline-block', opacity: q, transform: `translateY(${(1 - q) * 0.45}em) rotate(${(1 - q) * 8}deg)` }}>{ch}</span>;
                  })}
                </span>
              );
            }
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  marginRight: '0.24em',
                  color: last ? theme.palette.accent : theme.palette.text,
                  fontStyle: theme.style.display.italicEmphasis && last ? 'italic' : 'normal',
                  ...reveal(theme.style.motion.reveal, frame, at, theme.unit, 12),
                }}
              >
                {w}
              </span>
            );
          })}
        </h1>
      </div>
    </AbsoluteFill>
  );
}

// ─── Chapter card ──────────────────────────────────────────────────────────

export function ChapterShot({ clip }) {
  return clip.variant === 'split' ? <ChapterSplit clip={clip} /> : <ChapterClassic clip={clip} />;
}

function ChapterClassic({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { number, title, at } = clip.overlay;
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(title, maxW, theme.size.display, { lines: 2, ratio: glyphRatio(theme.style) });
  const line = progress(frame, at + 6, 26, ease.inOut);
  const align = theme.style.layout.textAlign;
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.5} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      <Shade where="full" strength={0.55} />
      <AbsoluteFill style={{ padding: `0 ${theme.safe.right}px 0 ${theme.safe.left}px`, justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', textAlign: align }}>
        <div style={{ ...t.label, color: theme.palette.accent, fontSize: theme.size.label * 1.1, ...reveal('fade', frame, at, theme.unit) }}>
          {number ? `Chapter ${String(number).padStart(2, '0')}` : 'Chapter'}
        </div>
        <div style={{ width: theme.u(160) * line, height: theme.u(3), background: theme.palette.accent, margin: `${theme.u(26)}px 0` }} />
        <h1 style={{ ...t.display, fontSize: size, ...reveal(theme.style.motion.reveal, frame, at + 8, theme.unit, 20) }}>{title}</h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * Split chapter card (adapted from the RVE "Title Split" template, MIT): the
 * chapter number in outline slides down, the title in solid fill slides up,
 * and they meet on an accent rule.
 */
function ChapterSplit({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { number, title, at } = clip.overlay;
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(title, maxW, theme.size.display * 1.05, { lines: 2, ratio: glyphRatio(theme.style) });
  const top = progress(frame, at, 20, ease.out), bottom = progress(frame, at + 4, 20, ease.out);
  const rule = progress(frame, at + 12, 18, ease.inOut);
  const align = theme.style.layout.textAlign;
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.55} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      <Shade where="full" strength={0.5} />
      <AbsoluteFill style={{ padding: `0 ${theme.safe.right}px 0 ${theme.safe.left}px`, justifyContent: 'center', alignItems: align === 'center' ? 'center' : 'flex-start', textAlign: align }}>
        <div style={{ ...t.display, fontSize: size * 1.1, color: 'transparent', WebkitTextStroke: `${theme.u(2.5)}px ${theme.palette.text}`, opacity: top, transform: `translateY(${(1 - top) * -theme.u(60)}px)`, textTransform: 'uppercase' }}>
          {number ? `Chapter ${String(number).padStart(2, '0')}` : 'Chapter'}
        </div>
        <div style={{ width: `${rule * 100}%`, maxWidth: maxW, height: theme.u(4), background: theme.palette.accent, margin: `${theme.u(22)}px 0`, boxShadow: `0 0 ${theme.u(24)}px ${theme.palette.accent}` }} />
        <h1 style={{ ...t.display, fontSize: size, opacity: bottom, transform: `translateY(${(1 - bottom) * theme.u(60)}px)` }}>{title}</h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Quote (only real, narrated quotes reach this family) ─────────────────

export function QuoteShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { quote, author, role, at, authorAt, words, wordAts } = clip.overlay;
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(quote, maxW, theme.size.h1, { lines: Math.min(5, Math.ceil(quote.length / 22)), ratio: glyphRatio(theme.style) * 0.95 });
  return (
    <AbsoluteFill>
      {clip.bed ? <Bed shots={clip.bed} dim={0.45} /> : <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />}
      <Shade where="full" strength={0.65} />
      <AbsoluteFill style={{ padding: `${theme.safe.top}px ${theme.safe.right}px ${theme.safe.bottom}px ${theme.safe.left}px`, justifyContent: 'center' }}>
        <div style={{ fontFamily: theme.font.display, fontSize: theme.size.hero * 0.9, lineHeight: 0.6, color: theme.palette.accent, height: theme.size.hero * 0.42, ...reveal('fade', frame, at - 4, theme.unit) }}>“</div>
        <blockquote style={{ ...t.display, fontSize: size, lineHeight: 1.12, fontStyle: theme.style.display.italicEmphasis ? 'italic' : 'normal', textTransform: 'none', margin: 0, ...reveal(theme.style.motion.reveal, frame, at, theme.unit, 22) }}>
          {words && wordAts
            ? words.map((w, i) => (
                <span key={i} style={{ opacity: 0.34 + 0.66 * progress(frame, wordAts[i] - 2, 6) }}>{w}{i < words.length - 1 ? ' ' : ''}</span>
              ))
            : quote}
        </blockquote>
        <div style={{ display: 'flex', gap: theme.u(16), alignItems: 'baseline', marginTop: theme.u(40), ...reveal('rise', frame, authorAt, theme.unit) }}>
          <div style={{ ...t.label, color: theme.palette.text, fontSize: theme.size.label * 1.1 }}>— {author}</div>
          {role && <div style={{ ...t.label }}>{role}</div>}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Published document / headline (real, cited in narration) ─────────────

export function DocumentShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { source, headline, date, highlightAt } = clip.overlay;
  const enter = progress(frame, 0, 22);
  const push = interpolate(frame, [0, clip.durationInFrames], [1, 1.045]);
  const hl = progress(frame, highlightAt, 20, ease.inOut);
  const cardW = theme.width * (theme.isVertical ? 0.84 : 0.56);
  const size = fitSize(headline, cardW * 0.86, theme.size.h1, { lines: 4, ratio: 0.5 });
  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: captionBand(theme) * 0.7 }}>
        <div
          style={{
            width: cardW,
            background: '#f3eee4',
            color: '#17130e',
            padding: `${theme.u(56)}px ${theme.u(60)}px ${theme.u(64)}px`,
            boxShadow: `0 ${theme.u(40)}px ${theme.u(90)}px rgba(0,0,0,0.55)`,
            transform: `translateY(${(1 - enter) * theme.u(80)}px) rotate(${-1.6 + enter * 0.6}deg) scale(${push})`,
            opacity: enter,
          }}
        >
          <div style={{ borderTop: '3px solid #17130e', borderBottom: '1px solid #17130e', padding: `${theme.u(14)}px 0`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: theme.size.h2 * 0.62, letterSpacing: '-0.01em' }}>{source}</div>
            {date && <div style={{ fontFamily: theme.font.text, fontWeight: 600, fontSize: theme.size.small, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>{date}</div>}
          </div>
          <div style={{ position: 'relative', marginTop: theme.u(34) }}>
            <div style={{ position: 'absolute', left: -theme.u(8), top: '8%', height: '84%', width: `calc(${hl * 100}% + ${theme.u(16)}px)`, background: 'rgba(255, 214, 10, 0.55)', mixBlendMode: 'multiply' }} />
            <div style={{ position: 'relative', fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.02em' }}>{headline}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
