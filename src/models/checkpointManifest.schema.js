import { z } from 'zod';
import { ProjectStageSchema } from './videoProject.schema.js';

export const CheckpointStageSchema = z.object({
  status: z.enum(['pending', 'running', 'in_progress', 'complete', 'failed', 'invalidated', 'skipped']).default('pending'),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  artifacts: z.array(z.string().min(1)).default([]),
  outputFiles: z.array(z.string().min(1)).default([]),
  inputHashes: z.record(z.string(), z.string()).default({}),
  schemaVersion: z.number().int().default(1),
  codeVersion: z.string().nullable().default(null),
  configHash: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
}).passthrough();

export const CheckpointManifestSchema = z.object({
  version: z.literal(1),
  videoId: z.string().min(1),
  projectFile: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stages: z.record(ProjectStageSchema.exclude(['complete']), CheckpointStageSchema),
}).passthrough();
