import React from 'react';
import { Composition } from 'remotion';
import { Video } from './engine/Video.jsx';
import { sampleTimeline } from './sampleTimeline.js';

// Size and length come from the timeline itself, so Studio previews and renders always match it.
const calculateMetadata = ({ props }) => ({
  durationInFrames: Math.max(1, props.timeline?.durationInFrames || 1),
  fps: props.timeline?.fps || 30,
  width: props.timeline?.width,
  height: props.timeline?.height,
});

export const RemotionRoot = () => (
  <>
    <Composition
      id="DynamicShorts"
      component={Video}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ timeline: sampleTimeline('shorts') }}
      calculateMetadata={calculateMetadata}
    />
    <Composition
      id="LandscapeExplainer"
      component={Video}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ timeline: sampleTimeline('landscape') }}
      calculateMetadata={calculateMetadata}
    />
  </>
);
