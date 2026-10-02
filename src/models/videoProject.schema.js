import { z } from 'zod';

export const ProjectStageSchema = z.enum([
  'request', 'plan', 'audio', 'alignment', 'visualStrategy', 'storyboard',
  'assets', 'timeline', 'preRenderQa', 'render', 'postRenderQa', 'package', 'complete',
]);

export const VideoProjectSchema = z.object({
  version: z.literal(1).default(1),
  id: z.string().min(1),
  topic: z.string().min(1),
  channelId: z.string().min(1).default('default'),
  format: z.enum(['shorts', 'landscape']),
  targetDuration: z.number().positive().nullable().default(null),
  status: z.enum(['pending', 'running', 'complete', 'failed']).default('pending'),
  currentStage: ProjectStageSchema.default('request'),
  config: z.record(z.string(), z.unknown()).default({}),
  artifacts: z.record(z.string(), z.array(z.string().min(1))).default({}),
  errors: z.array(z.object({
    stage: ProjectStageSchema,
    message: z.string().min(1),
    at: z.string().datetime(),
  }).passthrough()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).passthrough();
