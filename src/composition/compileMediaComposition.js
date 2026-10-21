import { createSceneComposition } from './sceneComposition.js';
import { phrasesFromAlignedWords } from './compileProcessComposition.js';

function element({ id, kind, role, importance, content, parentId = null, style = {}, binding = null, maxLines }) {
  return { id, kind, semanticRole: role, importance, content, intrinsic: {}, constraints: { parentId, protected: ['media', 'text', 'annotation'].includes(kind), ...(maxLines ? { maxLines } : {}) }, styleTokenRefs: style, semanticBinding: binding };
}

const phraseFor = (phrases, text, fallback = 0) => {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const ranked = phrases.map((phrase) => ({ phrase, score: tokens.filter((token) => phrase.tokens.includes(token)).length })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].phrase : phrases[fallback] || null;
};

export function compileMediaComposition({ mediaSceneSpec, overlay, alignedWords, shotStartFrame, durationInFrames, font, format }) {
  const phrases = phrasesFromAlignedWords(alignedWords, shotStartFrame);
  const primary = mediaSceneSpec.assets[0];
  const elements = [element({ id: 'media_root', kind: 'group', role: 'media-root', importance: 'structural', content: { strategy: mediaSceneSpec.strategy, mediaRole: mediaSceneSpec.mediaRole }, style: {} })];
  const relationships = [], readingOrder = [];
  mediaSceneSpec.assets.forEach((asset, index) => {
    const id = index ? `media_support_${index}` : 'media_primary';
    elements.push(element({ id, kind: 'media', role: index ? 'supporting-media' : 'primary-media', importance: index ? 'secondary' : 'primary', content: asset, parentId: 'media_root', style: { fit: 'cover' }, binding: { type: 'asset', value: asset.assetId } }));
    relationships.push({ type: 'contains', from: 'media_root', to: id }); readingOrder.push(id);
  });
  const headline = overlay?.headline || overlay?.title || null;
  const stat = overlay?.stat || overlay?.value || null;
  if (mediaSceneSpec.textNeed === 'HEADLINE' && headline) {
    elements.push(element({ id: 'media_headline', kind: 'text', role: 'headline', importance: 'secondary', content: headline, parentId: 'media_root', maxLines: 3, style: { fontFamily: font.display, fontWeight: 750, color: 'text', textAlign: 'left' }, binding: { type: 'takeaway', value: headline } }));
    relationships.push({ type: 'contains', from: 'media_root', to: 'media_headline' }); readingOrder.push('media_headline');
  }
  if (mediaSceneSpec.textNeed === 'STAT' && stat) {
    elements.push(element({ id: 'media_stat', kind: 'text', role: 'media-stat', importance: 'secondary', content: String(stat), parentId: 'media_root', maxLines: 2, style: { fontFamily: font.display, fontWeight: 850, color: 'accent', textAlign: 'left' }, binding: { type: 'stat', value: String(stat) } }));
    relationships.push({ type: 'contains', from: 'media_root', to: 'media_stat' }); readingOrder.push('media_stat');
  }
  if (mediaSceneSpec.annotationNeed !== 'NONE') {
    const label = overlay?.annotation || overlay?.label || 'Detail';
    elements.push(element({ id: 'media_annotation', kind: 'annotation', role: 'media-annotation', importance: 'secondary', content: label, parentId: 'media_root', maxLines: 2, style: { fontFamily: font.text, fontWeight: 650, color: 'text', accentRule: true }, binding: { type: 'assetRegion', value: primary.assetId, phraseId: phraseFor(phrases, label, 1)?.id || null } }));
    relationships.push({ type: 'labels', from: 'media_annotation', to: 'media_primary' }); readingOrder.push('media_annotation');
  }
  if (overlay?.source && mediaSceneSpec.mediaRole === 'EVIDENCE') {
    elements.push(element({ id: 'media_source', kind: 'text', role: 'source', importance: 'supporting', content: overlay.source, parentId: 'media_root', maxLines: 1, style: { fontFamily: font.text, fontWeight: 500, color: 'muted', textAlign: 'left' } }));
    relationships.push({ type: 'contains', from: 'media_root', to: 'media_source' }); readingOrder.push('media_source');
  }
  const annotationPhrase = phraseFor(phrases, overlay?.annotation || overlay?.label, 1);
  const changeFrames = mediaSceneSpec.montage?.cuts.slice(1).map((cut, i) => ({ id: `asset_change_${i + 1}`, type: 'assetChanged', targetId: `media_support_${i + 1}`, phraseId: phrases[i + 1]?.id || null, frame: cut.startFrame })) || [];
  return createSceneComposition({ version: 1, shotId: mediaSceneSpec.shotId, format,
    objective: mediaSceneSpec.editorialObjective, regions: [{ id: 'primary', role: 'media-stage', constraints: {} }, { id: 'captions', role: 'caption-safe', constraints: {} }], elements, relationships, readingOrder,
    captionPolicy: { mode: mediaSceneSpec.mediaRole === 'EVIDENCE' ? 'COMPACT' : 'NORMAL', regionId: 'captions', equivalentTextElementIds: [] }, backgroundIntent: { mode: 'charcoal', texture: null },
    motionIntent: { vocabulary: ['focus', 'highlight', 'scale', 'translate'], frame0Emphasis: 1 }, complexityBudget: { level: mediaSceneSpec.mediaRole === 'MONTAGE' ? 'HIGH' : elements.length > 3 ? 'MEDIUM' : 'LOW', mainTargets: mediaSceneSpec.assets.length, supportElements: elements.length - mediaSceneSpec.assets.length - 1, relationships: relationships.length },
    semanticEvents: [{ id: 'media_established', type: 'mediaEstablished', targetId: 'media_primary', phraseId: phrases[0]?.id || null, frame: 0 }, ...(mediaSceneSpec.annotationNeed !== 'NONE' ? [{ id: 'annotation_introduced', type: 'annotationIntroduced', targetId: 'media_annotation', phraseId: annotationPhrase?.id || null, frame: annotationPhrase?.startFrame ?? Math.round(durationInFrames * .4) }] : []), ...changeFrames],
  });
}
