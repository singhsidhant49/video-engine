import { config } from '../config/index.js';

const SYSTEM_PROMPT = `You are a world-class viral video producer for high-converting tech YouTube Shorts, TikTok, and Instagram Reels.
Your goal is to write dynamic, non-generic video scripts paired with rich visual scene instructions.

CRITICAL INSTRUCTIONS FOR VISUALS:
1. NEVER output generic trivial code like "console.log('Hello World')". Always output real, professional code (e.g. React hooks, Node.js async/await, SQL queries, Python data structures).
2. Vary the scene types! Use a mix of "code", "stats_highlight", "concept_card", and "headline".
3. Provide punchy headings and 2-3 specific bullet points per scene.

Respond ONLY with raw valid JSON matching this schema:
{
  "title": "Short Catchy Video Title",
  "hook": "5-second viral hook line",
  "niche": "tech-explainer" | "code-snippet" | "startup-case-study" | "daily-news" | "qna-interview",
  "format": "shorts" | "landscape",
  "theme": "dark-neon" | "cyber-purple" | "minimal-emerald" | "sunset-gold",
  "audioScript": "Complete continuous narration text to be spoken by Kokoro TTS. Make it punchy, engaging, and highly informative.",
  "scenes": [
    {
      "id": 1,
      "type": "headline" | "concept_card" | "code" | "stats_highlight",
      "heading": "Clear High-Impact Scene Title",
      "subheading": "Detailed explanation or concept breakdown",
      "code": "// Real multi-line production code snippet here",
      "language": "javascript" | "python" | "typescript" | "sql",
      "highlights": ["Key insight 1", "Key insight 2"],
      "statLabel": "Throughput / Speedup",
      "statValue": "10,000x",
      "accentColor": "#38bdf8",
      "durationRatio": 0.33
    }
  ]
}`;

export async function generateScript({ topic, niche = 'tech-explainer', format = 'shorts' }) {
  const deepseekKey = (config.deepseek.apiKey || '').trim();
  const openaiKey = (config.openai.apiKey || '').trim();
  const apiKey = deepseekKey || openaiKey;
  const isDeepSeek = Boolean(deepseekKey);
  
  if (!apiKey) {
    console.log('⚠️  No DEEPSEEK_API_KEY found in .env. Using template script generator.');
    return generateFallbackScript({ topic, niche, format });
  }

  console.log(`🤖 Generating video script with ${isDeepSeek ? 'DeepSeek API' : 'OpenAI API'} for topic: "${topic}"...`);

  const endpoint = isDeepSeek 
    ? `${config.deepseek.apiUrl}/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const model = isDeepSeek ? config.deepseek.model : config.openai.model;

  const userPrompt = `Topic: "${topic}"
Niche: ${niche}
Video Format: ${format}

Generate a viral video script and dynamic visual layout JSON for this topic.`;

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
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`AI API returned status ${response.status}: ${errText}. Using rich fallback script.`);
      return generateFallbackScript({ topic, niche, format });
    }

    const data = await response.json();
    const rawContent = data.choices[0]?.message?.content || '{}';
    
    const cleanedJsonString = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const scriptPayload = JSON.parse(cleanedJsonString);

    console.log(`✅ DeepSeek generated script: "${scriptPayload.title}" (${scriptPayload.scenes.length} distinct scenes)`);
    return scriptPayload;

  } catch (err) {
    console.error(`Error generating script from AI API: ${err.message}. Using fallback.`);
    return generateFallbackScript({ topic, niche, format });
  }
}

function generateFallbackScript({ topic, niche, format }) {
  const cleanTopic = topic || 'React Server Components vs Client Components';

  return {
    title: `${cleanTopic}`,
    hook: `Mastering ${cleanTopic} in 20 Seconds!`,
    niche: niche || "tech-explainer",
    format,
    theme: "cyber-purple",
    audioScript: `${cleanTopic} is revolutionizing how we build applications. Instead of shipping massive JavaScript bundles to the browser, server components execute directly on the edge. This drastically improves initial page load speed, slashes bundle size, and boosts lighthouse performance scores by up to 80 percent.`,
    scenes: [
      {
        id: 1,
        type: "concept_card",
        heading: cleanTopic,
        subheading: "Next-Gen Web Architecture",
        highlights: ["Zero client-side JS bundle", "Direct database access on edge", "Instant SEO & PageSpeed boost"],
        accentColor: "#a855f7",
        durationRatio: 0.33
      },
      {
        id: 2,
        type: "code",
        heading: "⚡ Production Server Component",
        subheading: "Async data fetching on edge server",
        code: `// Server Component\nasync function UserProfile({ userId }) {\n  const user = await db.users.find(userId);\n  return <Card name={user.name} />;\n}`,
        language: "typescript",
        highlights: ["No useEffect required", "Direct DB query"],
        accentColor: "#38bdf8",
        durationRatio: 0.34
      },
      {
        id: 3,
        type: "stats_highlight",
        heading: "Performance Benchmark",
        statLabel: "Bundle Size Reduction",
        statValue: "-80%",
        subheading: "Tested on high-traffic production workloads",
        accentColor: "#10b981",
        durationRatio: 0.33
      }
    ]
  };
}
