/**
 * Curated Visual Style Catalog for AI-Generated Video Images.
 * Maps high-level styles to Ideogram API parameters (style_type, style prompts, negative prompts)
 * and FLUX.1 Schnell prompts on Replicate.
 */

export const IMAGE_STYLE_CATALOG = Object.freeze({
  cinematic_documentary: {
    id: 'cinematic_documentary',
    label: 'Cinematic Documentary (35mm Photography)',
    ideogramStyleType: 'REALISTIC',
    description: 'Photorealistic photography, 35mm film aesthetic, natural light, realistic environments and cinematic compositions.',
    bestFor: 'Business stories, history, technology, science, real-world case studies',
    defaultEngine: 'flux',
    defaultModel: 'black-forest-labs/flux-schnell',
    stylePromptAnchor: 'cinematic 35mm documentary photography, authentic real-world scene, realistic natural lighting, practical light sources, authentic textures and materials, subtle film grain, realistic depth of field, observational composition, premium cinematic color grade, high-detail editorial still',
    generationRules: 'Stage a credible candid moment that could have been photographed at a real location. Specify subject, action, environment, time, weather or practical light, lens distance and focus plane. Keep faces, hands, reflections, scale and object interaction physically correct. Avoid symbolic fantasy unless the topic explicitly requires it.',
    negativePrompt: 'cartoon, anime, illustration, painting, 3d render, CGI, surreal composite, impossible lighting, beauty-ad pose, generic smiling stock photo, waxy skin, excessive HDR, oversaturation, text, logo, watermark, extra fingers, fused hands, duplicate person, distorted face, floating objects, incorrect reflections',
    llmGuidance: 'Describe a photographable documentary moment using concrete people, actions, objects and location details. Include time of day, practical light source, camera distance, lens character and focus subject. Prefer candid physical interaction over posed stock imagery or abstract symbolism.',
  },
  dark_noir: {
    id: 'dark_noir',
    label: 'Dark Investigative Noir (Chiaroscuro & Suspense)',
    ideogramStyleType: 'REALISTIC',
    description: 'Deep shadows, dramatic chiaroscuro lighting, muted desaturated colors, suspenseful atmosphere and high contrast.',
    bestFor: 'Corporate scandals, psychological mysteries, horror, true crime and business failures',
    defaultEngine: 'flux',
    defaultModel: 'black-forest-labs/flux-schnell',
    stylePromptAnchor: 'cinematic dark investigative noir, intense chiaroscuro lighting, deep shadows, dramatic rim light cutting through haze, muted desaturated cinematic color palette, moody atmosphere, subtle volumetric smoke and fog, anamorphic lens bokeh, high-contrast tension, dramatic corporate mystery aesthetic',
    generationRules: 'Stage a high-tension investigative scene with intense atmospheric contrast. Emphasize shadow geometry, dramatic edge lighting, and cinematic framing. Show specific narrative actions, documents, technology, or environments that evoke corporate mystery or high-stakes investigation. Maintain realistic physical scale and avoid flat, evenly lit compositions.',
    negativePrompt: 'bright daylight, sunny day, cheery flat lighting, pastel colors, oversaturated neon, cartoon, 3d render, smiling happy stock photo, generic studio portrait, flat background, text, watermark, logo, deformed limbs, blurry',
    llmGuidance: 'Describe a dramatic investigative scene with deep shadow contrast, motivated low-key lighting, specific environmental details (such as dimly lit offices, server rooms, evidence tables, or rainy night streets), and intense character posture. Avoid bright daylight, cheerful elements, or decorative clutter.',
  },
  editorial_vector: {
    id: 'editorial_vector',
    label: 'Modern Editorial Vector (Clean 2D Graphics)',
    ideogramStyleType: 'DESIGN',
    description: 'Clean geometric shapes, premium color palettes, strong visual metaphors and sophisticated 2D publication illustration.',
    bestFor: 'Finance, AI, technology, productivity, science and educational explainers',
    defaultEngine: 'ideogram',
    defaultModel: 'p-image-ideogram',
    stylePromptAnchor: 'premium modern editorial vector illustration, sophisticated flat geometric shapes, intelligent visual metaphor, restrained contemporary color palette with navy cream teal and coral accents, subtle paper screen-print texture, Swiss design layout hierarchy, clean motion-design keyframe, polished educational publication finish',
    generationRules: 'Compose one instantly readable editorial graphic with a powerful visual metaphor. Use clean geometric silhouettes, purposeful flat color planes, and clear focal hierarchy. Avoid literal photographic clutter or gratuitous 3D bevels. Ensure generous breathing room and balanced negative space suitable for video composition.',
    negativePrompt: 'photorealistic, 3d CGI render, glossy reflections, bevels, drop shadows, hand-drawn doodle, rough pencil sketch, childish scribble, messy brush strokes, clipart, generic corporate stock illustration, text, logo, watermark, extra limbs, chaotic layout',
    llmGuidance: 'Author a sophisticated editorial vector visual using an intelligent visual metaphor for the narration beat. Specify key geometric shapes, visual symbolism, a restrained contemporary color palette, and clear composition hierarchy. Avoid literal photography, 3D effects, or cluttered layouts.',
  },
  stickman: {
    id: 'stickman',
    label: 'Modern Stickman Storytelling (Minimalist & Conceptual)',
    ideogramStyleType: 'DESIGN',
    description: 'Expressive stick-figure characters, minimalist environments, conceptual symbolism and cinematic framing. Not children\'s whiteboard drawings.',
    bestFor: 'Psychology, human behavior, stoicism, self-improvement and emotional storytelling',
    defaultEngine: 'ideogram',
    defaultModel: 'p-image-ideogram',
    stylePromptAnchor: 'sophisticated minimalist stick-figure storytelling illustration, precisely constructed expressive stick character with circular head and uniform dark line weight, intelligent conceptual symbolism, dark moody or duotone matte background, cinematic wide-angle framing, thoughtful body language, mature philosophy and psychology explainer aesthetic',
    generationRules: 'Compose one instantly readable conceptual moment. Show the exact physical action and props mentioned in narration. Use one dominant action and one clear focal character. Build a purposeful geometric environment from simplified props or diagrams only when relevant. Every visible character has exactly one head, two arms and two legs; hands connect naturally to arms; props are held correctly.',
    negativePrompt: 'children crayon drawing, lined notebook paper, messy whiteboard scribble, rough pencil doodle, generic clipart, colorful cartoon, 3d render, photorealism, smiling stickman clipart, letters, numbers, text, logo, watermark, extra limbs, detached hands, chaotic mess',
    llmGuidance: 'Write a clean minimalist stick-figure scene: identify one focal character, one visible action, an essential conceptual prop, and a simplified matte background with cinematic framing. Characters use precise uniform linework and readable body language. Avoid comic panels, whiteboard scribbles, and generic decorative backgrounds.',
  },
  '3d_render': {
    id: '3d_render',
    label: 'Stylized 3D Animation (Warm & Expressive)',
    ideogramStyleType: 'AUTO',
    description: 'Expressive characters, tactile materials, soft lighting, vibrant depth and cinematic feature-animation appeal.',
    bestFor: 'Approaching complex topics playfully, storytelling, tech explainers and character journeys',
    defaultEngine: 'flux',
    defaultModel: 'black-forest-labs/flux-schnell',
    stylePromptAnchor: 'premium stylized 3d animated feature-film frame, appealing sculpted character design, expressive facial rig and body pose, soft subsurface skin and tactile fabric materials, rounded friendly shape language, cinematic global illumination, warm key light with soft fill, controlled depth of field, polished modern feature animation render',
    generationRules: 'Show one clear emotional action in a fully built environment with believable scale and object contact. Show the exact physical action and objects mentioned in narration. Use an intentional lens and camera height, a strong silhouette and complementary warm/cool lighting. Keep character design consistent between scenes. Favor stylization over uncanny realism and avoid toy-like plastic surfaces.',
    negativePrompt: 'live-action photo, flat 2d drawing, low-poly game asset, wireframe, plastic toy look, uncanny realistic human, stiff T-pose, character turnaround, empty studio backdrop, text, logo, watermark, extra limbs, fused fingers, floating props, broken contact shadows, excessive bloom',
    llmGuidance: 'Describe a feature-animation story frame with exact character action and emotion, consistent design traits, tactile clothing and props, complete environment, camera height, lens feel, foreground depth and motivated warm/cool lighting. Avoid studio portraits and generic smiling poses.',
  },
  anime: {
    id: 'anime',
    label: 'Cinematic Anime (Atmospheric Lighting)',
    ideogramStyleType: 'AUTO',
    description: 'Japanese animation aesthetic, dramatic lighting, detailed background art and emotional depth.',
    bestFor: 'Narrative storytelling, philosophical video essays, high-drama explainers and gaming lore',
    defaultEngine: 'flux',
    defaultModel: 'black-forest-labs/flux-schnell',
    stylePromptAnchor: 'premium cinematic anime film keyframe, confident clean cel linework, expressive but anatomically coherent characters, hand-painted environmental detail, layered atmospheric perspective, natural fabric folds, controlled color scripting, luminous rim light, soft volumetric sky light, polished feature-animation finish',
    generationRules: 'Show one emotionally legible story moment with a clear subject, visible action and specific setting. Show the exact physical action and objects mentioned in narration. Use a deliberate camera angle, foreground framing element, detailed middle ground and atmospheric background. Keep recurring character hair, clothing, age and proportions consistent. Favor natural poses and purposeful props over glamour portraits or empty scenery.',
    negativePrompt: 'photorealistic live action, 3d render, plastic skin, generic anime portrait, character lineup, collage, split screen, text, subtitle, speech bubble, logo, watermark, blank background, extra fingers, extra limbs, fused hands, asymmetrical eyes, duplicate character, malformed anatomy, muddy colors, oversaturated neon',
    llmGuidance: 'Describe one cinematic anime story beat with the subject identity, exact action, emotional expression, meaningful prop, environment, time of day, camera framing, foreground depth and motivated lighting. Preserve recurring character traits exactly. Do not request character sheets, posters, text or generic staring-at-camera portraits.',
  },
  custom: {
    id: 'custom',
    label: 'Custom Brand Style (Prompt-Driven)',
    ideogramStyleType: 'AUTO',
    description: 'Fully customized visual language defined by your own art direction prompt.',
    bestFor: 'Unique channel branding, signature creator aesthetics, bespoke art styles',
    defaultEngine: 'flux',
    defaultModel: 'black-forest-labs/flux-schnell',
    stylePromptAnchor: '',
    generationRules: 'Follow the user style instruction consistently while still producing one coherent cinematic scene with a clear focal subject, visible action, complete setting, foreground-to-background depth and format-safe composition. Preserve recurring character and location identifiers across scenes.',
    negativePrompt: 'blurry, low quality, generic stock composition, collage, split screen, text, subtitle, logo, watermark, blank background, distorted face, extra limbs, fused hands, duplicate subject, inconsistent perspective',
    llmGuidance: 'Adhere closely to the custom style while describing a concrete subject, action, setting, camera framing, lighting and continuity identifiers. Do not let the custom style replace the actual story content or produce text and collage artifacts.',
  },
});

export const DEFAULT_IMAGE_STYLE = 'cinematic_documentary';

export const STYLE_ALIASES = Object.freeze({
  hyper_realistic: 'cinematic_documentary',
  realistic: 'cinematic_documentary',
  documentary: 'cinematic_documentary',
  cinematic: 'cinematic_documentary',
  noir: 'dark_noir',
  dark: 'dark_noir',
  investigative: 'dark_noir',
  investigative_noir: 'dark_noir',
  crime: 'dark_noir',
  comic_book: 'dark_noir',
  comic: 'dark_noir',
  graphic_novel: 'dark_noir',
  vector: 'editorial_vector',
  editorial: 'editorial_vector',
  flat_vector: 'editorial_vector',
  infographic: 'editorial_vector',
  doodle: 'stickman',
  doodle_comic: 'stickman',
  doodle_art: 'stickman',
  stick_figure: 'stickman',
  stickfigure: 'stickman',
  '2d': 'stickman',
  '2d_animation': 'stickman',
  watercolor: 'anime',
  storybook: '3d_render',
  pixel_art: 'editorial_vector',
  pixel: 'editorial_vector',
  '3d': '3d_render',
  stylized_3d: '3d_render',
  ghibli: 'anime',
  cinematic_anime: 'anime',
  custom_style: 'custom',
  brand: 'custom',
});

export function getImageStyle(styleId = DEFAULT_IMAGE_STYLE) {
  const raw = String(styleId || DEFAULT_IMAGE_STYLE).trim().toLowerCase();
  const normalized = STYLE_ALIASES[raw] || raw;
  return IMAGE_STYLE_CATALOG[normalized] || IMAGE_STYLE_CATALOG[DEFAULT_IMAGE_STYLE];
}

export function listSupportedImageStyles() {
  return Object.values(IMAGE_STYLE_CATALOG).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description || '',
    bestFor: s.bestFor || '',
    defaultEngine: s.defaultEngine || 'flux',
    defaultModel: s.defaultModel || 'black-forest-labs/flux-schnell',
    ideogramStyleType: s.ideogramStyleType,
  }));
}

/**
 * Builds the complete prompt sent to Ideogram by combining:
 * 1. The scene visual prompt authored by the LLM
 * 2. The style anchor prompt
 * 3. Optional user custom style override
 */
export function buildFullIdeogramPrompt({ prompt, styleId = DEFAULT_IMAGE_STYLE, customStylePrompt = '', format = 'landscape' }) {
  const style = getImageStyle(styleId);
  const basePrompt = String(prompt || '').trim();
  const styleAnchor = (styleId === 'custom' && customStylePrompt)
    ? customStylePrompt.trim()
    : (style?.stylePromptAnchor || '');

  const generationRules = style?.generationRules || '';
  const frameRule = format === 'shorts'
    ? 'Vertical 9:16 composition, keep the focal action and all important faces inside the central safe area, use foreground-to-background depth.'
    : 'Horizontal 16:9 cinematic composition, use foreground-to-background depth and keep the focal action inside the center-safe region.';

  if (!styleAnchor) return [basePrompt, frameRule].filter(Boolean).join('. ');
  if (!basePrompt) return [styleAnchor, generationRules, frameRule].filter(Boolean).join('. ');

  // Combine cleanly without redundant periods
  const cleanBase = basePrompt.replace(/[.,\s]+$/, '');
  return [
    `${cleanBase}. Art direction: ${styleAnchor}`,
    generationRules ? `Composition contract: ${generationRules}` : '',
    frameRule,
    style?.negativePrompt ? `Exclude: ${style.negativePrompt}` : '',
  ].filter(Boolean).join('. ');
}

/** FLUX Schnell follows concise natural-language scene descriptions more
 * reliably than long negative-prompt blocks. Keep subject/action first, then
 * art direction and composition, with a short artifact guard at the end. */
export function buildFluxPrompt({ prompt, styleId = DEFAULT_IMAGE_STYLE, customStylePrompt = '', format = 'landscape' }) {
  const style = getImageStyle(styleId);
  const scene = String(prompt || '').replace(/\s+/g, ' ').trim().replace(/[.,\s]+$/, '');
  const artDirection = styleId === 'custom' && customStylePrompt
    ? String(customStylePrompt).replace(/\s+/g, ' ').trim()
    : style.stylePromptAnchor;
  const frame = format === 'shorts'
    ? 'Vertical 9:16 cinematic frame; one dominant focal subject; important face, hands, and action inside the central mobile-safe area; foreground, middle ground, and background depth'
    : 'Horizontal 16:9 cinematic frame; one dominant focal subject; clear readable action; layered foreground, middle ground, and background; center-safe composition';
  return [
    scene ? `Scene: ${scene}` : 'Scene: one clear narrative action in a specific environment',
    artDirection ? `Visual language: ${artDirection}` : '',
    `Composition: ${frame}`,
    'Continuity: coherent anatomy, physically connected hands and props, consistent lighting and perspective',
    'Clean image only: no words, captions, logos, watermarks, collage, split screen, poster layout, or decorative border',
  ].filter(Boolean).join('. ').slice(0, 2200);
}
