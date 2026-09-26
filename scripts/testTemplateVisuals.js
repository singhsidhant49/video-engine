import path from 'node:path';
import fs from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from '../src/config/index.js';

async function testVisuals() {
  const entryPoint = path.join(config.rootDir, 'src/remotion/index.jsx');
  console.log('Bundling Remotion...');
  const bundled = await bundle({
    entryPoint,
    ignoreRegisterRootWarning: true,
  });

  const testScenes = [
    {
      id: 'scene_01',
      type: 'cinematic_title_intro',
      startFrame: 0,
      endFrame: 60,
      params: {
        title: 'THE LIBRARY OF ALEXANDRIA',
        subtitle: 'How 500,000 Ancient Scrolls Vanished',
        tag: 'HISTORICAL INVESTIGATION',
        accentColor: '#fbbf24',
        mediaUrl: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?q=80&w=1080&auto=format&fit=crop',
      }
    },
    {
      id: 'scene_02',
      type: 'polaroid_photo_stack',
      startFrame: 60,
      endFrame: 120,
      params: {
        caption: 'The Great Royal Library',
        dateStamp: 'EST. 300 BC',
        accentColor: '#fbbf24',
        mediaUrl: 'https://images.unsplash.com/photo-1564769625905-50e93615e769?q=80&w=1080&auto=format&fit=crop',
      }
    },
    {
      id: 'scene_03',
      type: 'stat_counter',
      startFrame: 120,
      endFrame: 180,
      params: {
        headline: 'ANCIENT KNOWLEDGE LOST',
        targetValue: 500000,
        prefix: '',
        suffix: ' SCROLLS',
        statLabel: 'Parchment Texts Burned',
        trend: '-100%',
        accentColor: '#f43f5e',
        mediaUrl: 'https://images.unsplash.com/photo-1508175688552-6655ba7bfb5e?q=80&w=1080&auto=format&fit=crop',
      }
    },
    {
      id: 'scene_04',
      type: 'quote_card',
      startFrame: 180,
      endFrame: 240,
      params: {
        quote: 'The library was not destroyed in one dramatic fire, but through centuries of slow bureaucratic decay.',
        author: 'Dr. Heather Phillips',
        role: 'Historian, Oxford University',
        accentColor: '#38bdf8',
        mediaUrl: 'https://images.unsplash.com/photo-1575505586569-646b2ca898fc?q=80&w=1080&auto=format&fit=crop',
      }
    },
    {
      id: 'scene_05',
      type: 'notification_pop',
      startFrame: 240,
      endFrame: 300,
      params: {
        appName: 'ARCHIVAL INTELLIGENCE',
        sender: 'DISCOVERY DISPATCH',
        message: 'Excavation in Alexandria uncovers ancient papyrus fragments confirming the lost scrolls.',
        time: 'BREAKING',
        icon: '📜',
        accentColor: '#10b981',
        mediaUrl: 'https://images.unsplash.com/photo-1599420186946-7a27d4917b10?q=80&w=1080&auto=format&fit=crop',
      }
    }
  ];

  const renderProps = {
    title: 'The Lost Library of Alexandria',
    scenes: testScenes,
    subtitles: [
      { id: 1, text: 'THE GREATEST LIBRARY IN HUMAN HISTORY', startFrame: 0, endFrame: 50 },
      { id: 2, text: 'CONTAINED OVER HALF A MILLION SCROLLS', startFrame: 51, endFrame: 120 },
      { id: 3, text: 'ERASING CENTURIES OF SCIENTIFIC PROGRESS', startFrame: 121, endFrame: 200 },
      { id: 4, text: 'UNTIL RECENT EXCAVATIONS REVEALED THE TRUTH', startFrame: 201, endFrame: 300 },
    ],
    audioUrl: '',
    palette: {
      primary: '#d97706',
      accent: '#fbbf24',
      bg: '#140c06',
      bgGradient: 'linear-gradient(180deg, #2b1708 0%, #140c06 65%, #080402 100%)',
      glow: 'rgba(251, 191, 36, 0.35)',
      text: '#fef3c7',
      subtitlePill: 'rgba(20, 12, 6, 0.90)',
    },
    format: 'shorts',
  };

  const composition = await selectComposition({
    serveUrl: bundled,
    id: 'DynamicShorts',
    inputProps: renderProps,
  });

  const outDir = path.join(config.rootDir, 'renders/template_tests');
  await fs.mkdir(outDir, { recursive: true });

  const testFrames = [25, 85, 145, 205, 265];
  for (let i = 0; i < testFrames.length; i++) {
    const f = testFrames[i];
    const outFile = path.join(outDir, `template_scene_${i + 1}_frame_${f}.png`);
    console.log(`Rendering scene ${i + 1} at frame ${f}...`);
    await renderStill({
      composition,
      serveUrl: bundled,
      output: outFile,
      inputProps: renderProps,
      frame: f,
    });
    console.log(`Saved: ${outFile}`);
  }

  console.log('✅ All template visual tests rendered successfully!');
}

testVisuals().catch(console.error);
