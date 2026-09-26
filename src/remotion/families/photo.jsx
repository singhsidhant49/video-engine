import React from 'react';
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { useTheme, textStyles, fitSize, glyphRatio } from '../engine/theme.js';
import { Bed, Ground, Shade, ShotMedia, activeShot, projectPoint } from '../engine/imagery.jsx';
import { reveal, progress, ease } from '../engine/motion.js';
import { captionBand, Kicker } from './editorial.jsx';

/**
 * Photo family — one family, several compositions, so a run of photo scenes
 * does not read as a slideshow. The Visual Director picks the variant.
 *
 *   full       cinematic full frame, type locked to the lower third
 *   editorial  asymmetric: photo panel + type panel on the ground
 *   split      two photographs side by side (stacked on vertical), second arrives mid-sentence
 *   depth      foreground print over its own blurred, darker background — for portrait photos in 16:9
 *   annotated  full frame with a drawn ring + leader line on a GROUNDED subject box (FOCUS_GROUNDING only)
 */

function TextBlock({ kicker, headline, kickerAt, headlineAt, maxWidth, size }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.u(22) }}>
      {kicker && <Kicker text={kicker} at={kickerAt} />}
      {headline && <h1 style={{ ...t.display, fontSize: size, maxWidth, ...reveal(theme.style.motion.reveal, frame, headlineAt, theme.unit) }}>{headline}</h1>}
    </div>
  );
}

function FullPhoto({ clip }) {
  const theme = useTheme();
  const { kicker, headline, kickerAt, headlineAt } = clip.overlay;
  const maxW = theme.width - theme.safe.left - theme.safe.right;
  const size = headline ? fitSize(headline, maxW * (theme.isVertical ? 1 : 0.62), theme.size.h1, { lines: 3, ratio: glyphRatio(theme.style) }) : 0;
  return (
    <AbsoluteFill>
      <Bed shots={clip.bed} />
      {(kicker || headline) && <Shade where="bottom" strength={theme.style.grade.shade + (headline ? 0.1 : 0)} />}
      <div style={{ position: 'absolute', left: theme.safe.left, right: theme.safe.right, bottom: theme.safe.bottom + captionBand(theme) }}>
        <TextBlock kicker={kicker} headline={headline} kickerAt={kickerAt} headlineAt={headlineAt} size={size} maxWidth={theme.isVertical ? '100%' : '62%'} />
      </div>
    </AbsoluteFill>
  );
}

function EditorialPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { kicker, headline, kickerAt, headlineAt, label } = clip.overlay;
  const { width: W, height: H, isVertical } = theme;
  // Headline if the director wrote one; otherwise the subject's name carries the text panel.
  const title = headline || (label && label !== kicker ? label : null) || kicker;
  const shownKicker = title === kicker ? null : kicker;
  const box = isVertical ? { x: 0, y: 0, w: W, h: Math.round(H * 0.56) } : { x: Math.round(W * 0.44), y: 0, w: W - Math.round(W * 0.44), h: H };
  const wipe = progress(frame, 0, 18, ease.inOut);
  const panelW = isVertical ? W - theme.safe.left - theme.safe.right : box.x - theme.safe.left - theme.u(70);
  const size = title ? fitSize(title, panelW, theme.size.h1 * (isVertical ? 1 : 1.1), { lines: 3, ratio: glyphRatio(theme.style) }) : 0;
  return (
    <AbsoluteFill>
      <Ground texture={null} durationInFrames={clip.durationInFrames} />
      <div style={{ position: 'absolute', inset: 0, clipPath: clip.enter.frames ? 'none' : isVertical ? `inset(0 0 ${(1 - wipe) * 100}% 0)` : `inset(0 0 0 ${(1 - wipe) * 100}%)` }}>
        <Bed shots={clip.bed} box={box} />
      </div>
      <div style={{ position: 'absolute', background: theme.palette.accent, ...(isVertical ? { left: 0, top: box.h, height: theme.u(6), width: `${wipe * 100}%` } : { left: box.x, top: 0, width: theme.u(6), height: `${wipe * 100}%` }) }} />
      <div
        style={{
          position: 'absolute',
          left: theme.safe.left,
          width: panelW,
          ...(isVertical ? { top: box.h + theme.u(70), bottom: theme.safe.bottom + captionBand(theme) } : { top: theme.safe.top, bottom: theme.safe.bottom + captionBand(theme) * 0.6 }),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isVertical ? 'flex-start' : 'center',
        }}
      >
        <TextBlock kicker={shownKicker} headline={title} kickerAt={kickerAt} headlineAt={Math.min(headlineAt, kickerAt + 10)} size={size} maxWidth="100%" />
      </div>
    </AbsoluteFill>
  );
}

function SplitPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { kicker, kickerAt, secondAt } = clip.overlay;
  const { width: W, height: H, isVertical } = theme;
  const gap = theme.u(10);
  const a = isVertical ? { x: 0, y: 0, w: W, h: (H - gap) / 2 } : { x: 0, y: 0, w: (W - gap) / 2, h: H };
  const b = isVertical ? { x: 0, y: (H + gap) / 2, w: W, h: (H - gap) / 2 } : { x: (W + gap) / 2, y: 0, w: (W - gap) / 2, h: H };
  const p = progress(frame, secondAt, 16, ease.inOut);
  // Before the second image arrives, the first holds the whole frame.
  const aBox = { ...a, w: isVertical ? W : interpolate(p, [0, 1], [W, a.w]), h: isVertical ? interpolate(p, [0, 1], [H, a.h]) : H };
  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      <Bed shots={clip.bed} box={aBox} />
      {clip.bedB && p > 0 && (
        <div style={{ position: 'absolute', inset: 0, clipPath: isVertical ? `inset(${(1 - p) * 100}% 0 0 0)` : `inset(0 0 0 ${50 + (1 - p) * 50}%)` }}>
          <Bed shots={clip.bedB} box={b} />
        </div>
      )}
      {kicker && (
        <>
          <Shade where="bottom" strength={0.45} />
          <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) }}>
            <Kicker text={kicker} at={kickerAt} />
          </div>
        </>
      )}
    </AbsoluteFill>
  );
}

/** One depth shot: the same photograph as a sharp print over a blurred, darker copy, moving at different rates. */
function DepthShot({ shot }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { width: W, height: H } = theme;
  const t = interpolate(frame, [0, Math.max(1, shot.durationInFrames - 1)], [0, 1], { extrapolateRight: 'clamp', easing: ease.camera });
  const printH = H * 0.8;
  const printW = Math.min(W * 0.62, printH * (shot.width / shot.height));
  const x = W * 0.56 - printW / 2 + interpolate(t, [0, 1], [theme.u(18), -theme.u(18)]);
  const y = (H - printH) / 2 - theme.u(20);
  return (
    <AbsoluteFill>
      <ShotMedia shot={{ ...shot, move: { ...shot.move, scale: [1.18, 1.26] } }} filter={`blur(${theme.u(34)}px) brightness(0.45) saturate(0.8)`} />
      <div style={{ position: 'absolute', left: x, top: y, width: printW, height: printH, boxShadow: `0 ${theme.u(40)}px ${theme.u(90)}px rgba(0,0,0,0.6)`, overflow: 'hidden', transform: `scale(${1 + t * 0.035})` }}>
        <Img src={staticFile(shot.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: theme.style.grade.image }} />
      </div>
    </AbsoluteFill>
  );
}

function DepthPhoto({ clip }) {
  const theme = useTheme();
  const { kicker, kickerAt } = clip.overlay;
  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      {clip.bed.map((shot, i) => (
        <Sequence key={i} from={shot.from} durationInFrames={shot.durationInFrames} layout="none">
          <DepthShot shot={shot} />
        </Sequence>
      ))}
      {kicker && (
        <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) }}>
          <Kicker text={kicker} at={kickerAt} />
        </div>
      )}
    </AbsoluteFill>
  );
}

function AnnotatedPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const t = textStyles(theme);
  const { kicker, kickerAt, label, annotateAt } = clip.overlay;
  const { width: W, height: H } = theme;
  const cur = activeShot(clip.bed, frame);
  const draw = progress(frame, annotateAt, 20, ease.inOut);
  const labelIn = progress(frame, annotateAt + 12, 14);
  let ring = null;
  const box = cur?.shot.focusBox; // grounded subject location in normalised image coords
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
          <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={theme.palette.accent} strokeWidth={theme.u(5)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} transform={`rotate(-90 ${c.x} ${c.y})`} />
          <polyline points={`${ex},${ey} ${hx},${ly + theme.u(22)}`} fill="none" stroke={theme.palette.accent} strokeWidth={theme.u(3)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - labelIn} />
        </svg>
        {label && (
          <div style={{ position: 'absolute', left: lx, top: ly, width: theme.u(340), textAlign: toLeft ? 'right' : 'left', ...t.label, fontSize: theme.size.label * 1.25, color: theme.palette.text, textShadow: '0 2px 12px rgba(0,0,0,0.85)', opacity: labelIn }}>
            {label}
          </div>
        )}
      </>
    );
  }
  return (
    <AbsoluteFill>
      <Bed shots={clip.bed} />
      <Shade where="full" strength={0.28} />
      {ring}
      {kicker && kicker !== label && (
        <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) }}>
          <Kicker text={kicker} at={kickerAt} />
        </div>
      )}
    </AbsoluteFill>
  );
}

/**
 * Photo stack (adapted from the RVE "Photo Stack" template, MIT): real prints
 * with white borders drop onto a blurred plate of the first image, one per
 * phrase, each slightly rotated — for a run of artifacts or places.
 */
function StackPhoto({ clip }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { kicker, kickerAt, stackAts = [8] } = clip.overlay;
  const { width: W, height: H, isVertical } = theme;
  const prints = (clip.stack || []).slice(0, 3);
  const rot = [-4.5, 3, -1.5];
  const off = isVertical ? [[-0.06, -0.08], [0.05, 0.02], [-0.02, 0.1]] : [[-0.16, -0.03], [0.12, 0.02], [0.0, 0.05]];
  const drift = interpolate(frame, [0, clip.durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      <Bed shots={clip.bed} filter={`blur(${theme.u(30)}px) brightness(0.42) saturate(0.8)`} />
      {prints.map((p, i) => {
        const at = stackAts[i] ?? 8 + i * 30;
        const q = progress(frame, at, 18, ease.out);
        if (q <= 0) return null;
        const maxW = W * (isVertical ? 0.78 : 0.46), maxH = H * (isVertical ? 0.46 : 0.66);
        const scale = Math.min(maxW / p.width, maxH / p.height);
        const w = p.width * scale, h = p.height * scale;
        const border = theme.u(14);
        const x = W / 2 + off[i][0] * W - w / 2 + interpolate(drift, [0, 1], [0, theme.u(12) * (i % 2 ? 1 : -1)]);
        const y = H / 2 + off[i][1] * H - h / 2 - theme.u(30);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x - border, top: y - border, width: w + border * 2, height: h + border * 2,
              background: '#f4f1ea', padding: border, boxShadow: `0 ${theme.u(30)}px ${theme.u(70)}px rgba(0,0,0,0.55)`,
              opacity: q, transform: `translateY(${(1 - q) * -theme.u(40)}px) scale(${1.06 - 0.06 * q}) rotate(${rot[i]}deg)`,
            }}
          >
            <Img src={staticFile(p.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: theme.style.grade.image }} />
          </div>
        );
      })}
      {kicker && (
        <div style={{ position: 'absolute', left: theme.safe.left, bottom: theme.safe.bottom + captionBand(theme) }}>
          <Kicker text={kicker} at={kickerAt} />
        </div>
      )}
    </AbsoluteFill>
  );
}

export function PhotoShot({ clip }) {
  switch (clip.variant) {
    case 'editorial': return <EditorialPhoto clip={clip} />;
    case 'split': return clip.bedB ? <SplitPhoto clip={clip} /> : <FullPhoto clip={clip} />;
    case 'depth': return <DepthPhoto clip={clip} />;
    case 'annotated': return <AnnotatedPhoto clip={clip} />;
    case 'stack': return clip.stack?.length > 1 ? <StackPhoto clip={clip} /> : <FullPhoto clip={clip} />;
    default: return <FullPhoto clip={clip} />;
  }
}
