import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { ShotMedia, Shade } from '../engine/imagery.jsx';
import { useTheme } from '../engine/theme.js';

/** A restrained editorial montage: authored as one semantic shot, internally cut across 2–5 specific assets. */
export function DynamicMontage({ clip }) {
  const theme = useTheme();
  const assets = (clip.assets || []).slice(0, 5);
  if (!assets.length) return <AbsoluteFill style={{ background: theme.palette.bg }} />;
  const weights = assets.map((_, index) => 1 + (index === assets.length - 1 ? 0.25 : index % 2 ? 0.08 : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const ranges = assets.map((asset, index) => {
    const remaining = clip.durationInFrames - cursor;
    const duration = index === assets.length - 1 ? remaining : Math.max(6, Math.round(clip.durationInFrames * weights[index] / total));
    const range = { asset, from: cursor, duration };
    cursor += duration;
    return range;
  });
  return (
    <AbsoluteFill style={{ background: theme.palette.bg }}>
      {ranges.map(({ asset, from, duration }, index) => {
        const focal = asset.focal || { x: 0.5, y: 0.45 };
        const move = index % 3 === 1
          ? { type: 'static', scale: [1.02, 1.02], focus: [[focal.x, focal.y], [focal.x, focal.y]] }
          : { type: 'push', scale: [1, 1.035], focus: [[focal.x, focal.y + 0.015], [focal.x, focal.y]] };
        return (
          <Sequence key={`${asset.src}-${index}`} from={from} durationInFrames={duration} layout="none">
            <ShotMedia shot={{ ...asset, durationInFrames: duration, move }} filter={theme.style.grade.image} />
          </Sequence>
        );
      })}
      <Shade where="bottom" strength={0.22} />
    </AbsoluteFill>
  );
}
