import { config } from '../config/index.js';

/**
 * AI Visual Director & Automated Video Editor.
 * The AI (DeepSeek/OpenAI) makes ALL creative decisions:
 * - Color palette (primary, accent, bg, glow)
 * - Scene types and sequencing
 * - Camera movements
 * - Sound design
 * - Typography mood
 * 
 * No hardcoded palettes. The AI is the director.
 */

// Archetype style anchors ONLY for image generation prompts (not for colors)
const STYLE_ANCHORS = {
  history_documentary: {
    name: "History / Archival Documentary",
    styleAnchor: "authentic vintage archival 35mm film photograph, historical documentary still, museum lighting, 8k, desaturated earthy tones",
    negative: "flat vector, modern 3d render, cartoon, saturated neon, plastic",
  },
  business_editorial: {
    name: "Business / Corporate Editorial",
    styleAnchor: "Forbes Bloomberg executive documentary photography, 35mm film grain, moody corporate architecture, cinematic lighting, 8k",
    negative: "cartoon, flat clipart, cheesy stock smile, oversaturated vector",
  },
  finance_markets: {
    name: "Finance / Economic Crisis",
    styleAnchor: "Wall Street trading floor archival photo, financial crisis documentary still, moody 35mm film lighting, desaturated hyper-realistic 8k",
    negative: "childish illustration, cartoon, 3d render, low quality vector",
  },
  technology_ui: {
    name: "Technology / Deep Tech",
    styleAnchor: "sleek dark-mode technology laboratory, high-tech server architecture, cinematic anamorphic lens flare, 8k photorealistic",
    negative: "cartoon, cheesy clipart, flat 2d graphic, oversaturated",
  },
  science_discovery: {
    name: "Science / Educational Discovery",
    styleAnchor: "National Geographic editorial macro photography, crisp depth of field, dramatic scientific documentary lighting, 8k",
    negative: "flat vector, cartoon, childish illustration, low resolution",
  },
  mystery_investigation: {
    name: "Mystery / True Crime / Investigative",
    styleAnchor: "gritty crime documentary 35mm still, high-contrast chiaroscuro shadows, desaturated noir aesthetic, dramatic lighting, 8k",
    negative: "happy bright cartoon, flat vector, 3d render, plastic",
  },
  travel_cinematic: {
    name: "Travel / Cinematic Geography",
    styleAnchor: "cinematic location 35mm landscape photography, golden hour lighting, rich atmospheric haze, 8k",
    negative: "cartoon, low resolution, blurry, watermark",
  },
  product_startup: {
    name: "Product / Startup Breakdown",
    styleAnchor: "modern Silicon Valley founders workspace, high-end editorial tech photography, 8k dramatic lighting",
    negative: "flat vector, clipart, cartoon, low quality",
  }
};

const SYSTEM_PROMPT = `You are an elite, human-level video director and motion designer producing broadcast-quality social videos (YouTube Shorts, Instagram Reels, TikTok) in the style of Vox, Johnny Harris, and MagnatesMedia.

YOUR EDITORIAL GOAL:
Do NOT create an AI slideshow. Understand the narrative, determine the visual identity & color scheme, and make intentional editorial decisions.

CRITICAL: YOU MUST DESIGN A UNIQUE VISUAL IDENTITY FOR EVERY VIDEO.
- Choose colors that match the BRAND, MOOD, and ERA of the topic.
- Airbnb = Warm Coral (#FF5A5F) + Gold. Bitcoin = Orange (#F7931A) + Cyan. Wall Street Crisis = Crimson + Dark Navy. Ancient Rome = Imperial Gold + Deep Burgundy. Space = Cosmic Violet + Starlight Cyan. Medical = Teal + Clean White.
- NEVER default to generic blue. NEVER use the same palette for different topics.
- The "bg" color does NOT have to be near-black. Use deep topic-appropriate dark tones: deep burgundy for wine/food, deep navy for finance, deep forest for nature, warm charcoal for history.
- The "bgGradient" should create atmosphere, not just darkness.

5-BEAT EDITORIAL NARRATIVE ARC (STRICT 30 TO 38 SECONDS, 75-90 WORDS TOTAL):
Beat 1 (0-3s): The Thumb-Stop Hook (Kinetic impact word, leaked evidence, or shocking paradox).
Beat 2 (3-9s): The Stakes & Context (Authentic archival photo/footage establishing the crisis/story).
Beat 3 (9-18s): The Hidden Mechanism / Escalation (Animated data crash, dynamic chart, or split comparison).
Beat 4 (18-28s): The Climax / Impact Revelation (Massive glowing metric hero with shock camera shake).
Beat 5 (28-35s): The Payoff & Infinite Loop (Memorable conclusion that loops seamlessly back to sentence 1).

CRITICAL DIRECTORIAL RULES:
1. ZERO TEXT DUPLICATION: Never transcribe spoken narration into on-screen headlines! On-screen text is STRICTLY for evidence labels (e.g. "[ 📍 WALL STREET, 2008 ]", "[ CONFIDENTIAL MEMO ]") or massive numbers ("-$10B").
2. SEMANTIC REAL ENTITY SOURCING: Provide "wikiQuery" or "assetQuery" whenever referencing a real company, historical figure, city, or event so our archival engine pulls genuine photos.
3. CONTEXTUAL BACKGROUND ASSET: For every scene, provide "backgroundAssetQuery" to fetch an authentic topic photo for the ambient blurred background layer.
4. VARIETY ENFORCEMENT: Never repeat the same scene type twice in a row. Vary shot sizes, camera motion, and visual density.
5. SOUND DESIGN: Every scene must specify an "sfx" sound effect ('whoosh', 'impact_boom', 'sub_drop', 'paper_slam', 'click', 'cash_register').
6. TOTAL WORDS: 75 to 90 words continuous narration. Never exceed 95 words.
7. TRANSITIONS: Specify a transition type for each scene except the first. Options: "crossfade", "slide_left", "slide_right", "wipe", "none".

SHOT PRIMITIVES & MOTION GRAPHICS TEMPLATES:
- "cinematic_title_intro": Big cinematic opening title card with growing glowing underline sweep & category pill. Provide "title", "subtitle", "tag".
- "polaroid_photo_stack": Authentic archival polaroid photo with realistic tilt, tape, paper drop shadow, and date stamp. Provide "assetQuery" or "wikiQuery", "caption", "dateStamp".
- "lower_third": Broadcast documentary speaker/entity overlay with animated accent bar. Provide "name", "role", "location", "assetQuery".
- "quote_card": Editorial serif quote card with giant glowing quotation marks and citation. Provide "quote", "author", "role".
- "stat_counter": Animated counting KPI dashboard with trend badge (+340%) and glow card. Provide "targetValue", "prefix", "suffix", "statLabel", "trend", "headline".
- "notification_pop": iOS/Social breaking news alert card with spring physics. Provide "appName", "sender", "message", "time", "icon".
- "evidence_paper": Classified leaked document slamming onto screen with animated yellow highlighter. Provide "headline", "source", "snippet", "stampText".
- "animated_data_chart": Dynamic SVG line chart (direction: 'crash' or 'surge'). Provide "headline", "startValue", "endValue", "delta".
- "kinetic_impact_word": 1-2 screen-dominating words for 400ms thumb-stop. Provide "word", "subText", "backgroundAssetQuery".
- "split_comparison": Full-screen Before vs After / Myth vs Reality. Provide "topTitle", "topDesc", "bottomTitle", "bottomDesc".
- "metric_hero": Massive glowing statistic with shock impact. Provide "statValue", "statLabel", "headline".
- "process_flow": 3-step execution blueprint.
- "archival_documentary": Full-bleed photography/artwork with slow pan-and-scan camera glide. Provide "wikiQuery" or "imagePrompt" + optional "dateStamp".
- "browser" / "code": For web software or coding topics.

Respond ONLY with raw valid JSON:
{
  "title": "Catchy Viral Video Title",
  "archetype": "history_documentary" | "business_editorial" | "finance_markets" | "technology_ui" | "science_discovery" | "mystery_investigation" | "travel_cinematic" | "product_startup",
  "palette": {
    "primary": "#HEX (topic brand color)",
    "accent": "#HEX (contrasting highlight)",
    "bg": "#HEX (deep atmospheric background — NOT always black)",
    "bgGradient": "linear-gradient(180deg, #TOP 0%, #MID 65%, #BOTTOM 100%)",
    "glow": "rgba(R, G, B, 0.35) (radial spotlight color)",
    "text": "#HEX (primary text color)",
    "subtitlePill": "rgba(R, G, B, 0.88) (subtitle backdrop)"
  },
  "audioScript": "Complete continuous voiceover script (30-38 seconds, 75-90 words total).",
  "scenes": [
    {
      "id": "scene_01",
      "type": "kinetic_impact_word",
      "voiceoverSentence": "Exact spoken sentence for this scene.",
      "sfx": "impact_boom",
      "transition": "none",
      "camera": { "movement": "push_in", "speed": 1.15 },
      "params": {
        "assetQuery": "Specific search query for main visual",
        "backgroundAssetQuery": "Topic background query for ambient blur scrim",
        "accentColor": "#HEX"
      }
    }
  ]
}`;

export async function generateDirectorPlan({ topic, niche = 'finance', format = 'shorts' }) {
  const deepseekKey = (config.deepseek.apiKey || '').trim();
  const openaiKey = (config.openai.apiKey || '').trim();
  const apiKey = deepseekKey || openaiKey;
  const isDeepSeek = Boolean(deepseekKey);

  // Detect archetype for image style anchors only
  const detectedArchetype = detectArchetype(niche, topic);
  const styleConfig = STYLE_ANCHORS[detectedArchetype] || STYLE_ANCHORS.business_editorial;

  if (!apiKey) {
    console.log('⚠️  No API key found. Using Universal Fallback Director Plan.');
    return qualityControlPass(generateFallbackDirectorPlan({ topic, niche, format, styleConfig }), styleConfig);
  }

  console.log(`🎬 AI Director via ${isDeepSeek ? 'DeepSeek' : 'OpenAI'} for: "${topic}" (Style: ${styleConfig.name})...`);

  const endpoint = isDeepSeek 
    ? `${config.deepseek.apiUrl}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const model = isDeepSeek ? config.deepseek.model : config.openai.model;
  const userPrompt = `Topic: "${topic}"
Niche/Category: ${niche}
Format: ${format}
Visual Style Anchor (for image prompts): ${styleConfig.styleAnchor}
Negative Filter (for image prompts): ${styleConfig.negative}

IMPORTANT: Design a UNIQUE color palette that matches THIS specific topic's brand identity, mood, and era. Do NOT use generic dark blue. Every topic deserves its own visual identity.

Direct a 30-40 second viral video with diverse cinematic scenes. Output JSON only.`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.75,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Director AI returned status ${response.status}: ${errText}. Using fallback.`);
      return qualityControlPass(generateFallbackDirectorPlan({ topic, niche, format, styleConfig }), styleConfig);
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || '{}';
    const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const directorPayload = JSON.parse(cleaned);

    const p = directorPayload.palette || {};
    console.log(`✅ AI Director: "${directorPayload.title}" (${directorPayload.scenes?.length} scenes, Primary: ${p.primary || 'AI-chosen'}, BG: ${p.bg || 'AI-chosen'})`);
    return qualityControlPass(directorPayload, styleConfig);
  } catch (err) {
    console.error(`Error generating Director plan: ${err.message}. Using fallback.`);
    return qualityControlPass(generateFallbackDirectorPlan({ topic, niche, format, styleConfig }), styleConfig);
  }
}

function detectArchetype(niche = '', topic = '') {
  const combined = `${niche} ${topic}`.toLowerCase();
  if (/history|war|ancient|century|empire|rome|egypt|medieval|revolution/.test(combined)) return 'history_documentary';
  if (/finance|crisis|market|stock|crash|trillion|billion|debt|money|bank|recession/.test(combined)) return 'finance_markets';
  if (/tech|code|ai|software|algorithm|cyber|gpu|chip|semiconductor/.test(combined)) return 'technology_ui';
  if (/crime|fraud|scam|mystery|secret|leaked|murder|fbi|investigation/.test(combined)) return 'mystery_investigation';
  if (/science|space|brain|health|physics|biology|medicine|dna|quantum/.test(combined)) return 'science_discovery';
  if (/travel|city|country|island|geography|destination/.test(combined)) return 'travel_cinematic';
  if (/startup|product|airbnb|uber|tesla|apple|founder/.test(combined)) return 'product_startup';
  return 'business_editorial';
}

/**
 * Quality Control Pass.
 * Ensures valid palette exists (AI-generated or sensible default),
 * enforces visual variety, enriches image prompts.
 */
function qualityControlPass(plan, styleConfig) {
  if (!plan || !plan.scenes || plan.scenes.length === 0) return plan;

  plan.archetype = plan.archetype || 'business_editorial';
  plan.style = plan.archetype;

  // Ensure palette exists — if AI didn't provide one, use a sensible default
  if (!plan.palette || !plan.palette.primary) {
    plan.palette = {
      primary: '#38bdf8',
      accent: '#fbbf24',
      bg: '#050a18',
      bgGradient: 'linear-gradient(180deg, #0c1a3a 0%, #050a18 65%, #010206 100%)',
      glow: 'rgba(56, 189, 248, 0.35)',
      text: '#f8fafc',
      subtitlePill: 'rgba(4, 7, 15, 0.88)',
    };
  }

  // Fill in missing palette fields
  const p = plan.palette;
  if (!p.bg) p.bg = '#050a18';
  if (!p.bgGradient) p.bgGradient = `linear-gradient(180deg, ${p.bg}cc 0%, ${p.bg} 65%, #010206 100%)`;
  if (!p.glow) p.glow = `${p.primary}55`;
  if (!p.text) p.text = '#f8fafc';
  if (!p.subtitlePill) p.subtitlePill = 'rgba(4, 7, 15, 0.88)';

  let lastType = '';

  plan.scenes = plan.scenes.map((scene, idx) => {
    if (!scene.params) scene.params = {};

    // 1. Prevent consecutive identical scene types
    if (scene.type === lastType) {
      if (scene.type === 'archival_documentary') scene.type = 'evidence_paper';
      else if (scene.type === 'typography') scene.type = 'kinetic_impact_word';
      else scene.type = 'archival_documentary';
    }
    lastType = scene.type;

    // 2. Add visual style anchors to image prompts
    if (scene.params.imagePrompt) {
      scene.params.imagePrompt = `${scene.params.imagePrompt}, ${styleConfig.styleAnchor}`;
    }

    // 3. Ensure background asset query exists
    if (!scene.params.backgroundAssetQuery) {
      scene.params.backgroundAssetQuery = scene.params.assetQuery || scene.params.wikiQuery || plan.title;
    }

    // 4. Pass palette down to scene params
    scene.params.accentColor = scene.params.accentColor || p.accent;
    scene.params.primaryColor = scene.params.primaryColor || p.primary;
    scene.params.palette = p;

    // 5. Ensure transition is set (default to crossfade for all except first)
    if (idx === 0) {
      scene.transition = 'none';
    } else if (!scene.transition) {
      scene.transition = 'crossfade';
    }

    scene.archetype = plan.archetype;
    return scene;
  });

  return plan;
}

function generateFallbackDirectorPlan({ topic, niche, format, styleConfig }) {
  const cleanTopic = topic || 'How the 2008 Financial Crisis Started in an Afternoon';

  return {
    title: cleanTopic,
    archetype: detectArchetype(niche, topic),
    palette: {
      primary: '#f43f5e',
      accent: '#fbbf24',
      bg: '#0a0210',
      bgGradient: 'linear-gradient(180deg, #1a0520 0%, #0a0210 65%, #030008 100%)',
      glow: 'rgba(244, 63, 94, 0.35)',
      text: '#f8fafc',
      subtitlePill: 'rgba(10, 2, 16, 0.88)',
    },
    audioScript: `In September 2008, a single phone call triggered a trillion dollar collapse. Lehman Brothers held billions in toxic subprime mortgage debt that nobody would buy. When the government refused a bailout, the panic spread across global banking in hours, freezing credit and destroying sixty trillion dollars of wealth worldwide.`,
    scenes: [
      {
        id: "scene_01",
        type: "kinetic_impact_word",
        voiceoverSentence: "In September 2008, a single phone call triggered a trillion dollar collapse.",
        camera: { movement: "push_in", speed: 1.15 },
        sfx: "impact_boom",
        transition: "none",
        params: {
          word: "COLLAPSE",
          subText: "WALL STREET, 2008",
          accentColor: "#f43f5e",
          backgroundAssetQuery: "Wall Street stock exchange floor panic 2008"
        }
      },
      {
        id: "scene_02",
        type: "archival_documentary",
        voiceoverSentence: "Lehman Brothers held billions in toxic subprime mortgage debt that nobody would buy.",
        camera: { movement: "pan_left", speed: 1.1 },
        sfx: "whoosh",
        transition: "crossfade",
        params: {
          wikiQuery: "Lehman Brothers",
          assetQuery: "Lehman Brothers headquarters 2008",
          backgroundAssetQuery: "Lehman Brothers building New York",
          dateStamp: "NEW YORK, 2008",
          accentColor: "#38bdf8"
        }
      },
      {
        id: "scene_03",
        type: "evidence_paper",
        voiceoverSentence: "When the government refused a bailout, the panic spread across global banking in hours,",
        camera: { movement: "push_in", speed: 1.15 },
        sfx: "paper_slam",
        transition: "slide_left",
        params: {
          headline: "FEDERAL RESERVE DENIES EMERGENCY BAILOUT",
          source: "DEPARTMENT OF THE TREASURY — CONFIDENTIAL",
          snippet: "Systemic risk containment failed as counterparties froze interbank lending.",
          stampText: "LIQUIDATION",
          backgroundAssetQuery: "US Treasury federal reserve building"
        }
      },
      {
        id: "scene_04",
        type: "metric_hero",
        voiceoverSentence: "freezing credit and destroying sixty trillion dollars of wealth worldwide.",
        camera: { movement: "shake", speed: 1.08 },
        sfx: "sub_drop",
        transition: "crossfade",
        params: {
          statValue: "-$60 TRILLION",
          statLabel: "GLOBAL WEALTH DESTROYED",
          headline: "Largest Economic Collapse Since 1929",
          accentColor: "#f43f5e",
          backgroundAssetQuery: "stock market crash red chart 2008"
        }
      }
    ]
  };
}
