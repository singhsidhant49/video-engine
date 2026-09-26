import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Vox-Style 3D Perspective Camera Component.
 * Calibrated strictly for 9:16 vertical shorts (1080x1920) to guarantee
 * ZERO EDGE CLIPPING while maintaining cinematic pseudo-3D parallax.
 */
export const Camera = ({ 
  children, 
  camera = { movement: 'push_in', speed: 1.0 }, 
  durationInFrames = 90 
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const movement = camera.movement || 'push_in';
  const speed = camera.speed || 1.0;

  // Weighty, cinematic spring physics
  const springProgress = spring({
    frame,
    fps,
    config: { damping: 22, mass: 1, stiffness: 50 },
  });

  const linearProgress = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));

  let scale = 1.0;
  let translateX = 0;
  let translateY = 0;
  let rotateX = 0;
  let rotateY = 0;
  let rotateZ = 0;

  switch (movement) {
    case 'push_in':
    case 'zoom_in':
      scale = interpolate(springProgress, [0, 1], [1.0, 1.04 * speed]);
      rotateX = interpolate(linearProgress, [0, 1], [1.0, -0.6]);
      rotateY = interpolate(linearProgress, [0, 1], [-0.8, 0.6]);
      break;

    case 'pull_out':
    case 'zoom_out':
      scale = interpolate(springProgress, [0, 1], [1.05 * speed, 1.0]);
      rotateX = interpolate(linearProgress, [0, 1], [-0.8, 0.5]);
      rotateY = interpolate(linearProgress, [0, 1], [0.8, -0.5]);
      break;

    case 'pan_left':
      scale = 1.02;
      translateX = interpolate(linearProgress, [0, 1], [10, -10 * speed]);
      rotateY = interpolate(linearProgress, [0, 1], [-1.2, 1.0]);
      rotateX = interpolate(linearProgress, [0, 1], [0.3, -0.3]);
      break;

    case 'pan_right':
      scale = 1.02;
      translateX = interpolate(linearProgress, [0, 1], [-10, 10 * speed]);
      rotateY = interpolate(linearProgress, [0, 1], [1.2, -1.0]);
      rotateX = interpolate(linearProgress, [0, 1], [-0.3, 0.3]);
      break;

    case 'tilt_up':
      scale = 1.02;
      translateY = interpolate(linearProgress, [0, 1], [10, -10 * speed]);
      rotateX = interpolate(linearProgress, [0, 1], [1.5, -1.0]);
      break;

    case '3d_orbit':
    case 'orbit':
      scale = interpolate(springProgress, [0, 1], [1.0, 1.03 * speed]);
      rotateX = interpolate(linearProgress, [0, 1], [1.2, -1.0]);
      rotateY = interpolate(linearProgress, [0, 1], [-1.2, 1.2]);
      break;

    case 'shake': {
      const decay = Math.max(0, 1 - (frame / 16));
      translateX = Math.sin(frame * 1.5) * 3 * decay;
      translateY = Math.cos(frame * 1.6) * 3 * decay;
      rotateZ = Math.sin(frame * 1.1) * 0.5 * decay;
      scale = interpolate(linearProgress, [0, 1], [1.02, 1.0]);
      break;
    }

    default:
      scale = interpolate(springProgress, [0, 1], [1.0, 1.02]);
      rotateX = interpolate(linearProgress, [0, 1], [0.5, -0.4]);
      break;
  }

  if (camera.rotateX !== undefined) rotateX = camera.rotateX;
  if (camera.rotateY !== undefined) rotateY = camera.rotateY;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        perspective: 1200,
        transformStyle: 'preserve-3d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `perspective(1200px) scale(${scale}) translate3d(${translateX}px, ${translateY}px, 0px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
          transformStyle: 'preserve-3d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          willChange: 'transform',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
};
