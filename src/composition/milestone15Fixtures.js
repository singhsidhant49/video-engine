const wordsFor = (text, durationInFrames = 180, fps = 30) => {
  const tokens = String(text).split(/\s+/).filter(Boolean);
  const step = Math.max(3, Math.floor((durationInFrames - 24) / Math.max(1, tokens.length)));
  return tokens.map((text, index) => ({
    text,
    norm: [text.toLowerCase().replace(/[^a-z0-9]/g, '')].filter(Boolean),
    startFrame: 8 + index * step,
    endFrame: Math.min(durationInFrames - 12, 8 + index * step + Math.max(2, step - 1)),
    start: (8 + index * step) / fps,
    end: Math.min(durationInFrames - 12, 8 + index * step + Math.max(2, step - 1)) / fps,
    endsPhrase: /[,;:]$/.test(text),
    endsSentence: /[.!?]$/.test(text),
  }));
};

const comparison = (id, title, left, right, keyDifference, extra = {}) => {
  const narration = `${left.title} ${left.detail}. But ${right.title} ${right.detail}. ${keyDifference}.`;
  return { id, title, durationInFrames: 180, narration, alignedWords: wordsFor(narration), overlay: { left, right, keyDifference, ...extra } };
};

export const COMPARISON_FIXTURES = [
  comparison('reward', 'IMMEDIATE VS DELAYED REWARD',
    { title: 'IMMEDIATE REWARD', detail: 'Feels valuable now', metricLabel: 'Timing', metricValue: 'NOW' },
    { title: 'DELAYED REWARD', detail: 'Builds greater long-term value', metricLabel: 'Timing', metricValue: 'LATER' },
    'Waiting can increase the eventual value', { comparisonType: 'tradeoff' }),
  comparison('software-agent', 'SOFTWARE VS AI AGENT',
    { title: 'TRADITIONAL SOFTWARE', detail: 'Follows predefined instructions' },
    { title: 'AI AGENT', detail: 'Plans, acts, and adapts toward a goal' },
    'Agents choose actions from changing context'),
  comparison('fees', 'HIGH FEE VS LOW FEE',
    { title: 'HIGH FEE', detail: 'More return lost to cost', metricLabel: 'Annual fee', metricValue: '1.5%' },
    { title: 'LOW FEE', detail: 'More return stays invested', metricLabel: 'Annual fee', metricValue: '0.2%' },
    'Small annual fees compound into a large gap', { comparisonType: 'quantitative' }),
  comparison('strategy', 'OLD VS NEW STRATEGY',
    { title: 'OLD STRATEGY', detail: 'Optimize a stable product for a known market' },
    { title: 'NEW STRATEGY', detail: 'Run fast experiments and follow verified demand' },
    'Learning speed becomes the competitive advantage', { comparisonType: 'before_after' }),
];

const chart = (id, title, question, takeaway, chartType, series, extra = {}) => {
  const narration = `${question}. ${takeaway}.`;
  return { id, title, durationInFrames: 180, narration, alignedWords: wordsFor(narration), overlay: { title, question, takeaway, chartType, series, illustrative: true, ...extra } };
};

export const CHART_FIXTURES = [
  chart('reward-delay', 'REWARD VALUE OVER DELAY', 'How does perceived reward change as delay grows?', 'Perceived value falls sharply with delay', 'LINE', [
    { id: 'value', label: 'Perceived value', data: [{ x: 0, y: 100 }, { x: 1, y: 68 }, { x: 2, y: 48 }, { x: 4, y: 27 }, { x: 8, y: 14 }] },
  ], { units: '%', highlightIndex: 3, annotations: [{ id: 'drop', seriesId: 'value', pointIndex: 3, text: 'Most value is already discounted' }] }),
  chart('revenue-segments', 'REVENUE BY SEGMENT', 'Which business segment contributes most?', 'Enterprise is the largest revenue segment', 'BAR', [
    { id: 'revenue', label: 'Revenue', data: [{ x: 'Consumer', y: 24 }, { x: 'SMB', y: 37 }, { x: 'Enterprise', y: 61 }, { x: 'Partner', y: 18 }] },
  ], { units: '$M', highlightIndex: 2 }),
  chart('fees-over-time', 'FEES COMPOUND OVER TIME', 'How do cumulative fees change over time?', 'The fee gap widens as years compound', 'LINE', [
    { id: 'high_fee', label: 'High fee', data: [{ x: 1, y: 1.5 }, { x: 5, y: 7.7 }, { x: 10, y: 16.1 }, { x: 20, y: 34.7 }] },
    { id: 'low_fee', label: 'Low fee', data: [{ x: 1, y: 0.2 }, { x: 5, y: 1.0 }, { x: 10, y: 2.0 }, { x: 20, y: 4.1 }] },
  ], { units: '%', highlightIndex: 3 }),
  chart('performance', 'TASK PERFORMANCE', 'How does task performance compare?', 'The agent performs best on multi-step work', 'DOT', [
    { id: 'score', label: 'Task score', data: [{ x: 'Lookup', y: 72 }, { x: 'Reasoning', y: 81 }, { x: 'Multi-step', y: 93 }, { x: 'Review', y: 86 }] },
  ], { units: '%', highlightIndex: 2 }),
];

export function editorialPlanForM15Fixture(fixture, representation) {
  return {
    shotId: `shot_${fixture.id}`,
    selectedRepresentation: representation,
    communicationObjective: fixture.overlay.question || `Compare the meaningful difference in ${fixture.title.toLowerCase()}`,
    hierarchy: { primary: [fixture.overlay.takeaway || fixture.overlay.left?.title, fixture.overlay.right?.title].filter(Boolean), secondary: [], supporting: [] },
    density: 'MEDIUM', cognitiveLoad: 3, visualGrammar: representation,
    assetBindings: [], textBlocks: { title: fixture.title, takeaway: fixture.overlay.takeaway || fixture.overlay.keyDifference || null },
    semanticEvents: [], formatHints: {}, continuityIntent: {},
  };
}
