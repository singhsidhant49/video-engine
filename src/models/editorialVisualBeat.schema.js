import { z } from 'zod';

export const EditorialVisualBeatSchema = z.object({
  id: z.string().min(1),
  shotId: z.string().min(1),
  narrationRange: z.object({ startFrame: z.number().int().nonnegative(), endFrame: z.number().int().positive() }).strict(),
  phraseIds: z.array(z.string()),
  editorialPurpose: z.enum(['HOOK', 'CONTEXT', 'EVIDENCE', 'EXAMPLE', 'ENTITY', 'LOCATION', 'ACTION', 'DETAIL', 'EMOTIONAL_BEAT', 'CONTRAST', 'CHAPTER', 'PAYOFF', 'CONCLUSION']),
  viewerNeed: z.string().min(1),
  primaryConcept: z.string().min(1),
  entityIds: z.array(z.string()),
  visualChangeReason: z.enum(['NEW_IDEA', 'NEW_ENTITY', 'NEW_EVIDENCE', 'NEW_LOCATION', 'NEW_EXAMPLE', 'NEW_ACTION', 'DETAIL_SHIFT', 'EMOTIONAL_SHIFT', 'CHAPTER_CHANGE', 'MONTAGE_PROGRESSION', 'CONTINUATION']),
  preferredMediaType: z.enum(['REAL_VIDEO', 'REAL_IMAGE', 'SCREENSHOT', 'DOCUMENT_IMAGE', 'CURATED_MEDIA', 'MONTAGE', 'ANY_REAL_MEDIA']),
  evidenceRequirement: z.enum(['required', 'preferred', 'none']),
  emotionalTone: z.string().min(1),
  energy: z.number().min(0).max(1),
  complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  minimumComprehensionTime: z.number().positive(),
}).strict();

export const EditorialVisualBeatListSchema = z.array(EditorialVisualBeatSchema);
