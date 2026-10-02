import { Easing, interpolate } from 'remotion';

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

export const MOVEMENT_STATES = {
  STATIC: 'STATIC',
  SUBTLE: 'SUBTLE',
  ACTIVE: 'ACTIVE',
};

export const ease = {
  out: Easing.bezier(0.16, 1, 0.3, 1),       // expo-ish out: fast arrival, long settle
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  camera: Easing.bezier(0.25, 0.1, 0.25, 1), // ultra-gentle editorial drift
  whip: Easing.bezier(0.83, 0, 0.17, 1),
  back: Easing.bezier(0.34, 1.4, 0.64, 1),
};

export const progress = (frame, start = 0, duration = 14, easing = ease.out) => {
  const s = Number.isFinite(start) ? start : 0;
  const d = Number.isFinite(duration) ? Math.max(1, duration) : 14;
  const f = Number.isFinite(frame) ? frame : 0;
  return interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing });
};

/**
 * Classifies a camera move into one of the three deliberate movement states:
 * STATIC (0 motion), SUBTLE (gentle drift/micro-push), or ACTIVE (dynamic framing).
 */
export function classifyMovementState(moveType) {
  if (!moveType || moveType === 'static' || moveType === 'hold') return MOVEMENT_STATES.STATIC;
  if (['subtlePush', 'subtlePull', 'drift', 'subtle'].includes(moveType)) return MOVEMENT_STATES.SUBTLE;
  return MOVEMENT_STATES.ACTIVE;
}

/**
 * One reveal vocabulary per directing style: returns CSS for an element that
 * appears at `at`. Elements never animate from scale 0 — that was the cheap
 * "pop" the old templates shared.
 */
export function reveal(kind, frame, at = 0, unit = 1, duration = 16) {
  const a = Number.isFinite(at) ? at : 0;
  const u = Number.isFinite(unit) ? unit : 1;
  const p = progress(frame, a, duration);
  switch (kind) {
    case 'mask':
      return { clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`, transform: `translateY(${(1 - p) * 34 * u}px)`, opacity: p > 0 ? 1 : 0 };
    case 'fade':
      return { opacity: progress(frame, a, duration + 6, ease.inOut) };
    case 'pop': {
      const q = progress(frame, a, 12, ease.back);
      return { opacity: clamp01(p * 2), transform: `scale(${0.95 + 0.05 * q})` };
    }
    case 'rise':
    default:
      return { opacity: p, transform: `translateY(${(1 - p) * 24 * u}px)` };
  }
}

