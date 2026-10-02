import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade, ShotMedia, activeShot, projectPoint } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';
import { captionBand, Kicker } from './editorial.jsx';

/**
 * Editorial Photo family — Media-first documentary composition.
 *
 * Variants:
 *   full        Cinematic full bleed with optional clean lower-third
 *   editorial   Asymmetric split: razor-sharp photo panel + typographic panel (no empty dead space)
 *   split       Two media panels side-by-side (or top/bottom in 9:16)
 *   detail      Close-up detail crop focused on subject
 *   annotated   Clean documentary focus ring with leader line
 *   depth       Clean editorial split for portrait media (never a tiny floating phone stamp)
 */

function TextBlock({ kicker, headline, kickerAt = 0, headlineAt = 0, maxWidth, size }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const kAt = Number.isFinite(kickerAt) ? kickerAt : 0;
  const hAt = Number.isFinite(headlineAt) ? headlineAt : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(18), maxWidth: maxWidth || '100%' }}>
      {kicker && <Kicker text={kicker} at={kAt} />}
      {headline && (
        <h1
          style={{
            ...t.display,
            fontSize: size,
            maxWidth: '100%',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            ...reveal(theme.style.motion.reveal, frame, hAt, theme.unit),
          }}
        >
          {headline}
        </h1>
      )}
    </div>
  );
}

/** Full-frame media that lets imagery breathe. No obscuring boxes or cards. */
function FullPhoto({ clip }) {
  const theme = useTheme();
  const { kicker, headline, kickerAt, headlineAt } = clip.overlay || {};
  const hasText = Boolean(kicker || headline);
  const rightPad = theme.isVertical ? theme.safe.right + theme.u(28) : theme.safe.right;
  const maxW = theme.width - theme.safe.left - rightPad;
  const size = headline ? fitSize(headline, maxW * (theme.isVertical ? 0.9 : 0.62), theme.size.h1, { lines: 3, ratio: glyphRatio(theme.style) }) : 0;

  return (
    <AbsoluteFill>
      <Bed shots={clip.bed} />
      {hasText && <Shade where="bottom" strength={theme.style.grade.shade * 0.9} />}
      {hasText && (
        <div style={{ position: 'absolute', left: theme.safe.left, right: rightPad, bottom: theme.safe.bottom + captionBand(theme) * 0.7 }}>
          <TextBlock kicker={kicker} headline={headline} kickerAt={kickerAt} headlineAt={headlineAt} size={size} maxWidth={theme.isVertical ? '90%' : '62%'} />
        </div>
      )}
    </AbsoluteFill>
  );
}

/**
 * Editorial Split Photo:
 * Asymmetric editorial presentation.
 * If no text is assigned to this shot (e.g. secondary shot in a multi-shot sequence),
 * it seamlessly displays full-bleed media rather than leaving an empty black hole!
 */
function EditorialPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { kicker, headline, kickerAt, headlineAt, label } = clip.overlay || {};
  const { width: W, height: H, isVertical } = theme;

  const title = headline || (label && label !== kicker ? label : null) || (kicker && !label ? kicker : null);
  const shownKicker = title === kicker ? null : kicker;

  // CRITICAL FIX: If no text exists for this shot, do not leave an empty black abyss on the left!
  if (!title && !shownKicker) {
    return <FullPhoto clip={clip} />;
  }

  const box = isVertical ? { x: 0, y: 0, w: W, h: Math.round(H * 0.54) } : { x: Math.round(W * 0.46), y: 0, w: W - Math.round(W * 0.46), h: H };
  const wipe = progress(frame, 0, 16, ease.inOut);
  const panelW = isVertical ? W - theme.safe.left - theme.safe.right : box.x - theme.safe.left - theme.u(60);
  const size = title ? fitSize(title, panelW, theme.size.h1 * (isVertical ? 1 : 1.08), { lines: 3, ratio: glyphRatio(theme.style) }) : 0;

  return (
    <AbsoluteFill>
      <Ground texture={null} durationInFrames={clip.durationInFrames} />
      <div style={{ position: 'absolute', inset: 0, clipPath: clip.enter?.frames ? 'none' : isVertical ? `inset(0 0 ${(1 - wipe) * 100}% 0)` : `inset(0 0 0 ${(1 - wipe) * 100}%)` }}>
        <Bed shots={clip.bed} box={box} />
      </div>
      {/* Precision vertical architectural divider rule */}
      <div
        style={{
          position: 'absolute',
          background: theme.palette.line,
          ...(isVertical ? { left: 0, top: box.h, height: 1, width: `${wipe * 100}%` } : { left: box.x, top: 0, width: 1, height: `${wipe * 100}%` }),
        }}
      />
      <div
        style={{
          position: 'absolute',
          background: theme.palette.accent,
          ...(isVertical ? { left: theme.safe.left, top: box.h, height: theme.u(3), width: theme.u(80) * wipe } : { left: box.x, top: theme.safe.top, width: theme.u(3), height: theme.u(80) * wipe }),
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          width: panelW,
          ...(isVertical ? { top: box.h + theme.u(60), bottom: theme.safe.bottom + captionBand(theme) } : { top: theme.safe.top, bottom: theme.safe.bottom + captionBand(theme) * 0.5 }),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isVertical ? 'flex-start' : 'center',
        }}
      >
        <TextBlock kicker={shownKicker} headline={title} kickerAt={kickerAt} headlineAt={Math.min(headlineAt || 0, (kickerAt || 0) + 8)} size={size} maxWidth="100%" />
      </div>
    </AbsoluteFill>
  );
}

function SplitPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { kicker, kickerAt, secondAt } = clip.overlay || {};
  const { width: W, height: H, isVertical } = theme;
  const gap = theme.u(4);
  const a = isVertical ? { x: 0, y: 0, w: W, h: (H - gap) / 2 } : { x: 0, y: 0, w: (W - gap) / 2, h: H };
  const b = isVertical ? { x: 0, y: (H + gap) / 2, w: W, h: (H - gap) / 2 } : { x: (W + gap) / 2, y: 0, w: (W - gap) / 2, h: H };
  const p = progress(frame, secondAt || 20, 16, ease.inOut);
  const hasSecond = Boolean(clip.bedB && clip.bedB.length);
  const aBox = hasSecond
    ? { ...a, w: isVertical ? W : interpolate(p, [0, 1], [W, a.w]), h: isVertical ? interpolate(p, [0, 1], [H, a.h]) : H }
    : { x: 0, y: 0, w: W, h: H };

  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      <Bed shots={clip.bed} box={aBox} />
      {hasSecond && p > 0 && (
        <div style={{ position: 'absolute', inset: 0, clipPath: isVertical ? `inset(${(1 - p) * 100}% 0 0 0)` : `inset(0 0 0 ${50 + (1 - p) * 50}%)` }}>
          <Bed shots={clip.bedB} box={b} />
        </div>
      )}
      {kicker && (
        <>
          <Shade where="bottom" strength={0.4} />
          <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) * 0.7 }}>
            <Kicker text={kicker} at={kickerAt} />
          </div>
        </>
      )}
    </AbsoluteFill>
  );
}

/**
 * Editorial portrait treatment:
 * Replaces the tiny floating postage stamp with an elegant full-height documentary split.
 * In 16:9, portrait media cleanly fills the right 48% height-to-edge, while the left
 * displays refined metadata, title, and architectural rule.
 */
function PortraitSplitPhoto({ clip }) {
  const theme = useTheme();
  const { kicker, headline, kickerAt, headlineAt, label } = clip.overlay || {};
  const { width: W, height: H, isVertical } = theme;

  if (isVertical) {
    return <FullPhoto clip={clip} />;
  }

  const title = headline || label || kicker || 'ARCHIVAL RECORD';
  const shownKicker = title === kicker ? null : kicker;
  const boxW = Math.round(W * 0.48);
  const box = { x: W - boxW, y: 0, w: boxW, h: H };
  const panelW = box.x - theme.safe.left - theme.u(70);
  const size = fitSize(title, panelW, theme.size.h1 * 0.95, { lines: 3, ratio: glyphRatio(theme.style) });

  return (
    <AbsoluteFill>
      <Ground texture={null} durationInFrames={clip.durationInFrames} />
      <div style={{ position: 'absolute', left: box.x, top: 0, width: box.w, height: box.h, overflow: 'hidden' }}>
        <Bed shots={clip.bed} box={{ x: 0, y: 0, w: box.w, h: box.h }} />
      </div>
      {/* Precision dividing rule */}
      <div style={{ position: 'absolute', left: box.x, top: 0, bottom: 0, width: 1, background: theme.palette.line }} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          width: panelW,
          top: theme.safe.top,
          bottom: theme.safe.bottom + captionBand(theme) * 0.5,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <TextBlock kicker={shownKicker} headline={title} kickerAt={kickerAt} headlineAt={headlineAt} size={size} maxWidth="100%" />
      </div>
    </AbsoluteFill>
  );
}

function AnnotatedPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { kicker, kickerAt, label, annotateAt } = clip.overlay || {};
  const { width: W, height: H } = theme;
  const cur = activeShot(clip.bed, frame);
  const draw = progress(frame, annotateAt || 10, 18, ease.inOut);
  const labelIn = progress(frame, (annotateAt || 10) + 10, 14);
  let ring = null;
  const box = cur?.shot.focusBox;

  if (cur && cur.shot.type !== 'video' && box) {
    const c = projectPoint(cur.shot, cur.local, W, H, { x: (box.xmin + box.xmax) / 2, y: (box.ymin + box.ymax) / 2 });
    const corner = projectPoint(cur.shot, cur.local, W, H, { x: box.xmax, y: box.ymax });
    const r = Math.max(Math.min(W, H) * 0.06, Math.hypot(corner.x - c.x, corner.y - c.y) * 1.05);
    const toLeft = c.x > W / 2;
    const lx = toLeft ? Math.max(theme.safe.left, c.x - r - theme.u(260)) : Math.min(W - theme.safe.right - theme.u(380), c.x + r + theme.u(120));
    const ly = Math.max(theme.safe.top + theme.u(40), c.y - r - theme.u(90));
    const ex = toLeft ? c.x - r * 0.72 : c.x + r * 0.72, ey = c.y - r * 0.72;
    const hx = toLeft ? lx + theme.u(340) : lx - theme.u(16);
    ring = (
      <>
        <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
          <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={theme.palette.accent} strokeWidth={theme.u(4)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} transform={`rotate(-90 ${c.x} ${c.y})`} />
          <polyline points={`${ex},${ey} ${hx},${ly + theme.u(20)}`} fill="none" stroke={theme.palette.accent} strokeWidth={theme.u(2.5)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - labelIn} />
        </svg>
        {label && (
          <div style={{ position: 'absolute', left: lx, top: ly, width: theme.u(340), textAlign: toLeft ? 'right' : 'left', ...t.label, fontSize: theme.size.label * 1.2, color: theme.palette.text, textShadow: '0 2px 12px rgba(0,0,0,0.9)', opacity: labelIn }}>
            {label}
          </div>
        )}
      </>
    );
  }

  return (
    <AbsoluteFill>
      <Bed shots={clip.bed} />
      <Shade where="full" strength={0.25} />
      {ring}
      {kicker && kicker !== label && (
        <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) * 0.7 }}>
          <Kicker text={kicker} at={kickerAt} />
        </div>
      )}
    </AbsoluteFill>
  );
}

export function PhotoShot({ clip }) {
  const variant = clip.presentation?.variant || clip.variant;
  switch (variant) {
    case 'editorial':
      return <EditorialPhoto clip={clip} />;
    case 'split':
      return clip.bedB ? <SplitPhoto clip={clip} /> : <EditorialPhoto clip={clip} />;
    case 'depth':
      return <PortraitSplitPhoto clip={clip} />;
    case 'crop':
    case 'editorial_crop':
    case 'detail':
      return <FullPhoto clip={clip} />;
    case 'annotated':
      return <AnnotatedPhoto clip={clip} />;
    default:
      return <FullPhoto clip={clip} />;
  }
}
