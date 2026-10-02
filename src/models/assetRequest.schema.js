import { z } from 'zod';

export const AssetRequestSchema = z.object({
  id: z.string().min(1),
  storyboardShotId: z.string().min(1),
  sceneId: z.string().min(1),
  concept: z.string().min(1),
  searchConcepts: z.array(z.string().min(1)).max(12).default([]),
  preferredSource: z.enum(['video', 'image', 'procedural', 'generated', 'auto']).default('auto'),
  evidenceRequired: z.boolean().default(false),
  entities: z.array(z.string().min(1)).max(12).default([]),
  stagedQueries: z.object({
    specific: z.array(z.string().min(1)).max(12).default([]),
    fallback: z.array(z.string().min(1)).max(12).default([]),
  }),
  constraints: z.object({
    orientation: z.enum(['landscape', 'portrait', 'square']),
    minWidth: z.number().int().positive().optional(),
    minHeight: z.number().int().positive().optional(),
    durationHint: z.number().positive().optional(),
  }),
  exclusions: z.array(z.string().min(1)).max(20).default([]),
  continuityKey: z.string().min(1).optional(),
  assetIntent: z.enum(['entity', 'evidence', 'atmosphere', 'action', 'location', 'concept', 'product', 'historical', 'interface', 'document', 'data', 'background']),
}).strict().superRefine((request, ctx) => {
  if (request.preferredSource !== 'procedural' && !request.stagedQueries.specific.length && !request.stagedQueries.fallback.length) {
    ctx.addIssue({ code: 'custom', path: ['stagedQueries'], message: 'Media requests need at least one staged query' });
  }
});

export const AssetRequestListSchema = z.array(AssetRequestSchema);
