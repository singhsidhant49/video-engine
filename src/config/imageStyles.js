/**
 * Curated Visual Style Catalog for AI-Generated Video Images.
 * Maps high-level styles to Ideogram API parameters (style_type, style prompts, negative prompts).
 */

export const IMAGE_STYLE_CATALOG = Object.freeze({
  anime: {
    id: 'anime',
    label: 'Cinematic Anime (Painted Environments)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'premium cinematic anime film keyframe, confident clean cel linework, expressive but anatomically coherent characters, hand-painted environmental detail, layered atmospheric perspective, natural fabric folds, controlled color scripting, luminous rim light, soft volumetric sky light, polished feature-animation finish',
    generationRules: 'Show one emotionally legible story moment with a clear subject, visible action and specific setting. Show the exact physical action and objects mentioned in narration. Use a deliberate camera angle, foreground framing element, detailed middle ground and atmospheric background. Keep recurring character hair, clothing, age and proportions consistent. Favor natural poses and purposeful props over glamour portraits or empty scenery.',
    negativePrompt: 'photorealistic live action, 3d render, plastic skin, generic anime portrait, character lineup, collage, split screen, text, subtitle, speech bubble, logo, watermark, blank background, extra fingers, extra limbs, fused hands, asymmetrical eyes, duplicate character, malformed anatomy, muddy colors, oversaturated neon',
    llmGuidance: 'Describe one cinematic anime story beat with the subject identity, exact action, emotional expression, meaningful prop, environment, time of day, camera framing, foreground depth and motivated lighting. Preserve recurring character traits exactly. Do not request character sheets, posters, text or generic staring-at-camera portraits.',
  },
  stickman: {
    id: 'stickman',
    label: 'Modern Editorial Stick Figures (Clean Vector)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'premium modern editorial vector illustration, precisely constructed stick-figure characters, circular heads, crisp uniform dark line weight, simple geometric hands and feet, expressive readable poses, restrained facial marks, bold flat color shapes, subtle two-tone shadows, sophisticated navy coral mustard and teal palette, clean motion-design keyframe, polished educational explainer aesthetic',
    generationRules: 'Compose one instantly readable editorial moment, not a poster or collage. Show the exact physical action and props mentioned in narration. Use one dominant action and one clear focal character, with at most three supporting characters. Build a purposeful geometric environment from simplified furniture, architecture, props, arrows or diagrams only when physically relevant. Preserve generous negative space for video cropping while keeping the frame visually complete. Every visible character has exactly one head, two arms and two legs; hands connect naturally to arms; props are held correctly.',
    negativePrompt: 'photorealistic, 3d CGI, hand-drawn doodle, rough pencil, ink wash, halftone dots, paper texture, comic panels, speech bubbles, captions, letters, words, logo, watermark, blank white background, clipart, childish classroom drawing, extra limbs, detached hands, duplicate people, malformed anatomy, clutter',
    llmGuidance: 'Write a clean editorial-vector scene: identify one focal character, one visible action, the essential prop, a simplified but meaningful environment, camera framing, and a restrained palette. Characters use precise geometric stick anatomy and readable body language. Avoid comic panels, handwritten marks, atmospheric painterly language, and generic decorative backgrounds.',
  },
  hyper_realistic: {
    id: 'hyper_realistic',
    label: 'Cinematic Photorealism (35mm Documentary)',
    ideogramStyleType: 'REALISTIC',
    stylePromptAnchor: 'cinematic 35mm documentary photography, physically plausible real-world scene, authentic skin fabric wood glass and metal texture, natural practical lighting, controlled highlight rolloff, subtle film grain, realistic depth of field, observational composition, premium color grade, high-detail editorial still',
    generationRules: 'Stage a credible candid moment that could have been photographed at a real location. Specify subject, action, environment, time, weather or practical light, lens distance and focus plane. Keep faces, hands, reflections, scale and object interaction physically correct. Avoid symbolic fantasy unless the topic explicitly requires it.',
    negativePrompt: 'cartoon, anime, illustration, painting, 3d render, CGI, surreal composite, impossible lighting, beauty-ad pose, generic smiling stock photo, waxy skin, excessive HDR, oversaturation, text, logo, watermark, extra fingers, fused hands, duplicate person, distorted face, floating objects, incorrect reflections',
    llmGuidance: 'Describe a photographable documentary moment using concrete people, actions, objects and location details. Include time of day, practical light source, camera distance, lens character and focus subject. Prefer candid physical interaction over posed stock imagery or abstract symbolism.',
  },
  comic_book: {
    id: 'comic_book',
    label: 'Graphic Novel (Bold Ink & Halftone)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'premium graphic novel single-frame illustration, bold confident brush ink, controlled crosshatching, selective halftone texture, dramatic chiaroscuro shadows, angular silhouettes, limited high-impact color accents, dynamic cinematic perspective, polished sequential-art finish',
    generationRules: 'Render one decisive action or reaction as a borderless full-frame image, not a comic page. Show the exact physical action and objects mentioned in narration. Use a strong diagonal composition, readable silhouette and clear depth. Keep no more than four characters and preserve their clothing and physical identifiers. Let lighting and pose carry the drama without written sound effects.',
    negativePrompt: 'photorealistic, smooth 3d render, soft airbrush, low contrast, washed-out color, multi-panel page, panel grid, border, speech bubble, caption box, written sound effect, text, logo, watermark, character lineup, blank background, chaotic hatching, extra limbs, malformed hands',
    llmGuidance: 'Describe one borderless graphic-novel frame: decisive action, dramatic camera angle, character expression, concrete setting, foreground obstruction, ink-shadow pattern and limited accent colors. Never ask for panels, bubbles, captions or written sound effects.',
  },
  '3d_render': {
    id: '3d_render',
    label: 'Stylized 3D Animated Film (Warm & Expressive)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'premium stylized 3d animated feature-film frame, appealing sculpted character design, expressive facial rig and body pose, soft subsurface skin and fabric response, rich tactile materials, rounded shape language, cinematic global illumination, volumetric practical light, controlled depth of field, polished render',
    generationRules: 'Show one clear emotional action in a fully built environment with believable scale and object contact. Show the exact physical action and objects mentioned in narration. Use an intentional lens and camera height, a strong silhouette and complementary warm/cool lighting. Keep character design consistent between scenes. Favor stylization over uncanny realism and avoid toy-like plastic surfaces.',
    negativePrompt: 'live-action photo, flat 2d drawing, low-poly game asset, wireframe, plastic toy look, uncanny realistic human, stiff T-pose, character turnaround, empty studio backdrop, text, logo, watermark, extra limbs, fused fingers, floating props, broken contact shadows, excessive bloom',
    llmGuidance: 'Describe a feature-animation story frame with exact character action and emotion, consistent design traits, tactile clothing and props, complete environment, camera height, lens feel, foreground depth and motivated warm/cool lighting. Avoid studio portraits and generic smiling poses.',
  },
  custom: {
    id: 'custom',
    label: 'Custom Style Prompt',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: '',
    generationRules: 'Follow the user style instruction consistently while still producing one coherent cinematic scene with a clear focal subject, visible action, complete setting, foreground-to-background depth and format-safe composition. Preserve recurring character and location identifiers across scenes.',
    negativePrompt: 'blurry, low quality, generic stock composition, collage, split screen, text, subtitle, logo, watermark, blank background, distorted face, extra limbs, fused hands, duplicate subject, inconsistent perspective',
    llmGuidance: 'Adhere closely to the custom style while describing a concrete subject, action, setting, camera framing, lighting and continuity identifiers. Do not let the custom style replace the actual story content or produce text and collage artifacts.',
  },
});

export const DEFAULT_IMAGE_STYLE = 'anime';

export const STYLE_ALIASES = Object.freeze({
  doodle: 'stickman',
  doodle_comic: 'stickman',
  doodle_art: 'stickman',
  stick_figure: 'stickman',
  stickfigure: 'stickman',
  '2d': 'stickman',
  '2d_animation': 'stickman',
  vector: 'stickman',
  editorial: 'stickman',
  watercolor: 'anime',
  storybook: '3d_render',
  pixel_art: 'comic_book',
  pixel: 'comic_book',
  '3d': '3d_render',
  realistic: 'hyper_realistic',
  comic: 'comic_book',
  ghibli: 'anime',
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

