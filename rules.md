# 🎬 PREMIUM SOCIAL VIDEO ENGINE — CREATIVE & PRODUCTION RULES
**Standard:** Broadcast-Quality, High-Retention Social Video (YouTube Shorts, Reels, TikTok)  
**Core Law:**  
$$\text{NARRATION} \longrightarrow \text{MEANING} \longrightarrow \text{VISUAL IDEA} \longrightarrow \text{COMPOSITION} \longrightarrow \text{MOTION} \longrightarrow \text{TRANSITION}$$  
*(Never: Narration $\rightarrow$ Generic Template $\rightarrow$ Insert Text)*

---

## 1. The Anti-AI-Slop Manifesto

Most AI-generated videos fail and get skipped within 1.5 seconds because they look like cheap templates. To achieve top 0.1% creator quality (Fireship, MagnatesMedia, Vox, Alex Hormozi), you must enforce these rules:

1. **NO "CARD-IN-A-BOX" SYNDROME:** Never place content inside a tiny floating rounded box in the middle of a dark blue void. Every visual must be full-bleed, edge-to-edge, or an intentional cinematic stage.
2. **NO ABSTRACT LOOPING BLOBS:** Do not use meaningless liquid gradients or generic particle clouds that have zero connection to the spoken words. If the voiceover mentions *inflation*, show purchasing power erosion, shopping cart prices, or Federal Reserve vaults.
3. **CONTEXTUAL VISUAL SPECIFICITY:**
   - Talking about a company? Show real archival photos, original logos, stock charts, or founder moments.
   - Talking about code? Show real production syntax typing in an actual editor with camera zoom.
   - Talking about a metric? Show a high-impact animated counter or comparative visual bar.
   - Talking about a psychology trick? Show brain pathways, human gaze heatmaps, or behavioral experiments.
4. **NO STATIC RESTING FRAMES:** Every single frame must have micro-motion. The human eye detects stillness as boring and scrolls away.

---

## 2. The 6 Universal Niche Directorial Profiles

The AI Director must adapt the entire visual language to the topic niche:

| Niche Profile | Visual Language | Color World | Key Assets |
| :--- | :--- | :--- | :--- |
| **Business & Startup Teardown** | Archival photography, corporate headquarters, balance sheets, news headlines | Obsidian Black, Electric Amber (`#f59e0b`), Slate Grey | Real news clippings, financial metrics, case-study timelines |
| **Finance, Crypto & Wealth** | Stock candlestick charts, banking vaults, inflation graphs, currency comparisons | Deep Emerald (`#052e16`), Mint Green (`#10b981`), Gold (`#fbbf24`) | Animated price growth, cash-flow diagrams, split versus cards |
| **Tech, Software & AI** | Full-bleed VS Code typing, terminal commands, architecture nodes with moving packets | Midnight Navy (`#030712`), Cyber Cyan (`#38bdf8`), Violet (`#a855f7`) | Live CLI shells, network topologies, database queries |
| **History & Documentary** | Archival museum photos, historical maps, paper parchment texture, dramatic lighting | Warm Sepia (`#1c130b`), Bronze, Muted Crimson | Real historical portraiture, territory route maps, letter artifacts |
| **Science & Deep-Dive** | 3D atomic structures, microscope photography, planetary scales, blueprints | Deep Space Blue, Neon Lime (`#a3e635`), Crisp White | Cutaway diagrams, physical simulations, telemetry readouts |
| **Psychology & Mindset** | Extreme close-up facial expressions, cognitive biases, high-contrast kinetic quotes | High-Contrast Charcoal (`#09090b`), Electric Crimson (`#f43f5e`) | Split behavioral choices, giant one-sentence statements |

---

## 3. High-Retention Narrative Pacing (The 30–40s Formula)

Every Short must follow this exact time-tested dopamine pacing curve:

```
0.0s ─── [HOOK] ─── 3.0s ─── [PROBLEM] ─── 10.0s ─── [CORE INSIGHT] ─── 25.0s ─── [EVIDENCE/NUMBERS] ─── 35.0s ─── [CTA/CLIMAX] ─── 40.0s
```

* **0.0s – 3.0s (The Thumb-Stop Hook):** Instant high-impact kinetic typography or shocking visual question. The viewer decides whether to stay within 400 milliseconds.
* **3.0s – 10.0s (The Agitation):** Why does this matter? Introduce the villain, the mistake, or the misconception.
* **10.0s – 25.0s (The Core Mechanism):** The "aha!" breakdown. Show the architecture, the psychological quirk, or the business secret.
* **25.0s – 35.0s (The Hard Proof / Metric):** Giant statistic, comparison, or tangible consequence ($100B, +500%, Single vs Multi).
* **35.0s – 40.0s (The Payoff & Loop Hook):** Seamless punchline that naturally loops back to the start.

---

## 4. Multi-Layer Audio Architecture

A video is 50% visuals and 50% audio. A voiceover alone feels dry and amateurish.

1. **Layer 1: Voiceover (Master Narration)**
   - Generated via Kokoro TTS (Crisp, high-fidelity human speech).
   - Speed: 0.92x – 1.0x (energetic, clear pronunciation).
   - Audio Level: 100% (0 dB).
2. **Layer 2: Background Music (Lo-Fi / Cinematic Synth / Cyber)**
   - Curated genre matched to the niche profile.
   - Ducked automatically during speech to **12% – 15% volume (-18 dB)** so narration cuts through like glass.
3. **Layer 3: Micro-SFX Synchronization**
   - **Transition Whoosh:** Every time the scene changes.
   - **Mechanical Keyboard Click:** As code or terminal characters appear.
   - **Sub-Bass Drop:** When a giant number, warning, or metric lands on screen.
   - **Pop/Click:** On animated subtitle keywords and bullet points.

---

## 5. Free Public Web Media Asset Pipeline

Never fail back to static grey templates. Use this 4-tier real-media sourcing pipeline:

1. **Tier 1 (Wikipedia REST API):** Instant official high-res lead photo for any historical person, company, invention, city, or event (`https://en.wikipedia.org/api/rest_v1/page/summary/{entity}`).
2. **Tier 2 (Wikimedia Commons):** Millions of public domain archival documents, scientific illustrations, and world geography.
3. **Tier 3 (Openverse CC Search):** Public Creative Commons photography database.
4. **Tier 4 (Pollinations AI 1080x1920 Generator):** Instant custom photorealistic imagery for complex conceptual scenes (e.g., *"startup founders working late surrounded by cereal boxes in 2008"*).

---

## 6. Strict LLM Director Output Schema

DeepSeek must act as an award-winning Creative Director, producing a strict JSON shot list:

```json
{
  "title": "Short Catchy Video Title",
  "niche": "business" | "finance" | "tech" | "history" | "science" | "psychology",
  "audioScript": "Complete continuous voice narration script (70-90 words, 30-40 seconds).",
  "scenes": [
    {
      "id": "scene_01",
      "type": "kinetic_hook" | "real_media" | "split_versus" | "metric_hero" | "process_flow" | "code_live" | "browser_app",
      "voiceoverSentence": "Exact narration sentence spoken during this scene.",
      "camera": { "movement": "push_in" | "pan_left" | "zoom_out" | "shake", "speed": 1.15 },
      "params": {
        "assetQuery": "exact search term for public web media",
        "imagePrompt": "photorealistic descriptive prompt for generated visual",
        "headline": "Bold on-screen text",
        "badge": "CATEGORY OR CHAPTER TAG",
        "accentColor": "#38bdf8"
      }
    }
  ]
}
```
