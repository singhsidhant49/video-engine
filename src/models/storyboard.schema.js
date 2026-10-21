import { z } from 'zod';
import { VideoVisualStrategySchema } from './visualStrategy.schema.js';

export const ScenePurposeSchema = z.enum([
  'hook', 'setup', 'context', 'explanation', 'evidence', 'escalation',
  'contrast', 'reveal', 'payoff', 'transition', 'conclusion',
]);

export const VisualIntentSchema = z.enum([
  'establish', 'identify', 'demonstrate', 'explain', 'compare', 'quantify',
  'prove', 'locate', 'contextualize', 'humanize', 'emphasize', 'summarize',
]);

export const ShotSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['establishing', 'subject', 'detail', 'evidence', 'context', 'reaction', 'transition', 'graphic']),
  durationHint: z.number().positive(),
  visualConcept: z.string().min(1),
  assetIntent: z.enum(['entity', 'evidence', 'atmosphere', 'action', 'location', 'concept', 'product', 'historical', 'interface', 'document', 'data', 'background']),
  mediaPreference: z.enum(['real', 'procedural', 'auto']),
  searchConcepts: z.array(z.string().min(1)).max(12).default([]),
  entities: z.array(z.string().min(1)).max(12).default([]),
  motionPreference: z.string().nullable().optional(),
  focalPointHint: z.string().nullable().optional(),
  textOverlay: z.unknown().optional(),
  evidenceRequirement: z.enum(['required', 'preferred', 'conceptual_allowed']).default('conceptual_allowed'),
}).passthrough();

export const StoryboardSceneSchema = z.object({
  id: z.string().min(1),
  sourceSceneIds: z.array(z.string().min(1)).min(1),
  narration: z.string().min(1),
  scriptRange: z.object({ startWord: z.number().int().nonnegative(), endWord: z.number().int().nonnegative() }).refine((range) => range.endWord >= range.startWord),
  durationHint: z.number().positive(),
  purpose: ScenePurposeSchema,
  visualIntent: VisualIntentSchema,
  importance: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  informationDensity: z.number().int().min(1).max(5),
  preferredPresentation: z.string().optional(),
  evidenceRequirement: z.enum(['required', 'preferred', 'conceptual_allowed']),
  entities: z.array(z.string().min(1)).default([]),
  shots: z.array(ShotSchema).min(1),
  typography: z.unknown().optional(),
  audioCue: z.unknown().optional(),
}).passthrough();

export const StoryboardSectionSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  title: z.string().optional(),
  energy: z.number().int().min(1).max(5),
  scenes: z.array(StoryboardSceneSchema).min(1),
}).passthrough();

export const StoryboardSchema = z.object({
  version: z.literal(2),
  videoId: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  format: z.enum(['shorts', 'landscape']),
  visualStrategy: VideoVisualStrategySchema,
  sections: z.array(StoryboardSectionSchema).min(1),
}).passthrough();
