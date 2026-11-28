import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from 'remotion';
import { splitThumbnailTextLines } from '../services/creativeQuality.js';

const sourceFor = (value) => /^(?:data:|https?:|blob:)/.test(String(value || ''))
  ? value
  : staticFile(String(value || '').replace(/^[/\\]+/, ''));

export const ThumbnailComposition = ({ packageData, conceptIndex = 0 }) => {
  const concept = packageData?.thumbnails?.[conceptIndex] || {};
  const palette = concept.palette || {};
  const accent = palette.accent || '#F5C542';
  const textColor = palette.text || '#FFFFFF';
  const background = palette.background || '#0B1020';
  const textRight = concept.layout === 'text_right_subject_left';
  const noText = concept.textMode === 'none';
  const overlayText = String(concept.overlayText || '').trim().split(/\s+/).slice(0, 4).join(' ');
  const fallbackText = String(concept.mainSubject || packageData?.title || 'WATCH THIS').split(/\s+/).slice(0, 4).join(' ');
  const textLines = noText ? [] : splitThumbnailTextLines(overlayText || fallbackText);
  const longestLine = Math.max(...textLines.map((line) => line.length), 1);
  const fontSize = longestLine > 22 ? 58 : longestLine > 15 ? 76 : longestLine > 11 ? 88 : 104;
  const heroImage = concept.heroImage;
  const heroSrc = heroImage ? sourceFor(heroImage) : null;
  const isVideo = typeof heroImage === 'string' && /\.mp4(?:$|\?)/i.test(heroImage);

  return (
    <AbsoluteFill style={{ background, fontFamily: "'Outfit', 'Inter', 'Noto Sans Devanagari', 'Kohinoor Devanagari', sans-serif", overflow: 'hidden' }}>
      {heroSrc ? (
        isVideo ? (
          <OffthreadVideo src={heroSrc} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: concept.focalPosition || 'center' }} />
        ) : (
          <Img src={heroSrc} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: concept.focalPosition || 'center' }} />
        )
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(circle at ${textRight ? '28%' : '72%'} 45%, ${accent}55 0%, ${background} 58%, #03050A 100%)` }} />
      )}

      <AbsoluteFill style={{ background: textRight
        ? 'linear-gradient(90deg, rgba(2,4,9,.08) 0%, rgba(2,4,9,.28) 38%, rgba(2,4,9,.92) 72%, rgba(2,4,9,.98) 100%)'
        : 'linear-gradient(90deg, rgba(2,4,9,.98) 0%, rgba(2,4,9,.92) 30%, rgba(2,4,9,.28) 64%, rgba(2,4,9,.08) 100%)' }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.16), transparent 42%, rgba(0,0,0,.34))' }} />

      <div style={{
        position: 'absolute', top: 72, bottom: 72,
        left: textRight ? '43%' : 64, right: textRight ? 64 : '43%',
        display: 'flex', flexDirection: 'column', alignItems: textRight ? 'flex-end' : 'flex-start',
        justifyContent: 'center', textAlign: textRight ? 'right' : 'left',
      }}>
        {!noText && <div style={{ width: 96, height: 10, borderRadius: 8, background: accent, marginBottom: 28, boxShadow: `0 0 26px ${accent}77` }} />}
        {!noText && <div style={{
          color: textColor, fontSize, lineHeight: .9, fontWeight: 950,
          letterSpacing: '-0.045em', textTransform: 'uppercase',
          textShadow: '0 5px 18px rgba(0,0,0,.96), 0 1px 2px rgba(0,0,0,1)',
          WebkitTextStroke: '1px rgba(0,0,0,.24)',
        }}>
          {textLines.map((line) => <div key={line} style={{ whiteSpace: 'nowrap' }}>{line}</div>)}
        </div>}
      </div>

      <div style={{ position: 'absolute', inset: 20, border: '2px solid rgba(255,255,255,.12)', borderRadius: 22 }} />
    </AbsoluteFill>
  );
};
