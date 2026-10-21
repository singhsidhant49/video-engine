import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Img, staticFile } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';

/** Band reserved above the captions so on-screen type never collides with them. */
export function captionBand(theme) {
  return theme.style?.captions?.mode === 'none' ? 0 : theme.size.caption * (theme.style?.captions?.scale || 0.8) * (theme.isVertical ? 2.6 : 2.2);
}

export function Kicker({ text, at = 0, accent = true }) {
  if (!text) return null;
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const startAt = Number.isFinite(at) ? at : 0;
  const p = progress(frame, startAt, 14);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.u(14), ...reveal('rise', frame, startAt, theme.unit, 14) }}>
      {accent && <div style={{ width: theme.u(36) * p, height: theme.u(3), background: theme.palette.accent }} />}
      <div style={{ ...t.label, color: theme.palette.accent, letterSpacing: '0.14em', opacity: 0.95 }}>{text}</div>
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
  const { value, prefix, suffix, label, direction, at = 4, countFrames = 24, kicker } = clip.overlay || {};
  const wordSuffix = /^\s*[a-z]{3,}/i.test(suffix || '') ? suffix.trim() : null;
  const inlineSuffix = wordSuffix ? '' : (suffix || '');
  const finalText = `${prefix || ''}${formatCount(value, 1)}${inlineSuffix}`;
  const split = clip.overlay?.variant === 'split' && clip.bed && clip.bed.length > 0;
  const { width: W, height: H, isVertical } = theme;

  const photoBox = split ? (isVertical ? { x: 0, y: 0, w: W, h: Math.round(H * 0.46) } : { x: Math.round(W * 0.52), y: 0, w: W - Math.round(W * 0.52), h: H }) : null;
  const maxW = split && !isVertical ? photoBox.x - theme.safe.left - theme.u(60) : W - theme.safe.left - theme.safe.right;
  const size = fitSize(finalText, maxW * (isVertical || split ? 0.92 : 0.65), theme.size.hero * (finalText.length <= 4 ? 1.5 : 1.2), { lines: 1, ratio: 0.58 });
  const align = split ? 'left' : 'left';
  const color = direction === 'down' ? theme.palette.negative : direction === 'up' ? theme.palette.positive : theme.palette.accent;
  const settle = progress(frame, at + countFrames - 4, 16);

  const numberArea = split
    ? (isVertical ? { left: theme.safe.left, right: theme.safe.right, top: photoBox.h + theme.u(40), bottom: theme.safe.bottom + captionBand(theme) * 0.5 } : { left: theme.safe.left, right: W - photoBox.x + theme.u(50), top: theme.safe.top, bottom: theme.safe.bottom + captionBand(theme) * 0.5 })
    : { left: theme.safe.left, right: theme.safe.right, top: theme.safe.top, bottom: theme.safe.bottom + captionBand(theme) * 0.6 };

  return (
    <AbsoluteFill>
      {split ? (
        <>
          <Ground texture={null} durationInFrames={clip.durationInFrames} />
          <div style={{ position: 'absolute', left: photoBox.x, top: photoBox.y, width: photoBox.w, height: photoBox.h, overflow: 'hidden' }}>
            <Bed shots={clip.bed} box={{ x: 0, y: 0, w: photoBox.w, h: photoBox.h }} />
          </div>
          <div style={{ position: 'absolute', left: photoBox.x, top: 0, bottom: 0, width: 1, background: theme.palette.line }} />
        </>
      ) : clip.bed && clip.bed.length > 0 ? (
        <>
          <Bed shots={clip.bed} dim={0.4} />
          <Shade where="left" strength={0.75} />
        </>
      ) : (
        <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      )}

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
        {kicker && <Kicker text={kicker} at={0} />}
        <div style={{ ...reveal('fade', frame, 0, theme.unit, 8) }}>
          <div style={{ ...t.display, fontFamily: theme.font.display, fontSize: size, lineHeight: 0.92, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', textTransform: 'none', whiteSpace: 'nowrap' }}>
            {prefix && <span style={{ fontSize: '0.62em', verticalAlign: '0.3em', marginRight: '0.04em', color }}>{prefix}</span>}
            {formatCount(value, progress(frame, 0, countFrames + at, ease.out))}
            {inlineSuffix && <span style={{ fontSize: '0.52em', marginLeft: '0.06em', color }}>{inlineSuffix.trim()}</span>}
          </div>
          {/* Restrained accent baseline */}
          <div style={{ height: theme.u(3), width: `${settle * 100}%`, maxWidth: Math.min(maxW, size * 2.2), background: color, marginTop: theme.u(16) }} />
        </div>

        {wordSuffix && (
          <div style={{ ...t.display, fontSize: theme.size.h1 * 0.9, color, ...reveal('rise', frame, at + countFrames * 0.4, theme.unit) }}>{wordSuffix}</div>
        )}

        {label && (
          <div style={{ ...t.label, fontSize: theme.size.label * 1.35, color: theme.palette.text, opacity: 0.88, marginTop: theme.u(4), ...reveal('rise', frame, at + countFrames * 0.6, theme.unit) }}>
            {direction === 'down' ? '▼ ' : direction === 'up' ? '▲ ' : ''}{label}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// ─── Kinetic Headline / Statement ──────────────────────────────────────────

export function StatementShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { words = [], ats = [], kicker } = clip.overlay || {};
  const text = words.join(' ');
  const rightPad = theme.isVertical ? theme.safe.right + theme.u(28) : theme.safe.right;
  const maxW = theme.isVertical ? theme.width * 0.82 : theme.width - theme.safe.left - rightPad;
  const size = fitSize(text, maxW, theme.size.display * (words.length <= 2 ? 1.25 : 0.92), { lines: Math.min(3, Math.max(1, Math.ceil(words.length / 3))), ratio: glyphRatio(theme.style) });
  const variant = clip.variant || 'kinetic';

  return (
    <AbsoluteFill>
      {clip.bed && clip.bed.length > 0 ? (
        <>
          <Bed shots={clip.bed} dim={0.45} />
          <Shade where="left" strength={0.65} />
        </>
      ) : (
        <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      )}
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          right: rightPad,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          textAlign: 'left',
          gap: theme.u(20),
          maxWidth: '100%',
        }}
      >
        {kicker && <Kicker text={kicker} at={Math.max(0, (ats[0] ?? 8) - 8)} />}

        {/* Clean, editorial kinetic typography without empty-canvas delays */}
        <h1 style={{ ...t.display, fontSize: size, wordBreak: 'keep-all', overflowWrap: 'break-word', hyphens: 'none', maxWidth: maxW }}>
          {words.map((w, i) => {
            const isLast = i === words.length - 1 && words.length > 1;
            // Prevent massive empty-screen delay: stagger at times from shot start if audio cue is delayed
            const rawAt = ats[i] ?? (4 + i * 6);
            const at = Math.min(rawAt, 12 + i * 8);
            if (variant === 'highlight') {
              const sweep = progress(frame, at, 12, ease.inOut);
              return (
                <span key={i} style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap', wordBreak: 'keep-all', marginRight: '0.24em', opacity: frame >= at - 2 ? 1 : 0.32 }}>
                  <span style={{ position: 'absolute', left: '-0.06em', top: '0.12em', bottom: '0.04em', width: sweep > 0 ? `calc(${sweep * 100}% + 0.12em)` : 0, background: isLast ? theme.palette.accent : 'color-mix(in srgb, ' + theme.palette.accent + ' 28%, transparent)', zIndex: 0 }} />
                  <span style={{ position: 'relative', zIndex: 1, color: isLast && sweep > 0.6 ? theme.palette.bg : theme.palette.text }}>{w}</span>
                </span>
              );
            }
            if (variant === 'words') {
              const wordProgress = progress(frame, at, 8);
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    wordBreak: 'keep-all',
                    marginRight: '0.24em',
                    color: isLast && wordProgress > 0.5 ? theme.palette.accent : theme.palette.text,
                    opacity: 0.28 + 0.72 * wordProgress,
                    transform: `translateY(${Math.round((1 - wordProgress) * theme.u(8))}px)`,
                  }}
                >
                  {w}
                </span>
              );
            }
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                  wordBreak: 'keep-all',
                  marginRight: '0.24em',
                  color: isLast ? theme.palette.accent : theme.palette.text,
                  ...reveal(theme.style.motion?.reveal || 'mask', frame, at, theme.unit, 14),
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

// ─── Chapter ───────────────────────────────────────────────────────────────

export function ChapterShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { number, title = '', at = 4 } = clip.overlay || {};
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(title, maxW, theme.size.display * 0.95, { lines: 2, ratio: glyphRatio(theme.style) });
  const line = progress(frame, at + 6, 24, ease.inOut);

  return (
    <AbsoluteFill>
      {clip.bed && clip.bed.length > 0 ? (
        <>
          <Bed shots={clip.bed} dim={0.5} />
          <Shade where="full" strength={0.6} />
        </>
      ) : (
        <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      )}
      <AbsoluteFill style={{ padding: `0 ${theme.safe.right}px 0 ${theme.safe.left}px`, justifyContent: 'center', alignItems: 'flex-start', textAlign: 'left' }}>
        <div style={{ ...t.label, color: theme.palette.accent, fontSize: theme.size.label * 1.15, ...reveal('fade', frame, at, theme.unit) }}>
          {number ? `CHAPTER ${String(number).padStart(2, '0')}` : 'PART // SECTION'}
        </div>
        <div style={{ width: theme.u(120) * line, height: theme.u(3), background: theme.palette.accent, margin: `${theme.u(20)}px 0` }} />
        <h1 style={{ ...t.display, fontSize: size, wordBreak: 'keep-all', overflowWrap: 'break-word', hyphens: 'none', maxWidth: maxW, ...reveal('rise', frame, at + 6, theme.unit, 18) }}>{title}</h1>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Quote ─────────────────────────────────────────────────────────────────

export function QuoteShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { quote = '', author = '', role = '', at = 4, authorAt = 24, words, wordAts } = clip.overlay || {};
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = fitSize(quote, maxW, theme.size.h1 * 0.9, { lines: Math.min(4, Math.ceil(quote.length / 28)), ratio: glyphRatio(theme.style) * 0.95 });

  return (
    <AbsoluteFill>
      {clip.bed && clip.bed.length > 0 ? (
        <>
          <Bed shots={clip.bed} dim={0.45} />
          <Shade where="full" strength={0.65} />
        </>
      ) : (
        <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      )}
      <AbsoluteFill style={{ padding: `${theme.safe.top}px ${theme.safe.right}px ${theme.safe.bottom}px ${theme.safe.left}px`, justifyContent: 'center' }}>
        <div style={{ fontFamily: theme.font.display, fontSize: theme.size.hero * 0.8, lineHeight: 0.5, color: theme.palette.accent, height: theme.size.hero * 0.35, ...reveal('fade', frame, at - 4, theme.unit) }}>“</div>
        <blockquote style={{ ...t.display, fontSize: size, lineHeight: 1.14, fontStyle: 'italic', textTransform: 'none', margin: 0, maxWidth: maxW * 0.95, ...reveal('rise', frame, at, theme.unit, 20) }}>
          {words && wordAts
            ? words.map((w, i) => (
                <span key={i} style={{ opacity: 0.38 + 0.62 * progress(frame, wordAts[i] - 2, 6) }}>{w}{i < words.length - 1 ? ' ' : ''}</span>
              ))
            : quote}
        </blockquote>
        <div style={{ display: 'flex', gap: theme.u(16), alignItems: 'baseline', marginTop: theme.u(32), ...reveal('rise', frame, authorAt, theme.unit) }}>
          <div style={{ ...t.label, color: theme.palette.text, fontSize: theme.size.label * 1.15 }}>— {author}</div>
          {role && <div style={{ ...t.label, opacity: 0.7 }}>{role}</div>}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── Published Document / Evidence ─────────────────────────────────────────

export function DocumentShot({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { source = 'OFFICIAL RECORD', headline = '', date = '', highlightAt = 12 } = clip.overlay || {};
  const hasRealAsset = Boolean(clip.bed && clip.bed.length > 0);
  const hl = progress(frame, highlightAt, 18, ease.inOut);

  // If a real document asset exists, display it with editorial highlighter wipe
  if (hasRealAsset) {
    return (
      <AbsoluteFill>
        <Bed shots={clip.bed} />
        <Shade where="bottom" strength={0.65} />
        {/* Document Header Badge */}
        <div style={{ position: 'absolute', left: theme.safe.left, top: theme.safe.top, display: 'flex', alignItems: 'center', gap: theme.u(14), background: 'rgba(0,0,0,0.75)', padding: `${theme.u(10)}px ${theme.u(18)}px`, borderLeft: `3px solid ${theme.palette.accent}` }}>
          <span style={{ ...t.label, color: theme.palette.text, fontSize: theme.size.label }}>{source}</span>
          {date && <span style={{ ...t.label, opacity: 0.65 }}>// {date}</span>}
        </div>
        {headline && (
          <div style={{ position: 'absolute', left: theme.safe.left, right: theme.safe.right, bottom: theme.safe.bottom + captionBand(theme) * 0.6 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${hl * 100}%`, background: 'rgba(234, 179, 8, 0.45)', mixBlendMode: 'screen' }} />
              <h2 style={{ ...t.display, fontSize: theme.size.h2, position: 'relative', zIndex: 1, padding: `0 ${theme.u(8)}px` }}>{headline}</h2>
            </div>
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // Procedural Archival Memorandum fallback (no cartoon pastel card!)
  const maxW = theme.width * (theme.isVertical ? 0.88 : 0.68);
  const size = fitSize(headline, maxW * 0.88, theme.size.h1 * 0.85, { lines: 3, ratio: 0.55 });

  return (
    <AbsoluteFill>
      <Ground texture={clip.texture} durationInFrames={clip.durationInFrames} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', paddingBottom: captionBand(theme) * 0.5 }}>
        <div
          style={{
            width: maxW,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${theme.palette.line}`,
            padding: `${theme.u(44)}px ${theme.u(52)}px`,
            position: 'relative',
          }}
        >
          {/* Classification header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.palette.line}`, paddingBottom: theme.u(16), marginBottom: theme.u(28) }}>
            <div style={{ ...t.label, color: theme.palette.accent, letterSpacing: '0.2em' }}>{source.toUpperCase()}</div>
            {date && <div style={{ ...t.label, opacity: 0.6 }}>{date}</div>}
          </div>

          {/* Highlighted core excerpt */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: -theme.u(8), top: 0, bottom: 0, width: `calc(${hl * 100}% + ${theme.u(16)}px)`, background: 'color-mix(in srgb, ' + theme.palette.accent + ' 28%, transparent)', zIndex: 0 }} />
            <div style={{ position: 'relative', zIndex: 1, ...t.display, fontSize: size, lineHeight: 1.15, textTransform: 'none', letterSpacing: '-0.02em' }}>
              {headline}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
