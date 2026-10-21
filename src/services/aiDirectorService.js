import { config } from '../config/index.js';
import { STYLES, STYLE_IDS, DEFAULT_STYLE, hexToHue } from '../shared/styles.js';
import { normalizeToken, tokenizeScript } from './alignmentService.js';
import { calculateDurationBudget, DEFAULT_SPEECH_RATE_WPS } from '../storyboard/durationBudget.js';

const wordBudget = (seconds) => Math.round(Number(seconds || 0) * (DEFAULT_SPEECH_RATE_WPS || 2.60));
const editableSceneId = (scene, index) => scene?.id || `__scene_${String(index + 1).padStart(3, '0')}`;

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
  "source": { "url": string, "label": string } | null, // required for dates, numbers, quotations, "first/oldest/largest", and other checkable factual claims
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
8. Truth: every number, date, quote, historical superlative, name and document must be real. For a checkable factual claim, provide a direct source URL in scene.source. Never invent a source; if you cannot cite it, rewrite the sentence without the unsupported exact claim.
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

/** Deterministic, extractive compression fallback. */
function finishTruncatedSentence(words) {
  const kept = [...words];
  // Prefer punctuation that already completed a sentence in the source.
  // Appending a period to an arbitrary word prefix can manufacture fragments
  // such as "This." or "Without logical.".
  for (let index = kept.length - 1; index >= 0; index--) {
    if (/[.!?]["')\]]*$/.test(kept[index])) {
      const text = kept.slice(0, index + 1).join(' ').trim();
      if (text.split(/\s+/).length >= 4) return text;
    }
  }

  // A comma or semicolon can delimit a complete leading clause. Only use it
  // when the result is substantive and does not end with a connector.
  for (let index = kept.length - 1; index >= 3; index--) {
    if (/[,;:]["')\]]*$/.test(kept[index])) {
      const text = kept.slice(0, index + 1).join(' ').replace(/[,;:]+["')\]]*$/, '').trim();
      if (text && !DANGLING_END_RE.test(`${text}.`)) return `${text}.`;
    }
  }
  return '';
}

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
      scene.narration = finishTruncatedSentence(words.slice(0, keep)) || scene.narration;
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
        scene.narration = finishTruncatedSentence(words.slice(0, keep)) || scene.narration;
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
export function validateCompressionCandidate(plan, compressed, targetWords, maxWords) {
  if (!Array.isArray(compressed?.scenes) || compressed.scenes.length !== plan.scenes.length) {
    throw new Error('compression response changed the scene count');
  }
  const compressedById = new Map(compressed.scenes.map((scene) => [scene?.id, scene]));
  const hasEveryScene = compressedById.size === plan.scenes.length
    && plan.scenes.every((scene, index) => compressedById.get(editableSceneId(scene, index))?.narration?.trim());
  if (!hasEveryScene) throw new Error('compression response changed scene IDs or omitted narration');
  const narrations = plan.scenes.map((scene, index) => compressedById.get(editableSceneId(scene, index)).narration.replace(/\s+/g, ' ').trim());
  const wordCount = narrations.join(' ').split(/\s+/).filter(Boolean).length;
  const minWords = Math.round(targetWords * 0.93);
  if (wordCount < minWords) {
    throw new Error(`compression response undershot the word budget (${wordCount} words; minimum ${minWords})`);
  }
  return { compressedById, narrations, wordCount, minWords, maxWords };
}

export async function compressPlanScript(plan, targetWords, maxWords = Math.round(targetWords * 1.05), llm = llmConfig()) {
  const currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords <= maxWords) return plan;

  console.log(`   ✂️ Compressing script from ${currentWords} words to ~${targetWords} words (max ${maxWords})...`);
  if (!llm) {
    return deterministicCompress(plan, targetWords);
  }

  try {
    const sceneList = plan.scenes.map((s, index) => ({
      id: editableSceneId(s, index),
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

    if (Array.isArray(compressed?.scenes)) {
      // Validate the complete candidate before touching the working plan. An
      // LLM can satisfy the JSON shape while badly undershooting the requested
      // duration; accepting that response used to turn a 120s script into 85s.
      const { compressedById, narrations: candidateNarrations, wordCount: wordsCount } = validateCompressionCandidate(
        plan, compressed, targetWords, maxWords,
      );

      for (let i = 0; i < plan.scenes.length; i++) {
        const match = compressedById.get(editableSceneId(plan.scenes[i], i));
        plan.scenes[i].narration = candidateNarrations[i];
        if (match.emphasis && match.narration.includes(match.emphasis)) {
          plan.scenes[i].emphasis = match.emphasis;
        } else {
          const words = match.narration.split(/\s+/).filter((w) => w.length > 4);
          plan.scenes[i].emphasis = words[0] || plan.scenes[i].emphasis;
        }
      }
      plan.script = plan.scenes.map((s) => s.narration).join(' ');
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

/** Expand an undersized script without changing its scene structure or adding
 * unsupported exact claims. If no LLM is configured, leave the script intact
 * so the duration gate can fail honestly instead of padding with filler. */
export async function expandPlanScript(plan, targetWords, minWords = Math.round(targetWords * 0.93), llm = llmConfig(), correctionAttempt = 0) {
  const currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords >= minWords || !llm) return plan;

  console.log(`   ↗️ Expanding script from ${currentWords} words to ~${targetWords} words (minimum ${minWords})...`);
  const sceneList = (plan.scenes || []).map((scene, index) => ({
    id: editableSceneId(scene, index),
    purpose: scene.purpose,
    narration: scene.narration,
  }));
  try {
    const expanded = await callJson(llm, [
      {
        role: 'system',
        content: 'You are a careful documentary script editor. Expand an undersized script with useful explanation, not filler. Preserve all scene IDs and factual meaning. Do not introduce new exact numbers, quotations, dates, people, organizations, accusations, or medical/financial claims. Reply with JSON only.',
      },
      {
        role: 'user',
        content: `Expand this ${currentWords}-word script to between ${minWords} and ${Math.round(targetWords * 1.04)} words. Keep exactly ${sceneList.length} scenes and the same IDs. Add definitions, causal explanation, concrete but non-numeric context, and transitions. Do not repeat sentences. Return {"scenes":[{"id":string,"narration":string,"emphasis":string|null}]} only.\n${JSON.stringify(sceneList)}`,
      },
    ], { temperature: 0.35, retries: 2, timeoutMs: 60000 });
    if (!Array.isArray(expanded?.scenes) || expanded.scenes.length !== plan.scenes.length) {
      if (correctionAttempt < 1) {
        console.warn('   Expansion response changed the scene count; requesting one corrective expansion pass.');
        return expandPlanScript(plan, targetWords, minWords, llm, correctionAttempt + 1);
      }
      console.warn('   ⚠️ Expansion response remained structurally invalid; measured-audio repair will enforce duration.');
      return plan;
    }
    for (let sceneIndex = 0; sceneIndex < plan.scenes.length; sceneIndex++) {
      const scene = plan.scenes[sceneIndex];
      const stableId = editableSceneId(scene, sceneIndex);
      const replacement = expanded.scenes.find((item) => item.id === stableId);
      if (!replacement?.narration) {
        if (correctionAttempt < 1) {
          console.warn(`   Expansion response omitted ${stableId}; requesting one corrective expansion pass.`);
          return expandPlanScript(plan, targetWords, minWords, llm, correctionAttempt + 1);
        }
        console.warn(`   ⚠️ Expansion response still omitted ${stableId}; measured-audio repair will enforce duration.`);
        return plan;
      }
      scene.narration = replacement.narration.replace(/\s+/g, ' ').trim();
      if (replacement.emphasis && scene.narration.includes(replacement.emphasis)) scene.emphasis = replacement.emphasis;
    }
    plan.script = plan.scenes.map((scene) => scene.narration).join(' ');
    plan = await repairIncompleteNarration(plan, llm);
    const expandedWords = plan.script.split(/\s+/).filter(Boolean).length;
    const maxWords = Math.round(targetWords * 1.04);
    if (expandedWords > maxWords) {
      console.warn(`   Expansion returned ${expandedWords} words (maximum ${maxWords}); applying sentence-safe compression.`);
      plan = await compressPlanScript(plan, targetWords, maxWords, llm);
      plan = await repairIncompleteNarration(plan, llm);
    }
    const finalWords = plan.scenes.map((scene) => scene.narration).join(' ').split(/\s+/).filter(Boolean).length;
    if (finalWords < minWords && correctionAttempt < 1) {
      console.warn(`   Expansion returned only ${finalWords} words (minimum ${minWords}); requesting one corrective expansion pass.`);
      return expandPlanScript(plan, targetWords, minWords, llm, correctionAttempt + 1);
    }
    if (finalWords < minWords) {
      console.warn(`   ⚠️ Expansion remained below budget at ${finalWords} words (minimum ${minWords}); measured-audio repair will enforce duration.`);
    }
    return plan;
  } catch (error) {
    console.warn(`   ⚠️ LLM expansion failed (${error.message}). Duration QC will enforce the undersized result.`);
    return plan;
  }
}

/**
 * @param {{ topic: string, niche?: string, format?: 'shorts'|'landscape', durationSec?: number, style?: string, speechRateWps?: number, sourceData?: unknown, productionProfile?: object }} brief
 */
export async function generateDirectorPlan({ topic, niche = '', format = 'shorts', durationSec, style, speechRateWps, sourceData, productionProfile }) {
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
  const serializedSource = sourceData == null
    ? ''
    : (typeof sourceData === 'string' ? sourceData : JSON.stringify(sourceData));
  const sourceContext = serializedSource
    ? `\nSupplied source data (treat as editorial input; do not invent details beyond it):\n${serializedSource.slice(0, 16000)}`
    : '';
  const channelContext = productionProfile
    ? `\nContent type: ${productionProfile.contentType}\nAudience: ${productionProfile.audience}\nEditorial tone: ${productionProfile.tone}\nPacing: ${productionProfile.pacing?.mode || 'balanced'}`
    : '';
  const brief = `Topic: "${topic}"\nNiche: ${niche || 'general'}\nFormat: ${format === 'shorts' ? 'vertical 9:16 short' : 'horizontal 16:9 YouTube video'}${styleHint}${channelContext}${sourceContext}`;

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
    plan = await planLongForm(llm, brief, target, budget);
  }

  // Pre-TTS Duration & Word Budget Validation
  let currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  if (currentWords > budget.maxWords) {
    console.log(`   ⚠️ Generated plan exceeds word budget (${currentWords} words vs max ${budget.maxWords}). Running compression pass...`);
    plan = await compressPlanScript(plan, budget.targetWords, budget.maxWords, llm);
    compressionPasses++;
  }
  currentWords = (plan.scenes || []).map((s) => s.narration).join(' ').split(/\s+/).filter(Boolean).length;
  let expansionPasses = 0;
  if (currentWords < budget.minWords) {
    plan = await expandPlanScript(plan, budget.targetWords, budget.minWords, llm);
    expansionPasses++;
  }

  plan = await repairIncompleteNarration(plan, llm);
  const normalized = normalizePlan(plan, { topic, niche, format, style });
  normalized.durationBudget = budget;
  normalized.compressionPasses = compressionPasses;
  normalized.expansionPasses = expansionPasses;
  Object.defineProperty(normalized, 'raw', { value: plan, enumerable: false });
  return normalized;
}

/** Long-form: outline first, then each chapter with the running story as context. */
async function planLongForm(llm, brief, target, budget = null) {
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
    const targetWords = budget?.speechRateWps ? Math.round(seconds * budget.speechRateWps) : wordBudget(seconds);
    const soFar = scenes.slice(-6).map((s) => s.narration).join(' ');
    console.log(`   📖 Chapter ${i + 1}/${chapters.length}: ${ch.title}`);
    const part = await callJson(llm, [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${brief}\nVideo title: "${outline.title}". Style: "${outline.style}".\nWrite ONLY chapter ${i + 1} of ${chapters.length}: "${ch.title}" — ${ch.summary}\n` +
          `Chapter length: ${targetWords} words. ${i > 0 ? `Start with a "chapter" scene (section: true), but begin its narration naturally: never say "Chapter", a chapter number, or read the section title aloud. The story so far ended with: "${soFar}"` : 'This is the cold open: start with the hook.'}\n` +
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

const NUMBER_WORD = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
const SPOKEN_CHAPTER_RE = new RegExp(`^\\s*chapter\\s+(?:\\d+|${NUMBER_WORD})\\s*:\\s*`, 'i');
const DANGLING_END_RE = /(?:\b(?:and|or|but|the|a|an|of|to|for|with|than|into|from|by|as|which|who|whose|represents|deposited|stretched|define|shape)\s*[.!?]?|[,;:]\s*[.!?]?)$/i;

export function stripSpokenChapterLabel(text) {
  return String(text || '').replace(SPOKEN_CHAPTER_RE, '').trim();
}

function spokenChapterMetadata(text) {
  const match = String(text || '').match(new RegExp(`^\\s*chapter\\s+(\\d+|${NUMBER_WORD})\\s*:\\s*([^.!?]+)`, 'i'));
  if (!match) return null;
  const words = NUMBER_WORD.split('|');
  const number = /^\d+$/.test(match[1]) ? Number(match[1]) : words.indexOf(match[1].toLowerCase()) + 1;
  return { number: number || null, title: match[2].trim().split(/\s+/).slice(0, 6).join(' ') };
}

export function narrationCompletenessIssues(scenes = []) {
  const issues = [];
  for (let index = 0; index < scenes.length; index++) {
    const narration = String(scenes[index]?.narration || scenes[index]?.script || '').trim();
    const sentences = narration.split(/(?<=[.!?])\s+/).filter(Boolean);
    const lastSentence = sentences.at(-1) || narration;
    const lastWords = lastSentence.replace(/[.!?]+$/, '').trim().split(/\s+/).filter(Boolean);
    const malformed = /[,;:]\s*[.!?]$/.test(narration);
    const dangling = DANGLING_END_RE.test(narration);
    const tinyFragment = (lastWords.length === 1 && /^(?:this|that|these|those|it)[.!?]?$/i.test(lastSentence.trim()))
      || (lastWords.length === 2 && /^(?:their|our|his|her)\b/i.test(lastSentence));
    if (!/[.!?]$/.test(narration) || malformed || dangling || tinyFragment) {
      issues.push({
        type: 'incomplete_narration',
        severity: 'error',
        sceneIndex: index,
        sceneId: scenes[index]?.id || null,
        message: `Scene ${index + 1} ends with an incomplete or malformed sentence: "${lastSentence.slice(-120)}"`,
      });
    }
  }
  return issues;
}

function removeTrailingFragment(text) {
  const clean = String(text || '').replace(/,\s*\./g, '.').trim();
  if (!narrationCompletenessIssues([{ narration: clean }]).length) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const complete = (/[.!?]$/.test(clean) ? sentences.slice(0, -1) : sentences).join(' ').trim();
  return complete && complete.split(/\s+/).length >= 4 ? complete : clean;
}

export async function repairIncompleteNarration(plan, llm) {
  let issues = narrationCompletenessIssues(plan?.scenes || []);
  if (!issues.length) return plan;
  for (let pass = 0; llm && pass < 2 && issues.length; pass++) {
    const targets = issues.map((issue) => {
      const scene = plan.scenes[issue.sceneIndex];
      return { index: issue.sceneIndex, narration: scene?.narration || '', purpose: scene?.purpose || 'explain' };
    });
    try {
      const repaired = await callJson(llm, [
        {
          role: 'system',
          content: 'You repair unfinished documentary narration. Complete grammar and meaning using only facts already present in the supplied text. Do not add numbers, dates, names, quotations, superlatives, or new claims. Reply with JSON only.',
        },
        {
          role: 'user',
          content: `Repair each incomplete narration below. Return {"repairs":[{"index":number,"narration":string}]}. Preserve the intended meaning, make every entry end in a complete sentence, and do not include spoken chapter numbers.\n${JSON.stringify(targets)}`,
        },
      ], { temperature: 0.2, retries: 2, timeoutMs: 60000 });
      for (const item of repaired?.repairs || []) {
        const index = Number(item.index);
        if (!Number.isInteger(index) || !plan.scenes[index] || !item.narration) continue;
        plan.scenes[index].narration = stripSpokenChapterLabel(String(item.narration).replace(/\s+/g, ' ').trim());
      }
      issues = narrationCompletenessIssues(plan.scenes);
    } catch (error) {
      console.warn(`   Narration repair failed (${error.message}). Content QC will block incomplete prose.`);
      break;
    }
  }
  // Compression can leave a partial final sentence. If network repair is not
  // available, retain all earlier complete sentences and drop only that
  // mechanically introduced tail rather than publishing broken narration.
  for (const issue of narrationCompletenessIssues(plan.scenes)) {
    const scene = plan.scenes[issue.sceneIndex];
    if (scene) {
      const repaired = removeTrailingFragment(scene.narration);
      const unrecoverableMicroFragment = repaired === scene.narration
        && repaired.split(/\s+/).filter(Boolean).length <= 8;
      scene.narration = unrecoverableMicroFragment ? '' : repaired;
    }
  }
  plan.scenes = (plan.scenes || []).filter((scene) => String(scene.narration || '').trim());
  plan.script = (plan.scenes || []).map((scene) => scene.narration).join(' ');
  return plan;
}

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
    const rawNarration = str(s?.narration || s?.voiceoverSentence);
    const spokenChapter = spokenChapterMetadata(rawNarration);
    const narration = str(stripSpokenChapterLabel(rawNarration));
    if (!narration) continue;
    let kind = KINDS.includes(s.kind) ? s.kind : LEGACY_KIND[s.kind || s.type] || 'subject';
    if (spokenChapter && (s.section || s.purpose === 'chapter')) kind = 'chapter';
    let data = null;
    if (!['atmosphere', 'subject', 'statement'].includes(kind)) {
      const rawData = s.data || (kind === 'chapter' && spokenChapter ? spokenChapter : s.params);
      data = validateData(kind, rawData, narration);
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
    let source = null;
    try {
      if (s.source?.url) {
        const parsed = new URL(String(s.source.url));
        if (['http:', 'https:'].includes(parsed.protocol)) source = { url: parsed.toString(), label: str(s.source.label, 12) || parsed.hostname };
      }
    } catch { /* invalid source remains unverified */ }
    if (!source && entityName && s.entity?.wikipedia) {
      source = { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.entity.wikipedia)}`, label: `${entityName} reference` };
    }
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
      source,
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
  // Only claims with a genuinely checkable exact value or historical
  // superlative need evidence. Absolute words used as creative language
  // ("the only sound", "always waiting") are not factual statistics.
  const exactClaimPattern = /(?:\b(?:1\d{3}|20\d{2})\b|[$£€]\s*\d|\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|trillion)\b|\b(?:the|world(?:'s)?|history(?:'s)?)\s+(?:first(?!\s+(?:step|thing|move|way|place|time)\b)|earliest|oldest|largest|smallest)\b)/i;
  let illustrativeContext = false;
  scenes.forEach((s, idx) => {
    // Only explicit hypothetical framing may bypass source evidence. Phrases
    // such as "Meet Alex" or "A versus B" can still sound like factual case
    // studies, so the repair pass must label those examples unambiguously.
    const startsIllustration = /\b(?:example|for example|for instance|suppose|imagine|say you|let's say)\b/i.test(s.narration);
    const continuesIllustration = illustrativeContext && /^(?:by\s+\w+|then|next|after|before)|\b(?:she|he|they)\b/i.test(s.narration);
    illustrativeContext = startsIllustration || continuesIllustration;
    const genericNarrativeFirst = /\bthe first\b/i.test(s.narration)
      && !/\b(?:world(?:'s)?|history(?:'s)?)\s+first\b|\bthe first\s+(?:ever|known|recorded|modern|commercial)\b/i.test(s.narration)
      && !/(?:\b(?:1\d{3}|20\d{2})\b|[$£€]\s*\d|\b\d+(?:\.\d+)?\s*(?:%|percent|million|billion|trillion)\b)/i.test(s.narration);
    if (s.data?.value || s.kind === 'statistic' || (exactClaimPattern.test(s.narration) && !genericNarrativeFirst)) {
      const illustrative = !s.source?.url && illustrativeContext;
      claims.push({
        claim_id: `claim_${String(idx + 1).padStart(3, '0')}`,
        scene_id: s.id,
        text: s.narration,
        type: 'statistic',
        value: s.data?.value || null,
        unit: s.data?.suffix || s.data?.prefix || null,
        source_url: s.source?.url || null,
        source_label: s.source?.label || null,
        confidence: s.source?.url ? 0.7 : 0,
        status: s.source?.url ? 'sourced_unverified' : illustrative ? 'illustrative' : 'unverified',
        qualification: illustrative ? 'illustrative' : /\b(around|nearly|approx|estimated|over|about)\b/i.test(s.narration) ? 'estimated' : 'exact',
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

  const contentQuality = validateContentQuality({ scenes, claims });

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
export function validateContentQuality({ scenes = [], claims = [] } = {}) {
  const issues = [...narrationCompletenessIssues(scenes)];
  for (const claim of claims.filter((item) => item.type === 'statistic' && item.status === 'unverified')) {
    issues.push({
      type: 'unverified_exact_claim',
      severity: 'error',
      sceneId: claim.scene_id,
      message: `Exact factual claim has no recorded source: "${claim.text.slice(0, 140)}"`,
    });
  }
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

  const totalNarrationWords = scenes.reduce((sum, scene) => sum + String(scene.narration || scene.script || '').split(/\s+/).filter(Boolean).length, 0);
  const averageWordsPerScene = totalNarrationWords / Math.max(1, scenes.length);
  if (scenes.length > 14 && averageWordsPerScene < 12) {
    issues.push({
      type: 'excessive_scene_fragmentation',
      severity: 'warn',
      message: `Script contains ${scenes.length} short scenes averaging ${averageWordsPerScene.toFixed(1)} words; consolidate adjacent fragments.`,
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

/** Repair unsupported exact claims once without weakening the source gate. */
export async function repairUnverifiedClaims(plan, llm = llmConfig()) {
  const targets = (plan?.claims || []).filter((claim) => claim.type === 'statistic' && claim.status === 'unverified');
  if (!targets.length || !llm) return plan;
  const sceneIds = new Set(targets.map((claim) => claim.scene_id));
  const scenes = (plan.scenes || []).filter((scene) => sceneIds.has(scene.id)).map((scene) => ({ id: scene.id, narration: scene.narration }));
  try {
    const response = await callJson(llm, [
      {
        role: 'system',
        content: 'You repair unsupported narration claims. Keep every scene ID. If an exact date, amount, statistic, named victim, quotation, or superlative has no supplied source, remove the invented precision and express only the general mechanism already present. Hypothetical examples must be explicitly introduced as examples. Do not add facts, names, dates, numbers, sources, or allegations. Reply with JSON only.',
      },
      {
        role: 'user',
        content: `Rewrite only these scenes. Preserve meaning, approximate word count, complete sentences, and return {"scenes":[{"id":string,"narration":string}]}:\n${JSON.stringify(scenes)}`,
      },
    ], { temperature: 0.15, retries: 2, timeoutMs: 60000 });
    for (const repair of response?.scenes || []) {
      const scene = plan.scenes.find((item) => item.id === repair.id);
      if (scene && repair.narration) scene.narration = String(repair.narration).replace(/\s+/g, ' ').trim();
    }
    plan.script = plan.scenes.map((scene) => scene.narration).join(' ');
  } catch (error) {
    console.warn(`   Unsupported-claim repair failed (${error.message}). Content QC will block the claim.`);
  }
  return plan;
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
