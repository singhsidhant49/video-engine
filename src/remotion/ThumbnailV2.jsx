import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile } from 'remotion';

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
  const overlayText = String(concept.overlayText || '').trim().split(/\s+/).slice(0, 4).join(' ');
  const fontSize = overlayText.length > 26 ? 82 : overlayText.length > 18 ? 96 : 112;
  const heroImage = concept.heroImage;
  const heroSrc = heroImage ? sourceFor(heroImage) : null;
  const isVideo = typeof heroImage === 'string' && /\.mp4(?:$|\?)/i.test(heroImage);
  const fallbackText = String(concept.mainSubject || packageData?.title || 'WATCH THIS').split(/\s+/).slice(0, 4).join(' ');

  return (
    <AbsoluteFill style={{ background, fontFamily: "'Outfit', 'Inter', sans-serif", overflow: 'hidden' }}>
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
        left: textRight ? '45%' : 72, right: textRight ? 72 : '45%',
        display: 'flex', flexDirection: 'column', alignItems: textRight ? 'flex-end' : 'flex-start',
        justifyContent: 'center', textAlign: textRight ? 'right' : 'left',
      }}>
        <div style={{ width: 96, height: 10, borderRadius: 8, background: accent, marginBottom: 28, boxShadow: `0 0 26px ${accent}77` }} />
        <div style={{
          color: textColor, fontSize, lineHeight: .88, fontWeight: 950,
          letterSpacing: '-0.055em', textTransform: 'uppercase', textWrap: 'balance',
          textShadow: '0 5px 18px rgba(0,0,0,.96), 0 1px 2px rgba(0,0,0,1)',
          WebkitTextStroke: '1px rgba(0,0,0,.24)',
        }}>
          {overlayText || fallbackText}
        </div>
      </div>

      <div style={{ position: 'absolute', inset: 20, border: '2px solid rgba(255,255,255,.12)', borderRadius: 22 }} />
      <div style={{ position: 'absolute', right: 18, bottom: 18, width: 132, height: 42, borderRadius: 8, background: 'rgba(0,0,0,.58)' }} />
    </AbsoluteFill>
  );
};
