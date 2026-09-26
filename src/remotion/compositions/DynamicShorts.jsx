import React from 'react';
import { Audio, Sequence, useCurrentFrame, AbsoluteFill } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { DynamicBackground } from '../components/DynamicBackground.jsx';
import { AnimatedCaptions } from '../components/AnimatedCaptions.jsx';
import { Camera } from '../components/Camera.jsx';

// Core Documentary & Narrative Primitives
import { ArchivalDocumentaryShot } from '../scenes/ArchivalDocumentaryShot.jsx';
import { AnimatedDataCrashShot } from '../scenes/AnimatedDataCrashShot.jsx';
import { EvidencePaperShot } from '../scenes/EvidencePaperShot.jsx';
import { KineticImpactWordShot } from '../scenes/KineticImpactWordShot.jsx';
import { SplitComparisonScene } from '../scenes/SplitComparisonScene.jsx';
import { MetricHeroScene } from '../scenes/MetricHeroScene.jsx';
import { ProcessFlowScene } from '../scenes/ProcessFlowScene.jsx';
import { TypographyScene } from '../scenes/TypographyScene.jsx';
import { BrowserScene } from '../scenes/BrowserScene.jsx';
import { TerminalScene } from '../scenes/TerminalScene.jsx';
import { CodeWindow } from '../components/CodeWindow.jsx';

// ReactVideoEditor Motion Graphics Templates
import { StatCounterScene } from '../templates/StatCounterTemplate.jsx';
import { CinematicTitleIntroTemplate } from '../templates/CinematicTitleIntroTemplate.jsx';
import { LowerThirdTemplate } from '../templates/LowerThirdTemplate.jsx';
import { QuoteCardTemplate } from '../templates/QuoteCardTemplate.jsx';
import { PolaroidPhotoStackTemplate } from '../templates/PolaroidPhotoStackTemplate.jsx';
import { NotificationPopTemplate } from '../templates/NotificationPopTemplate.jsx';

// Transition duration in frames (8 frames = ~266ms at 30fps)
const TRANSITION_FRAMES = 8;

function getTransitionEffect(transitionType) {
  switch (transitionType) {
    case 'slide_left':
      return slide({ direction: 'from-left' });
    case 'slide_right':
      return slide({ direction: 'from-right' });
    case 'wipe':
      return wipe({ direction: 'from-left' });
    case 'crossfade':
    default:
      return fade();
  }
}

export const DynamicShorts = ({
  title = 'Faceless Video',
  scenes = [],
  subtitles = [],
  audioUrl = '',
  bgmUrl = '',
  sfxMap = {},
  theme = 'business_editorial',
  palette = null,
  format = 'shorts',
}) => {
  const frame = useCurrentFrame();

  // AI-generated palette (or sensible defaults)
  const activePalette = palette || {
    primary: '#38bdf8',
    accent: '#fbbf24',
    bg: '#050a18',
    bgGradient: 'linear-gradient(180deg, #0c1a3a 0%, #050a18 65%, #010206 100%)',
    glow: 'rgba(56, 189, 248, 0.35)',
    text: '#f8fafc',
    subtitlePill: 'rgba(4, 7, 15, 0.88)',
  };

  // Film Grain seed
  const grainSeed = Math.floor(frame / 2);
  const grainOffsetX = (grainSeed * 37) % 200;
  const grainOffsetY = (grainSeed * 53) % 200;

  // Check if any scene uses transitions
  const hasTransitions = scenes.some(s => s.transition && s.transition !== 'none');

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: activePalette.bg || '#050a18',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* In-frame Google Fonts Loader */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter+Tight:ital,wght@0,600;0,700;0,800;0,900;1,700;1,900&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,500;1,6..72,600;1,6..72,700&family=Outfit:wght@500;600;700;800;900&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700;1,900&family=Plus+Jakarta+Sans:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@500;700;800&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* MASTER CINEMATIC COMPOSITE */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          filter: 'contrast(1.05) brightness(0.97) saturate(0.93)',
          overflow: 'hidden',
        }}
      >
        {/* Scene Compositor with Transitions */}
        {hasTransitions ? (
          <TransitionSeries>
            {scenes.map((scene, idx) => {
              const duration = Math.max(1, (scene.endFrame || 90) - (scene.startFrame || 0));
              const transitionType = scene.transition || (idx > 0 ? 'crossfade' : 'none');
              
              return (
                <React.Fragment key={`scene-${idx}`}>
                  {idx > 0 && transitionType !== 'none' && (
                    <TransitionSeries.Transition
                      presentation={getTransitionEffect(transitionType)}
                      timing={linearTiming({ durationInFrames: TRANSITION_FRAMES })}
                    />
                  )}
                  <TransitionSeries.Sequence durationInFrames={duration}>
                    <AbsoluteFill>
                      <SceneWithBackground 
                        scene={scene} 
                        scenes={scenes} 
                        theme={theme} 
                        palette={activePalette} 
                      />
                    </AbsoluteFill>
                  </TransitionSeries.Sequence>
                </React.Fragment>
              );
            })}
          </TransitionSeries>
        ) : (
          // Fallback: Sequence-based rendering
          scenes.map((scene, idx) => (
            <Sequence
              key={`scene-${idx}`}
              from={scene.startFrame || 0}
              durationInFrames={Math.max(1, (scene.endFrame || 90) - (scene.startFrame || 0))}
            >
              <AbsoluteFill>
                <SceneWithBackground 
                  scene={scene} 
                  scenes={scenes} 
                  theme={theme} 
                  palette={activePalette} 
                />
              </AbsoluteFill>
            </Sequence>
          ))
        )}
      </div>

      {/* Master Radial Vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
          zIndex: 60,
        }}
      />

      {/* Animated SVG Film Grain Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: '-20px',
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          transform: `translate(${grainOffsetX % 10}px, ${grainOffsetY % 10}px)`,
          pointerEvents: 'none',
          opacity: 0.065,
          mixBlendMode: 'overlay',
          zIndex: 70,
        }}
      >
        <svg width="100%" height="100%">
          <filter id={`film-grain-${grainSeed % 10}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed={grainSeed} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#film-grain-${grainSeed % 10})`} />
        </svg>
      </div>

      {/* Animated Captions with AI-chosen palette colors */}
      <AnimatedCaptions 
        subtitles={subtitles} 
        format={format} 
        activeColor={activePalette.accent || '#fbbf24'} 
        pillBackground={activePalette.subtitlePill || 'rgba(4, 7, 15, 0.88)'}
      />

      {/* MULTI-TRACK AUDIO ENGINE */}
      {audioUrl && <Audio src={audioUrl} volume={1.0} />}
      {bgmUrl && <Audio src={bgmUrl} volume={0.12} loop />}

      {/* SFX on Scene Transitions */}
      {scenes.map((scene, idx) => {
        const sfxKey = scene.sfx || (scene.type === 'metric_hero' || scene.type === 'stat_counter' ? 'impact_boom' : (scene.type === 'animated_data_chart' ? 'sub_drop' : (scene.type === 'evidence_paper' || scene.type === 'polaroid_photo_stack' ? 'paper_slam' : (idx > 0 ? 'whoosh' : null))));
        const sfxAudioSrc = sfxKey && sfxMap[sfxKey];
        if (!sfxAudioSrc) return null;
        const startFrame = (scene.startFrame || 0) + (scene.sfxDelayFrames || 0);
        return (
          <Sequence key={`sfx_${idx}`} from={startFrame} durationInFrames={35}>
            <Audio src={sfxAudioSrc} volume={0.6} />
          </Sequence>
        );
      })}
    </div>
  );
};

// Scene + Dynamic Background wrapper
function SceneWithBackground({ scene, scenes, theme, palette }) {
  const isFullBleedPhoto = scene && (
    scene.type === 'archival_documentary' ||
    scene.type === 'cinematic' ||
    scene.type === 'stock' ||
    scene.type === 'media'
  );

  const sceneDuration = Math.max(1, (scene.endFrame || 90) - (scene.startFrame || 0));
  const bgPhoto = scene.params?.backgroundMediaUrl || scene.params?.mediaUrl || scene.params?.imageUrl || null;

  return (
    <>
      {/* Dynamic Background is ALWAYS active for cards, graphs, quotes, documents, counters */}
      {!isFullBleedPhoto && (
        <DynamicBackground 
          theme={theme} 
          archetype={scene.archetype || theme} 
          palette={palette}
          bgMediaUrl={bgPhoto}
          accentColor={scene.params?.accentColor || palette.accent || '#38bdf8'}
        />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10,
      }}>
        <Camera camera={scene.camera} durationInFrames={sceneDuration}>
          {renderScene(scene, palette)}
        </Camera>
      </div>
    </>
  );
}

// Scene Switcher supporting Full ReactVideoEditor Template Suite
function renderScene(scene, palette) {
  const params = { ...scene, ...scene.params };
  if (!params.accentColor) params.accentColor = palette.accent || '#38bdf8';
  if (!params.primaryColor) params.primaryColor = palette.primary || '#38bdf8';
  if (!params.palette) params.palette = palette;

  switch (scene.type) {
    // 1. Archival & Media
    case 'archival_documentary':
    case 'cinematic':
    case 'stock':
    case 'media':
    case 'image':
      return <ArchivalDocumentaryShot params={params} startFrame={scene.startFrame || 0} />;

    // 2. Polaroid / Framed Photo Stack
    case 'polaroid_photo_stack':
    case 'photo_stack':
    case 'polaroid':
    case 'framed_photo':
      return <PolaroidPhotoStackTemplate params={params} startFrame={scene.startFrame || 0} />;

    // 3. Cinematic Title Intro
    case 'cinematic_title_intro':
    case 'cinematic_title':
    case 'title_card':
    case 'chapter_title':
      return <CinematicTitleIntroTemplate params={params} startFrame={scene.startFrame || 0} />;

    // 4. Lower Third Speaker Overlay
    case 'lower_third':
    case 'speaker_intro':
    case 'author_profile':
      return <LowerThirdTemplate params={params} startFrame={scene.startFrame || 0} />;

    // 5. Editorial Quote Card
    case 'quote_card':
    case 'quote':
    case 'citation':
      return <QuoteCardTemplate params={params} startFrame={scene.startFrame || 0} />;

    // 6. Stat Counter & KPI Dashboard
    case 'stat_counter':
    case 'kpi_dashboard':
    case 'counter':
      return <StatCounterScene params={params} startFrame={scene.startFrame || 0} />;

    // 7. Interactive Notification Pop
    case 'notification_pop':
    case 'notification':
    case 'alert_toast':
      return <NotificationPopTemplate params={params} startFrame={scene.startFrame || 0} />;

    // 8. Dynamic SVG Data Crash & Trend Chart
    case 'animated_data_chart':
    case 'data_crash':
    case 'line_chart':
    case 'chart':
      return <AnimatedDataCrashShot params={params} startFrame={scene.startFrame || 0} />;

    // 9. Classified Evidence Paper Slam
    case 'evidence_paper':
    case 'newspaper':
    case 'document':
      return <EvidencePaperShot params={params} startFrame={scene.startFrame || 0} />;

    // 10. Kinetic Impact Hook Word
    case 'kinetic_impact_word':
    case 'hook_word':
      return <KineticImpactWordShot params={params} startFrame={scene.startFrame || 0} />;

    // 11. Split Comparison (Before/After, Myth/Reality)
    case 'split_comparison':
    case 'versus':
    case 'before_after':
      return <SplitComparisonScene params={params} startFrame={scene.startFrame || 0} />;

    // 12. Metric Hero Shock
    case 'metric_hero':
    case 'stats_highlight':
    case 'number':
      return <MetricHeroScene params={params} startFrame={scene.startFrame || 0} />;

    // 13. Step-by-Step Process Flow
    case 'process_flow':
    case 'diagram':
    case 'steps':
    case 'timeline':
      return <ProcessFlowScene params={params} startFrame={scene.startFrame || 0} />;

    // 14. Typography & Headlines
    case 'typography':
    case 'headline_alert':
    case 'hook':
      return <TypographyScene params={params} startFrame={scene.startFrame || 0} />;

    // 15. Browser / Web Demo
    case 'browser':
    case 'web_demo':
      return <BrowserScene params={params} startFrame={scene.startFrame || 0} />;

    // 16. Terminal Command
    case 'terminal':
    case 'command':
      return <TerminalScene params={params} startFrame={scene.startFrame || 0} />;

    // 17. Code Editor
    case 'code':
    case 'code_editor':
      return (
        <CodeWindow
          title={params.title || 'script.js'}
          heading={params.heading || scene.voiceoverSentence}
          code={params.code || '// Production code\nasync function main() {\n  return true;\n}'}
          language={params.language || 'typescript'}
          accentColor={params.accentColor || '#38bdf8'}
          startFrame={scene.startFrame || 0}
        />
      );

    default:
      return <ArchivalDocumentaryShot params={params} startFrame={scene.startFrame || 0} />;
  }
}
