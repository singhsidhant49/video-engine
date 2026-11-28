const STOP_WORDS = new Set(['the', 'a', 'an', 'to', 'and', 'of', 'it', 'then', 'next', 'first', 'finally']);
const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((word) => word && !STOP_WORDS.has(word));

export function phrasesFromAlignedWords(words = [], shotStartFrame = 0) {
  const phrases = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    if (word.endsPhrase || word.endsSentence) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);
  return phrases.map((phrase, index) => ({
    id: `phrase_${String(index + 1).padStart(3, '0')}`,
    text: phrase.map((word) => word.text).join(' '),
    tokens: phrase.flatMap((word) => word.norm || normalize(word.text)),
    startFrame: Math.max(0, phrase[0].startFrame - shotStartFrame),
    endFrame: Math.max(1, phrase.at(-1).endFrame - shotStartFrame),
  }));
}
