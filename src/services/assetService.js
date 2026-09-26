import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * Universal Media Asset Engine.
 * Fetches high-resolution 1080x1920 visuals for ANY topic:
 * 1. Pexels API (if PEXELS_API_KEY is present)
 * 2. Unsplash high-res photography
 * 3. Instant AI Photorealistic Generation (Pollinations 1080x1920)
 * Saves all media locally to public/media for fast offline Remotion rendering.
 */
export async function fetchAndCacheAsset(scene, index = 0) {
  const mediaDir = path.join(config.publicDir, 'media');
  await fs.mkdir(mediaDir, { recursive: true });

  const query = scene.params?.assetQuery || scene.params?.imagePrompt || scene.voiceoverSentence || 'cinematic business technology';
  const cleanFilename = `scene_${index}_${Date.now()}.jpg`;
  const localFilePath = path.join(mediaDir, cleanFilename);
  const publicUrl = `/media/${cleanFilename}`;

  console.log(`🖼️  Asset Engine: Fetching visual media for [${scene.type}] -> "${query.slice(0, 45)}..."`);

  // Source 1: Check Pexels if API key provided
  const pexelsKey = process.env.PEXELS_API_KEY || '';
  if (pexelsKey) {
    try {
      const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`, {
        headers: { Authorization: pexelsKey }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.photos && data.photos.length > 0) {
          const imgUrl = data.photos[0].src.large2x || data.photos[0].src.portrait;
          const imgRes = await fetch(imgUrl);
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            await fs.writeFile(localFilePath, buffer);
            console.log(`✅ Pexels image cached: ${cleanFilename}`);
            return { url: publicUrl, localPath: localFilePath };
          }
        }
      }
    } catch (err) {
      console.warn(`Pexels fetch failed: ${err.message}`);
    }
  }

  // Source 2: Instant High-Res Visual Generation for ANY niche
  // (Generates crisp 1080x1920 photorealistic visuals without requiring API keys)
  try {
    const aiPrompt = encodeURIComponent(`cinematic photorealistic 8k, dramatic lighting, high quality, ${query}`);
    const aiUrl = `https://image.pollinations.ai/prompt/${aiPrompt}?width=1080&height=1920&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

    const res = await fetch(aiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 5000) {
        await fs.writeFile(localFilePath, buffer);
        console.log(`✅ High-Res Photorealistic Visual Generated & Cached: ${cleanFilename}`);
        return { url: publicUrl, localPath: localFilePath };
      }
    }
  } catch (err) {
    console.warn(`Instant visual generation timed out (${err.message}). Using curated fallback.`);
  }

  // Source 3: Curated High-Definition Topic-Specific Fallback Library
  const curatedLibrary = [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1080&auto=format&fit=crop', // Abstract Fluid Neon
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1080&auto=format&fit=crop', // High Tech Servers
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1080&auto=format&fit=crop', // Cyber Code
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?q=80&w=1080&auto=format&fit=crop', // Financial Stock Market
    'https://images.unsplash.com/photo-1507668077129-56e32842fceb?q=80&w=1080&auto=format&fit=crop', // AI Neural Network
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=1080&auto=format&fit=crop', // Earth from Space
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1080&auto=format&fit=crop', // Modern Office Startup
  ];

  const hash = (query.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + index) % curatedLibrary.length;
  const fallbackUrl = curatedLibrary[hash];

  try {
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const buffer = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(localFilePath, buffer);
      return { url: publicUrl, localPath: localFilePath };
    }
  } catch (e) {
    // If offline, return fallback URL directly
  }

  return { url: fallbackUrl };
}
