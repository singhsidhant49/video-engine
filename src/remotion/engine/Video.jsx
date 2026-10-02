import React, { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import './fonts.js';
import { ThemeProvider, useTheme } from './theme.js';
import { progress, ease } from './motion.js';
import { Captions } from './Captions.jsx';
import { Letterbox, FilmBurn, irisClip } from './accents.jsx';
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
  const { width, unit } = useTheme();
  const { enter, exit, durationInFrames: d } = clip;
  const pin = enter.frames ? progress(frame, 0, enter.frames, ease.inOut) : 1;
  const pout = exit.frames ? progress(frame, d - exit.frames, exit.frames, ease.inOut) : 0;
  const style = {};
  const transforms = [];

  if (pin < 1) {
    switch (enter.type) {
      case 'dissolve': style.opacity = pin; break;
      case 'push': transforms.push(`translateX(${(1 - pin) * 100}%)`); break;
      case 'whip': {
        const w = progress(frame, 0, enter.frames, ease.whip);
        transforms.push(`translateX(${(1 - w) * 100}%)`);
        style.filter = `blur(${Math.sin(Math.PI * w) * 26 * unit}px)`;
        break;
      }
      case 'zoom': style.opacity = pin; transforms.push(`scale(${1.18 - 0.18 * pin})`); break;
      case 'wipe': style.clipPath = `inset(0 0 0 ${(1 - pin) * 100}%)`; break;
      case 'iris': style.clipPath = irisClip(pin); break;
      default: break;
    }
  }
  if (pout > 0) {
    switch (exit.type) {
      case 'push': transforms.push(`translateX(${-pout * 100}%)`); break;
      case 'whip': {
        const w = progress(frame, d - exit.frames, exit.frames, ease.whip);
        transforms.push(`translateX(${-w * 100}%)`);
        style.filter = `blur(${Math.sin(Math.PI * w) * 26 * unit}px)`;
        break;
      }
      case 'zoom': transforms.push(`scale(${1 + 0.3 * pout})`); break;
      default: break; // dissolve/wipe: the incoming clip covers this one
    }
  }
  if (transforms.length) style.transform = transforms.join(' ');
  return (
    <AbsoluteFill style={{ ...style, overflow: 'hidden', width }}>
      {children}
      {clip.accents?.letterbox && <Letterbox durationInFrames={d} opening={clip.from === 0} />}
    </AbsoluteFill>
  );
}

/** Dips, flashes and the opening/closing fades — drawn over everything but captions. */
function CutOverlays({ overlays, total }) {
  const frame = useCurrentFrame();
  let black = 0, white = 0;
  for (const o of overlays) {
    const half = o.frames / 2;
    if (o.type === 'fadeIn') black = Math.max(black, interpolate(frame, [0, o.frames], [1, 0], { extrapolateRight: 'clamp' }));
    else if (o.type === 'fadeOut') black = Math.max(black, interpolate(frame, [total - o.frames, total - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    else if (o.type === 'dip') black = Math.max(black, interpolate(frame, [o.frame - half, o.frame, o.frame + half], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    else if (o.type === 'flash') white = Math.max(white, interpolate(frame, [o.frame - 1, o.frame + 1, o.frame + o.frames], [0, 0.8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  }
  const burns = overlays.filter((o) => o.type === 'burn');
  return (
    <>
      {burns.map((o, i) => <FilmBurn key={i} frame={frame} at={o.frame} frames={o.frames} />)}
      {white > 0 && <AbsoluteFill style={{ background: '#fff', opacity: white }} />}
      {black > 0 && <AbsoluteFill style={{ background: '#000', opacity: black }} />}
    </>
  );
}

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
  const mediaEditorial = timeline.visualMode === 'MEDIA_EDITORIAL';
  return (
    <AbsoluteFill>
      {clip.shots.map((shot, idx) => {
        const solvedScene = shot.renderMode === 'solved' ? timeline.solvedScenes?.[shot.solvedSceneId] : null;
        const motionPlan = shot.renderMode === 'solved' ? timeline.motionPlans?.[shot.motionPlanId] : null;
        return (
          <Sequence key={shot.id || idx} from={shot.from} durationInFrames={shot.durationInFrames} name={shot.id}>
            {solvedScene && motionPlan
              ? <GenericSceneRenderer solvedScene={solvedScene} motionPlan={motionPlan} />
              : mediaEditorial
                ? <AbsoluteFill style={{ background: '#000', color: '#fff', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>MEDIA_EDITORIAL preflight failure: {shot.id}</AbsoluteFill>
                : <LegacyFamilyAdapter shot={shot} clip={clip} />}
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
        <CutOverlays overlays={timeline.cutOverlays} total={total} />
        <Captions captions={timeline.captions} />
        <Soundtrack audio={timeline.audio} total={total} />
      </AbsoluteFill>
    </ThemeProvider>
  );
};
