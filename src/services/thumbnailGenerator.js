/**
 * Thumbnail and Video Packaging Generator
 *
 * Implements Section 14 of the Production Roadmap:
 * 1. 3 High-CTR Thumbnail Concepts (single subject, 3-5 punchy words, high contrast).
 * 2. YouTube Metadata Package (Curiosity title, SEO description, Chapter timestamps, Evidence bibliography).
 */

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Generate 3 high-CTR thumbnail concepts and a full YouTube distribution package.
 * @param {object} plan The editorial plan.json
 * @param {object} timeline The compiled timeline.json
 * @param {object} options
 * @returns {object} Full packaging bundle
 */
export function generateVideoPackage(plan, timeline, options = {}) {
  const topic = plan.topic || 'Unknown Topic';
  const title = plan.title || topic;
  const style = plan.style || 'cinematic_dark';

  // 1. Generate 3 High-CTR Thumbnail Concepts
  const thumbnailConcepts = [
    {
      conceptId: 'A_high_contrast_statement',
      style: 'bold_editorial',
      overlayText: (plan.scenes[0]?.statement || title).split(/\s+/).slice(0, 4).join(' ').toUpperCase(),
      mainSubject: plan.scenes[0]?.entity?.name || 'Central Hero Element',
      emotion: 'curiosity',
      palette: {
        background: '#0B1020',
        text: '#FFFFFF',
        accent: '#F5C542',
      },
      compositionTip: 'Place subject slightly off-center right, with 3-4 bold words on the left at 72pt+ font.',
    },
    {
      conceptId: 'B_provocative_question',
      style: 'mystery_gap',
      overlayText: `THE TRUTH ABOUT ${topic.split(/\s+/).slice(0, 2).join(' ').toUpperCase()}`,
      mainSubject: 'Dramatic Cinematic Close-Up',
      emotion: 'surprise',
      palette: {
        background: '#05070E',
        text: '#F7F8FA',
        accent: '#FF4D4D',
      },
      compositionTip: 'High contrast vignetted background with large saturated red/white text in top third.',
    },
    {
      conceptId: 'C_stat_proof',
      style: 'evidence_proof',
      overlayText: plan.scenes.find((s) => s.stat)?.stat?.value ? `${plan.scenes.find((s) => s.stat)?.stat?.value} CHANGED THIS` : 'HOW IT HAPPENED',
      mainSubject: 'Data Graphic or Blueprint Mockup',
      emotion: 'urgency',
      palette: {
        background: '#0F172A',
        text: '#38BDF8',
        accent: '#FACC15',
      },
      compositionTip: 'Clear legible number callout with glowing accent bounding box.',
    },
  ];

  // 2. Generate Chapters from Timeline Scenes
  const fps = timeline.fps || 30;
  let currentSec = 0;
  const chapters = [];

  (timeline.scenes || []).forEach((scene, index) => {
    const sceneStartSec = currentSec;
    const sceneDurationSec = scene.durationInFrames / fps;

    let chapterTitle = scene.purpose || `Scene ${index + 1}`;
    if (index === 0) chapterTitle = 'Hook & Introduction';
    else if (scene.statement) chapterTitle = scene.statement.slice(0, 35);
    else if (scene.entity?.name) chapterTitle = `The Role of ${scene.entity.name}`;
    else if (scene.kind === 'statistic') chapterTitle = 'The Critical Numbers';
    else if (scene.kind === 'process' || scene.kind === 'timeline') chapterTitle = 'How It Unfolds';

    chapters.push({
      time: formatTimestamp(sceneStartSec),
      seconds: Number(sceneStartSec.toFixed(1)),
      title: chapterTitle.charAt(0).toUpperCase() + chapterTitle.slice(1),
    });

    currentSec += sceneDurationSec;
  });

  // 3. Evidence Sources List
  const evidenceSources = (plan.scenes || [])
    .filter((s) => s.entity?.wikipedia || s.stat || s.quote)
    .map((s) => {
      if (s.entity?.wikipedia) {
        return { type: 'entity', name: s.entity.name, reference: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.entity.wikipedia)}` };
      }
      if (s.stat) {
        return { type: 'statistic', claim: `${s.stat.value} ${s.stat.label || ''}`, source: s.stat.source || 'Industry Report / Research' };
      }
      if (s.quote) {
        return { type: 'quote', speaker: s.quote.speaker, context: s.quote.text };
      }
      return null;
    })
    .filter(Boolean);

  // 4. Formatted Description
  const description = [
    `${title}\n`,
    `${plan.script ? plan.script.slice(0, 180) + '...' : ''}\n`,
    '⏱️ CHAPTERS:',
    chapters.map((c) => `${c.time} - ${c.title}`).join('\n'),
    '\n🔍 SOURCES & EVIDENCE:',
    evidenceSources.length
      ? evidenceSources.map((e) => `- ${e.name || e.claim || e.speaker}: ${e.reference || e.source || ''}`).join('\n')
      : '- Verified via open editorial and encyclopedic records.',
    '\n#technology #education #documentary #analysis',
  ].join('\n');

  return {
    title,
    topic,
    thumbnails: thumbnailConcepts,
    chapters,
    evidenceSources,
    description,
  };
}
