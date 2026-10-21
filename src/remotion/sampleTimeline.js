import { buildPalette } from '../shared/styles.js';

/**
 * A small hand-written timeline for Remotion Studio: graphic families only,
 * so it needs no downloaded assets or narration. Real timelines come from
 * src/pipeline/timeline.js (see renders/runs/<id>/timeline.json).
 */
export function sampleTimeline(format = 'shorts') {
  const fps = 30;
  const word = (text, s) => ({ index: 0, text, startFrame: s, endFrame: s + 8 });
  const clip = (id, family, from, dur, overlay, enter = { type: 'cut', frames: 0 }, exit = { type: 'cut', frames: 0 }) => ({
    id, sceneId: id, kind: family, family, intensity: 3, from, durationInFrames: dur, cutAt: 0, enter, exit, bed: null, texture: null, overlay, narration: '',
  });
  return {
    version: 2,
    title: 'Sample',
    format,
    fps,
    width: format === 'shorts' ? 1080 : 1920,
    height: format === 'shorts' ? 1920 : 1080,
    durationInFrames: 420,
    style: 'editorial_explainer',
    palette: buildPalette('editorial_explainer', 205),
    clips: [
      clip('c01', 'statement', 0, 90, { words: ['Three', 'forces', 'collided'], ats: [6, 14, 22], kicker: 'Sample timeline' }),
      clip('c02', 'list', 90, 120, { title: 'What changed', items: ['Cheap credit everywhere', 'Risk hidden in bonds', 'Nobody watching'], ats: [10, 45, 80] }),
      clip('c03', 'stat', 210, 90, { value: '60', prefix: '$', suffix: ' trillion', label: 'wealth erased', direction: 'down', at: 10, countFrames: 27 }),
      clip('c04', 'chart', 300, 120, { type: 'line', title: 'S&P 500, 2007–2009', unit: null, points: [{ label: 'Oct 07', value: 1565 }, { label: 'Mar 08', value: 1330 }, { label: 'Sep 08', value: 1166 }, { label: 'Nov 08', value: 752 }, { label: 'Mar 09', value: 677 }], at: 10, drawFrames: 60 }),
    ],
    cutOverlays: [{ type: 'fadeIn', frame: 0, frames: 12 }, { type: 'fadeOut', frame: 420, frames: 18 }],
    captions: {
      mode: 'highlight',
      hidden: [],
      chunks: [
        { id: 0, startFrame: 0, endFrame: 60, words: [word('Three', 0), word('forces', 12), word('collided.', 24)] },
        { id: 1, startFrame: 95, endFrame: 200, words: [word('Cheap', 100), word('credit,', 110), word('hidden', 135), word('risk.', 150)] },
      ],
    },
    audio: { narration: null, bgm: null, sfx: [], speech: [] },
  };
}
