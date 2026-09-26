import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { useTheme } from './theme.js';
import { ease, progress } from './motion.js';

/**
 * Cinematic accents adapted from the React Video Editor free templates
 * (https://github.com/reactvideoeditor/remotion-templates, MIT — see
 * THIRD_PARTY_NOTICES.md): Letterbox Reveal, Image Zoom Reveal, Film Burn,
 * Spotlight Reveal. The originals are fixed-length demos with placeholder
 * content; these are driven by clip timing, the directing style and the
 * palette, and work over photographs and video clips alike.
 */

/**
 * Letterbox (from "Letterbox Reveal"): bars close in from full-frame black to a
 * 2.39:1 frame when the clip opens, hold, and part again before the clip ends.
 * On the video's first clip they start closed, so the film "opens".
 */
export function Letterbox({ durationInFrames, opening }) {
  const frame = useCurrentFrame();
  const { height, width, isVertical } = useTheme();
  const target = isVertical ? 0.07 : Math.max(0, (1 - (width / height) / 2.39) / 2); // fraction of height per bar
  const inP = progress(frame, 0, opening ? 34 : 18, ease.inOut);
  const outP = progress(frame, durationInFrames - 14, 14, ease.inOut);
  const start = opening ? 0.5 : 0;
  const bar = interpolate(inP, [0, 1], [start, target]) * (1 - outP);
  if (bar <= 0.0005) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar * height, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar * height, background: '#000' }} />
    </AbsoluteFill>
  );
}

/**
 * Focus pull (from "Image Zoom Reveal"): the first shot of a key moment arrives
 * soft and slightly oversized and racks into focus. Shorter and subtler than
 * the original (2× → 1.12×, 10px → ~14px at 1080), so it reads as a lens, not a zoom effect.
 */
export function FocusPull({ children, frames = 22 }) {
  const frame = useCurrentFrame();
  const { unit } = useTheme();
  const p = progress(frame, 0, frames, ease.out);
  if (p >= 1) return children;
  return (
    <AbsoluteFill style={{ transform: `scale(${1.12 - 0.12 * p})`, filter: `blur(${(1 - p) * 14 * unit}px)` }}>
      {children}
    </AbsoluteFill>
  );
}

/**
 * Film burn (from "Film Burn"): three drifting warm radial light leaks peaking
 * on the cut, so the cut happens under a bloom of light. Used as a designed
 * section transition in documentary styles.
 */
export function FilmBurn({ frame, at, frames }) {
  const t = frame - (at - frames / 2);
  if (t < 0 || t > frames) return null;
  const intensity = interpolate(t, [0, frames * 0.5, frames], [0, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const x1 = 50 + Math.sin(frame * 0.05) * 30, y1 = 50 + Math.cos(frame * 0.04) * 20;
  const x2 = 50 + Math.sin(frame * 0.07 + 2) * 25, y2 = 50 + Math.cos(frame * 0.06 + 1) * 30;
  const x3 = 50 + Math.sin(frame * 0.03 + 4) * 20, y3 = 50 + Math.cos(frame * 0.08 + 3) * 15;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${x1}% ${y1}%, rgba(249,115,22,${intensity * 0.75}), transparent 62%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${x2}% ${y2}%, rgba(251,191,36,${intensity * 0.55}), transparent 52%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${x3}% ${y3}%, rgba(255,255,255,${intensity * 0.45}), transparent 42%)` }} />
      <AbsoluteFill style={{ background: `rgba(255, 214, 170, ${Math.max(0, intensity - 0.55) * 0.9})` }} />
    </AbsoluteFill>
  );
}

/** Iris (from "Spotlight Reveal"): incoming clip opens from a circle centred on the frame. */
export const irisClip = (p) => `circle(${interpolate(p, [0, 1], [0, 75])}% at 50% 50%)`;
