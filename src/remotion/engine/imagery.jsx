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
  const move = shot.move || { type: 'static', scale: [1, 1], focus: [[0.5, 0.5], [0.5, 0.5]] };
  const moveType = move.type || 'static';
  const focal = shot.focal || { x: 0.5, y: 0.45 };

  if (moveType === 'static') {
    const baseScale = move.scale?.[0] || 1;
    const k = Math.max(W / shot.width, H / shot.height) * baseScale;
    const bw = shot.width * k, bh = shot.height * k;
    const fx = move.focus?.[0]?.[0] ?? focal.x;
    const fy = move.focus?.[0]?.[1] ?? focal.y;
    const left = Math.min(0, Math.max(W - bw, W / 2 - fx * bw));
    const top = Math.min(0, Math.max(H - bh, H / 2 - fy * bh));
    return { left, top, s: 1, bw, bh, rw: bw, rh: bh };
  }

  const t = interpolate(frame, [0, Math.max(1, shot.durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease.camera,
  });

  const { scale = [1, 1.03], focus = [[focal.x, focal.y], [focal.x, focal.y]] } = move;
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

const normalizeStaticPath = (src) => {
  if (!src) return '';
  return String(src).replace(/^public[\\/]/, '').split('\\').join('/');
};

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
        src={staticFile(normalizeStaticPath(shot.src))}
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
  const moveType = shot.move?.type || 'static';
  const t = moveType === 'static' ? 0 : interpolate(frame, [0, Math.max(1, shot.durationInFrames - 1)], [0, 1], { extrapolateRight: 'clamp', easing: ease.camera });
  const s = moveType === 'static' ? 1 : lerp(shot.move?.scale?.[0] || 1, shot.move?.scale?.[1] || 1.025, t);
  return (
    <div style={{ position: 'absolute', left: box?.x ?? 0, top: box?.y ?? 0, width: W, height: H, overflow: 'hidden' }}>
      <OffthreadVideo
        src={staticFile(normalizeStaticPath(shot.src))}
        muted
        startFrom={Math.round((shot.clipStart || 0) * fps)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`, filter }}
      />
    </div>
  );
}

export function ShotMedia({ shot, filter, box }) {
  const isVideo = shot.type === 'video' || (typeof shot.src === 'string' && shot.src.endsWith('.mp4'));
  return isVideo ? <CameraVideo shot={shot} filter={filter} box={box} /> : <CameraImage shot={shot} filter={filter} box={box} />;
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

/**
 * Editorial background system:
 * - neutralDark: Deep obsidian editorial void with restrained ambient vignette
 * - softRadial: Focused spotlight under primary diagram area
 * - technicalGrid: Clean ultra-subtle hairline coordinate grid (opacity <= 0.08)
 * - paperLight: Architectural blueprint / archival paper tone
 * - mediaBlur: Muted, darkened, highly blurred real media background (never noisy)
 * - charcoal: Deep matte textured graphite tone
 * - subtleTexture: Fine architectural dot matrix
 */
export function Ground({ texture, durationInFrames = 300, variant = 'neutralDark', mode }) {
  const theme = useTheme();
  const { palette, width: W, height: H } = theme;
  const bgMode = mode || variant || 'neutralDark';

  const isGrid = bgMode === 'technicalGrid' || bgMode === 'dark_editorial';
  const isDots = bgMode === 'subtleTexture';
  const isRadial = bgMode === 'softRadial';
  const isCharcoal = bgMode === 'charcoal';
  const isPaper = bgMode === 'paperLight';

  let bgGradient = `linear-gradient(160deg, ${palette.bg} 0%, ${palette.bgRaised || palette.bg} 100%)`;
  if (isRadial) {
    bgGradient = `radial-gradient(ellipse at 50% 46%, ${palette.accentSoft || 'rgba(99, 102, 241, 0.14)'} 0%, ${palette.bg} 68%)`;
  } else if (isCharcoal) {
    bgGradient = `radial-gradient(circle at 50% 50%, #151821 0%, #0b0d12 100%)`;
  } else if (isPaper) {
    bgGradient = `linear-gradient(180deg, #181d26 0%, #0d1017 100%)`;
  }

  return (
    <AbsoluteFill style={{ background: bgGradient, overflow: 'hidden' }}>
      {texture && (
        <AbsoluteFill style={{ opacity: 0.16, mixBlendMode: 'screen', filter: 'blur(38px) contrast(1.1)' }}>
          <ShotMedia
            shot={{
              ...texture,
              type: texture.type || (texture.src?.endsWith('.mp4') ? 'video' : 'image'),
              durationInFrames,
              move: { type: 'static', scale: [1.05, 1.05], focus: [[0.5, 0.5], [0.5, 0.5]] },
            }}
            filter="contrast(1.05) saturate(0.7)"
          />
        </AbsoluteFill>
      )}

      {/* Controlled ambient glow for radial/charcoal modes */}
      {!isRadial && (
        <div
          style={{
            position: 'absolute',
            width: W * 0.75,
            height: H * 0.65,
            left: '12%',
            top: '15%',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${palette.accentSoft || 'rgba(99, 102, 241, 0.08)'} 0%, transparent 68%)`,
            filter: 'blur(60px)',
            opacity: 0.35,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Subtle Hairline Grid (only in technicalGrid mode, never forced globally) */}
      {isGrid && (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${palette.line || 'rgba(255,255,255,0.04)'} 1px, transparent 1px), linear-gradient(90deg, ${palette.line || 'rgba(255,255,255,0.04)'} 1px, transparent 1px)`,
            backgroundSize: `${theme.u ? theme.u(theme.isVertical ? 48 : 64) : 54}px ${theme.u ? theme.u(theme.isVertical ? 48 : 64) : 54}px`,
            opacity: 0.08,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Subtle Dot Matrix */}
      {isDots && (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(${palette.line || 'rgba(255,255,255,0.1)'} 1px, transparent 1px)`,
            backgroundSize: `${theme.u ? theme.u(theme.isVertical ? 36 : 48) : 40}px ${theme.u ? theme.u(theme.isVertical ? 36 : 48) : 40}px`,
            opacity: 0.09,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Editorial vignette scrim */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(0,0,0,0.65) 100%)', pointerEvents: 'none' }} />
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
