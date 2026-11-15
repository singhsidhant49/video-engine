/**
 * TTS Text Normalization
 * 
 * Prepares written script text for Kokoro TTS synthesis:
 * - Converts decimal numbers ("7.5" -> "7 point 5") so Kokoro doesn't treat the dot as a sentence terminator.
 * - Normalizes currencies ("$7.5M" -> "7 point 5 million dollars", "$50" -> "50 dollars", "$19.99" -> "19 dollars and 99 cents").
 * - Normalizes percentages ("7.5%" -> "7 point 5 percent").
 * - Normalizes multipliers ("2.5x" -> "2 point 5 times").
 * - Normalizes number ranges ("5-10" -> "5 to 10").
 * - Expands common abbreviations containing periods ("U.S." -> "US", "Dr." -> "Doctor", "vs." -> "versus")
 *   so sentence chunking won't fragment phrases prematurely.
 * - Strips grouping commas from large numbers ("10,000" -> "10000").
 */

const ABBREVIATIONS = [
  [/\bU\.S\.A\.(?!\w)/gi, 'USA'],
  [/\bU\.S\.(?!\w)/gi, 'US'],
  [/\bU\.K\.(?!\w)/gi, 'UK'],
  [/\bDr\.(?!\w)\s*/gi, 'Doctor '],
  [/\bMr\.(?!\w)\s*/gi, 'Mister '],
  [/\bMrs\.(?!\w)\s*/gi, 'Missus '],
  [/\bMs\.(?!\w)\s*/gi, 'Ms '],
  [/\bProf\.(?!\w)\s*/gi, 'Professor '],
  [/\bvs\.(?!\w)\s*/gi, 'versus '],
  [/\bvs\b/gi, 'versus'],
  [/\be\.g\.,?(?!\w)\s*/gi, 'for example, '],
  [/\bi\.e\.,?(?!\w)\s*/gi, 'that is, '],
  [/\betc\.(?!\w)/gi, 'etcetera'],
  [/\bapprox\.(?!\w)\s*/gi, 'approximately '],
  [/\bdept\.(?!\w)\s*/gi, 'department '],
  [/\bavg\.(?!\w)\s*/gi, 'average '],
  [/\best\.(?!\w)\s*/gi, 'estimated '],
  [/\bNo\.(?!\w)\s*(\d+)/gi, 'number $1'],
  [/\bvol\.(?!\w)\s*(\d+)/gi, 'volume $1'],
  [/\bgen\.(?!\w)\s*(\d+)/gi, 'generation $1'],
];

const CURRENCY_SCALES = {
  t: 'trillion',
  trillion: 'trillion',
  b: 'billion',
  bn: 'billion',
  billion: 'billion',
  m: 'million',
  million: 'million',
  k: 'thousand',
  thousand: 'thousand',
};

/**
 * Normalizes script text into a pronunciation-friendly string for TTS synthesis.
 * 
 * @param {string} text Raw script text
 * @returns {string} Normalized text ready for Kokoro TTS
 */
export function normalizeTextForTts(text) {
  let s = String(text || '').trim();
  if (!s) return '';

  // 1. Expand common period-bearing abbreviations first so subsequent logic doesn't mistake them for sentences
  for (const [regex, replacement] of ABBREVIATIONS) {
    s = s.replace(regex, replacement);
  }

  // 2. Remove commas inside numbers: e.g. "10,000" -> "10000", "1,500,000" -> "1500000"
  s = s.replace(/(?<=\b\d+),(?=\d+\b)/g, '');

  // 3. Normalise currencies with scale words or letters:
  // e.g. "$7.5 million" -> "7 point 5 million dollars"
  // e.g. "$7.5M" / "$7.5b" -> "7 point 5 million dollars" / "7 point 5 billion dollars"
  // e.g. "$100" -> "100 dollars"
  // e.g. "$19.99" -> "19 dollars and 99 cents"
  s = s.replace(/\$(\d+)\.(\d{2})\b(?!\s*(?:million|billion|trillion|thousand|[kmbt]\b))/gi, '$1 dollars and $2 cents');
  s = s.replace(/\$(\d+(?:\.\d+)?)\s*(trillion|billion|bn|million|thousand|[tbmk])\b/gi, (match, num, unit) => {
    const scale = CURRENCY_SCALES[unit.toLowerCase()] || unit;
    return `${num} ${scale} dollars`;
  });
  s = s.replace(/\$(\d+(?:\.\d+)?)\b/g, '$1 dollars');

  // Also support British pounds and Euros
  s = s.replace(/£(\d+(?:\.\d+)?)\s*(trillion|billion|bn|million|thousand|[tbmk])\b/gi, (match, num, unit) => {
    const scale = CURRENCY_SCALES[unit.toLowerCase()] || unit;
    return `${num} ${scale} pounds`;
  });
  s = s.replace(/£(\d+(?:\.\d+)?)\b/g, '$1 pounds');
  s = s.replace(/€(\d+(?:\.\d+)?)\s*(trillion|billion|bn|million|thousand|[tbmk])\b/gi, (match, num, unit) => {
    const scale = CURRENCY_SCALES[unit.toLowerCase()] || unit;
    return `${num} ${scale} euros`;
  });
  s = s.replace(/€(\d+(?:\.\d+)?)\b/g, '$1 euros');

  // 4. Normalise decimals: "7.5" -> "7 point 5", "0.05" -> "0 point 05", "2.5x" -> "2 point 5x"
  // Guard against IP addresses or version numbers (e.g. 1.2.3) by checking boundary
  s = s.replace(/(?<!\d\.)\b(\d+)\.(\d+)(?!\.\d)/g, '$1 point $2');

  // 5. Normalise percentages: "7.5%" or "7 point 5%" or "15%" -> "... percent"
  s = s.replace(/(\b\d+(?:\s*point\s*\d+)?)\s*%/g, '$1 percent');

  // 6. Normalise multipliers: "2.5x" / "10X" -> "2 point 5 times" / "10 times"
  s = s.replace(/(\b\d+(?:\s*point\s*\d+)?)\s*[xX]\b/g, '$1 times');

  // 7. Normalise number ranges: "5-10" / "10 - 20" -> "5 to 10" / "10 to 20"
  s = s.replace(/(\b\d+(?:\s*point\s*\d+)?)\s*[-–—]\s*(\d+(?:\s*point\s*\d+)?)\b/g, '$1 to $2');

  // 8. Normalise negative numbers: "-5 degrees" / "-2.5%" -> "minus 5 degrees" / "minus 2 point 5 percent"
  s = s.replace(/(?<=\s|^)-(\d+(?:\s*point\s*\d+)?)\b/g, 'minus $1');

  // 9. Clean up multiple spaces
  s = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return s;
}
