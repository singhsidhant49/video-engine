import { config } from '../config/index.js';
import { STYLES, STYLE_IDS, DEFAULT_STYLE, hexToHue } from '../shared/styles.js';
import { normalizeToken, tokenizeScript } from './alignmentService.js';
import { calculateDurationBudget } from '../storyboard/durationBudget.js';

/**
 * Editorial Director.
 *
 * The LLM decides WHAT the viewer should see and WHY (per-sentence intent,
 * typed data, short on-screen text, emphasis). It never decides pixels,
 * colours, fonts, frames, transitions or sound — the resolver
 * (src/pipeline/timeline.js) derives those from the chosen directing style.
 *
 * Output is validated here; anything the renderer could not show faithfully
 * is downgraded to an image shot instead of being filled with placeholder
 * content.
 */

export const KINDS = ['atmosphere', 'subject', 'statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'quote', 'document', 'chapter', 'statement', 'ui', 'code'];
export const TONES = ['tense', 'urgent', 'somber', 'reflective', 'curious', 'neutral', 'hopeful', 'triumphant', 'playful'];
export const SHOT_SCALES = ['wide', 'medium', 'close', 'detail'];
export const CAMERA_BEHAVIOURS = ['still', 'slow', 'push', 'drift', 'reveal', 'track'];
export const TREATMENTS = ['cinematic', 'graphic', 'typographic', 'quiet'];
const PURPOSES = ['hook', 'context', 'explain', 'evidence', 'escalate', 'reveal', 'contrast', 'list', 'process', 'quote', 'payoff', 'chapter'];

const STYLE_MENU = STYLE_IDS.map((id) => `  - "${id}": ${STYLES[id].label}`).join('\n');

const SYSTEM_PROMPT = `You are the executive writer and editorial director of a premium faceless documentary channel.
You write the narration script and direct visual presentations in coherent CONTENT BEATS.

A CONTENT BEAT is ONE complete idea the viewer must understand (1–3 cohesive sentences).
DO NOT split every individual sentence into a separate scene. For a 60–90 second explainer, aim for 8 to 11 meaningful scenes total.

RETENTION-AWARE SCRIPT ARCHITECTURE:
1. HOOK: Specific tension, stakes, or counterintuitive fact. Never use generic openers like "Have you ever wondered...".
2. WHY IT MATTERS: Immediate relevance or real stakes for the viewer.
3. OPEN QUESTION: An unresolved curiosity gap or core paradox.
4. EXPLANATION: Foundational concept or thesis introduction.
5. EXAMPLE / CONTRAST: Real-world scenario or clear binary contrast.
6. DEEPER MECHANISM: How it actually works (science, logistics, economics).
7. PAYOFF: Direct resolution of the open question/tension introduced in the hook.
8. MEMORABLE CONCLUSION: Clear, lingering insight.

OUTPUT: one JSON object:
{
  "title": string,
  "style": one of the directing styles below,
  "brandColor": "#RRGGBB" | null,   // ONE seed colour only if the topic has an iconic brand colour (Bitcoin orange, Netflix red); otherwise null
  "scenes": [Scene, ...]
}

DIRECTING STYLES (pick the one that fits the topic; the whole video uses it):
${STYLE_MENU}

Scene = {
  "narration": string,       // exactly what is spoken: 1 to 3 cohesive sentences explaining this beat.
  "purpose": "hook" | "context" | "explain" | "evidence" | "escalate" | "reveal" | "contrast" | "list" | "process" | "quote" | "payoff" | "chapter",
  "contentBeat": "hook" | "why_it_matters" | "open_question" | "explanation" | "contrast" | "mechanism" | "payoff" | "conclusion",
  "kind": one of the visual kinds below,
  "visual": string,          // one concrete sentence: what fills the frame and where attention goes
  "imageQueries": [string],  // 1–3 stock/archive photo searches for what is literally shown. Concrete nouns, no adjectives like "cinematic" or "8k".
  "entity": { "name": string, "wikipedia": string } | null,  // a real person/org/place/event on screen; "wikipedia" = exact English Wikipedia article title
  "text": { "kicker": string?, "headline": string? } | null,  // on-screen text, see rules
  "emphasis": string | null, // the exact word or short phrase from THIS narration that the visual should land on
  "data": object | null,     // required for data kinds, schema below
  "intensity": 1-5,          // energy: 1 = calm, 5 = shock/climax
  "complexity": 1-5,         // conceptual/visual complexity: 1 = simple photo, 5 = dense multi-step diagram
  "emotionalWeight": 1-5,    // emotional resonance: 1 = neutral/informational, 5 = heavy/cathartic
  "requiredComprehensionTime": number, // minimum seconds (2.0 to 6.5s) needed for viewer to absorb this beat
  "visualChangeTolerance": "low" | "moderate" | "high", // low = hold visual steady; high = allows cuts
  "pauseAfterSec": number,   // 0 to 0.4s pause after a rhetorical question, number, or reveal
  "section": boolean,        // true if this scene starts a new section/chapter of the story
  "tone": ${TONES.map((t) => `"${t}"`).join(' | ')},
  "importance": 1-5,         // how much this moment matters to the story; 5 = core thesis
  "shot": "wide" | "medium" | "close" | "detail",   // scale of what fills the frame (wide = establishing, detail = texture/object)
  "focus": string | null,    // the single thing the eye should land on
  "camera": "still" | "slow" | "push" | "drift" | "reveal" | "track",
  "continuity": "continue" | "new" | "contrast",
  "template": "bubblePop" | "popScale" | "floatingChip" | "pulsing" | "typewriter" | "highlight" | "chars" | "bounce" | "editorial" | "cards" | "ledger" | "versus" | null,
  "treatment": "cinematic" | "graphic" | "typographic" | "quiet"
}

VISUAL KINDS and their "data":
- "atmosphere": full-frame photo that sets place/mood. data: null
- "subject": full-frame photo of the specific thing being discussed. data: null
- "statistic": one number the narration states. data: { "value": "60", "prefix": "$", "suffix": " trillion", "label": "≤5 words", "direction": "up"|"down"|"neutral" }
- "comparison": two things contrasted. data: { "left": {"title": "≤4 words", "detail": "≤8 words"}, "right": {...}, "leftTone": "negative"|"neutral"|"positive", "rightTone": ... }
- "list": data: { "title": "≤5 words" | null, "items": ["≤6 words", ...] }  (2–5 items, in the order they are spoken)
- "process": steps of a mechanism. data: { "steps": [{"title": "≤4 words", "detail": "≤8 words" | null}] } (2–5)
- "timeline": dated events. data: { "events": [{"date": "1998", "label": "≤5 words"}] } (2–6)
- "chart": real numbers. data: { "type": "line"|"bar"|"share"|"rank", "title": "≤6 words", "unit": string|null, "points": [{"label": "2019", "value": 12.5}] }
    line/bar = a series over time (3–12 points); share = parts of a whole in % (2–6 points summing to ~100); rank = items compared by one value, labels may be long (3–8 points). Real values only.
- "quote": a REAL, verifiable quotation that the narration itself quotes. data: { "quote": string, "author": string, "role": string|null }
- "document": a real published headline or document the narration cites. data: { "source": "The New York Times", "headline": string, "date": string|null }
- "chapter": section title card. data: { "number": number|null, "title": "≤5 words" }
- "statement": 1–4 powerful words on screen (kinetic type) for a thesis, hook or turn. data: null, use text.headline
- "ui": a phone notification/message the story describes. data: { "app": string, "title": string, "body": "≤14 words" }
- "code": only for programming topics. data: { "language": string, "code": "≤12 short lines of real code" }

EDITORIAL & PACING RULES:
1. CONTENT BEATS FIRST: Group sentences that explain the same concept into a single scene. Do not cut every 2–3 seconds.
2. VARY HOLD TIMES: Simple atmospheric photos hold 3–5s; complex diagrams/processes hold 4–7s. Give ideas room to breathe.
3. SPECIFIC HOOKS: Start with a concrete contradiction or high-stakes fact. Never open with "Have you ever wondered..." or "In this video...".
4. PAYOFF MANDATE: Every question or mystery opened in the hook must be explicitly answered in the payoff scene.
5. CINEMATIC FOOTAGE FIRST: 75% to 85% of all scenes MUST be "atmosphere" or "subject" with rich, concrete imageQueries for 4K video and photography. A great video is visual cinema, not a PowerPoint slide deck.
6. USE GRAPHICS SPARINGLY: Use "chart", "process", "quote", "statement", or "comparison" ONLY for 1 or 2 high-impact anchor moments in the entire video. Never use graphic/data kinds in consecutive scenes or in more than 20% of total scenes.
7. On-screen text supports, never transcribes. "kicker" = a label such as a place/date/name ("NEW YORK · 2008"). "headline" = ≤6 words, a claim or keyword that is NOT a paraphrase of the whole sentence. Most photo scenes need no text at all.
8. Truth: every number, quote, name and document must come from the narration and be real. Never invent quotes, documents, sources or statistics. If unsure, use a photo scene instead.
9. "emphasis" must be copied verbatim from that scene's narration.
10. Write for the ear: short sentences, concrete nouns, a strong hook in the first sentence, a payoff at the end.
11. Direct the feel, not just the content: vary shot scale (establish wide, then move closer), give the key revelations importance 4–5 and the connective sentences 1–2, and mark 1–2 moments per minute as "quiet".`;

// ─── Style / niche heuristics (used only when the LLM gives no valid style) ─

function guessStyle(niche = '', topic = '') {
  const t = ` ${niche} ${topic} `.toLowerCase();
  const has = (words) => words.some((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (has(['code', 'coding', 'software', 'programming', 'developer', 'api', 'react', 'javascript', 'python', 'ai', 'gpu', 'chip', 'tech'])) return 'tech_editorial';
  if (has(['crime', 'fraud', 'scam', 'mystery', 'secret', 'leaked', 'murder', 'fbi', 'investigation', 'scandal'])) return 'investigative';
  if (has(['history', 'war', 'ancient', 'empire', 'rome', 'egypt', 'medieval', 'revolution', 'century'])) return 'cinematic_documentary';
  if (has(['finance', 'market', 'stock', 'economy', 'inflation', 'data', 'statistics', 'crisis', 'bank', 'debt'])) return 'data_driven';
  if (has(['facts', 'tips', 'learn', 'hacks', 'quiz', 'educational'])) return 'fast_educational';
  if (has(['luxury', 'design', 'architecture', 'art', 'fashion'])) return 'minimal_premium';
  return DEFAULT_STYLE;
}

// ─── LLM plumbing ──────────────────────────────────────────────────────────

function llmConfig() {
  const deepseekKey = (config.deepseek.apiKey || '').trim();
  const openaiKey = (config.openai.apiKey || '').trim();
  if (deepseekKey) return { key: deepseekKey, endpoint: `${config.deepseek.apiUrl}/chat/completions`, model: config.deepseek.model, name: 'DeepSeek' };
  if (openaiKey) return { key: openaiKey, endpoint: 'https://api.openai.com/v1/chat/completions', model: config.openai.model, name: 'OpenAI' };
  return null;
}

async function callJson(llm, messages, { temperature = 0.6, retries = 2, timeoutMs = 45000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(llm.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.key}` },
          body: JSON.stringify({ model: llm.model, messages, temperature, response_format: { type: 'json_object' } }),
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new Error(`${llm.name} API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      const data = await res.json();
      const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        lastErr = parseErr;
        messages = [
          ...messages,
          { role: 'assistant', content: raw },
          { role: 'user', content: `That was not valid JSON (${parseErr.message}). Reply with the corrected JSON object only.` },
        ];
      }
    } catch (netErr) {
      lastErr = netErr;
      if (attempt < retries) {
        const delay = (attempt + 1) * 2000;
        console.warn(`   ⚠️ ${llm.name} connection attempt ${attempt + 1} failed (${netErr.code || netErr.message}). Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error(`${llm.name} failed: ${lastErr?.message}`);
}

/** Deterministic compression fallback */
export function deterministicCompress(plan, targetWords) {
  let currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords <= targetWords) return plan;

  const compressible = [...(plan.scenes || [])]
    .filter((s) => s.purpose !== 'hook' && s.purpose !== 'payoff')
    .sort((a, b) => (a.importance ?? 3) - (b.importance ?? 3));

  for (const scene of compressible) {
    if (currentWords <= targetWords) break;
    const words = (scene.narration || '').split(/\s+/).filter(Boolean);
    const excess = currentWords - targetWords;
    if (words.length > 5) {
      const trimCount = Math.min(excess, Math.max(1, Math.floor(words.length * 0.45)));
      const keep = Math.max(5, words.length - trimCount);
      scene.narration = words.slice(0, keep).join(' ');
      if (!/[.!?]$/.test(scene.narration)) scene.narration += '.';
      currentWords = plan.scenes.map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
    }
  }

  // Secondary pass if still over target
  if (currentWords > targetWords) {
    for (const scene of compressible) {
      if (currentWords <= targetWords) break;
      const words = (scene.narration || '').split(/\s+/).filter(Boolean);
      const excess = currentWords - targetWords;
      if (words.length > 4) {
        const keep = Math.max(4, words.length - excess);
        scene.narration = words.slice(0, keep).join(' ');
        if (!/[.!?]$/.test(scene.narration)) scene.narration += '.';
        currentWords = plan.scenes.map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
      }
    }
  }

  plan.script = plan.scenes.map((s) => s.narration).join(' ');
  return plan;
}

/**
 * Compresses an overlong video plan script to meet a target word budget.
 * Preserves the hook, core mechanism, and final payoff.
 */
export async function compressPlanScript(plan, targetWords, maxWords = Math.round(targetWords * 1.05), llm = llmConfig()) {
  const currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords <= maxWords) return plan;

  console.log(`   ✂️ Compressing script from ${currentWords} words to ~${targetWords} words (max ${maxWords})...`);
  if (!llm) {
    return deterministicCompress(plan, targetWords);
  }

  try {
    const sceneList = plan.scenes.map((s) => ({
      id: s.id,
      purpose: s.purpose,
      importance: s.importance,
      narration: s.narration,
    }));

    const compressed = await callJson(llm, [
      {
        role: 'system',
        content: 'You are an elite YouTube documentary script editor. Your job is to compress an overlong video script to meet a strict word budget without losing the hook tension, core mechanism, or conclusion payoff. Reply with JSON only.',
      },
      {
        role: 'user',
        content: `Current script (${currentWords} words across ${sceneList.length} scenes):\n${JSON.stringify(sceneList, null, 2)}\n\n` +
          `INSTRUCTIONS:\n` +
          `1. Shorten each scene's narration so the SUM of all scene narrations is EXACTLY between ${Math.round(targetWords * 0.93)} and ${maxWords} words.\n` +
          `2. Keep the exact same number of scenes and the exact same scene IDs.\n` +
          `3. Keep the hook punchy and retain the payoff resolution.\n` +
          `4. Cut filler words ("In fact", "Interestingly", "As we know", repeated adverbs), tighten context, and trim secondary examples.\n` +
          `Return {"scenes": [{"id": string, "narration": string, "emphasis": string}]}.`,
      },
    ]);

    if (Array.isArray(compressed?.scenes) && compressed.scenes.length === plan.scenes.length) {
      for (let i = 0; i < plan.scenes.length; i++) {
        const match = compressed.scenes.find((c) => c.id === plan.scenes[i].id) || compressed.scenes[i];
        if (match?.narration) {
          plan.scenes[i].narration = match.narration;
          if (match.emphasis && match.narration.includes(match.emphasis)) {
            plan.scenes[i].emphasis = match.emphasis;
          } else {
            const words = match.narration.split(/\s+/).filter((w) => w.length > 4);
            plan.scenes[i].emphasis = words[0] || plan.scenes[i].emphasis;
          }
        }
      }
      plan.script = plan.scenes.map((s) => s.narration).join(' ');
      const wordsCount = plan.script.split(/\s+/).filter(Boolean).length;
      if (wordsCount > maxWords) {
        console.log(`   ✂️ LLM compression returned ${wordsCount} words (exceeds max ${maxWords}). Trimming deterministically to ${targetWords}...`);
        return deterministicCompress(plan, targetWords);
      }
      return plan;
    }
  } catch (err) {
    console.warn(`   ⚠️ LLM compression failed (${err.message}). Using deterministic compression.`);
  }

  return deterministicCompress(plan, targetWords);
}

/**
 * @param {{ topic: string, niche?: string, format?: 'shorts'|'landscape', durationSec?: number, style?: string, speechRateWps?: number }} brief
 */
export async function generateDirectorPlan({ topic, niche = '', format = 'shorts', durationSec, style, speechRateWps }) {
  const target = durationSec || (format === 'shorts' ? 45 : 75);
  const budget = calculateDurationBudget({ targetDurationSec: target, format, style, speechRateWps });
  const llm = llmConfig();
  if (!llm) {
    console.log('⚠️  No DEEPSEEK_API_KEY/OPENAI_API_KEY — using the built-in DEMO plan (2008 financial crisis), not your topic.');
    const demo = normalizePlan(demoPlan(), { topic, niche, format, style });
    demo.durationBudget = budget;
    return demo;
  }

  console.log(`🎬 Director (${llm.name}): "${topic}" · ${format} · ~${target}s · Budget: ${budget.targetWords} words (max ${budget.maxWords}) · ${budget.targetSceneCount} beats`);
  const styleHint = style && STYLES[style] ? `\nThe directing style is fixed: "${style}".` : '';
  const brief = `Topic: "${topic}"\nNiche: ${niche || 'general'}\nFormat: ${format === 'shorts' ? 'vertical 9:16 short' : 'horizontal 16:9 YouTube video'}${styleHint}`;

  let plan;
  let compressionPasses = 0;
  if (target <= 180) {
    // Pass 1: Structured Beat Outline
    console.log(`   📝 Pass 1: Outlining ${budget.targetSceneCount} content beats for ${target}s...`);
    const outline = await callJson(llm, [
      {
        role: 'system',
        content: 'You outline documentary-style YouTube explainers. Reply with JSON only.',
      },
      {
        role: 'user',
        content: `${brief}\nTarget duration: ${target} seconds.\nTotal narration word budget: ${budget.targetWords} words (ABSOLUTE MAXIMUM: ${budget.maxWords} words).\n` +
          `Design a beat outline with EXACTLY ${budget.targetSceneCount} content beats conforming to these section targets:\n` +
          `- Hook: 1 scene, ~${budget.sectionBudgets.hook.targetWords} words\n` +
          `- Why it matters / Open question: 1–2 scenes, ~${budget.sectionBudgets.why_it_matters.targetWords} words total\n` +
          `- Core explanation / mechanism: 3–4 scenes, ~${budget.sectionBudgets.core_explanation.targetWords} words total\n` +
          `- Example / evidence: 2 scenes, ~${budget.sectionBudgets.example_evidence.targetWords} words total\n` +
          `- Payoff / conclusion: 1–2 scenes, ~${budget.sectionBudgets.payoff_conclusion.targetWords} words total\n\n` +
          `Return {"title": string, "style": string, "brandColor": string|null, "beats": [{"beatIndex": number, "section": string, "contentBeat": string, "purpose": string, "coreIdea": string, "targetWords": number, "visualType": string}]}`,
      },
    ]);

    // Pass 2: Write complete scenes adhering strictly to beat outline and word budget
    console.log(`   🎬 Pass 2: Authoring ${budget.targetSceneCount} scenes (budget: ${budget.targetWords} words)...`);
    const beatsContext = Array.isArray(outline?.beats) ? JSON.stringify(outline.beats, null, 2) : '';
    plan = await callJson(llm, [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${brief}\nVideo Title: "${outline?.title || topic}". Style: "${outline?.style || style || 'minimal_premium'}".\n` +
          `STRICT DURATION & WORD BUDGET:\n` +
          `- Total narration length: EXACTLY ${budget.targetWords} words (minimum ${budget.minWords} words, ABSOLUTE CEILING: ${budget.maxWords} words).\n` +
          `- Total scenes: EXACTLY ${budget.targetSceneCount} content beats.\n` +
          (beatsContext ? `Follow this approved beat outline:\n${beatsContext}\n\n` : '') +
          `CRITICAL EDITORIAL RULE: Every word takes speaking time. Do not write filler. The sum of all scene narrations MUST be between ${budget.minWords} and ${budget.maxWords} words.\n` +
          `Return the complete JSON plan object with "scenes": [...].`,
      },
    ]);

    if (outline?.title && !plan.title) plan.title = outline.title;
    if (outline?.style && !plan.style) plan.style = outline.style;
    if (outline?.brandColor && !plan.brandColor) plan.brandColor = outline.brandColor;
  } else {
    plan = await planLongForm(llm, brief, target);
  }

  // Pre-TTS Duration & Word Budget Validation
  let currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords > budget.maxWords) {
    console.log(`   ⚠️ Generated plan exceeds word budget (${currentWords} words vs max ${budget.maxWords}). Running compression pass...`);
    plan = await compressPlanScript(plan, budget.targetWords, budget.maxWords, llm);
    compressionPasses++;
  }

  const normalized = normalizePlan(plan, { topic, niche, format, style });
  normalized.durationBudget = budget;
  normalized.compressionPasses = compressionPasses;
  Object.defineProperty(normalized, 'raw', { value: plan, enumerable: false });
  return normalized;
}

/** Long-form: outline first, then each chapter with the running story as context. */
async function planLongForm(llm, brief, target) {
  const outline = await callJson(llm, [
    { role: 'system', content: 'You outline premium documentary-style YouTube videos. Reply with JSON only.' },
    {
      role: 'user',
      content: `${brief}\nTotal length: ~${Math.round(target / 60)} minutes.\nReturn {"title": string, "style": one of ${JSON.stringify(STYLE_IDS)}, "brandColor": "#RRGGBB"|null, "chapters": [{"title": "≤5 words", "summary": "2–3 sentences of what this chapter covers", "shareOfRuntime": number}]} with 4–8 chapters; the first is a cold-open hook, the last a payoff.`,
    },
  ]);
  const chapters = Array.isArray(outline.chapters) ? outline.chapters : [];
  const totalShare = chapters.reduce((s, c) => s + (Number(c.shareOfRuntime) || 1), 0) || 1;
  const scenes = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const seconds = (target * (Number(ch.shareOfRuntime) || 1)) / totalShare;
    const soFar = scenes.slice(-6).map((s) => s.narration).join(' ');
    console.log(`   📖 Chapter ${i + 1}/${chapters.length}: ${ch.title}`);
    const part = await callJson(llm, [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${brief}\nVideo title: "${outline.title}". Style: "${outline.style}".\nWrite ONLY chapter ${i + 1} of ${chapters.length}: "${ch.title}" — ${ch.summary}\n` +
          `Chapter length: ${wordBudget(seconds)} words. ${i > 0 ? `Start with a "chapter" scene (section: true). The story so far ended with: "${soFar}"` : 'This is the cold open: start with the hook.'}\n` +
          `Return {"scenes": [...]} only.`,
      },
    ]);
    scenes.push(...(Array.isArray(part.scenes) ? part.scenes : []));
  }
  return { title: outline.title, style: outline.style, brandColor: outline.brandColor, scenes };
}

// ─── Validation / normalisation ────────────────────────────────────────────

const str = (v, maxWords) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (maxWords && s.split(' ').length > maxWords) return null;
  return s;
};

const tokensOf = (text) => tokenizeScript(text).flatMap((w) => w.norm);

/** Fraction of `needle` tokens that occur in `hay` tokens. */
function coverage(needle, hay) {
  const n = tokensOf(needle);
  if (!n.length) return 0;
  const set = new Set(tokensOf(hay));
  return n.filter((t) => set.has(t)).length / n.length;
}

function validateData(kind, d, narration) {
  if (!d || typeof d !== 'object') return null;
  switch (kind) {
    case 'statistic': {
      const value = str(String(d.value ?? d.statValue ?? d.targetValue ?? ''), 3);
      if (!value) return null;
      // The number must actually be said in this sentence.
      const valueTokens = normalizeToken(value).filter((t) => !['dollars', 'pounds', 'euros', 'percent'].includes(t));
      const said = new Set(tokensOf(narration));
      if (!valueTokens.length || !valueTokens.every((t) => said.has(t))) return null;
      // Split "$1.8M" into prefix "$", number "1.8", unit "M" so the renderer can count the number.
      const m = /^([^\d-]*)(-?[\d,]*\.?\d+)\s*([^\d]*)$/.exec(value);
      if (!m) return null;
      return {
        value: m[2],
        prefix: (str(d.prefix, 1) || m[1] || '').trim(),
        suffix: `${m[3] || ''}${typeof d.suffix === 'string' ? d.suffix : ''}`.slice(0, 14),
        label: str(d.label ?? d.statLabel, 6),
        direction: ['up', 'down', 'neutral'].includes(d.direction) ? d.direction : 'neutral',
      };
    }
    case 'comparison': {
      const side = (s) => (s && str(s.title, 5) ? { title: str(s.title, 5), detail: str(s.detail, 10) } : null);
      const left = side(d.left), right = side(d.right);
      if (!left || !right) return null;
      const tone = (t) => (['negative', 'neutral', 'positive'].includes(t) ? t : 'neutral');
      return { left, right, leftTone: tone(d.leftTone), rightTone: tone(d.rightTone) };
    }
    case 'list': {
      const items = (Array.isArray(d.items) ? d.items : []).map((x) => str(typeof x === 'string' ? x : x?.text, 7)).filter(Boolean).slice(0, 5);
      return items.length >= 2 ? { title: str(d.title, 6), items } : null;
    }
    case 'process': {
      const steps = (Array.isArray(d.steps) ? d.steps : [])
        .map((s) => (typeof s === 'string' ? { title: str(s, 5) } : { title: str(s?.title, 5), detail: str(s?.detail, 10) }))
        .filter((s) => s.title).slice(0, 5);
      return steps.length >= 2 ? { steps } : null;
    }
    case 'timeline': {
      const events = (Array.isArray(d.events) ? d.events : [])
        .map((e) => ({ date: str(String(e?.date ?? ''), 3), label: str(e?.label, 7) }))
        .filter((e) => e.date && e.label).slice(0, 6);
      return events.length >= 2 ? { events } : null;
    }
    case 'chart': {
      const points = (Array.isArray(d.points) ? d.points : [])
        .map((p) => ({ label: str(String(p?.label ?? ''), d.type === 'rank' || d.type === 'share' ? 6 : 3), value: Number(p?.value) }))
        .filter((p) => p.label && Number.isFinite(p.value)).slice(0, 12);
      const type = ['line', 'bar', 'share', 'rank'].includes(d.type) ? d.type : 'line';
      if (type === 'share') {
        const sum = points.reduce((s, p) => s + p.value, 0);
        if (points.length < 2 || points.length > 6 || points.some((p) => p.value <= 0) || sum < 60 || sum > 110) return null;
      } else if (points.length < 3) return null;
      if (type === 'rank') points.sort((a, b) => b.value - a.value);
      return { type, title: str(d.title, 7), unit: str(d.unit, 3), points: type === 'rank' ? points.slice(0, 8) : points };
    }
    case 'quote': {
      const quote = str(d.quote, 40), author = str(d.author, 6);
      // Only quotes the narration itself speaks — never a decorative "quote".
      if (!quote || !author || coverage(quote, narration) < 0.6) return null;
      return { quote, author, role: str(d.role, 8) };
    }
    case 'document': {
      const source = str(d.source, 6), headline = str(d.headline, 16);
      if (!source || !headline || coverage(source, narration) < 0.5) return null;
      return { source, headline, date: str(d.date, 4) };
    }
    case 'chapter': {
      const title = str(d.title, 6);
      return title ? { number: Number.isFinite(Number(d.number)) ? Number(d.number) : null, title } : null;
    }
    case 'ui': {
      const title = str(d.title, 8), body = str(d.body, 18);
      return title && body ? { app: str(d.app, 3) || 'Messages', title, body } : null;
    }
    case 'code': {
      const code = typeof d.code === 'string' ? d.code.split('\n').slice(0, 14).join('\n').trim() : '';
      return code ? { language: str(d.language, 1) || 'javascript', code } : null;
    }
    default:
      return null;
  }
}

const LEGACY_KIND = {
  archival_documentary: 'subject', cinematic: 'atmosphere', stock: 'atmosphere', image: 'subject', media: 'subject',
  metric_hero: 'statistic', stat_counter: 'statistic', stats_highlight: 'statistic',
  split_comparison: 'comparison', versus: 'comparison', process_flow: 'process', steps: 'process',
  animated_data_chart: 'chart', quote_card: 'quote', evidence_paper: 'document', kinetic_impact_word: 'statement',
  typography: 'statement', cinematic_title_intro: 'chapter', chapter_title: 'chapter', notification_pop: 'ui', browser: 'ui', terminal: 'code',
};

export function normalizePlan(raw, { topic = '', niche = '', format = 'shorts', style } = {}) {
  const styleId = (style && STYLES[style] && style) || (STYLES[raw?.style] && raw.style) || guessStyle(niche, `${topic} ${raw?.title || ''}`);
  const hue = hexToHue(raw?.brandColor) ?? topicHue(`${raw?.title || topic}`);
  const scenes = [];
  const downgrades = [];
  const diagnostics = { rawScenes: Array.isArray(raw?.scenes) ? raw.scenes.length : 0, invalidEmphasis: 0, droppedHeadlines: 0, missingAttributes: {}, styleFromLlm: Boolean(STYLES[raw?.style]) };

  for (const s of Array.isArray(raw?.scenes) ? raw.scenes : []) {
    const narration = str(s?.narration || s?.voiceoverSentence);
    if (!narration) continue;
    let kind = KINDS.includes(s.kind) ? s.kind : LEGACY_KIND[s.kind || s.type] || 'subject';
    let data = null;
    if (!['atmosphere', 'subject', 'statement'].includes(kind)) {
      data = validateData(kind, s.data || s.params, narration);
      if (!data) { downgrades.push(`${kind}→subject: "${narration.slice(0, 50)}"`); kind = 'subject'; }
    }
    let kicker = str(s.text?.kicker, 6);
    let headline = str(s.text?.headline, 7);
    // A headline that re-states most of the sentence is duplication, not support.
    if (headline && kind !== 'statement' && headline.split(' ').length > 3 && coverage(headline, narration) > 0.8) headline = null;
    if (kind === 'statement' && !headline) {
      headline = str(s.params?.word, 4) || str(s.emphasis, 4);
      if (!headline) { kind = 'subject'; downgrades.push(`statement→subject (no text): "${narration.slice(0, 50)}"`); }
    }
    const emphasis = str(s.emphasis, 8);
    const queries = [...(Array.isArray(s.imageQueries) ? s.imageQueries : []), s.params?.assetQuery, s.params?.backgroundAssetQuery]
      .map((q) => str(q, 12)).filter(Boolean);
    const entityName = str(s.entity?.name, 8);
    const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
    const defaultTreatment = ['atmosphere', 'subject'].includes(kind) ? 'cinematic' : kind === 'statement' ? 'typographic' : 'graphic';
    scenes.push({
      id: `s${String(scenes.length + 1).padStart(2, '0')}`,
      narration,
      purpose: PURPOSES.includes(s.purpose) ? s.purpose : 'explain',
      kind,
      visual: str(s.visual) || '',
      imageQueries: [...new Set(queries)].slice(0, 3),
      entity: entityName ? { name: entityName, wikipedia: str(s.entity?.wikipedia, 10) || str(s.params?.wikiQuery, 10) || entityName } : null,
      text: kicker || headline ? { kicker, headline } : null,
      emphasis: emphasis && coverage(emphasis, narration) >= 0.99 ? emphasis : null,
      data,
      intensity: Math.min(5, Math.max(1, Math.round(Number(s.intensity) || 3))),
      section: Boolean(s.section) || kind === 'chapter',
      tone: pick(s.tone, TONES, 'neutral'),
      importance: Math.min(5, Math.max(1, Math.round(Number(s.importance) || Number(s.intensity) || 3))),
      shot: pick(s.shot, SHOT_SCALES, kind === 'atmosphere' ? 'wide' : 'medium'),
      focus: str(s.focus, 10),
      camera: pick(s.camera, CAMERA_BEHAVIOURS, null),
      continuity: pick(s.continuity, ['continue', 'new', 'contrast'], 'new'),
      // A graphic/typographic kind keeps its treatment; photo kinds may ask for any treatment.
      treatment: ['atmosphere', 'subject'].includes(kind) ? pick(s.treatment, TREATMENTS, defaultTreatment) : (s.treatment === 'quiet' ? 'quiet' : defaultTreatment),
      contentBeat: str(s.contentBeat, 5) || s.purpose || 'explanation',
      complexity: Math.min(5, Math.max(1, Math.round(Number(s.complexity) || (['statistic', 'comparison', 'list', 'process', 'timeline', 'chart', 'document', 'ui', 'code'].includes(kind) ? 4 : 2)))),
      emotionalWeight: Math.min(5, Math.max(1, Math.round(Number(s.emotionalWeight) || Number(s.intensity) || 3))),
      requiredComprehensionTime: Number(s.requiredComprehensionTime) || (['process', 'timeline', 'comparison', 'chart'].includes(kind) ? 5.0 : ['statistic', 'document', 'ui', 'code'].includes(kind) ? 3.5 : 2.5),
      visualChangeTolerance: ['low', 'moderate', 'high'].includes(s.visualChangeTolerance) ? s.visualChangeTolerance : (kind === 'atmosphere' ? 'high' : ['process', 'chart', 'comparison'].includes(kind) ? 'low' : 'moderate'),
      pauseAfterSec: Number(s.pauseAfterSec) || (s.purpose === 'hook' || s.purpose === 'reveal' ? 0.3 : 0),
    });
    if (s.emphasis && !scenes[scenes.length - 1].emphasis) diagnostics.invalidEmphasis++;
    if (s.text?.headline && !scenes[scenes.length - 1].text?.headline) diagnostics.droppedHeadlines++;
    for (const k of ['tone', 'importance', 'shot', 'camera', 'treatment']) if (s[k] === undefined) diagnostics.missingAttributes[k] = (diagnostics.missingAttributes[k] || 0) + 1;
  }
  if (!scenes.length) throw new Error('Director plan contained no usable scenes');
  if (downgrades.length) console.log(`   ↳ downgraded ${downgrades.length} scene(s) lacking valid data:\n     ${downgrades.join('\n     ')}`);

  // Claim extraction only. These are asserted/planned claims, not externally fact-checked claims.
  const claims = [];
  scenes.forEach((s, idx) => {
    if (s.data?.value || s.kind === 'statistic') {
      claims.push({
        claim_id: `claim_${String(idx + 1).padStart(3, '0')}`,
        scene_id: s.id,
        text: s.narration,
        type: 'statistic',
        value: s.data?.value || null,
        unit: s.data?.suffix || s.data?.prefix || null,
        confidence: 0.92,
        status: 'asserted',
        qualification: /\b(around|nearly|approx|estimated|over|about)\b/i.test(s.narration) ? 'estimated' : 'exact',
      });
    } else if (s.entity?.wikipedia) {
      claims.push({
        claim_id: `claim_${String(idx + 1).padStart(3, '0')}`,
        scene_id: s.id,
        text: `Entity reference: ${s.entity.name}`,
        type: 'entity',
        value: s.entity.name,
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.entity.wikipedia)}`,
        confidence: 0.95,
        status: 'asserted',
        qualification: 'exact',
      });
    }
  });

  const contentQuality = validateContentQuality({ scenes });

  return {
    title: str(raw?.title) || topic || 'Untitled',
    topic,
    niche,
    format,
    style: styleId,
    hue,
    scenes,
    claims,
    script: scenes.map((s) => s.narration).join(' '),
    contentQuality,
    diagnostics: { ...diagnostics, downgrades, contentQualityIssues: contentQuality.issues.length },
  };
}

/** Validate narrative progression, hook curiosity, redundancy, and hook-to-payoff closure. */
export function validateContentQuality({ scenes = [] } = {}) {
  const issues = [];
  const hookScene = scenes[0];
  const hookText = (hookScene?.narration || hookScene?.script || '').toLowerCase();
  const genericHookPhrases = [
    'have you ever wondered', 'in this video', 'today we will', 'welcome back',
    'did you know that', 'let us dive in', 'let\'s explore',
  ];
  for (const phrase of genericHookPhrases) {
    if (hookText.includes(phrase)) {
      issues.push({
        type: 'generic_hook',
        severity: 'warn',
        message: `Hook contains generic filler opener: "${phrase}". Prefer concrete tension or high-stakes fact.`,
      });
    }
  }

  for (let i = 1; i < scenes.length; i++) {
    const prev = (scenes[i - 1].narration || scenes[i - 1].script || '').toLowerCase();
    const curr = (scenes[i].narration || scenes[i].script || '').toLowerCase();
    const prevWords = new Set(prev.split(/\s+/).filter((w) => w.length > 3));
    const currWords = curr.split(/\s+/).filter((w) => w.length > 3);
    const common = currWords.filter((w) => prevWords.has(w)).length;
    if (currWords.length >= 4 && common / currWords.length > 0.65) {
      issues.push({
        type: 'redundant_script_sentence',
        severity: 'warn',
        sceneIndex: i,
        message: `Scene ${i + 1} heavily repeats phrasing from scene ${i}.`,
      });
    }
  }

  const hasQuestionHook = hookText.includes('?') || /\b(why|how|what if|could|is it possible)\b/i.test(hookText);
  const payoffScenes = scenes.filter((s) =>
    ['payoff', 'conclusion', 'reveal'].includes(String(s.purpose || '').toLowerCase())
    || ['payoff', 'conclusion', 'reveal'].includes(String(s.contentBeat || '').toLowerCase())
  );
  if (hasQuestionHook && !payoffScenes.length) {
    issues.push({
      type: 'missing_hook_payoff',
      severity: 'warn',
      message: 'Hook raises a question/tension, but no explicit payoff or conclusion scene was found in script.',
    });
  }

  if (scenes.length > 14) {
    issues.push({
      type: 'excessive_scene_fragmentation',
      severity: 'warn',
      message: `Script contains ${scenes.length} fragmented scenes (target: 8–11 content beats for explainer).`,
    });
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    totalScenes: scenes.length,
    hookText: hookScene?.narration || hookScene?.script || '',
    hasHookPayoff: payoffScenes.length > 0,
    hasGenericHook: issues.some((i) => i.type === 'generic_hook'),
    hasPayoff: payoffScenes.length > 0,
    warnings: issues.map((i) => i.message),
    issues,
  };
}

/** Stable, topic-derived hue when there is no brand colour. */
function topicHue(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h) % 360;
}

// ─── Demo plan (no API key) — also the deterministic test fixture ──────────

export function demoPlan() {
  return {
    title: 'How the 2008 Crash Started in an Afternoon',
    style: 'data_driven',
    brandColor: '#e0463a',
    scenes: [
      {
        narration: 'In September 2008, a single phone call triggered a trillion dollar collapse.',
        purpose: 'hook', kind: 'atmosphere', visual: 'Wall Street at dusk, the New York Stock Exchange facade dominating the frame',
        imageQueries: ['New York Stock Exchange facade', 'Wall Street street sign'], entity: { name: 'New York Stock Exchange', wikipedia: 'New York Stock Exchange' },
        text: { kicker: 'New York · September 2008' }, emphasis: 'trillion dollar collapse', intensity: 4,
        tone: 'tense', importance: 4, shot: 'wide', focus: 'the exchange facade', camera: 'push', continuity: 'new', treatment: 'cinematic',
      },
      {
        narration: 'Lehman Brothers held billions in toxic subprime mortgage debt that nobody would buy.',
        purpose: 'context', kind: 'subject', visual: 'The Lehman Brothers headquarters tower, camera drifting up the facade',
        imageQueries: ['Lehman Brothers headquarters', 'Lehman Brothers building 745 Seventh Avenue'], entity: { name: 'Lehman Brothers', wikipedia: 'Lehman Brothers' },
        text: { kicker: 'Lehman Brothers' }, emphasis: 'toxic subprime mortgage debt', intensity: 3,
        tone: 'somber', importance: 3, shot: 'medium', focus: 'the Lehman Brothers sign', camera: 'reveal', continuity: 'new', treatment: 'graphic',
      },
      {
        narration: 'When the government refused a bailout, the panic spread across global banking in hours,',
        purpose: 'escalate', kind: 'process', visual: 'A chain reaction: no bailout, then bank panic, then a global credit freeze',
        data: { steps: [{ title: 'No bailout', detail: 'Lehman files for bankruptcy' }, { title: 'Bank panic', detail: 'Lenders pull funding overnight' }, { title: 'Global freeze', detail: 'Credit markets stop' }] },
        emphasis: 'refused a bailout', intensity: 4, section: false, tone: 'urgent', importance: 4, continuity: 'new', treatment: 'graphic',
      },
      {
        narration: 'freezing credit and destroying sixty trillion dollars of wealth worldwide.',
        purpose: 'reveal', kind: 'statistic', visual: 'A single number over a dark trading floor',
        imageQueries: ['stock exchange trading floor'],
        data: { value: '60', prefix: '$', suffix: ' trillion', label: 'global wealth erased', direction: 'down' },
        emphasis: 'sixty trillion dollars', intensity: 5, tone: 'somber', importance: 5, shot: 'wide', camera: 'slow', continuity: 'contrast', treatment: 'graphic',
      },
    ],
  };
}
