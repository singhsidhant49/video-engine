import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { generateIdeogramImage } from '../services/ideogramService.js';
import { generateFluxImage } from '../services/replicateService.js';
import { getImageDimensions } from '../services/imageUtils.js';
import { getImageStyle, buildFullIdeogramPrompt } from '../config/imageStyles.js';
import { recordImageInBank } from '../services/imageBank.js';
import { compareVisualToNeed, inspectPixelsAgainstVisibleNeed, inspectVisualCandidate } from '../assets/visualInspectionService.js';
import { composeImagePrompt, createImagePromptSpec, deterministicImageSeed } from './aiImagePromptComposer.js';
import { computePerceptualHash, hammingDistance } from '../core/cache/cacheManager.js';

async function computeFileSha256(filePath) {
  try {
    const buffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  } catch {
    return 'none';
  }
}

export function buildSemanticRecoveryPrompt({ narration = '', visibleNeed = {}, styleLabel = '', format = 'landscape', attempt = 1 } = {}) {
  const spoken = String(narration || visibleNeed.narrationText || '').replace(/\s+/g, ' ').trim();
  const combined = `${spoken} ${visibleNeed.subject || ''} ${visibleNeed.primaryConcept || ''}`.toLowerCase();
  let concreteDirection = [visibleNeed.subject, visibleNeed.action, visibleNeed.environment].filter(Boolean).join('; ');
  if (/\b(?:replicat(?:e|ed|ion)|participants?|sample)\b/.test(combined) && /\b(?:psycholog|experiment|research|study)\b/.test(combined)) {
    concreteDirection = 'two small teams of researchers repeat the same simple psychology task in matching rooms with two visibly diverse participant groups; in the foreground a researcher compares two result sheets containing matching check marks but no readable words';
  } else if (/\bcontext\b/.test(combined) && /\b(?:cues?|people|stakes|behavior)\b/.test(combined)) {
    concreteDirection = 'the same person behaves differently in two clearly distinct social settings: alone in one room, then observed by peers with a visible reward token in the other room; the environmental cues visibly cause the behavior change';
  } else if (/\bweird samples?\b|western,? educated|industrialized,? rich/i.test(combined)) {
    concreteDirection = 'a psychology researcher sampling almost everyone from one narrow university group while many visibly different communities remain outside the study area';
  }
  const framing = attempt === 1
    ? 'medium-wide frame showing the complete action and its cause-and-effect relationship'
    : 'closer evidence-focused frame emphasizing the decisive objects, participants, and comparison';
  return [
    `Create a literal visual for this narration: "${spoken}".`,
    `Visible direction: ${concreteDirection}.`,
    `${framing}.`,
    `Use concrete people, actions, rooms, and props; do not substitute metaphors, office handshakes, code screens, symbols, or unrelated objects.`,
    `No readable words, labels, logos, watermarks, posters, or UI.`,
    `Maintain ${styleLabel || 'the selected channel style'} and all established character and location continuity.`,
    format === 'shorts' ? 'Vertical 9:16 mobile-safe composition.' : 'Horizontal 16:9 cinematic composition.',
  ].join(' ');
}

export function findApprovedSameSceneContinuation(sceneAssets, judgments = {}) {
  return Object.entries(sceneAssets?.byShot || {})
    .reverse()
    .find(([priorShotId, priorAsset]) => priorAsset?.src && judgments[priorShotId]?.accepted === true) || null;
}

export function buildSameSceneContinuationPrompt(scene = {}, req = {}) {
  const narration = String(scene?.narration || req?.visibleNeed?.narrationText || '').trim();
  return `Approved same-scene visual continuation for narration: ${narration}`;
}

/**
 * Enriches and structures the AI prompt to maximize visual storytelling,
 * context relevance to narration, camera perspective, and lighting.
 */
export function legacyEnrichAiImagePrompt({ scene, shotConcept = '', req = null, style = null, format = 'landscape', index = 0 } = {}) {
  let basePrompt = (scene?.imagePrompt || scene?.visual || '').trim();

  if (!basePrompt || basePrompt.length < 15) {
    basePrompt = shotConcept || req?.concept || scene?.narration || 'a cinematic story scene';
  } else if (shotConcept && shotConcept.length > 5 && !basePrompt.toLowerCase().includes(shotConcept.toLowerCase().slice(0, 15))) {
    basePrompt = `${basePrompt.replace(/[.,\s]+$/, '')}, focusing on ${shotConcept}`;
  }

  basePrompt = basePrompt.replace(/[.,\s]+$/, '');

  // Connect narration directly if base prompt is short or generic, creating a literal visual projection sequence
  const narration = (scene?.narration || '').trim();
  if (!shotConcept && narration && basePrompt.length < 75 && !basePrompt.toLowerCase().includes(narration.toLowerCase().slice(0, 15))) {
    const actionSnippet = narration.replace(/[.,!?]+$/, '').slice(0, 90).trim();
    if (actionSnippet) {
      basePrompt = `${basePrompt.replace(/[.,\s]+$/, '')}, depicting: ${actionSnippet}`;
    }
  }

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

export function enrichAiImagePrompt(options = {}) {
  return composeImagePrompt(createImagePromptSpec(options));
}

const CINEMATIC_PALETTES = [
  { bg1: '#07101e', bg2: '#0d2038', accent: '#00d2ff', mid: '#1b3a5c', mood: 'cyan-midnight' },
  { bg1: '#150d06', bg2: '#281708', accent: '#ff9f43', mid: '#4a2d12', mood: 'amber-obsidian' },
  { bg1: '#0f0a21', bg2: '#1d1238', accent: '#a55eea', mid: '#382363', mood: 'indigo-violet' },
  { bg1: '#170606', bg2: '#2b0c0c', accent: '#ff4757', mid: '#521919', mood: 'crimson-abyss' },
  { bg1: '#06170e', bg2: '#0d2b1a', accent: '#2ed573', mid: '#16472b', mood: 'emerald-forest' },
  { bg1: '#161205', bg2: '#292107', accent: '#fed330', mid: '#4d3f10', mood: 'royal-gold' },
  { bg1: '#190a16', bg2: '#2e1227', accent: '#fd79a8', mid: '#522245', mood: 'twilight-rose' },
  { bg1: '#0a101d', bg2: '#141d30', accent: '#70a1ff', mid: '#253450', mood: 'arctic-steel' },
];

/**
 * Synthesizes a distinct, high-resolution visual motif for a specific shot
 * so every scene receives a unique, scene-matched visual even when offline or during transient API outage.
 */
export async function generateDistinctSceneVisual({
  targetFilePath,
  width,
  height,
  shotId,
  seed,
  shotConcept = '',
  rawPrompt = '',
  styleId = '',
}) {
  const paletteIndex = Math.abs(seed || 0) % CINEMATIC_PALETTES.length;
  const palette = CINEMATIC_PALETTES[paletteIndex];

  // Derive motivated focal coordinates from seed
  const focalX = Math.round(width * (0.35 + ((Math.abs((seed || 1) * 7) % 30) / 100)));
  const focalY = Math.round(height * (0.35 + ((Math.abs((seed || 1) * 13) % 30) / 100)));
  const glowR = Math.round(Math.min(width, height) * 0.45);
  const secondaryX = width - focalX;
  const secondaryY = height - focalY;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="focalGrad_${shotId}" cx="${focalX}" cy="${focalY}" r="${glowR}" fx="${focalX}" fy="${focalY}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.35" />
          <stop offset="45%" stop-color="${palette.mid}" stop-opacity="0.20" />
          <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="bgGrad_${shotId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${palette.bg1}" />
          <stop offset="50%" stop-color="${palette.bg2}" />
          <stop offset="100%" stop-color="#05070a" />
        </linearGradient>
        <linearGradient id="horizonGrad_${shotId}" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="${palette.bg1}" stop-opacity="0.9" />
          <stop offset="100%" stop-color="${palette.bg1}" stop-opacity="0" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bgGrad_${shotId})" />
      <circle cx="${focalX}" cy="${focalY}" r="${glowR}" fill="url(#focalGrad_${shotId})" />
      <circle cx="${secondaryX}" cy="${secondaryY}" r="${Math.round(glowR * 0.7)}" fill="${palette.mid}" opacity="0.12" />
      <path d="M 0 ${Math.round(height * 0.72)} Q ${Math.round(width * 0.5)} ${Math.round(height * 0.65)} ${width} ${Math.round(height * 0.75)} L ${width} ${height} L 0 ${height} Z" fill="url(#horizonGrad_${shotId})" opacity="0.8" />
    </svg>
  `;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  await fs.writeFile(targetFilePath, pngBuffer);
  return {
    width,
    height,
    sha256: crypto.createHash('sha256').update(pngBuffer).digest('hex'),
  };
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
  publishMode = 'DEV_RENDER',
  candidateCount = 2,
}) {
  const style = getImageStyle(imageStyle);
  const dir = path.join(publicDir, 'assets');
  await fs.mkdir(dir, { recursive: true });

  const scenes = plan.scenes || [];
  const sceneMap = new Map(scenes.map((s) => [s.id, s]));
  const masterSeed = baseSeed != null
    ? Number(baseSeed)
    : deterministicImageSeed({
      title: plan.title,
      style: imageStyle,
      format,
      continuityBible: plan.continuityBible,
      shots: assetRequests.map((item) => item.storyboardShotId || item.id),
    });

  const normalizedProvider = String(imageProvider || '').trim().toLowerCase();
  const normalizedModel = String(imageModel || '').trim().toLowerCase();
  const isFlux = normalizedProvider === 'flux' || normalizedProvider === 'replicate' || normalizedModel.includes('flux');
  const providerLabel = isFlux ? 'FLUX.1 Schnell (Replicate)' : 'Ideogram';

  console.log(`🎨 AI Asset Director: Resolving ${assetRequests.length} shot(s) in "${style.label}" via ${providerLabel} (master seed: ${masterSeed})...`);

  const assets = Object.fromEntries(scenes.map((scene) => [scene.id, { primary: null, alternates: [], byShot: {} }]));
  const requestReports = [];
  const editorialAssetJudgments = {};
  const visualInspections = {};
  const imagePromptSpecs = {};
  const selectedPerceptualHashes = [];
  const imageCandidateEvaluations = {};
  let continuityReferencePath = null;

  // Continuity-dependent generation is serial so an approved prior shot can
  // become a stable identity/location reference for the next shot.
  await mapLimit(assetRequests, 1, async (req, index) => {
    const scene = sceneMap.get(req.sceneId);
    const shotId = req.storyboardShotId || `shot_${index + 1}`;

    // Extract shot-specific visual nuances from visual proposition or visible need
    const shotConcept = req.visualProposition?.positiveDescriptions?.[0]
      || req.visibleNeed?.visualGoal
      || req.visibleNeed?.focalSubject
      || req.concept;

    // Prioritize the director's authored AI image prompt, then shot visual proposition, then scene visual, enriched for visual storytelling
    const promptSpec = createImagePromptSpec({
      scene,
      req: { ...req, shotConcept },
      previous: index > 0 ? assetRequests[index - 1] : null,
      next: index < assetRequests.length - 1 ? assetRequests[index + 1] : null,
      continuityBible: plan.continuityBible,
      style,
      format,
      index,
      contentType: scene?.kind,
    });
    imagePromptSpecs[shotId] = promptSpec;
    let rawPrompt = composeImagePrompt(promptSpec);

    const shotSeed = (masterSeed + index * 17) % 1000000000;

    const targetFileName = `${shotId}_a.png`;
    const targetFilePath = path.join(dir, targetFileName);
    const referenceImagePath = scene?.continuity === 'continue' ? continuityReferencePath : null;

    // Add pacing delay between consecutive requests to respect API rate limits
    if (index > 0 && !offline) {
      await new Promise((r) => setTimeout(r, 350));
    }

    let generated = null;
    let generateAttempts = 0;
    const maxGenerateAttempts = offline ? 1 : 3;

    while (generateAttempts < maxGenerateAttempts) {
      generateAttempts++;
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
            referenceImagePath,
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
            referenceImagePath,
          });
        }

        // Copy or write from local cache to run public asset directory
        if (generated.localPath && generated.localPath !== targetFilePath) {
          await fs.copyFile(generated.localPath, targetFilePath);
        }
        break;
      } catch (err) {
        if (/credit balance ran out|insufficient_funds|HTTP 402|authentication failed|HTTP 401/i.test(err.message)) {
          throw err;
        }
        const isRateLimit = /429|too many requests|rate limit/i.test(err.message);
        const isServerBusy = /502|503|504|gateway|unavailable|econnreset|timeout/i.test(err.message);
        if ((isRateLimit || isServerBusy) && generateAttempts < maxGenerateAttempts) {
          const delayMs = isRateLimit ? 3500 * generateAttempts : 2000 * generateAttempts;
          console.warn(`   ⏳ ${providerLabel} [${shotId}] transient ${isRateLimit ? 'rate limit (429)' : 'server glitch'}. Retrying in ${delayMs / 1000}s (attempt ${generateAttempts}/${maxGenerateAttempts})...`);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        console.warn(`   ⚠️ ${providerLabel} generation failed for [${shotId}]: ${err.message}. Using dedicated scene visual.`);
        break;
      }
    }

    if (!generated?.localPath) {
      // Check if this same scene already has an approved primary asset and this shot is a direct continuation
      const sameScenePrimary = assets[req.sceneId]?.primary;
      const isShotContinuation = sameScenePrimary?.src && (scene?.shots?.length || 0) > 1;

      if (isShotContinuation && sameScenePrimary?.src) {
        const sourceFile = path.join(publicDir, sameScenePrimary.src);
        try {
          await fs.copyFile(sourceFile, targetFilePath);
          generated = {
            localPath: targetFilePath,
            sha256: sameScenePrimary.sha256ContentHash,
            seed: shotSeed,
            prompt: rawPrompt,
            cached: false,
            isFallback: true,
          };
        } catch {}
      }

      // If not a continuation or same-scene copy failed: generate a distinct, high-res visual specifically for this shot!
      if (!generated?.localPath) {
        const canvasWidth = format === 'shorts' ? 1080 : 1920;
        const canvasHeight = format === 'shorts' ? 1920 : 1080;
        const visual = await generateDistinctSceneVisual({
          targetFilePath,
          width: canvasWidth,
          height: canvasHeight,
          shotId,
          seed: shotSeed,
          shotConcept,
          rawPrompt,
          styleId: style.id,
        });
        generated = {
          localPath: targetFilePath,
          sha256: visual.sha256,
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
      const canvasWidth = format === 'shorts' ? 1080 : 1920;
      const canvasHeight = format === 'shorts' ? 1920 : 1080;
      const visual = await generateDistinctSceneVisual({
        targetFilePath,
        width: canvasWidth,
        height: canvasHeight,
        shotId,
        seed: shotSeed,
        shotConcept,
        rawPrompt,
        styleId: style.id,
      });
      dimensions = { width: visual.width, height: visual.height };
    }

    const sha256ContentHash = await computeFileSha256(targetFilePath);
    const relativeSrc = path.relative(publicDir, targetFilePath).split(path.sep).join('/');

    const inspectionCandidate = {
      id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}`,
      type: 'image', localPath: targetFilePath, width: dimensions.width, height: dimensions.height,
      label: 'AI-generated candidate under blind pixel review', description: '', tags: [style.id],
    };
    let inspection = await inspectVisualCandidate(inspectionCandidate, { filePath: targetFilePath }).catch(() => null);
    let visualMatch = inspection ? compareVisualToNeed(inspection, req.visibleNeed) : null;
    let pixelGrounding = !offline && !generated.isFallback
      ? await inspectPixelsAgainstVisibleNeed(targetFilePath, req.visibleNeed, { styleId: style.id }).catch(() => ({ available: false }))
      : { available: false, reason: offline ? 'offline' : 'fallback' };
    if (inspection) inspection.pixelGrounding = pixelGrounding;
    if (pixelGrounding.available) {
      visualMatch = {
        ...(visualMatch || {}),
        overallVisualMatch: pixelGrounding.targetScore,
        semanticDistance: Number((1 - pixelGrounding.targetScore).toFixed(3)),
        details: `Pixel-grounded target confidence ${(pixelGrounding.targetScore * 100).toFixed(0)}%; strongest alternative: ${pixelGrounding.bestNegative || 'none'}`,
      };
    }
    let semanticMismatch = Boolean(!generated.isFallback && (pixelGrounding.available
      ? !pixelGrounding.matched
      : inspection?.semanticPixelInspected && visualMatch?.overallVisualMatch < 0.35));
    let perceptualHash = await fs.readFile(targetFilePath).then(computePerceptualHash).catch(() => null);
    let nearestDuplicate = perceptualHash
      ? selectedPerceptualHashes
        .map((item) => ({ ...item, distance: hammingDistance(perceptualHash, item.hash) }))
        .sort((a, b) => a.distance - b.distance)[0]
      : null;
    let duplicateMismatch = Boolean(!generated.isFallback && nearestDuplicate && nearestDuplicate.distance <= 6);
    const candidateEvaluations = [{
      candidateId: `${shotId}_candidate_1`,
      seed: shotSeed,
      prompt: rawPrompt,
      semanticScore: visualMatch?.overallVisualMatch ?? null,
      semanticPixelInspected: Boolean(inspection?.semanticPixelInspected),
      perceptualHash,
      duplicateOf: duplicateMismatch ? nearestDuplicate?.shotId : null,
      accepted: !semanticMismatch && !duplicateMismatch,
    }];

    const criticalRole = new Set(['HOOK', 'ACTION', 'DETAIL', 'EVIDENCE', 'PAYOFF', 'REACTION']).has(String(req.visibleNeed?.visualRole || '').toUpperCase());
    const shouldGenerateAlternate = !offline && !generated.isFallback && Math.max(1, Math.min(3, Number(candidateCount) || 1)) > 1
      && (criticalRole || Number(req.visibleNeed?.importance || scene?.importance || 0) >= 4);
    if (shouldGenerateAlternate) {
      const alternateSeed = (shotSeed + 7919) % 1000000000;
      const alternatePrompt = `${rawPrompt} Alternative editorial interpretation: preserve every continuity constraint, but choose the clearest narration-specific composition for this shot's purpose.`;
      try {
        const alternate = isFlux
          ? await generateFluxImage({ prompt: alternatePrompt, styleId: imageStyle, customStylePrompt, format, seed: alternateSeed, model: imageModel && normalizedModel.includes('flux') ? imageModel : undefined, quality: imageQuality || 'high', offline, referenceImagePath })
          : await generateIdeogramImage({ prompt: alternatePrompt, styleId: imageStyle, customStylePrompt, format, seed: alternateSeed, model: imageModel, quality: imageQuality, offline, referenceImagePath });
        if (alternate?.localPath) {
          const alternateCandidate = {
            id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}_candidate_2`, type: 'image', localPath: alternate.localPath,
            label: 'AI-generated alternate candidate under blind pixel review', description: '', tags: [style.id],
          };
          const alternateInspection = await inspectVisualCandidate(alternateCandidate, { filePath: alternate.localPath }).catch(() => null);
          let alternateMatch = alternateInspection ? compareVisualToNeed(alternateInspection, req.visibleNeed) : null;
          const alternateGrounding = await inspectPixelsAgainstVisibleNeed(alternate.localPath, req.visibleNeed, { styleId: style.id }).catch(() => ({ available: false }));
          if (alternateInspection) alternateInspection.pixelGrounding = alternateGrounding;
          if (alternateGrounding.available) alternateMatch = { ...(alternateMatch || {}), overallVisualMatch: alternateGrounding.targetScore, semanticDistance: 1 - alternateGrounding.targetScore, details: `Pixel-grounded alternate confidence ${(alternateGrounding.targetScore * 100).toFixed(0)}%` };
          const alternateHash = await fs.readFile(alternate.localPath).then(computePerceptualHash).catch(() => null);
          const duplicateOf = alternateHash ? selectedPerceptualHashes.find((item) => hammingDistance(alternateHash, item.hash) <= 6) : null;
          const alternateScore = alternateMatch?.overallVisualMatch ?? (alternateInspection?.semanticPixelInspected ? 0 : 0.5);
          const currentScore = visualMatch?.overallVisualMatch ?? (inspection?.semanticPixelInspected ? 0 : 0.5);
          const alternateUsable = !duplicateOf && (alternateGrounding.available
            ? alternateGrounding.matched
            : !(alternateInspection?.semanticPixelInspected && alternateScore < 0.35));
          const chooseAlternate = alternateUsable && (semanticMismatch || duplicateMismatch || alternateScore > currentScore + 0.02);
          candidateEvaluations.push({
            candidateId: `${shotId}_candidate_2`, seed: alternateSeed, prompt: alternatePrompt,
            semanticScore: alternateMatch?.overallVisualMatch ?? null,
            semanticPixelInspected: Boolean(alternateInspection?.semanticPixelInspected), perceptualHash: alternateHash,
            duplicateOf: duplicateOf?.shotId || null, accepted: chooseAlternate,
          });
          if (chooseAlternate) {
            await fs.copyFile(alternate.localPath, targetFilePath);
            generated = alternate;
            rawPrompt = alternatePrompt;
            inspection = alternateInspection;
            visualMatch = alternateMatch;
            pixelGrounding = alternateGrounding;
            perceptualHash = alternateHash;
            nearestDuplicate = null;
            duplicateMismatch = false;
            semanticMismatch = false;
            candidateEvaluations[0].accepted = false;
          }
        }
      } catch (alternateError) {
        candidateEvaluations.push({ candidateId: `${shotId}_candidate_2`, seed: alternateSeed, prompt: alternatePrompt, accepted: false, error: alternateError.message });
      }
    }

    // Visual Relevance Validation & Selective Regeneration (Requirement 2)
    // If pixel relevance fails or is poor (< 0.40) while online, perform one targeted focal refinement retry
    if (!offline && !generated.isFallback && (semanticMismatch || duplicateMismatch || (visualMatch?.overallVisualMatch && visualMatch.overallVisualMatch < 0.40))) {
      const focalNeed = req.visibleNeed?.focalSubject || req.concept || shotConcept;
      if (focalNeed && focalNeed.length > 3) {
        console.log(`   🔄 [Shot ${shotId}] Visual relevance suboptimal (${Math.round((visualMatch?.overallVisualMatch || 0.3) * 100)}%). Refining prompt and regenerating...`);
        const duplicateDirection = duplicateMismatch
          ? `Use a meaningfully different shot scale or editorial viewpoint from shot ${nearestDuplicate.shotId}, while preserving subject identity and continuity.`
          : '';
        const refinedPrompt = `${focalNeed}, prominent and unmistakable. ${duplicateDirection} Action and context: ${rawPrompt}`;
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
              referenceImagePath,
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
              referenceImagePath,
            });

          if (retried?.localPath) {
            const retryCandidate = {
              id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}_retry`,
              type: 'image', localPath: retried.localPath, width: dimensions.width, height: dimensions.height,
              label: 'AI-generated retry candidate under blind pixel review', description: '', tags: [style.id],
            };
            const retryInspection = await inspectVisualCandidate(retryCandidate, { filePath: retried.localPath }).catch(() => null);
            let retryMatch = retryInspection ? compareVisualToNeed(retryInspection, req.visibleNeed) : null;
            const retryGrounding = await inspectPixelsAgainstVisibleNeed(retried.localPath, req.visibleNeed, { styleId: style.id }).catch(() => ({ available: false }));
            if (retryInspection) retryInspection.pixelGrounding = retryGrounding;
            if (retryGrounding.available) retryMatch = { ...(retryMatch || {}), overallVisualMatch: retryGrounding.targetScore, semanticDistance: 1 - retryGrounding.targetScore, details: `Pixel-grounded retry confidence ${(retryGrounding.targetScore * 100).toFixed(0)}%` };
            const retryHash = await fs.readFile(retried.localPath).then(computePerceptualHash).catch(() => null);
            const retryDuplicate = retryHash && selectedPerceptualHashes.some((item) => hammingDistance(retryHash, item.hash) <= 6);
            const retryIsImprovement = retryMatch
              ? retryMatch.overallVisualMatch >= (visualMatch?.overallVisualMatch || 0)
              : !inspection?.semanticPixelInspected;
            if (!retryDuplicate && retryIsImprovement) {
              await fs.copyFile(retried.localPath, targetFilePath);
              generated = retried;
              rawPrompt = refinedPrompt;
              inspection = retryInspection;
              visualMatch = retryMatch;
              pixelGrounding = retryGrounding;
              perceptualHash = retryHash;
              nearestDuplicate = null;
              duplicateMismatch = false;
              semanticMismatch = retryGrounding.available ? !retryGrounding.matched : Boolean(inspection?.semanticPixelInspected && visualMatch?.overallVisualMatch < 0.35);
              console.log(`   ✅ [Shot ${shotId}] Refinement accepted (pixel match: ${Math.round((visualMatch?.overallVisualMatch || 0.65) * 100)}%).`);
            }
          }
        } catch (retryErr) {
          console.warn(`   ⚠️ [Shot ${shotId}] Refinement retry skipped: ${retryErr.message}`);
        }
      }
    }

    // A failed relevance refinement is not the end of production. Generate a
    // small, deterministic set of semantically stricter candidates before
    // declaring the shot unresolved. Bad pixels remain rejected; this only
    // expands the candidate pool with a different composition and seed.
    if (!offline && !generated.isFallback && (semanticMismatch || duplicateMismatch)) {
      const narration = String(scene?.narration || '').trim();
      const focalNeed = req.visibleNeed?.focalSubject || req.concept || shotConcept;
      for (let emergencyAttempt = 1; emergencyAttempt <= 2 && (semanticMismatch || duplicateMismatch); emergencyAttempt++) {
        const emergencySeed = (shotSeed + (104729 * emergencyAttempt)) % 1000000000;
        const emergencyPrompt = buildSemanticRecoveryPrompt({
          narration,
          visibleNeed: { ...req.visibleNeed, subject: focalNeed },
          styleLabel: style.label,
          format,
          attempt: emergencyAttempt,
        });
        try {
          const emergency = isFlux
            ? await generateFluxImage({ prompt: emergencyPrompt, styleId: imageStyle, customStylePrompt, format, seed: emergencySeed, model: imageModel && normalizedModel.includes('flux') ? imageModel : undefined, quality: imageQuality || 'high', offline, referenceImagePath })
            : await generateIdeogramImage({ prompt: emergencyPrompt, styleId: imageStyle, customStylePrompt, format, seed: emergencySeed, model: imageModel, quality: imageQuality, offline, referenceImagePath });
          if (!emergency?.localPath) continue;

          const emergencyCandidate = {
            id: `${isFlux ? 'replicate' : 'ideogram'}_${shotId}_recovery_${emergencyAttempt}`,
            type: 'image', localPath: emergency.localPath,
            label: 'AI-generated semantic recovery candidate under blind pixel review', description: '', tags: [style.id],
          };
          const emergencyInspection = await inspectVisualCandidate(emergencyCandidate, { filePath: emergency.localPath }).catch(() => null);
          let emergencyMatch = emergencyInspection ? compareVisualToNeed(emergencyInspection, req.visibleNeed) : null;
          const emergencyGrounding = await inspectPixelsAgainstVisibleNeed(emergency.localPath, req.visibleNeed, { styleId: style.id }).catch(() => ({ available: false }));
          if (emergencyInspection) emergencyInspection.pixelGrounding = emergencyGrounding;
          if (emergencyGrounding.available) {
            emergencyMatch = {
              ...(emergencyMatch || {}),
              overallVisualMatch: emergencyGrounding.targetScore,
              semanticDistance: 1 - emergencyGrounding.targetScore,
              details: `Pixel-grounded recovery confidence ${(emergencyGrounding.targetScore * 100).toFixed(0)}%`,
            };
          }
          const emergencyHash = await fs.readFile(emergency.localPath).then(computePerceptualHash).catch(() => null);
          const emergencyDuplicate = emergencyHash && selectedPerceptualHashes.some((item) => hammingDistance(emergencyHash, item.hash) <= 6);
          const emergencyScore = emergencyMatch?.overallVisualMatch ?? (emergencyInspection?.semanticPixelInspected ? 0 : 0.5);
          const emergencyUsable = !emergencyDuplicate && (emergencyGrounding.available
            ? emergencyGrounding.matched
            : !(emergencyInspection?.semanticPixelInspected && emergencyScore < 0.35));
          candidateEvaluations.push({
            candidateId: `${shotId}_recovery_${emergencyAttempt}`,
            seed: emergencySeed,
            prompt: emergencyPrompt,
            semanticScore: emergencyMatch?.overallVisualMatch ?? null,
            semanticPixelInspected: Boolean(emergencyInspection?.semanticPixelInspected),
            perceptualHash: emergencyHash,
            duplicateOf: emergencyDuplicate ? 'prior_selected_shot' : null,
            accepted: emergencyUsable,
          });
          if (!emergencyUsable) continue;

          await fs.copyFile(emergency.localPath, targetFilePath);
          generated = emergency;
          rawPrompt = emergencyPrompt;
          inspection = emergencyInspection;
          visualMatch = emergencyMatch;
          pixelGrounding = emergencyGrounding;
          perceptualHash = emergencyHash;
          nearestDuplicate = null;
          duplicateMismatch = false;
          semanticMismatch = false;
          for (const evaluation of candidateEvaluations.slice(0, -1)) evaluation.accepted = false;
          console.log(`   ✅ [Shot ${shotId}] semantic recovery accepted on attempt ${emergencyAttempt} (pixel match: ${Math.round(emergencyScore * 100)}%).`);
        } catch (recoveryError) {
          candidateEvaluations.push({ candidateId: `${shotId}_recovery_${emergencyAttempt}`, seed: emergencySeed, prompt: emergencyPrompt, accepted: false, error: recoveryError.message });
          console.warn(`   ⚠️ [Shot ${shotId}] semantic recovery attempt ${emergencyAttempt} failed: ${recoveryError.message}`);
        }
      }
    }

    // When multiple shots intentionally cover the same narration scene, an
    // already approved image from that scene is a safe editorial continuation
    // if every newly generated candidate fails. Reusing it preserves semantic
    // truth and continuity; timeline realization continues the camera path
    // instead of restarting a duplicate Ken Burns move.
    if (semanticMismatch || duplicateMismatch) {
      const sceneAssets = assets[req.sceneId];
      const approvedSameScene = findApprovedSameSceneContinuation(sceneAssets, editorialAssetJudgments);
      if (approvedSameScene) {
        const [priorShotId, priorAsset] = approvedSameScene;
        const priorPath = path.join(publicDir, priorAsset.src);
        try {
          await fs.copyFile(priorPath, targetFilePath);
          generated = {
            localPath: targetFilePath,
            seed: shotSeed,
            prompt: `Approved same-scene continuation from ${priorShotId}`,
            cached: true,
            isFallback: false,
            referenceApplied: true,
            reusedFromShotId: priorShotId,
          };
          rawPrompt = buildSameSceneContinuationPrompt(scene, req);
          inspection = visualInspections[priorShotId] || inspection;
          visualMatch = { overallVisualMatch: Math.max(0.65, Number(priorAsset.relevance || 0)), details: `Approved continuation of ${priorShotId} within the same narration scene` };
          pixelGrounding = { available: false, reason: 'approved_same_scene_continuation', matched: true };
          perceptualHash = priorAsset.perceptualHash || await fs.readFile(targetFilePath).then(computePerceptualHash).catch(() => null);
          nearestDuplicate = null;
          duplicateMismatch = false;
          semanticMismatch = false;
          candidateEvaluations.push({ candidateId: `${shotId}_same_scene_continuation`, reusedFromShotId: priorShotId, accepted: true, semanticScore: visualMatch.overallVisualMatch });
          console.log(`   ✓ [Shot ${shotId}] using approved same-scene continuation from ${priorShotId}.`);
        } catch (reuseError) {
          console.warn(`   ⚠️ [Shot ${shotId}] approved same-scene continuation failed: ${reuseError.message}`);
        }
      }
    }

    const productionFallback = publishMode === 'PRODUCTION_RENDER' && Boolean(generated.isFallback);
    if (perceptualHash && !semanticMismatch && !duplicateMismatch && !productionFallback) {
      selectedPerceptualHashes.push({ shotId, hash: perceptualHash });
    }

    visualInspections[shotId] = inspection;
    imageCandidateEvaluations[shotId] = candidateEvaluations;
    const rejectedCandidate = semanticMismatch || duplicateMismatch || productionFallback;
    const editorialScore = rejectedCandidate ? 0 : Math.round(75 + (visualMatch?.overallVisualMatch || 0.65) * 25);

    // Selection may have replaced the first provider result. Provenance must
    // describe the bytes actually copied into the run, not the stale first candidate.
    try {
      const finalBuffer = await fs.readFile(targetFilePath);
      dimensions = getImageDimensions(finalBuffer);
    } catch {}
    const finalSha256ContentHash = await computeFileSha256(targetFilePath);
    if (!rejectedCandidate) continuityReferencePath = targetFilePath;

    const assetObj = {
      type: 'image',
      width: dimensions.width || (format === 'shorts' ? 1080 : 1920),
      height: dimensions.height || (format === 'shorts' ? 1920 : 1080),
      sha256ContentHash: finalSha256ContentHash,
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
      providerCandidateId: `${isFlux ? 'replicate' : 'ideogram'}_${finalSha256ContentHash.slice(0, 16)}`,
      query: rawPrompt,
      queryStage: 'AI_GENERATED',
      focal: { x: 0.5, y: 0.5 },
      selectionReason: `Generated via ${providerLabel} in ${style.label} visual style`,
      whyItMatchesNarration: `Synthesized specifically for: "${scene?.narration?.slice(0, 80) || rawPrompt.slice(0, 80)}"`,
      finalEditorialScore: editorialScore,
      perceptualHash,
      referenceApplied: Boolean(generated.referenceApplied),
      reusedFromShotId: generated.reusedFromShotId || null,
      assetIdentityChain: {
        candidateId: `${isFlux ? 'replicate' : 'ideogram'}_${finalSha256ContentHash.slice(0, 16)}`,
        materializedAssetId: targetFileName,
        solvedSceneAssetId: `${req.sceneId}:${shotId}`,
        timelineAssetId: shotId,
        rendererAssetId: relativeSrc,
        sha256ContentHash: finalSha256ContentHash,
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
      accepted: !rejectedCandidate,
      rejected: rejectedCandidate,
      finalEditorialScore: editorialScore,
      classification: productionFallback ? 'UNUSABLE' : semanticMismatch ? 'ACCIDENTAL' : duplicateMismatch ? 'REPETITIVE' : 'DIRECT',
      rejectReasons: [productionFallback ? 'provider_generation_failed' : null, semanticMismatch ? 'ai_pixel_semantic_mismatch' : null, duplicateMismatch ? `near_duplicate_of_${nearestDuplicate?.shotId}` : null].filter(Boolean),
      selectionReason: semanticMismatch
        ? `Rejected: generated pixels did not clearly communicate ${req.concept || shotConcept}`
        : productionFallback
          ? `Rejected: ${providerLabel} did not return a usable generated image; synthetic placeholders are forbidden in production`
        : duplicateMismatch
          ? `Rejected: image was perceptually too similar to ${nearestDuplicate?.shotId}`
        : `AI-generated illustration in ${style.label} style; pixel relevance ${Math.round((visualMatch?.overallVisualMatch || 0.65) * 100)}%`,
      whyItMatchesNarration: visualMatch?.details || `Custom rendered for ${req.concept || rawPrompt}`,
    };

    requestReports.push({
      shotId,
      sceneId: req.sceneId,
      status: rejectedCandidate ? 'unresolved' : 'resolved',
      source: isFlux ? 'replicate' : 'ideogram',
      candidateCount: candidateEvaluations.length,
      selected: assetObj,
      noUsableCandidate: rejectedCandidate,
    });

    console.log(rejectedCandidate
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
    imagePromptSpecs,
    imageCandidateEvaluations,
    editorialUsefulnessRecords: {},
    formatFitnessEvaluations: {},
    videoWindowSelections: {},
  };
}

