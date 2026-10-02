const makeWords = (phrases, fps = 30) => {
  const words = [];
  phrases.forEach((phrase, phraseIndex) => {
    const tokens = phrase.split(/\s+/);
    const start = phraseIndex * 34 + 8;
    tokens.forEach((text, wordIndex) => words.push({
      text,
      norm: [text.toLowerCase().replace(/[^a-z0-9]/g, '')],
      startFrame: start + wordIndex * 5,
      endFrame: start + wordIndex * 5 + 4,
      start: (start + wordIndex * 5) / fps,
      end: (start + wordIndex * 5 + 4) / fps,
      endsPhrase: wordIndex === tokens.length - 1,
      endsSentence: wordIndex === tokens.length - 1,
    }));
  });
  return words;
};

function fixture(id, title, steps, phrases) {
  return {
    id, title, durationInFrames: 160,
    steps: steps.map((step) => typeof step === 'string' ? { title: step } : step),
    alignedWords: makeWords(phrases),
    expectedActivationRanges: phrases.map((_, index) => [index * 34 + 8, index * 34 + 12]),
  };
}

export const PROCESS_FIXTURES = [
  fixture('ai-agent', 'HOW AN AI CODING AGENT WORKS', [
    { title: 'READ', detail: 'Inspect repository context' }, { title: 'PLAN', detail: 'Choose the next action' },
    { title: 'CALL TOOL', detail: 'Execute a bounded operation' }, { title: 'OBSERVE', detail: 'Interpret the result' },
  ], ['reads the repository', 'plans the next action', 'calls a tool', 'observes the result']),
  fixture('dopamine', 'WHY YOUR BRAIN CHOOSES INSTANT GRATIFICATION', ['TRIGGER', 'ANTICIPATION', 'ACTION', 'REWARD'],
    ['a trigger appears', 'anticipation builds', 'action follows', 'reward reinforces it']),
  fixture('transaction', 'TRANSACTION FLOW', ['CUSTOMER', 'PAYMENT', 'PLATFORM', 'SELLER'],
    ['customer checks out', 'payment is authorized', 'platform routes funds', 'seller receives settlement']),
  fixture('science', 'SCIENCE MECHANISM', ['INPUT', 'REACTION', 'OUTPUT'],
    ['input enters', 'reaction transforms it', 'output emerges']),
];

export function editorialPlanForProcessFixture(fixture) {
  return {
    shotId: `shot_${fixture.id}`,
    selectedRepresentation: 'process',
    communicationObjective: `Explain ${fixture.title.toLowerCase()} as an ordered process`,
    hierarchy: { primary: fixture.steps.map((step) => step.title), secondary: fixture.steps.map((step) => step.detail).filter(Boolean), supporting: [] },
    density: 'MEDIUM', cognitiveLoad: 3, visualGrammar: 'directed-flow', assetBindings: [],
    textBlocks: { title: fixture.title, steps: fixture.steps }, semanticEvents: [],
    formatHints: {}, continuityIntent: {},
  };
}
