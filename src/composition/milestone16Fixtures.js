const asset = (id, src, width, height, focal, subjectBounds, extra = {}) => ({ id, type: 'image', src, width, height, focal, subjectBounds, safeTextRegions: focal.x > .55 ? ['center_left', 'top_left'] : focal.x < .45 ? ['center_right', 'top_right'] : ['top_left'], tier: 'verified', cropFitness: .9, evidenceStrength: .85, ...extra });
const right = asset('wide-right', 'media/media_1_1790351072989.jpg', 3840, 1411, { x: .76, y: .46 }, { x: .68, y: .2, width: .18, height: .52 });
const center = asset('center', 'assets/s01_d.jpg', 3840, 2880, { x: .5, y: .42 }, { x: .36, y: .2, width: .28, height: .38 });
const portrait = asset('portrait', 'media/media_1_1790351187106.jpg', 2493, 2422, { x: .5, y: .42 }, { x: .29, y: .12, width: .42, height: .62 }, { cropFitness: .64 });
const alternate = asset('alternate', 'media/media_1_1790351281551.jpg', 2816, 2112, { x: .3, y: .4 }, { x: .2, y: .22, width: .2, height: .32 });
const third = asset('third', 'media/media_1_1790351319517.jpg', 3648, 2736, { x: .58, y: .4 }, { x: .48, y: .2, width: .2, height: .32 });

export const MEDIA_FIXTURES = [
  { id: 'subject-right-text-left', title: 'Subject right, text left', role: 'subject', asset: right, overlay: { headline: 'Precision at industrial scale' }, cameraMove: 'static' },
  { id: 'centered-no-text', title: 'Centered subject, no text', role: 'subject', asset: center, overlay: {}, cameraMove: 'static' },
  { id: 'portrait-landscape', title: 'Portrait in landscape', role: 'subject', asset: portrait, overlay: { headline: 'A deliberate portrait treatment' }, cameraMove: 'static' },
  { id: 'landscape-to-shorts', title: 'Landscape adapted to Shorts', role: 'subject', asset: center, overlay: {}, cameraMove: 'static' },
  { id: 'native-video', title: 'Native-motion video', role: 'context', asset: { ...center, id: 'native-video', type: 'video', src: 'media/m16_native_motion.mp4', motionPresent: true }, overlay: {}, cameraMove: 'subtlePush' },
  { id: 'image-stat', title: 'Image plus stat', role: 'context', asset: right, overlay: { stat: '$200M+' }, cameraMove: 'static' },
  { id: 'image-annotation', title: 'Image plus annotation', role: 'detail', asset: center, overlay: { label: 'detail' }, cameraMove: 'detailCrop' },
  { id: 'two-media', title: 'Two-media comparison', role: 'comparison', asset: right, supportingAssets: [alternate], overlay: {}, cameraMove: 'static', variant: 'split' },
  { id: 'three-image-montage', title: 'Three-image montage', role: 'context', family: 'montage', asset: center, supportingAssets: [alternate, third], overlay: {}, cameraMove: 'static' },
];

export function wordsForMediaFixture(durationInFrames = 150) {
  const text = ['This', 'detail', 'shows', 'why', 'the', 'selected', 'media', 'matters'];
  const step = Math.floor(durationInFrames / text.length);
  return text.map((word, index) => ({ word, text: word, norm: [word.toLowerCase()], startFrame: index * step, endFrame: Math.min(durationInFrames - 1, (index + 1) * step - 2), endsSentence: index === text.length - 1 }));
}
