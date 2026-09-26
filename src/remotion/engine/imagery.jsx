import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { useTheme } from './theme.js';
import { ease } from './motion.js';
import { FocusPull } from './accents.jsx';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Where the image sits at `frame` for a camera move inside a box of W×H.
 * The focus point is kept centred, clamped so the image always covers the box.
 */
export function cameraLayout(shot, frame, W, H) {
  const t = interpolate(frame, [0, Math.max(1, shot.durationInFrames - 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.camera });
  const { scale, focus } = shot.move;
  const s = lerp(scale[0], scale[1], t);
  const fx = lerp(focus[0][0], focus[1][0], t);
  const fy = lerp(focus[0][1], focus[1][1], t);
  const k = Math.max(W / shot.width, H / shot.height);
  const bw = shot.width * k, bh = shot.height * k;
  const rw = bw * s, rh = bh * s;
  const left = Math.min(0, Math.max(W - rw, W / 2 - fx * rw));
  const top = Math.min(0, Math.max(H - rh, H / 2 - fy * rh));
  return { left, top, s, bw, bh, rw, rh };
}

/** Screen position (within the box) of a point given in normalised image coords. */
export function projectPoint(shot, frame, W, H, point) {
  const l = cameraLayout(shot, frame, W, H);
  return { x: l.left + point.x * l.rw, y: l.top + point.y * l.rh };
}

/**
 * A still photograph treated as a camera shot. The move is a focus path plus a
 * zoom curve eased over the WHOLE shot (no spring-then-stop).
 */
export function CameraImage({ shot, filter, box }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const W = box?.w ?? theme.width, H = box?.h ?? theme.height;
  const { left, top, s, bw, bh } = cameraLayout(shot, frame, W, H);
  return (
    <div style={{ position: 'absolute', left: box?.x ?? 0, top: box?.y ?? 0, width: W, height: H, overflow: 'hidden' }}>
      <Img
        src={staticFile(shot.src)}
        style={{ position: 'absolute', left: 0, top: 0, width: bw, height: bh, transformOrigin: '0 0', transform: `translate3d(${left}px, ${top}px, 0) scale(${s})`, filter }}
      />
    </div>
  );
}

/** Motion footage: cover-cropped, muted, with a gentle push so it sits in the same camera language. */
export function CameraVideo({ shot, filter, box }) {
  const frame = useCurrentFrame();
  const theme = useTheme();
  const { fps } = useVideoConfig();
  const W = box?.w ?? theme.width, H = box?.h ?? theme.height;
  const t = interpolate(frame, [0, Math.max(1, shot.durationInFrames - 1)], [0, 1], { extrapolateRight: 'clamp', easing: ease.camera });
  const s = lerp(shot.move.scale[0], shot.move.scale[1], t);
  return (
    <div style={{ position: 'absolute', left: box?.x ?? 0, top: box?.y ?? 0, width: W, height: H, overflow: 'hidden' }}>
      <OffthreadVideo
        src={staticFile(shot.src)}
        muted
        startFrom={Math.round((shot.clipStart || 0) * fps)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`, filter }}
      />
    </div>
  );
}

export function ShotMedia({ shot, filter, box }) {
  return shot.type === 'video' ? <CameraVideo shot={shot} filter={filter} box={box} /> : <CameraImage shot={shot} filter={filter} box={box} />;
}

/** The A-roll bed: a clip's sequence of camera shots, hard-cut between each other. */
export function Bed({ shots, dim = 0, box, filter }) {
  const { style } = useTheme();
  if (!shots?.length) return null;
  return (
    <AbsoluteFill>
      {shots.map((shot, i) => (
        <Sequence key={i} from={shot.from} durationInFrames={shot.durationInFrames} layout="none">
          {shot.reveal === 'focus'
            ? <FocusPull><ShotMedia shot={shot} filter={filter ?? style.grade.image} box={box} /></FocusPull>
            : <ShotMedia shot={shot} filter={filter ?? style.grade.image} box={box} />}
        </Sequence>
      ))}
      {dim > 0 && <div style={{ position: 'absolute', left: box?.x ?? 0, top: box?.y ?? 0, width: box?.w ?? '100%', height: box?.h ?? '100%', background: `rgba(0,0,0,${dim})` }} />}
    </AbsoluteFill>
  );
}

/** The shot active at `frame` (clip-relative), with frame made shot-relative. */
export function activeShot(shots, frame) {
  const shot = shots?.find((s) => frame >= s.from && frame < s.from + s.durationInFrames) || shots?.[shots.length - 1];
  return shot ? { shot, local: frame - shot.from } : null;
}

/** Graphic-only ground: palette background, a slow light drift, optional faint photographic texture. */
export function Ground({ texture, durationInFrames = 300 }) {
  const frame = useCurrentFrame();
  const { palette, width: W, height: H, style } = useTheme();
  const drift = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: palette.bg }}>
      {texture && (
        <AbsoluteFill style={{ opacity: 0.16, mixBlendMode: 'luminosity' }}>
          <CameraImage
            shot={{ ...texture, durationInFrames, move: { scale: [1.05, 1.12], focus: [[texture.focal?.x ?? 0.5, texture.focal?.y ?? 0.5], [texture.focal?.x ?? 0.5, (texture.focal?.y ?? 0.5) - 0.03]] } }}
            filter={`grayscale(1) contrast(1.1) ${style.grade.image}`}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${W * 0.9}px ${H * 0.7}px at ${22 + drift * 10}% ${18 + drift * 6}%, ${palette.accentSoft}, transparent 70%)` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.35))' }} />
    </AbsoluteFill>
  );
}

/** Legibility shading where text sits — never a global blur/dim of the photo. */
export function Shade({ where = 'bottom', strength = 0.55 }) {
  const a = strength;
  const bg = {
    bottom: `linear-gradient(180deg, rgba(0,0,0,0) 38%, rgba(0,0,0,${a * 0.55}) 62%, rgba(0,0,0,${a}) 100%)`,
    top: `linear-gradient(0deg, rgba(0,0,0,0) 45%, rgba(0,0,0,${a}) 100%)`,
    left: `linear-gradient(90deg, rgba(0,0,0,${a}) 0%, rgba(0,0,0,${a * 0.5}) 45%, rgba(0,0,0,0) 75%)`,
    full: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,${a * 0.55}) 0%, rgba(0,0,0,${a}) 100%)`,
  }[where];
  return <AbsoluteFill style={{ background: bg }} />;
}
