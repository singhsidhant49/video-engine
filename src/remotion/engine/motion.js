import { Easing, interpolate } from 'remotion';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),       // expo-ish out: fast arrival, long settle
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  camera: Easing.bezier(0.37, 0, 0.63, 1),   // gentle, never stops dead
  whip: Easing.bezier(0.83, 0, 0.17, 1),
  back: Easing.bezier(0.34, 1.4, 0.64, 1),
};

export const progress = (frame, start, duration, easing = ease.out) =>
  interpolate(frame, [start, start + Math.max(1, duration)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });

/**
 * One reveal vocabulary per directing style: returns CSS for an element that
 * appears at `at`. Elements never animate from scale 0 — that was the cheap
 * "pop" the old templates shared.
 */
export function reveal(kind, frame, at, unit, duration = 16) {
  const p = progress(frame, at, duration);
  switch (kind) {
    case 'mask':
      return { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, transform: `translateY(${(1 - p) * 34 * unit}px)`, opacity: p > 0 ? 1 : 0 };
    case 'fade':
      return { opacity: progress(frame, at, duration + 6, ease.inOut) };
    case 'pop': {
      const q = progress(frame, at, 12, ease.back);
      return { opacity: clamp01(p * 2), transform: `scale(${0.9 + 0.1 * q})` };
    }
    case 'rise':
    default:
      return { opacity: p, transform: `translateY(${(1 - p) * 28 * unit}px)` };
  }
}
