const WORD_EQUIVALENTS = new Map([
  ['immediate', 'now'], ['delayed', 'later'], ['traditional', 'legacy'], ['artificial', 'ai'],
  ['percentage', '%'], ['approximately', 'about'], ['versus', 'vs'],
]);

function words(value) { return String(value || '').trim().split(/\s+/).filter(Boolean); }

/** Deterministic authored-form fallback. Callers should prefer explicitly supplied variants. */
export function createSemanticTextVariants(full, { short = null, labelOnly = null } = {}) {
  const tokens = words(full);
  const firstClause = String(full || '').split(/[,:;—–]|\s+(?:because|while|that|which)\s+/i)[0].trim();
  const shortValue = short || (words(firstClause).length <= 5 ? firstClause : tokens.slice(0, 5).join(' '));
  const meaningful = tokens.filter((token) => !['the', 'a', 'an', 'of', 'to', 'and', 'vs'].includes(token.toLowerCase()));
  const rawLabel = labelOnly || meaningful.slice(0, 2).map((token) => WORD_EQUIVALENTS.get(token.toLowerCase()) || token).join(' ');
  return { full: String(full).trim(), short: shortValue, labelOnly: rawLabel.toUpperCase() };
}

export const semanticReductionOrder = Object.freeze(['FULL', 'SHORT', 'LABEL_ONLY']);

