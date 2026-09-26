/**
 * Script ↔ transcript alignment.
 *
 * Whisper never tokenises the way the script does ("bailout" → "bail out",
 * "sixty trillion dollars" → "$60 trillion"), so timestamps must be mapped by
 * sequence alignment, not by array index. Both sides are normalised to
 * lowercase word tokens (numbers spelled out), aligned with a banded
 * Needleman–Wunsch using fuzzy/prefix matching, and every SCRIPT word then
 * receives the time span of the transcript tokens aligned to it. Script words
 * with no match are interpolated between their matched neighbours.
 *
 * The script is the source of truth for on-screen text; the transcript only
 * contributes timing.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [100, 'hundred']];

function intToWords(n) {
  if (n < 20) return [ONES[n]];
  if (n < 100) return n % 10 ? [TENS[Math.floor(n / 10)], ONES[n % 10]] : [TENS[n / 10]];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      const rest = n % value;
      return [...intToWords(Math.floor(n / value)), name, ...(rest ? intToWords(rest) : [])];
    }
  }
  return [String(n)];
}

function numberToWords(raw) {
  const hadComma = raw.includes(',');
  const clean = raw.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) return [raw];
  const [int, frac] = clean.split('.');
  const n = parseInt(int, 10);
  if (!Number.isFinite(n) || n > 999e12) return [raw];
  // Four-digit years are spoken as "twenty twenty-four" / "nineteen eighty"; 2000–2009 as "two thousand eight".
  let words;
  if (!frac && !hadComma && int.length === 4 && n >= 1100 && n < 2100 && !(n >= 2000 && n < 2010)) {
    const hi = Math.floor(n / 100), lo = n % 100;
    words = [...intToWords(hi), ...(lo === 0 ? ['hundred'] : lo < 10 ? ['oh', ONES[lo]] : intToWords(lo))];
  } else {
    words = intToWords(n);
  }
  if (frac) words.push('point', ...frac.split('').map((d) => ONES[+d]));
  return words;
}

const SUFFIX_WORDS = { '%': ['percent'], k: ['thousand'], m: ['million'], b: ['billion'], bn: ['billion'], t: ['trillion'], x: ['times'] };

/** Normalise one raw token into zero or more comparable lowercase word tokens. */
export function normalizeToken(raw) {
  let s = String(raw || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (!s) return [];
  const out = [];
  for (let part of s.split(/[-–—/]+/)) {
    part = part.replace(/^[^\p{L}\p{N}$£€]+|[^\p{L}\p{N}%]+$/gu, '');
    if (!part) continue;
    const currency = /^[$£€]/.test(part) ? { $: 'dollars', '£': 'pounds', '€': 'euros' }[part[0]] : null;
    if (currency) part = part.slice(1);
    const m = /^(\d[\d,]*(?:\.\d+)?)(%|k|m|bn|b|t|x|s|st|nd|rd|th)?$/.exec(part);
    if (m) {
      out.push(...numberToWords(m[1]));
      if (m[2] && SUFFIX_WORDS[m[2]]) out.push(...SUFFIX_WORDS[m[2]]);
    } else {
      const letters = part.replace(/'/g, '').replace(/[^\p{L}\p{N}]/gu, '');
      if (letters) out.push(letters);
    }
    if (currency) out.push(currency);
  }
  return out;
}

/** Split display text into words, keeping punctuation for captions and sentence/phrase boundaries. */
export function tokenizeScript(text) {
  const words = [];
  let sentence = 0;
  for (const raw of String(text || '').split(/\s+/).filter(Boolean)) {
    const trailing = (/[.,!?;:…—–]+["'”’)]*$/.exec(raw) || [''])[0];
    const endsSentence = /[.!?…]/.test(trailing);
    const endsPhrase = endsSentence || /[,;:—–]/.test(trailing);
    words.push({ index: words.length, text: raw, norm: normalizeToken(raw), sentence, endsSentence, endsPhrase });
    if (endsSentence) sentence += 1;
  }
  return words;
}

function similarity(a, b) {
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.8;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > Math.max(la, lb) * 0.6) return 0;
  const prev = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= lb; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[lb] / Math.max(la, lb);
}

/**
 * Banded Needleman–Wunsch over token arrays. Returns pairs[i] = index in B aligned to A[i] (or -1).
 * Only diagonal moves with similarity ≥ 0.5 count as alignments.
 */
function alignTokens(A, B) {
  const n = A.length, m = B.length;
  const pairs = new Int32Array(n).fill(-1);
  if (!n || !m) return pairs;
  const band = Math.max(40, Math.ceil(Math.abs(n - m) * 1.2) + 40);
  const W = 2 * band + 1;
  const NEG = -1e9;
  const score = new Float64Array((n + 1) * W).fill(NEG);
  const trace = new Uint8Array((n + 1) * W); // 1 diag, 2 up (skip A), 3 left (skip B)
  const center = (i) => Math.round((i * m) / n);
  const idx = (i, j) => { const k = j - center(i) + band; return k < 0 || k >= W ? -1 : i * W + k; };
  const GAP = -0.6;

  const k00 = idx(0, 0);
  if (k00 >= 0) score[k00] = 0;
  for (let j = 1; j <= m; j++) { const k = idx(0, j); if (k >= 0) { score[k] = j * GAP; trace[k] = 3; } }

  for (let i = 1; i <= n; i++) {
    const c = center(i);
    for (let j = Math.max(0, c - band); j <= Math.min(m, c + band); j++) {
      const k = idx(i, j);
      let best = NEG, t = 0;
      const up = idx(i - 1, j);
      if (up >= 0 && score[up] > NEG && score[up] + GAP > best) { best = score[up] + GAP; t = 2; }
      if (j > 0) {
        const left = idx(i, j - 1);
        if (left >= 0 && score[left] > NEG && score[left] + GAP > best) { best = score[left] + GAP; t = 3; }
        const diag = idx(i - 1, j - 1);
        if (diag >= 0 && score[diag] > NEG) {
          const sim = similarity(A[i - 1], B[j - 1]);
          const s = score[diag] + (sim >= 0.5 ? 2 * sim : -1);
          if (s > best) { best = s; t = 1; }
        }
      }
      score[k] = best;
      trace[k] = t;
    }
  }

  let i = n, j = m;
  while (i > 0 || j > 0) {
    const k = idx(i, j);
    const t = k >= 0 ? trace[k] : (i > 0 ? 2 : 3);
    if (t === 1) {
      if (similarity(A[i - 1], B[j - 1]) >= 0.5) pairs[i - 1] = j - 1;
      i--; j--;
    } else if (t === 2 || j === 0) i--;
    else j--;
  }
  return pairs;
}

/**
 * @param {ReturnType<typeof tokenizeScript>} scriptWords
 * @param {{text: string, start: number, end: number}[]} transcript - transcript words with seconds
 * @param {number} duration - audio duration in seconds
 * @returns script words with {start, end, matched}
 */
export function alignScriptToTranscript(scriptWords, transcript, duration) {
  // Flatten both sides to normalised tokens that remember their owner.
  const A = [], aOwner = [];
  scriptWords.forEach((w, wi) => w.norm.forEach((t) => { A.push(t); aOwner.push(wi); }));
  const B = [], bTime = [];
  for (const t of transcript) {
    const norm = normalizeToken(t.text);
    const span = Math.max(0.01, t.end - t.start);
    norm.forEach((tok, k) => {
      B.push(tok);
      bTime.push({ start: t.start + (span * k) / norm.length, end: t.start + (span * (k + 1)) / norm.length });
    });
  }

  const pairs = alignTokens(A, B);
  const timed = scriptWords.map((w) => ({ ...w, start: null, end: null, matched: false }));

  const bOwner = new Int32Array(B.length).fill(-1);
  for (let a = 0; a < A.length; a++) {
    const b = pairs[a];
    if (b < 0) continue;
    const w = timed[aOwner[a]];
    bOwner[b] = aOwner[a];
    w.start = w.start === null ? bTime[b].start : Math.min(w.start, bTime[b].start);
    w.end = w.end === null ? bTime[b].end : Math.max(w.end, bTime[b].end);
    w.matched = true;
  }
  // Transcript tokens that matched nothing ("out" in "bail out") extend the preceding matched word.
  let lastOwner = -1;
  for (let b = 0; b < B.length; b++) {
    if (bOwner[b] >= 0) lastOwner = bOwner[b];
    else if (lastOwner >= 0) {
      const w = timed[lastOwner];
      const next = timed.slice(lastOwner + 1).find((x) => x.matched);
      if (!next || bTime[b].end <= next.start) w.end = Math.max(w.end, bTime[b].end);
    }
  }

  // Interpolate unmatched runs by character weight between matched neighbours.
  let i = 0;
  while (i < timed.length) {
    if (timed[i].matched) { i++; continue; }
    let j = i;
    while (j < timed.length && !timed[j].matched) j++;
    const from = i > 0 ? timed[i - 1].end : 0;
    const to = j < timed.length ? timed[j].start : duration;
    const weights = timed.slice(i, j).map((w) => Math.max(2, w.text.length));
    const total = weights.reduce((s, x) => s + x, 0);
    let cursor = from;
    for (let k = i; k < j; k++) {
      const len = ((to - from) * weights[k - i]) / total;
      timed[k].start = cursor;
      timed[k].end = cursor + len;
      cursor += len;
    }
    i = j;
  }

  // Monotonic, non-overlapping, inside the audio.
  for (let k = 0; k < timed.length; k++) {
    const w = timed[k];
    w.start = Math.max(0, Math.min(duration, w.start));
    if (k > 0 && w.start < timed[k - 1].end) w.start = timed[k - 1].end;
    w.end = Math.max(w.start + 0.04, Math.min(duration, w.end));
  }
  return timed;
}

/** Estimate timing with no transcript at all (last resort): character-weighted, pauses at punctuation. */
export function estimateTiming(scriptWords, duration) {
  const weights = scriptWords.map((w) => Math.max(2, w.text.replace(/[^\p{L}\p{N}]/gu, '').length) + (w.endsSentence ? 6 : w.endsPhrase ? 3 : 1));
  const total = weights.reduce((s, x) => s + x, 0) || 1;
  let cursor = 0;
  return scriptWords.map((w, i) => {
    const len = (duration * weights[i]) / total;
    const out = { ...w, start: cursor, end: cursor + len * 0.8, matched: false };
    cursor += len;
    return out;
  });
}

const WEAK_ENDINGS = new Set(['a', 'an', 'the', 'of', 'to', 'and', 'in', 'on', 'for', 'with', 'at', 'by', 'or', 'but', 'that', 'is', 'as']);

/**
 * Group timed words into caption chunks on phrase boundaries.
 * @param {{maxWords: number, maxChars: number}} limits
 */
export function buildCaptionChunks(words, fps, { maxWords = 4, maxChars = 28 } = {}) {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const chars = cur.map((x) => x.text).join(' ').length;
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 0;
    const full = cur.length >= maxWords || chars >= maxChars;
    if (w.endsPhrase || gap > 0.35 || !next) flush();
    else if (full) {
      // Don't strand a function word at the end of a line — carry it to the next chunk.
      if (cur.length > 1 && WEAK_ENDINGS.has(w.norm[0])) { cur.pop(); flush(); cur.push(w); }
      else flush();
    }
  }
  flush();
  return chunks.map((c, i) => {
    const next = chunks[i + 1];
    const startFrame = Math.round(c[0].start * fps);
    const naturalEnd = Math.round((c[c.length - 1].end + 0.45) * fps);
    const endFrame = next ? Math.min(naturalEnd, Math.round(next[0].start * fps)) : naturalEnd;
    return {
      id: i,
      startFrame,
      endFrame: Math.max(startFrame + 6, endFrame),
      words: c.map((w) => ({ index: w.index, text: w.text, startFrame: Math.round(w.start * fps), endFrame: Math.round(w.end * fps) })),
    };
  });
}
