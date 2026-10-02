import { z } from 'zod';

const Density = z.number().min(0).max(1);

export const VideoVisualStrategySchema = z.object({
  version: z.literal(1).default(1),
  continuityMode: z.enum(['topic', 'concept', 'mixed']).default('mixed'),
  visualFlow: z.enum(['evidence', 'explanatory', 'cinematic', 'hybrid']).default('hybrid'),
  assetPreference: z.object({
    realMediaWeight: Density.default(0.7),
    proceduralWeight: Density.default(0.3),
  }).default({ realMediaWeight: 0.7, proceduralWeight: 0.3 }),
  pacing: z.object({
    introEnergy: Density.default(0.8),
    bodyEnergy: Density.default(0.55),
    endingEnergy: Density.default(0.65),
  }).default({ introEnergy: 0.8, bodyEnergy: 0.55, endingEnergy: 0.65 }),
  visualDensity: Density.default(0.6),
  graphicDensity: Density.default(0.4),
  evidenceDensity: Density.default(0.5),
  captionDensity: Density.default(0.6),
  transitionIntensity: Density.default(0.35),
  cameraMotionIntensity: Density.default(0.5),
  source: z.enum(['engine-default', 'channel-default', 'video-override', 'director']).default('engine-default'),
  rationale: z.array(z.string().min(1)).max(8).default([]),
}).passthrough();

/**
 * Milestone 1 compatibility default. A later selector may replace these values,
 * but downstream stages can rely on one validated contract now.
 */
export function createDefaultVisualStrategy(overrides = {}) {
  return VideoVisualStrategySchema.parse(overrides);
}
