import { scoreTitle } from './youtubeGrowthService.js';
import { conciseThumbnailText } from './creativeQuality.js';

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

const HASHTAG_STOP_WORDS = new Set([
  'about', 'after', 'before', 'complete', 'explained', 'guide', 'happened', 'into', 'most',
  'that', 'this', 'truth', 'video', 'what', 'when', 'where', 'which', 'with', 'your',
]);

export function buildVideoHashtags({ title = '', topic = '', niche = '', primaryKeyword = '' } = {}) {
  const phrases = [primaryKeyword, niche, topic, title];
  const tags = [];
  for (const phrase of phrases) {
    const words = String(phrase).toLowerCase().match(/[a-z0-9]+/g)
      ?.filter((word) => word.length > 2 && !HASHTAG_STOP_WORDS.has(word)) || [];
    if (!words.length) continue;
    const candidate = `#${words.slice(0, 3).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`;
    if (candidate.length <= 40 && !tags.some((tag) => tag.toLowerCase() === candidate.toLowerCase())) tags.push(candidate);
    if (tags.length >= 4) break;
  }
  return tags.length ? tags : ['#EducationalVideo'];
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
  const metadata = options.metadata || {};
  const titleCandidates = [...new Set([
    plan.title,
    ...(plan.titleOptions || []),
    ...(metadata.titleOptions || []),
  ].map((item) => String(item || '').replace(/\s+/g, ' ').trim()).filter(Boolean))]
    .map((value) => ({ value, score: scoreTitle(value) - (/\bthe truth about\b/i.test(value) ? 20 : 0) - (/!{2,}|\?{2,}/.test(value) ? 8 : 0) }))
    .sort((left, right) => right.score - left.score);
  const title = titleCandidates[0]?.value || plan.title || topic;
  const style = plan.style || 'cinematic_dark';
  const hashtags = buildVideoHashtags({ title, topic, niche: plan.niche || '', primaryKeyword: metadata.primaryKeyword || '' });

  const hook = plan.scenes?.[0] || {};
  const payoff = [...(plan.scenes || [])].reverse().find((scene) => ['payoff', 'reveal', 'conclusion'].includes(scene.purpose)) || plan.scenes?.at(-1) || {};
  const statistic = plan.scenes?.find((scene) => scene.kind === 'statistic' && scene.data?.value);
  const heroSubject = hook.entity?.name || hook.focus || hook.visual || metadata.thumbnailConcept || topic;
  const hookText = conciseThumbnailText(hook.text?.headline || hook.emphasis || title) || conciseThumbnailText(topic) || 'WATCH THIS';
  const tensionText = conciseThumbnailText(hook.narration || title) || conciseThumbnailText(topic) || 'WATCH THIS';
  const payoffText = statistic
    ? conciseThumbnailText(`${statistic.data.value}${statistic.data.suffix || ''} ${statistic.data.label || ''}`, { maxWords: 3 })
    : conciseThumbnailText(payoff.text?.headline || payoff.emphasis || payoff.narration || title, { maxWords: 3 });
  const resolvedPayoffText = payoffText || conciseThumbnailText(topic, { maxWords: 3 }) || 'WHY IT MATTERS';

  // 1. Generate 3 High-CTR Thumbnail Concepts
  const thumbnailConcepts = [
    {
      conceptId: 'A_high_contrast_statement',
      style: 'bold_editorial',
      overlayText: hookText,
      mainSubject: heroSubject,
      emotion: 'curiosity',
      layout: 'text_left_subject_right',
      palette: {
        background: '#0B1020',
        text: '#FFFFFF',
        accent: '#F5C542',
      },
      compositionTip: 'Use the strongest real frame full bleed. Keep the focal subject on the right and 2-4 high-contrast words on the left.',
      strategicBrief: metadata.thumbnailConcept || null,
    },
    {
      conceptId: 'B_tension_closeup',
      style: 'tension_closeup',
      overlayText: tensionText,
      mainSubject: heroSubject,
      emotion: 'surprise',
      layout: 'text_right_subject_left',
      palette: {
        background: '#05070E',
        text: '#F7F8FA',
        accent: '#FF4D4D',
      },
      compositionTip: 'Crop tightly around the most expressive subject or story-critical object; place concise text in clean negative space.',
    },
    {
      conceptId: 'C_payoff_proof',
      style: 'payoff_proof',
      overlayText: resolvedPayoffText,
      mainSubject: payoff.entity?.name || payoff.focus || payoff.visual || heroSubject,
      emotion: 'urgency',
      layout: 'text_left_subject_right',
      palette: {
        background: '#0F172A',
        text: '#38BDF8',
        accent: '#FACC15',
      },
      compositionTip: 'Use the clearest evidence or payoff frame with one visual focal point; never add fake charts, interface mockups, or decorative clutter.',
    },
  ];

  // 2. Generate Chapters from Timeline Scenes
  const fps = timeline.fps || 30;
  const chapters = [];

  const timelineScenes = timeline.clips || timeline.scenes || [];
  const planScenes = plan.scenes || [];
  let priorSectionId = null;
  timelineScenes.forEach((scene, index) => {
    const authored = planScenes.find((item) => item.id === scene.sceneId || item.id === scene.id) || planScenes[index] || {};
    const sectionId = scene.sectionId || authored.sectionId || null;
    const startsSection = index === 0
      || authored.section === true
      || authored.startsSection === true
      || authored.kind === 'chapter'
      || (sectionId != null && sectionId !== priorSectionId);
    priorSectionId = sectionId;
    if (!startsSection) return;
    const sceneStartSec = Number.isFinite(scene.from) ? scene.from / fps : 0;
    let chapterTitle = authored.data?.title || authored.text?.headline || authored.title || '';
    if (index === 0) chapterTitle = 'Hook & Introduction';
    else if (!chapterTitle && authored.narration) chapterTitle = authored.narration.split(/[.!?]/)[0].split(/\s+/).slice(0, 7).join(' ');
    if (!chapterTitle) chapterTitle = `Section ${chapters.length + 1}`;

    chapters.push({
      time: formatTimestamp(sceneStartSec),
      seconds: Number(sceneStartSec.toFixed(1)),
      title: chapterTitle.charAt(0).toUpperCase() + chapterTitle.slice(1),
    });
  });

  // 3. Evidence Sources List
  const evidenceSources = (plan.scenes || [])
    .filter((s) => s.source?.url || s.entity?.wikipedia || s.data?.source || (s.kind === 'quote' && s.data?.author))
    .map((s) => {
      if (s.source?.url) {
        return { type: 'reference', name: s.source.label || 'Source', reference: s.source.url };
      }
      if (s.entity?.wikipedia) {
        return { type: 'entity', name: s.entity.name, reference: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.entity.wikipedia)}` };
      }
      if (s.data?.source) {
        return { type: 'evidence', claim: s.narration, source: s.data.source };
      }
      if (s.kind === 'quote' && s.data?.author) {
        return { type: 'quote', speaker: s.data.author, context: s.data.quote };
      }
      return null;
    })
    .filter(Boolean);

  // 4. Formatted Description
  const description = [
    `${metadata.primaryKeyword ? `${metadata.primaryKeyword}: ` : ''}${title}\n`,
    `${plan.script ? plan.script.slice(0, 180) + '...' : ''}\n`,
    '⏱️ CHAPTERS:',
    chapters.map((c) => `${c.time} - ${c.title}`).join('\n'),
    '\n🔍 SOURCES & EVIDENCE:',
    evidenceSources.length
      ? evidenceSources.map((e) => `- ${e.name || e.claim || e.speaker}: ${e.reference || e.source || ''}`).join('\n')
      : '- No externally verified claim sources were recorded for this run.',
    evidenceSources.length ? '\nSources are recorded for editorial review; automated citation presence is not a substitute for human fact-checking.' : '',
    `\n${hashtags.join(' ')}`,
  ].join('\n');

  return {
    title,
    titleOptions: titleCandidates.slice(0, 5).map((item) => item.value),
    titleScores: titleCandidates.slice(0, 5),
    topic,
    thumbnails: thumbnailConcepts,
    chapters,
    evidenceSources,
    description,
    strategy: {
      trafficStrategy: metadata.trafficStrategy || null,
      primaryKeyword: metadata.primaryKeyword || null,
      thumbnailConcept: metadata.thumbnailConcept || null,
      hashtags,
    },
  };
}
