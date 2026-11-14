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
    generationRules: 'Show one emotionally legible story moment with a clear subject, visible action and specific setting. Use a deliberate camera angle, foreground framing element, detailed middle ground and atmospheric background. Keep recurring character hair, clothing, age and proportions consistent. Favor natural poses and purposeful props over glamour portraits or empty scenery.',
    negativePrompt: 'photorealistic live action, 3d render, plastic skin, generic anime portrait, character lineup, collage, split screen, text, subtitle, speech bubble, logo, watermark, blank background, extra fingers, extra limbs, fused hands, asymmetrical eyes, duplicate character, malformed anatomy, muddy colors, oversaturated neon',
    llmGuidance: 'Describe one cinematic anime story beat with the subject identity, exact action, emotional expression, meaningful prop, environment, time of day, camera framing, foreground depth and motivated lighting. Preserve recurring character traits exactly. Do not request character sheets, posters, text or generic staring-at-camera portraits.',
  },
  '2d_animation': {
    id: '2d_animation',
    label: 'Modern 2D Vector Animation (Flat Editorial)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'premium modern 2d vector animation keyframe, crisp geometric construction, clean tapered outlines, bold flat color fields, subtle gradient accents, modular editorial shapes, balanced negative space, strong silhouette design, polished broadcast motion-graphics aesthetic',
    generationRules: 'Reduce the idea to one clear visual hierarchy: dominant subject, supporting action and simplified contextual environment. Use a limited five-to-seven-color palette and large readable shapes that survive mobile viewing. Keep people stylized but anatomically coherent. Use diagrams or arrows only when the narration describes a real relationship or process.',
    negativePrompt: 'photorealistic, 3d CGI, painterly texture, rough sketch, paper grain, generic stock icon sheet, clipart collage, presentation slide, dashboard UI, text, labels, letters, logo, watermark, blank background, excessive tiny objects, extra limbs, detached hands, muddy gradients',
    llmGuidance: 'Describe a single flat-vector animation frame with one dominant subject, exact action, essential contextual objects, geometric environment, palette and clear visual hierarchy. Keep detail bold and sparse enough for mobile viewing; never request a slide full of icons or written labels.',
  },
  stickman: {
    id: 'stickman',
    label: 'Modern Editorial Stick Figures (Clean Vector)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'premium modern editorial vector illustration, precisely constructed stick-figure characters, circular heads, crisp uniform dark line weight, simple geometric hands and feet, expressive readable poses, restrained facial marks, bold flat color shapes, subtle two-tone shadows, sophisticated navy coral mustard and teal palette, clean motion-design keyframe, polished educational explainer aesthetic',
    generationRules: 'Compose one instantly readable editorial moment, not a poster or collage. Use one dominant action and one clear focal character, with at most three supporting characters. Build a purposeful geometric environment from simplified furniture, architecture, props, arrows or diagrams only when physically relevant. Preserve generous negative space for video cropping while keeping the frame visually complete. Every visible character has exactly one head, two arms and two legs; hands connect naturally to arms; props are held correctly.',
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
    generationRules: 'Render one decisive action or reaction as a borderless full-frame image, not a comic page. Use a strong diagonal composition, readable silhouette and clear depth. Keep no more than four characters and preserve their clothing and physical identifiers. Let lighting and pose carry the drama without written sound effects.',
    negativePrompt: 'photorealistic, smooth 3d render, soft airbrush, low contrast, washed-out color, multi-panel page, panel grid, border, speech bubble, caption box, written sound effect, text, logo, watermark, character lineup, blank background, chaotic hatching, extra limbs, malformed hands',
    llmGuidance: 'Describe one borderless graphic-novel frame: decisive action, dramatic camera angle, character expression, concrete setting, foreground obstruction, ink-shadow pattern and limited accent colors. Never ask for panels, bubbles, captions or written sound effects.',
  },
  watercolor: {
    id: 'watercolor',
    label: 'Expressive Watercolor (Fine-Art Narrative)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'museum-quality narrative watercolor illustration, transparent layered pigment, wet-on-wet atmospheric washes, precise dry-brush focal details, luminous reserved paper highlights, natural granulation, cold-press paper texture, elegant lost-and-found edges, restrained harmonious palette',
    generationRules: 'Keep the principal subject and action clearly recognizable while allowing edges to dissolve into atmosphere away from the focal point. Use one dominant color temperature, one contrasting accent and a believable setting. Reserve the sharpest detail for faces, hands and the story-critical object; keep splatter subtle and intentional.',
    negativePrompt: 'photorealistic photo, hard plastic 3d render, flat vector, neon digital glow, thick acrylic impasto, opaque muddy pigment, uncontrolled splatter, abstract wash with no subject, text, logo, watermark, blank composition, deformed face, extra limbs, fused hands',
    llmGuidance: 'Describe a recognizable narrative scene with subject, action, setting, emotional temperature, dominant wash colors, focal dry-brush detail and areas that softly dissolve. Do not request a vague abstract mood wash; the story action must remain clear.',
  },
  pixel_art: {
    id: 'pixel_art',
    label: '16-Bit Pixel Art (Cinematic Game Scene)',
    ideogramStyleType: 'DESIGN',
    stylePromptAnchor: 'authentic 16-bit pixel-art cinematic scene, deliberate visible pixel clusters, crisp hard edges, limited indexed color palette, hand-placed dithering, readable sprite silhouettes, tile-based environmental detail, layered parallax depth, polished retro game key art',
    generationRules: 'Choose one coherent viewpoint: side-scroller, top-down or isometric, never mix projections. Keep characters and story-critical props large enough to read at thumbnail size. Use a limited palette, consistent light direction and clean clusters; make every background object support the location or action.',
    negativePrompt: 'photograph, 3d render, smooth vector, high-resolution painting, anti-aliased edges, blurry pixels, mixed pixel sizes, voxel art, low-poly 3d, fake pixel filter, text, HUD, health bar, dialogue box, logo, watermark, noisy dithering, malformed sprite anatomy',
    llmGuidance: 'Describe one game-like narrative moment and specify side-view, top-down or isometric perspective, character action, readable prop, environment layers, light direction and limited palette. Never request HUD elements, dialogue boxes or a smooth illustration with a pixel filter.',
  },
  '3d_render': {
    id: '3d_render',
    label: 'Stylized 3D Animated Film (Warm & Expressive)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'premium stylized 3d animated feature-film frame, appealing sculpted character design, expressive facial rig and body pose, soft subsurface skin and fabric response, rich tactile materials, rounded shape language, cinematic global illumination, volumetric practical light, controlled depth of field, polished render',
    generationRules: 'Show one clear emotional action in a fully built environment with believable scale and object contact. Use an intentional lens and camera height, a strong silhouette and complementary warm/cool lighting. Keep character design consistent between scenes. Favor stylization over uncanny realism and avoid toy-like plastic surfaces.',
    negativePrompt: 'live-action photo, flat 2d drawing, low-poly game asset, wireframe, plastic toy look, uncanny realistic human, stiff T-pose, character turnaround, empty studio backdrop, text, logo, watermark, extra limbs, fused fingers, floating props, broken contact shadows, excessive bloom',
    llmGuidance: 'Describe a feature-animation story frame with exact character action and emotion, consistent design traits, tactile clothing and props, complete environment, camera height, lens feel, foreground depth and motivated warm/cool lighting. Avoid studio portraits and generic smiling poses.',
  },
  storybook: {
    id: 'storybook',
    label: 'Hand-Painted Storybook (Cozy Fable)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'timeless hand-painted storybook illustration, graceful pencil-and-ink contours, soft opaque gouache color, gently textured paper, charming expressive characters, warm naturalistic interiors and landscapes, lyrical shape design, subtle vignette, cozy luminous storytelling atmosphere, polished picture-book spread quality',
    generationRules: 'Illustrate one specific fable beat with clear character emotion, gesture and consequence. Use a fully described setting with story-relevant objects, layered depth and a warm focal light. Preserve each recurring character’s species, age, clothing and signature prop. Keep the composition cinematic rather than resembling an open book or printed page.',
    negativePrompt: 'photorealistic, 3d CGI, anime cel shading, flat corporate vector, open book mockup, page border, decorative frame, text, lettering, caption, logo, watermark, empty background, generic nursery clipart, plastic skin, distorted face, extra limbs, duplicate character',
    llmGuidance: 'Describe one warm hand-painted fable scene with character identity, exact gesture, emotional consequence, signature prop, complete environment, depth layers and focal light. Maintain recurring character details and never request an illustrated book page containing text.',
  },
  doodle_comic: {
    id: 'doodle_comic',
    label: 'Hand-Drawn Stickman Comic (Ink & Marker)',
    ideogramStyleType: 'AUTO',
    stylePromptAnchor: 'expressive hand-inked stickman webcomic illustration, lively variable-width black brush lines, charming imperfect round-headed characters, highly readable eyebrows eyes and mouth, energetic gesture drawing, hand-colored marker and gouache fills, visible crosshatching and dry-brush texture, warm off-white paper grain, selective saturated accent colors, cinematic independent-comic storytelling frame, handcrafted editorial charm',
    generationRules: 'Illustrate one cinematic story beat as a single full-frame comic image, never a multi-panel page. Use a strong foreground silhouette, a descriptive middle-ground action, and a loose but recognizable environmental background. Limit the cast to one to four distinct characters. Give recurring characters memorable accessories and consistent silhouettes. Use expressive gestures and reaction poses, controlled ink texture, and selective hatching for depth without making the drawing dirty or chaotic.',
    negativePrompt: 'photorealistic, glossy 3d render, sterile corporate vector art, flat geometric infographic, generic icon set, multi-panel comic page, panel borders, speech bubbles, text, captions, letters, words, logo, watermark, blank white void, empty background, childish scribble, shaky illegible anatomy, extra limbs, duplicate heads, detached hands, muddy colors, visual clutter',
    llmGuidance: 'Write a hand-inked narrative frame with a specific foreground action, emotional reaction, concrete props, environmental storytelling, camera angle, and selective accent colors. Describe consistent character accessories and silhouettes. Keep it a single cinematic webcomic frame; never request panels, speech bubbles, captions, or corporate vector graphics.',
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

const STYLE_ALIASES = Object.freeze({
  doodle: 'doodle_comic',
  doodle_comic: 'doodle_comic',
  doodle_art: 'doodle_comic',
  stick_figure: 'stickman',
  stickfigure: 'stickman',
  '2d': '2d_animation',
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

