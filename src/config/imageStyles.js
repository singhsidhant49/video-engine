/**
 * Curated Visual Style Catalog for AI-Generated Video Images.
 * Maps high-level styles to Ideogram API parameters (style_type, style prompts, negative prompts).
 */

export const IMAGE_STYLE_CATALOG = Object.freeze({
  anime: {
    id: 'anime',
    label: 'Anime (Studio Ghibli & Makoto Shinkai)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'vibrant cel-shaded anime aesthetic, clean expressive line art, Makoto Shinkai atmospheric lighting, Studio Ghibli detail, vivid colors, 8k anime keyframe',
    negativePrompt: 'photorealistic, 3d render, live action, photography, muddy colors, bad anatomy, deformed eyes, watermark, text',
    llmGuidance: 'Describe emotional, cinematic anime scenes. Focus on expressive character silhouettes, dynamic sky and light rays, detailed environmental backdrops, and vibrant atmospheric color gradients.',
  },
  '2d_animation': {
    id: '2d_animation',
    label: '2D Vector Animation (Modern Flat Design)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'modern 2d flat vector animation style, bold clean geometric outlines, vibrant solid color blocks, minimalist graphic design aesthetic, sleek digital vector art',
    negativePrompt: 'photorealistic, textured photo, 3d CGI, complex shading, gritty, film grain, photographic, messy sketchy lines',
    llmGuidance: 'Focus on crisp geometric shapes, iconic characters or objects, uncluttered minimalist backgrounds, clear visual hierarchy, and high contrast colors.',
  },
  stickman: {
    id: 'stickman',
    label: 'Stickman Figure (MinutePhysics & xkcd)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'minimalist hand-drawn black ink stick figure illustration, simple expressive line art characters, clean white textured paper background, whimsical educational doodle, xkcd and MinutePhysics aesthetic',
    negativePrompt: 'photorealistic, detailed anatomy, 3d render, complex shading, photographic, full color background, cluttered, dark background',
    llmGuidance: 'Depict stick figure characters with clear physical gestures (pointing, running, thinking, shrugging), simple hand-drawn props, and minimal uncluttered composition on a white or light textured page.',
  },
  hyper_realistic: {
    id: 'hyper_realistic',
    label: 'Hyper-Realistic (Cinematic 35mm Photography)',
    ideogramStyleType: 'REALISTIC',
    stylePromptAnchor: 'cinematic 35mm film photography, Hasselblad portrait, ultra-detailed photorealism, natural volumetric lighting, shallow depth of field, 8k resolution, documentary authenticity',
    negativePrompt: 'cartoon, anime, 3d render, illustration, drawing, painting, oversaturated, plastic skin, distorted faces, watermark',
    llmGuidance: 'Describe tangible real-world physical subjects, authentic textures (skin pores, worn fabric, metal patina), natural lighting (golden hour, soft window light, moody shadows), and realistic camera framing.',
  },
  comic_book: {
    id: 'comic_book',
    label: 'Comic Book (Classic Graphic Novel)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'classic graphic novel comic book illustration, dynamic high-contrast angles, vintage Ben-Day dots texture, heavy ink crosshatching, bold dramatic shadows, pulp comic art',
    negativePrompt: 'smooth 3d render, blurry, photographic, soft airbrushed, low contrast, washed out colors',
    llmGuidance: 'Emphasize dramatic perspectives (extreme low-angle, close-up crop), high-contrast chiaroscuro shadows, dynamic action silhouettes, and bold pulp graphic atmosphere.',
  },
  watercolor: {
    id: 'watercolor',
    label: 'Watercolor Painting (Artistic & Expressive)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'expressive watercolor painting, delicate pigment bleeding, wet-on-wet watercolor washes, rough cold-press paper texture, elegant splatters and soft organic edges',
    negativePrompt: 'hard plastic 3d render, digital vector, photorealistic photo, neon glossy, sharp geometric lines',
    llmGuidance: 'Describe poetic, atmospheric scenes emphasizing color transitions, soft light diffusion, emotional mood, and organic fluid compositions.',
  },
  pixel_art: {
    id: 'pixel_art',
    label: 'Pixel Art (16-Bit Retro Nostalgia)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: '16-bit retro pixel art, crisp pixel grid, vibrant nostalgic color palette, detailed sprite work, classic SNES and arcade era aesthetic',
    negativePrompt: 'smooth vectors, high resolution photo, 3d realistic render, blurry anti-aliasing, painted textures',
    llmGuidance: 'Frame scenes as iconic retro game or narrative moments with clear silhouettes, isometric or cinematic side-scroller perspectives, and charming pixel-level detail.',
  },
  '3d_render': {
    id: '3d_render',
    label: '3D Animation (Pixar & Disney Style)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'modern 3d animated feature film style, Pixar and Disney aesthetic, soft subsurface scattering, warm volumetric studio lighting, rich tactile shaders, appealing character design',
    negativePrompt: '2d flat cartoon, harsh photorealism, creepy uncanny valley, live action photography, low poly, wireframe',
    llmGuidance: 'Describe endearing, expressive characters, rich tactile materials (cloth, fur, wood), cinematic depth of field, and warm cinematic lighting.',
  },
  storybook: {
    id: 'storybook',
    label: '2D Storybook Animation (Wisdom of Hope Style)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'classic 2d hand-drawn storybook animated illustration, expressive Disney and Don Bluth animation style, warm glowing hearth lighting, cozy atmospheric interior, charming expressive characters, painted background, wisdom of hope moral storybook aesthetic, high quality keyframe',
    negativePrompt: 'photorealistic, 3d CGI render, live action photo, harsh plastic skin, ugly, distorted faces, watermark',
    llmGuidance: 'Describe heartwarming moral fable scenes with clear character emotions, cozy warm lighting, expressive hand gestures, and charming storybook environments that advance the story beat-by-beat.',
  },
  doodle_comic: {
    id: 'doodle_comic',
    label: 'Deep Thinking Doodle Comic (Psychology & Life Lessons)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'minimalist expressive comic doodle illustration, round-headed cartoon stickman characters with simple clothes and big expressive eyes, clean bold black ink lines, muted warm cream textured paper background, human deep thinking comic style, thought-provoking psychology editorial cartoon',
    negativePrompt: 'photorealistic photo, detailed realistic human face, 3d render, complex dark background, cluttered, neon colors',
    llmGuidance: 'Describe relatable psychology dilemmas, social metaphors, or emotional reflections featuring clean round-headed doodle stickman characters facing life situations, with clear gestures and minimal props.',
  },
  custom: {
    id: 'custom',
    label: 'Custom Style Prompt',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: '',
    negativePrompt: 'blurry, watermark, low quality, distorted, extra limbs, ugly',
    llmGuidance: 'Adhere closely to the user-provided custom artistic style instruction across all scene descriptions.',
  },
});

export const DEFAULT_IMAGE_STYLE = 'anime';

export function getImageStyle(styleId = DEFAULT_IMAGE_STYLE) {
  const normalized = String(styleId || DEFAULT_IMAGE_STYLE).trim().toLowerCase();
  return IMAGE_STYLE_CATALOG[normalized] || IMAGE_STYLE_CATALOG[DEFAULT_IMAGE_STYLE];
}

export function listSupportedImageStyles() {
  return Object.values(IMAGE_STYLE_CATALOG).map((s) => ({
    id: s.id,
    label: s.label,
    ideogramStyleType: s.ideogramStyleType,
  }));
}

/**
 * Builds the complete prompt sent to Ideogram by combining:
 * 1. The scene visual prompt authored by the LLM
 * 2. The style anchor prompt
 * 3. Optional user custom style override
 */
export function buildFullIdeogramPrompt({ prompt, styleId = DEFAULT_IMAGE_STYLE, customStylePrompt = '' }) {
  const style = getImageStyle(styleId);
  const basePrompt = String(prompt || '').trim();
  const styleAnchor = (styleId === 'custom' && customStylePrompt)
    ? customStylePrompt.trim()
    : (style?.stylePromptAnchor || '');

  if (!styleAnchor) return basePrompt;
  if (!basePrompt) return styleAnchor;

  // Combine cleanly without redundant periods
  const cleanBase = basePrompt.replace(/[.,\s]+$/, '');
  return `${cleanBase}, ${styleAnchor}.`;
}

