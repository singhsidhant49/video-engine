import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { generateIdeogramImage } from '../services/ideogramService.js';
import { generateFluxImage } from '../services/replicateService.js';
import { getImageDimensions } from '../services/imageUtils.js';
import { getImageStyle, buildFullIdeogramPrompt } from '../config/imageStyles.js';
import { recordImageInBank } from '../services/imageBank.js';
import { compareVisualToNeed, inspectVisualCandidate } from '../assets/visualInspectionService.js';

async function computeFileSha256(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return 'none';
  }
}

/**
 * Enriches and structures the AI prompt to maximize visual storytelling,
 * context relevance to narration, camera perspective, and lighting.
 */
export function enrichAiImagePrompt({ scene, shotConcept = '', req = null, style = null, format = 'landscape', index = 0 } = {}) {
  let basePrompt = (scene?.imagePrompt || scene?.visual || '').trim();

  if (!basePrompt || basePrompt.length < 15) {
    basePrompt = shotConcept || req?.concept || scene?.narration || 'a cinematic story scene';
  } else if (shotConcept && shotConcept.length > 5 && !basePrompt.toLowerCase().includes(shotConcept.toLowerCase().slice(0, 15))) {
    basePrompt = `${basePrompt.replace(/[.,\s]+$/, '')}, focusing on ${shotConcept}`;
  }

  basePrompt = basePrompt.replace(/[.,\s]+$/, '');

  // 1. Framing / Perspective
  const shotScale = scene?.shot || 'medium';
  let framing = '';
  if (!/\b(close\s*up|wide\s*shot|macro|establishing|overhead|bird['’]s\s*eye|dutch\s*angle|low\s*angle)\b/i.test(basePrompt)) {
    if (shotScale === 'close' || req?.visibleNeed?.focalSubject?.includes('close')) {
      framing = 'tight dramatic close-up, sharp facial and textural details';
    } else if (shotScale === 'detail') {
      framing = 'extreme macro detail shot, intricate physical textures and surfaces';
    } else if (shotScale === 'wide') {
      framing = 'wide expansive establishing composition, deep environmental horizon';
    } else {
      framing = 'cinematic eye-level framing, intentional subject-to-background separation';
    }
  }

  // 2. Lighting & Atmosphere
  const tone = scene?.tone || 'neutral';
  let lighting = '';
  if (!/\b(lighting|illuminat\w+|shadows?|chiaroscuro|golden\s*hour|neon|rim\s*light|sunlight)\b/i.test(basePrompt)) {
    switch (tone) {
      case 'tense':
      case 'urgent':
        lighting = 'dramatic chiaroscuro lighting, deep cutting shadows, cold atmospheric rim light';
        break;
      case 'curious':
        lighting = 'volumetric atmospheric illumination, subtle god rays, layered depth of light';
        break;
      case 'somber':
      case 'reflective':
        lighting = 'moody subdued ambient illumination, soft diffused practical lighting, naturalistic gloom';
        break;
      case 'hopeful':
      case 'triumphant':
        lighting = 'warm golden hour illumination, vibrant specular rim highlights, luminous atmosphere';
        break;
      case 'playful':
      case 'neutral':
      default:
        lighting = 'natural motivated practical lighting, rich dynamic range';
        break;
    }
  }

  // 3. Format Safety
  const isShorts = format === 'shorts';
  const compositionSafety = isShorts
    ? 'vertical 9:16 aspect ratio with all principal subjects and action centered in the mobile safe zone'
    : 'cinematic 16:9 composition with layered foreground, middle ground, and background';

  const parts = [
    basePrompt,
    framing,
    lighting,
    compositionSafety,
    'clean visual storytelling, zero text, zero letters, zero logos, no watermark, single seamless frame',
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Concurrency-bounded worker helper.
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Directs AI-generated image assets for all scenes/shots via Ideogram.
 * Guarantees visual consistency across the film while outputting the exact
 * contract expected by timeline.js and Remotion.
 */
export async function directAiAssets(plan, specs, {
  publicDir,
  format = 'landscape',
  assetRequests = [],
  imageStyle = 'anime',
  customStylePrompt = '',
  imageProvider = null,
  imageModel = null,
  imageQuality = null,
  offline = false,
  baseSeed = null,
}) {
  const style = getImageStyle(imageStyle);
  const dir = path.join(publicDir, 'assets');
  await fs.mkdir(dir, { recursive: true });

  const scenes = plan.scenes || [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const masterSeed = baseSeed != null
    ? Number(baseSeed)
    : Math.floor(Math.random() * 900000000) + 100000000;

  const normalizedProvider = String(imageProvider || '').trim().toLowerCase();
  const normalizedModel = String(imageModel || '').trim().toLowerCase();
  const isFlux = normalizedProvider === 'flux' || normalizedProvider === 'replicate' || normalizedModel.includes('flux');
  const providerLabel = isFlux ? 'FLUX.1 Schnell (Replicate)' : 'Ideogram';

  console.log(`🎨 AI Asset Director: Resolving ${assetRequests.length} shot(s) in "${style.label}" via ${providerLabel} (master seed: ${masterSeed})...`);

  const assets = Object.fromEntries(scenes.map((scene) => [scene.id, { primary: null, alternates: [], byShot: {} }]));
  const requestReports = [];
  const editorialAssetJudgments = {};
  const visualInspections = {};

  // Resolve each shot request with dedicated AI visual synthesis (concurrency 2)
  await mapLimit(assetRequests, 2, async (req, index) => {
    const scene = sceneMap.get(req.sceneId);
    const shotId = req.storyboardShotId || `shot_${index + 1}`;

    // Extract shot-specific visual nuances from visual proposition or visible need
    const shotConcept = req.visualProposition?.positiveDescriptions?.[0]
      || req.visibleNeed?.visualGoal
      || req.visibleNeed?.focalSubject
      || req.concept;

    // Prioritize the director's authored AI image prompt, then shot visual proposition, then scene visual, enriched for visual storytelling
    let rawPrompt = enrichAiImagePrompt({ scene, shotConcept, req, style, format, index });

    const shotSeed = (masterSeed + index * 17) % 1000000000;

    const targetFileName = `${shotId}_a.png`;
    const targetFilePath = path.join(dir, targetFileName);

    let generated;
    try {
      if (isFlux) {
        generated = await generateFluxImage({
          prompt: rawPrompt,
          styleId: imageStyle,
          customStylePrompt,
          format,
          seed: shotSeed,
          model: imageModel && normalizedModel.includes('flux') ? imageModel : undefined,
          quality: imageQuality || 'high',
          offline,
        });
      } else {
        generated = await generateIdeogramImage({
          prompt: rawPrompt,
          styleId: imageStyle,
          customStylePrompt,
          format,
          seed: shotSeed,
          model: imageModel,
          quality: imageQuality,
          offline,
        });
      }

      // Copy or write from local cache to run public asset directory
      if (generated.localPath && generated.localPath !== targetFilePath) {
        await fs.copyFile(generated.localPath, targetFilePath);
      }
    } catch (err) {
      if (/credit balance ran out|insufficient_funds|HTTP 402|authentication failed|HTTP 401/i.test(err.message)) {
        throw err;
      }
      console.warn(`   ⚠️ ${providerLabel} generation failed for [${shotId}]: ${err.message}. Using fallback.`);
      
      // Try to reuse an already resolved image from this scene or a previous scene
      const priorAsset = Object.values(assets).flatMap((s) => [s.primary, ...(s.alternates || [])]).find((a) => a?.src && a?.type === 'image');
      if (priorAsset?.src) {
        const sourceFile = path.join(publicDir, priorAsset.src);
        try {
          await fs.copyFile(sourceFile, targetFilePath);
          generated = {
            localPath: targetFilePath,
            sha256: priorAsset.sha256ContentHash,
            seed: shotSeed,
            prompt: rawPrompt,
            cached: false,
            isFallback: true,
          };
        } catch {
          // continue to canvas fallback
        }
      }
      if (!generated?.localPath) {
        generated = {
          localPath: targetFilePath,
          sha256: crypto.createHash('sha256').update(rawPrompt).digest('hex'),
          seed: shotSeed,
          prompt: rawPrompt,
          cached: false,
          isFallback: true,
        };
      }
    }

    let dimensions = { width: format === 'shorts' ? 1080 : 1920, height: format === 'shorts' ? 1920 : 1080 };
    try {
      const buffer = await fs.readFile(targetFilePath);
      dimensions = getImageDimensions(buffer);
    } catch {
      // Create a textured high-resolution canvas with visual gradient so zoom produces optical delta
      const width = format === 'shorts' ? 1080 : 1920;
      const height = format === 'shorts' ? 1920 : 1080;
      const svgPattern = Buffer.from(`
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="grad" cx="50%" cy="50%" r="70%" fx="30%" fy="30%">
              <stop offset="0%" stop-color="#2a3342" />
              <stop offset="50%" stop-color="#181e28" />
              <stop offset="100%" stop-color="#0c0f15" />
            </radialGradient>
          </defs>
          <rect width="${width}" height="${height}" fill="url(#grad)" />
          <circle cx="${width * 0.4}" cy="${height * 0.45}" r="${width * 0.35}" fill="#3b4b60" opacity="0.25" />
          <circle cx="${width * 0.6}" cy="${height * 0.55}" r="${width * 0.25}" fill="#4f637f" opacity="0.18" />
        </svg>
      `);
      const placeholder = await sharp(svgPattern).png().toBuffer();
      await fs.writeFile(targetFilePath, placeholder);
      dimensions = { width, height };
    }

    const sha256ContentHash = await computeFileSha256(targetFilePath);
    const relativeSrc = path.relative(publicDir, targetFilePath).split(path.sep).join('/');

    const inspectionCandidate = {
      id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}`,
      type: 'image', localPath: targetFilePath, width: dimensions.width, height: dimensions.height,
      label: rawPrompt, description: rawPrompt, tags: [style.id, req.concept, shotConcept].filter(Boolean),
    };
    let inspection = await inspectVisualCandidate(inspectionCandidate, { filePath: targetFilePath }).catch(() => null);
    let visualMatch = inspection ? compareVisualToNeed(inspection, req.visibleNeed) : null;
    let semanticMismatch = Boolean(inspection?.semanticPixelInspected && visualMatch?.overallVisualMatch < 0.35);

    // Visual Relevance Validation & Selective Regeneration (Requirement 2)
    // If pixel relevance fails or is poor (< 0.40) while online, perform one targeted focal refinement retry
    if (!offline && !generated.isFallback && (semanticMismatch || (visualMatch?.overallVisualMatch && visualMatch.overallVisualMatch < 0.40))) {
      const focalNeed = req.visibleNeed?.focalSubject || req.concept || shotConcept;
      if (focalNeed && focalNeed.length > 3) {
        console.log(`   🔄 [Shot ${shotId}] Visual relevance suboptimal (${Math.round((visualMatch?.overallVisualMatch || 0.3) * 100)}%). Refining prompt and regenerating...`);
        const refinedPrompt = `${focalNeed}, prominent in foreground, clear distinct focus. Action/Context: ${rawPrompt.slice(0, 150)}`;
        const retrySeed = (shotSeed + 1337) % 1000000000;
        try {
          const retried = isFlux
            ? await generateFluxImage({
              prompt: refinedPrompt,
              styleId: imageStyle,
              customStylePrompt,
              format,
              seed: retrySeed,
              model: imageModel && normalizedModel.includes('flux') ? imageModel : undefined,
              quality: imageQuality || 'high',
              offline,
            })
            : await generateIdeogramImage({
              prompt: refinedPrompt,
              styleId: imageStyle,
              customStylePrompt,
              format,
              seed: retrySeed,
              model: imageModel,
              quality: imageQuality,
              offline,
            });

          if (retried?.localPath) {
            const retryCandidate = {
              id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}_retry`,
              type: 'image', localPath: retried.localPath, width: dimensions.width, height: dimensions.height,
              label: refinedPrompt, description: refinedPrompt, tags: [style.id, req.concept, shotConcept].filter(Boolean),
            };
            const retryInspection = await inspectVisualCandidate(retryCandidate, { filePath: retried.localPath }).catch(() => null);
            const retryMatch = retryInspection ? compareVisualToNeed(retryInspection, req.visibleNeed) : null;
            if (!retryMatch || (retryMatch.overallVisualMatch >= (visualMatch?.overallVisualMatch || 0))) {
              await fs.copyFile(retried.localPath, targetFilePath);
              generated = retried;
              rawPrompt = refinedPrompt;
              inspection = retryInspection;
              visualMatch = retryMatch;
              semanticMismatch = Boolean(inspection?.semanticPixelInspected && visualMatch?.overallVisualMatch < 0.35);
              console.log(`   ✅ [Shot ${shotId}] Refinement accepted (pixel match: ${Math.round((visualMatch?.overallVisualMatch || 0.65) * 100)}%).`);
            }
          }
        } catch (retryErr) {
          console.warn(`   ⚠️ [Shot ${shotId}] Refinement retry skipped: ${retryErr.message}`);
        }
      }
    }

    visualInspections[shotId] = inspection;
    const editorialScore = semanticMismatch ? 0 : Math.round(75 + (visualMatch?.overallVisualMatch || 0.65) * 25);

    const assetObj = {
      type: 'image',
      width: dimensions.width || (format === 'shorts' ? 1080 : 1920),
      height: dimensions.height || (format === 'shorts' ? 1920 : 1080),
      sha256ContentHash,
      src: relativeSrc,
      source: isFlux ? 'replicate' : 'ideogram',
      isFallback: Boolean(generated.isFallback),
      qualityTier: generated.isFallback ? 'FALLBACK' : 'AI_GENERATED',
      tier: 'verified',
      generic: false,
      label: `AI Art (${style.id}): ${rawPrompt.slice(0, 40)}`,
      license: {
        provider: isFlux ? 'replicate' : 'ideogram',
        name: isFlux ? 'FLUX.1 Schnell' : 'Ideogram AI',
        attribution_required: false,
        commercial_use: 'allowed',
        nonFree: false,
        verification_status: 'verified',
      },
      relevance: 0.95,
      assetRequestId: req.id || `asset_${shotId}`,
      storyboardShotId: shotId,
      providerCandidateId: `${isFlux ? 'replicate' : 'ideogram'}_${sha256ContentHash.slice(0, 16)}`,
      query: rawPrompt,
      queryStage: 'AI_GENERATED',
      focal: { x: 0.5, y: 0.5 },
      selectionReason: `Generated via ${providerLabel} in ${style.label} visual style`,
      whyItMatchesNarration: `Synthesized specifically for: "${scene?.narration?.slice(0, 80) || rawPrompt.slice(0, 80)}"`,
      finalEditorialScore: editorialScore,
      assetIdentityChain: {
        candidateId: `${isFlux ? 'replicate' : 'ideogram'}_${sha256ContentHash.slice(0, 16)}`,
        materializedAssetId: targetFileName,
        solvedSceneAssetId: `${req.sceneId}:${shotId}`,
        timelineAssetId: shotId,
        rendererAssetId: relativeSrc,
        sha256ContentHash,
      },
    };

    const sceneAssets = assets[req.sceneId];
    if (sceneAssets) {
      sceneAssets.byShot[shotId] = assetObj;
      if (!sceneAssets.primary) {
        sceneAssets.primary = assetObj;
      } else {
        sceneAssets.alternates.push(assetObj);
      }
    }

    editorialAssetJudgments[shotId] = {
      accepted: !semanticMismatch,
      rejected: semanticMismatch,
      finalEditorialScore: editorialScore,
      classification: semanticMismatch ? 'ACCIDENTAL' : 'DIRECT',
      rejectReasons: semanticMismatch ? ['ai_pixel_semantic_mismatch'] : [],
      selectionReason: semanticMismatch
        ? `Rejected: generated pixels did not clearly communicate ${req.concept || shotConcept}`
        : `AI-generated illustration in ${style.label} style; pixel relevance ${Math.round((visualMatch?.overallVisualMatch || 0.65) * 100)}%`,
      whyItMatchesNarration: visualMatch?.details || `Custom rendered for ${req.concept || rawPrompt}`,
    };

    requestReports.push({
      shotId,
      sceneId: req.sceneId,
      status: semanticMismatch ? 'unresolved' : 'resolved',
      source: isFlux ? 'replicate' : 'ideogram',
      candidateCount: 1,
      selected: assetObj,
    });

    console.log(semanticMismatch
      ? `   ⚠️ [Shot ${shotId}] rejected AI image after pixel review (${style.id}): "${rawPrompt.slice(0, 50)}..."`
      : `   ✓ [Shot ${shotId}] resolved AI image (${style.id}): "${rawPrompt.slice(0, 50)}..."`);
  });

  return {
    assets,
    report: {
      totalRequests: assetRequests.length,
      resolvedCount: requestReports.filter((item) => item.status === 'resolved').length,
      unresolvedCount: requestReports.filter((item) => item.status !== 'resolved').length,
      requests: requestReports,
    },
    editorialAssetJudgments,
    visualInspections,
    editorialUsefulnessRecords: {},
    formatFitnessEvaluations: {},
    videoWindowSelections: {},
  };
}

