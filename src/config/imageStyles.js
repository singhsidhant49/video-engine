/**
 * Curated Visual Style Catalog for AI-Generated Video Images.
 * Maps high-level styles to Ideogram API parameters (style_type, style prompts, negative prompts).
 */

export const IMAGE_STYLE_CATALOG = Object.freeze({
  anime: {
    id: 'anime',
    label: 'Anime (Studio Ghibli & Makoto Shinkai)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'vibrant cel-shaded anime aesthetic, clean expressive line art, Makoto Shinkai atmospheric lighting, Studio Ghibli environmental detail, vivid colors, cinematic 8k anime keyframe',
    negativePrompt: 'photorealistic, 3d render, live action photo, muddy colors, bad anatomy, deformed eyes, watermark, text',
    llmGuidance: 'Describe emotional, cinematic anime scenes. Focus on expressive character silhouettes, dynamic sky and light rays, detailed environmental backdrops, and vibrant atmospheric color gradients.',
  },
  '2d_animation': {
    id: '2d_animation',
    label: '2D Vector Animation (Modern Flat Design)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'modern 2d flat vector animation style, bold clean geometric outlines, vibrant solid color blocks, minimalist graphic design aesthetic, sleek digital vector art, professional motion design keyframe',
    negativePrompt: 'photorealistic, textured photo, 3d CGI, complex shading, gritty, film grain, photographic, messy sketchy lines',
    llmGuidance: 'Focus on crisp geometric shapes, iconic characters or objects, uncluttered minimalist backgrounds, clear visual hierarchy, and high contrast colors.',
  },
  stickman: {
    id: 'stickman',
    label: 'Modern Illustrated Stick Figure (Explainer & Narrative)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'modern illustrated stick figure style, charming round-headed stick figure character with expressive gestures, set in a beautifully rendered colorful illustrated scene, crisp line art, clean vector comic aesthetic, rich atmospheric background',
    negativePrompt: 'photorealistic photo, realistic 3d CGI, blank white void, messy sketches, low resolution, ugly, distorted',
    llmGuidance: 'Depict expressive stick figure characters interacting with props and environments that directly illustrate the narrated concept, with clean lines and colorful cartoon background scenery.',
  },
  hyper_realistic: {
    id: 'hyper_realistic',
    label: 'Hyper-Realistic (Cinematic 35mm Photography)',
    ideogramStyleType: 'REALISTIC',
    stylePromptAnchor: 'cinematic 35mm film photography, Hasselblad portrait, ultra-detailed photorealism, natural volumetric lighting, shallow depth of field, 8k resolution, documentary authenticity, film grain',
    negativePrompt: 'cartoon, anime, 3d render, illustration, drawing, painting, oversaturated, plastic skin, distorted faces, watermark',
    llmGuidance: 'Describe tangible real-world physical subjects, authentic textures (skin pores, worn fabric, metal patina), natural lighting (golden hour, soft window light, moody shadows), and realistic camera framing.',
  },
  comic_book: {
    id: 'comic_book',
    label: 'Comic Book (Classic Graphic Novel)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'classic graphic novel comic book illustration, dynamic high-contrast angles, vintage Ben-Day dots texture, heavy ink crosshatching, bold dramatic shadows, pulp comic art, cinematic panel composition',
    negativePrompt: 'smooth 3d render, blurry, photographic, soft airbrushed, low contrast, washed out colors',
    llmGuidance: 'Emphasize dramatic perspectives (extreme low-angle, close-up crop), high-contrast chiaroscuro shadows, dynamic action silhouettes, and bold pulp graphic atmosphere.',
  },
  watercolor: {
    id: 'watercolor',
    label: 'Watercolor Painting (Artistic & Expressive)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'expressive watercolor painting, delicate pigment bleeding, wet-on-wet watercolor washes, rough cold-press paper texture, elegant splatters and soft organic edges, fine art illustration',
    negativePrompt: 'hard plastic 3d render, digital vector, photorealistic photo, neon glossy, sharp geometric lines',
    llmGuidance: 'Describe poetic, atmospheric scenes emphasizing color transitions, soft light diffusion, emotional mood, and organic fluid compositions.',
  },
  pixel_art: {
    id: 'pixel_art',
    label: 'Pixel Art (16-Bit Retro Nostalgia)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: '16-bit retro pixel art, crisp pixel grid, vibrant nostalgic color palette, detailed sprite work, classic SNES and arcade era aesthetic, clean pixel edges',
    negativePrompt: 'smooth vectors, high resolution photo, 3d realistic render, blurry anti-aliasing, painted textures',
    llmGuidance: 'Frame scenes as iconic retro game or narrative moments with clear silhouettes, isometric or cinematic side-scroller perspectives, and charming pixel-level detail.',
  },
  '3d_render': {
    id: '3d_render',
    label: '3D Animation (Pixar & Disney Style)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'modern 3d animated feature film style, Pixar and Disney aesthetic, soft subsurface scattering, warm volumetric studio lighting, rich tactile shaders, appealing character design, octane render 8k',
    negativePrompt: '2d flat cartoon, harsh photorealism, creepy uncanny valley, live action photography, low poly, wireframe',
    llmGuidance: 'Describe endearing, expressive characters, rich tactile materials (cloth, fur, wood), cinematic depth of field, and warm cinematic lighting.',
  },
  storybook: {
    id: 'storybook',
    label: '2D Storybook Animation (Cozy Hand-Drawn Fable)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'classic 2d hand-drawn storybook animated illustration, expressive Disney and Don Bluth animation style, warm glowing hearth lighting, cozy atmospheric interior, charming expressive characters, painted background, wisdom of hope moral storybook aesthetic, high quality keyframe',
    negativePrompt: 'photorealistic, 3d CGI render, live action photo, harsh plastic skin, ugly, distorted faces, watermark',
    llmGuidance: 'Describe heartwarming moral fable scenes with clear character emotions, cozy warm lighting, expressive hand gestures, and charming storybook environments that advance the story beat-by-beat.',
  },
  doodle_comic: {
    id: 'doodle_comic',
    label: 'Modern Stickman Comic (Storytelling & Explainer)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'modern animated stick figure comic style, expressive round-headed stickman characters with clean black linework and simple accessories (beanies, glasses, scarves, aprons), set in rich fully-colored detailed modern environments, warm cinematic lighting, cel-shaded architectural backgrounds, high quality webcomic keyframe aesthetic',
    negativePrompt: 'photorealistic photo, detailed realistic human face, 3d CGI render, blank white void background, empty paper background, messy scribbles, low quality, blurry, distorted anatomy, text artifacts',
    llmGuidance: 'Depict relatable narrative or educational moments with modern stick figure characters (round heads, expressive eyes, simple stick limbs with accessories like hats, scarves, glasses, or aprons). Always situate them inside a rich, fully illustrated, colored environment (e.g., city rooftop with water tower and skyline, cozy kitchen, workspace, library, or street) with warm atmospheric lighting.',
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

