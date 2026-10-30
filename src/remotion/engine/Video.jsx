import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import './fonts.js';
import { ThemeProvider, useTheme } from './theme.js';
import { progress, ease } from './motion.js';
import { Captions } from './Captions.jsx';
import { Letterbox } from './accents.jsx';
import { StatShot, StatementShot, ChapterShot, QuoteShot, DocumentShot } from '../families/editorial.jsx';
import { PhotoShot } from '../families/photo.jsx';
import { ListShot, ProcessShot, TimelineShot, ChartShot, CompareShot, GroundShot } from '../families/structured.jsx';
import { DiagramShot, MapShot, ModernCodeShot, ModernUiShot } from '../families/diagrams.jsx';
import { DynamicMontage } from '../families/montage.jsx';
import { GenericSceneRenderer } from './GenericSceneRenderer.jsx';

const FAMILIES = {
  image: PhotoShot, stat: StatShot, statement: StatementShot, chapter: ChapterShot, quote: QuoteShot, document: DocumentShot,
  list: ListShot, process: ProcessShot, timeline: TimelineShot, chart: ChartShot, compare: CompareShot,
  ui: ModernUiShot, code: ModernCodeShot, diagram: DiagramShot, map: MapShot, ground: GroundShot,
  montage: DynamicMontage,
};

/**
 * Applies a clip's enter/exit transitions. Overlaps were already compensated
 * in the timeline: the incoming clip starts `enter.frames/2` before the cut
 * and the outgoing one ends `exit.frames/2` after it, so picture stays locked
 * to the voice. Later clips render on top.
 */
function ClipFrame({ clip, children }) {
  const frame = useCurrentFrame();
  const { width } = useTheme();
  const { enter, durationInFrames: d } = clip;
  const pin = enter.frames ? progress(frame, 0, enter.frames, ease.inOut) : 1;
  const style = {};
  if (pin < 1 && enter.type === 'dissolve') style.opacity = pin;
  return (
    <AbsoluteFill style={{ ...style, overflow: 'hidden', width }}>
      {children}
      {clip.accents?.letterbox && <Letterbox durationInFrames={d} opening={clip.from === 0} />}
    </AbsoluteFill>
  );
}

/** Restrained transitions between shots that live inside the same scene clip. */
function ShotTransitionFrame({ enter, children }) {
  const frame = useCurrentFrame();
  const pin = enter?.frames ? progress(frame, 0, enter.frames, ease.inOut) : 1;
  const style = {};
  if (pin < 1 && enter?.type === 'dissolve') style.opacity = pin;
  return <AbsoluteFill style={{ ...style, overflow: 'hidden' }}>{children}</AbsoluteFill>;
}

/** Dips, flashes and the opening/closing fades — drawn over everything but captions. */

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="256" height="256" filter="url(#n)"/></svg>',
)}")`;

/** Vignette + film grain. Grain is one static tile jittered per frame (cheap, no per-frame SVG filter). */
function Finish() {
  const frame = useCurrentFrame();
  const { style } = useTheme();
  const seed = Math.floor(frame / 2);
  const gx = (seed * 73) % 256, gy = (seed * 151) % 256;
  return (
    <>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,${style.grade.vignette}) 100%)` }} />
      {style.grade.grain > 0 && <AbsoluteFill style={{ backgroundImage: GRAIN, backgroundPosition: `${gx}px ${gy}px`, opacity: style.grade.grain, mixBlendMode: 'overlay' }} />}
    </>
  );
}

/** Music ducks under speech using precalculated envelope or falls back to speech intervals. */
function useDuckedVolume(bgm, duckingEnvelope, speech, total) {
  return useMemo(() => {
    if (!bgm) return null;
    if (Array.isArray(duckingEnvelope) && duckingEnvelope.length > 0) {
      return (f) => {
        const idx = Math.min(duckingEnvelope.length - 1, Math.max(0, Math.floor(f)));
        return duckingEnvelope[idx] ?? bgm.ducked;
      };
    }
    const RAMP = 12;
    return (f) => {
      let dist = Infinity;
      for (const [a, b] of (speech || [])) {
        if (f >= a && f <= b) { dist = 0; break; }
        dist = Math.min(dist, f < a ? a - f : f - b);
        if (a > f + RAMP) break;
      }
      const duck = Math.min(1, dist / RAMP);
      const v = bgm.ducked + (bgm.base - bgm.ducked) * duck;
      const fade = Math.min(1, f / 30, (total - f) / 45);
      return Math.max(0, v * fade);
    };
  }, [bgm, duckingEnvelope, speech, total]);
}

function Soundtrack({ audio, total }) {
  const volume = useDuckedVolume(audio.bgm, audio.duckingEnvelope, audio.speech, total);
  return (
    <>
      {audio.narration && <Audio src={staticFile(audio.narration)} />}
      {audio.bgm && <Audio src={staticFile(audio.bgm.src)} volume={volume} loop />}
      {audio.sfx.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={45} layout="none">
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </>
  );
}

export function LegacyFamilyAdapter({ shot, clip }) {
  const ShotFamily = FAMILIES[shot.family] || FAMILIES.image;
  const assetRef = shot.asset || clip.asset || (clip.assets && clip.assets[0]);
  const subClip = {
    ...clip,
    family: shot.family,
    variant: shot.variant || clip.variant,
    durationInFrames: shot.durationInFrames,
    overlay: shot.overlay || {},
    presentation: shot.presentation,
    assets: shot.assets || [],
    texture: shot.family === 'image' || shot.family === 'montage'
      ? null
      : (assetRef ? {
        src: assetRef.src,
        type: assetRef.type,
        width: assetRef.width,
        height: assetRef.height,
        focal: assetRef.focal,
      } : clip.texture),
    bed: shot.asset ? [{ ...shot.asset, from: 0, durationInFrames: shot.durationInFrames, move: shot.move }] : null,
  };
  return <ShotFamily clip={subClip} />;
}

function MultiShotClip({ clip, timeline }) {
  const mediaEditorial = timeline.visualMode === 'MEDIA_EDITORIAL' || timeline.visualMode === 'HYBRID_EDITORIAL';
  return (
    <AbsoluteFill>
      {clip.shots.map((shot, idx) => {
        const solvedScene = shot.renderMode === 'solved' ? timeline.solvedScenes?.[shot.solvedSceneId] : null;
        const motionPlan = shot.renderMode === 'solved' ? timeline.motionPlans?.[shot.motionPlanId] : null;
        const internalEnter = idx > 0 ? shot.enter || { type: 'cut', frames: 0 } : { type: 'cut', frames: 0 };
        const internalExit = idx < clip.shots.length - 1 ? shot.exit || { type: 'cut', frames: 0 } : { type: 'cut', frames: 0 };
        const overlapIn = internalEnter.type === 'cut' ? 0 : Math.floor(internalEnter.frames / 2);
        const overlapOut = internalExit.type === 'cut' ? 0 : Math.ceil(internalExit.frames / 2);
        const sequenceFrom = Math.max(0, shot.from - overlapIn);
        const sequenceEnd = Math.min(clip.durationInFrames, shot.from + shot.durationInFrames + overlapOut);
        const sequenceDuration = Math.max(1, sequenceEnd - sequenceFrom);
        const frameOffset = shot.from - sequenceFrom;
        return (
          <Sequence key={shot.id || idx} from={sequenceFrom} durationInFrames={sequenceDuration} name={shot.id}>
            <ShotTransitionFrame enter={internalEnter} exit={internalExit} durationInFrames={sequenceDuration}>
              {solvedScene && motionPlan
                ? <GenericSceneRenderer solvedScene={solvedScene} motionPlan={motionPlan} frameOffset={frameOffset} />
                : mediaEditorial && ['image', 'montage'].includes(shot.family)
                  ? <AbsoluteFill style={{ background: '#000', color: '#fff', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>MEDIA_EDITORIAL preflight failure: {shot.id}</AbsoluteFill>
                  : <LegacyFamilyAdapter shot={shot} clip={clip} />}
            </ShotTransitionFrame>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

export const Video = ({ timeline }) => {
  if (!timeline?.clips?.length) {
    return <AbsoluteFill style={{ background: '#000', color: '#fff', justifyContent: 'center', alignItems: 'center', fontSize: 40, fontFamily: 'sans-serif' }}>No timeline</AbsoluteFill>;
  }
  const total = timeline.durationInFrames;
  return (
    <ThemeProvider timeline={timeline}>
      <AbsoluteFill style={{ background: timeline.palette.bg, overflow: 'hidden' }}>
        {timeline.clips.map((clip) => {
          const Family = FAMILIES[clip.family] || GroundShot;
          return (
            <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames} name={`${clip.id} ${clip.family}`}>
              <ClipFrame clip={clip}>
                {clip.shots?.length ? (
                  <MultiShotClip clip={clip} timeline={timeline} />
                ) : (
                  <Family clip={clip} />
                )}
              </ClipFrame>
            </Sequence>
          );
        })}
        <Finish />
        <Captions captions={timeline.captions} />
        <Soundtrack audio={timeline.audio} total={total} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
